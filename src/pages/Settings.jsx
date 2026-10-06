import { useEffect, useState } from 'react'
import { supabase, plError } from '../supabase.js'
import { runJob, PUBLISH_URL } from '../jobs.js'

export default function Settings() {
  const [channels, setChannels] = useState([])
  const [edit, setEdit] = useState({})
  const [integ, setInteg] = useState(null)
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState('')

  async function load() {
    const { data } = await supabase.from('channels').select('*').order('code')
    setChannels(data || []); setEdit(Object.fromEntries((data || []).map(c => [c.id, { src: c.baselinker_source_id || '', active: c.active, title_max: c.limits?.title_max ?? 200 }])))
  }
  useEffect(() => { load() }, [])

  async function fetchIntegrations() {
    setBusy('integ'); setMsg(null)
    try { const r = await runJob('bl_integrations', {}, { url: PUBLISH_URL, timeoutSec: 60 }); setInteg(r.integrations || []) }
    catch (e) { setMsg({ type: 'error', text: e.message }) } finally { setBusy('') }
  }
  async function save(c) {
    setBusy(c.id); setMsg(null)
    const e = edit[c.id]
    const { error } = await supabase.from('channels').update({ baselinker_source_id: e.src.trim() || null, active: e.active, limits: { ...(c.limits || {}), title_max: Number(e.title_max) || 200 } }).eq('id', c.id)
    setMsg(error ? { type: 'error', text: plError(error.message) } : { type: 'ok', text: `Zapisano ${c.marketplace} ${c.language.toUpperCase()}.` })
    setBusy(''); if (!error) load()
  }

  return (
    <section className="page">
      <h1>Ustawienia</h1>
      <div className="panel">
        <div className="panel-head">
          <h2>Kanały sprzedaży</h2>
          <button className="btn ghost top" onClick={fetchIntegrations} disabled={busy === 'integ'}>{busy === 'integ' ? 'Pobieranie…' : 'Pobierz integracje z Baselinkera'}</button>
        </div>
        <p className="muted small">ID integracji wskazuje, do którego konta marketplace w Baselinkerze trafi opis (np. emag_12345). Bez niego publikacja w danym kanale jest zablokowana.</p>
        {integ && (
          <div className="integ">
            {integ.length === 0 ? <p className="hint">Baselinker nie zwrócił integracji dla tego katalogu.</p> : integ.map(i => (
              <span key={i.source_id} className="integ-item"><code>{i.source_id}</code> <span className="muted">{i.name}</span>
                <button className="link-dark" onClick={() => navigator.clipboard.writeText(i.source_id)}>kopiuj</button></span>
            ))}
          </div>
        )}
        <div className="table-wrap">
          <table className="compact">
            <thead><tr><th>Kanał</th><th>ID integracji Baselinker</th><th>Limit tytułu</th><th>Aktywny</th><th /></tr></thead>
            <tbody>
              {channels.map(c => {
                const e = edit[c.id] || {}
                const dirty = e.src !== (c.baselinker_source_id || '') || e.active !== c.active || Number(e.title_max) !== (c.limits?.title_max ?? 200)
                return (
                  <tr key={c.id}>
                    <td><strong>{c.marketplace} {c.language.toUpperCase()}</strong></td>
                    <td><input value={e.src || ''} placeholder="np. emag_12345" list="integ-list" onChange={ev => setEdit({ ...edit, [c.id]: { ...e, src: ev.target.value } })} /></td>
                    <td><input type="number" min="50" max="255" value={e.title_max ?? 200} onChange={ev => setEdit({ ...edit, [c.id]: { ...e, title_max: ev.target.value } })} style={{ width: 90 }} /></td>
                    <td><input type="checkbox" checked={!!e.active} onChange={ev => setEdit({ ...edit, [c.id]: { ...e, active: ev.target.checked } })} /></td>
                    <td><button className="btn ghost small-btn" disabled={!dirty || busy === c.id} onClick={() => save(c)}>Zapisz</button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <datalist id="integ-list">{(integ || []).map(i => <option key={i.source_id} value={i.source_id}>{i.name}</option>)}</datalist>
        {msg && <p className={msg.type} role="status">{msg.text}</p>}
      </div>
    </section>
  )
}
