import { supabase, N8N_URL } from './supabase.js'

const sleep = ms => new Promise(r => setTimeout(r, ms))

// Zleca zadanie n8n i czeka na wynik zapisany w bazie
export async function runJob(jobType, payload, { onStage, timeoutSec = 120 } = {}) {
  if (!N8N_URL) throw new Error('Brakuje adresu n8n (zmienna VITE_N8N_WEBHOOK_URL).')
  const { data: { session } } = await supabase.auth.getSession()
  const ins = await supabase.from('jobs').insert({ job_type: jobType, payload, created_by: session.user.id }).select('id').single()
  if (ins.error) throw new Error(ins.error.message)
  const jobId = ins.data.id
  onStage?.('wyslane')
  let res
  try {
    res = await fetch(N8N_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ job_id: jobId }),
    })
  } catch {
    await supabase.from('jobs').update({ status: 'blad', error: 'Brak połączenia z n8n' }).eq('id', jobId).eq('status', 'w_kolejce')
    throw new Error('Brak połączenia z n8n. Sprawdź, czy workflow jest włączony.')
  }
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    await supabase.from('jobs').update({ status: 'blad', error: body.error || `kod ${res.status}` }).eq('id', jobId).eq('status', 'w_kolejce')
    throw new Error(body.error || `n8n odrzucił zadanie (kod ${res.status}).`)
  }
  onStage?.('w_toku')
  for (let i = 0; i < timeoutSec / 2; i++) {
    await sleep(2000)
    const { data } = await supabase.from('jobs').select('status, result, error').eq('id', jobId).single()
    if (data?.status === 'gotowe') return data.result
    if (data?.status === 'blad') throw new Error(data.error || 'n8n zgłosił błąd zadania.')
  }
  throw new Error('Zadanie trwa zbyt długo. Sprawdź listę wykonań (Executions) w n8n.')
}
