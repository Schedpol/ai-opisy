import { useEffect, useState } from 'react'
import { supabase, plError, STATUS_FLOW } from '../supabase.js'
import N8nTest from '../components/N8nTest.jsx'

export default function Dashboard({ profile }) {
  const [state, setState] = useState({ loading: true })

  useEffect(() => {
    (async () => {
      const head = (t, f) => { let q = supabase.from(t).select('*', { count: 'exact', head: true }); if (f) q = f(q); return q }
      const [ch, desc, prod, fam, facts] = await Promise.all([
        supabase.from('channels').select('id, code, marketplace, language, active, baselinker_source_id'),
        supabase.from('descriptions').select('status, channel_id'),
        head('products'),
        head('product_families'),
        head('kb_facts', q => q.eq('status', 'do_akceptacji')),
      ])
      const err = [ch, desc, prod, fam, facts].find(r => r.error)?.error
      if (err) { setState({ loading: false, error: plError(err.message) }); return }
      const order = { ro: 1, hu: 2, bg: 3 }
      const channels = [...ch.data].sort((a, b) => (order[a.language] || 9) - (order[b.language] || 9))
      setState({ loading: false, channels, descriptions: desc.data, products: prod.count, families: fam.count, pendingFacts: facts.count })
    })()
  }, [])

  if (state.loading) return <section className="page"><p className="muted">Ładowanie danych…</p></section>
  if (state.error) return (
    <section className="page">
      <h1>Dashboard</h1>
      <div className="panel"><p className="error" role="alert">Nie udało się pobrać danych: {state.error}</p></div>
    </section>
  )

  const byStatus = Object.fromEntries(STATUS_FLOW.map(s => [s.key, 0]))
  for (const d of state.descriptions) if (d.status in byStatus) byStatus[d.status]++
  const total = state.descriptions.length

  return (
    <section className="page">
      <header className="page-head">
        <h1>Dashboard</h1>
        <p className="conn ok-dot">Połączono z bazą · {state.channels.length} kanały</p>
      </header>

      <div className="pipe" role="list" aria-label="Opisy według statusu">
        {STATUS_FLOW.map((s, i) => (
          <div key={s.key} role="listitem" className={'pipe-stage' + (i === STATUS_FLOW.length - 1 ? ' last' : '')}>
            <span className="pipe-count">{byStatus[s.key]}</span>
            <span className="pipe-label">{s.label}</span>
          </div>
        ))}
      </div>
      {total === 0 && (
        <p className="muted pipe-empty">Jeszcze nie ma opisów. Pierwsze pojawią się po imporcie produktów i wygenerowaniu opisów bazowych rodzin.</p>
      )}

      <div className="grid">
        <div className="panel">
          <h2>Rynki</h2>
          <table>
            <thead><tr><th>Kanał</th><th>Opublikowane</th><th>Integracja Baselinker</th></tr></thead>
            <tbody>
              {state.channels.map(c => {
                const all = state.descriptions.filter(d => d.channel_id === c.id).length
                const pub = state.descriptions.filter(d => d.channel_id === c.id && d.status === 'opublikowany').length
                return (
                  <tr key={c.id}>
                    <td>{c.marketplace} {c.language.toUpperCase()}</td>
                                        <td>{pub} / {all}</td>
                    <td>{c.baselinker_source_id ? c.baselinker_source_id : <span className="tag warn">do uzupełnienia</span>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="panel">
          <h2>Katalog i wiedza</h2>
          <dl className="facts">
            <dt>Produkty (SKU)</dt><dd>{state.products ?? 0}</dd>
            <dt>Rodziny produktów</dt><dd>{state.families ?? 0}</dd>
            <dt>Fakty do akceptacji</dt><dd>{state.pendingFacts ?? 0}</dd>
          </dl>
        </div>
        {profile?.role === 'admin' && <N8nTest />}
      </div>
    </section>
  )
}
