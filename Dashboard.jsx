import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, plError } from '../supabase.js'
import N8nTest from '../components/N8nTest.jsx'

const STAGES = [['do_generacji', 'Do generacji'], ['do_weryfikacji', 'Do weryfikacji'], ['blad', 'Błędy'], ['zaakceptowany', 'Zaakceptowane'], ['opublikowany', 'Opublikowane']]
const N8N_LIMIT = 2500

export default function Dashboard({ profile }) {
  const [s, setS] = useState({ loading: true })

  useEffect(() => { (async () => {
    const month = new Date(); month.setDate(1); month.setHours(0, 0, 0, 0)
    const [ch, tp, fam, prod, desc, jobs, facts] = await Promise.all([
      supabase.from('channels').select('id, marketplace, language, active, baselinker_source_id').eq('active', true),
      supabase.from('templates').select('channel_id, brand_id').eq('status', 'aktywny'),
      supabase.from('product_families').select('id, brand_id, model_name'),
      supabase.from('products').select('id, family_id'),
      supabase.from('descriptions').select('id, family_id, channel_id, product_id, version, status, is_base, qa, created_at, meta').order('version', { ascending: false }),
      supabase.from('jobs').select('*', { count: 'exact', head: true }).gte('created_at', month.toISOString()),
      supabase.from('kb_facts').select('*', { count: 'exact', head: true }).eq('status', 'do_akceptacji'),
    ])
    const err = [ch, tp, fam, prod, desc, jobs, facts].find(r => r.error)?.error
    if (err) { setS({ error: plError(err.message) }); return }
    const famBrand = Object.fromEntries(fam.data.map(f => [f.id, f.brand_id]))
    const latest = {}
    for (const d of desc.data) { const k = `${d.channel_id}|${d.product_id}`; if (!latest[k]) latest[k] = d }
    // sloty = produkt × aktywny kanał z szablonem dla marki produktu
    const slots = []
    for (const p of prod.data) for (const c of ch.data) if (tp.data.some(t => t.channel_id === c.id && t.brand_id === famBrand[p.family_id])) slots.push({ p, c, d: latest[`${c.id}|${p.id}`] })
    const stageOf = d => !d ? 'do_generacji' : d.status === 'generowanie' ? 'do_weryfikacji' : d.status === 'poprawki' ? 'do_weryfikacji' : d.status
    const funnel = Object.fromEntries(STAGES.map(([k]) => [k, 0]))
    slots.forEach(x => { const st = stageOf(x.d); if (st in funnel) funnel[st]++ })
    const order = { ro: 1, hu: 2, bg: 3 }
    const markets = [...ch.data].sort((a, b) => (order[a.language] || 9) - (order[b.language] || 9)).map(c => {
      const mine = slots.filter(x => x.c.id === c.id)
      return { c, total: mine.length, accepted: mine.filter(x => x.d?.status === 'zaakceptowany').length, published: mine.filter(x => x.d?.status === 'opublikowany').length }
    })
    const done = Object.values(latest).filter(d => d.qa)
    const variants = done.filter(d => !d.is_base)
    const queue = Object.values(latest).filter(d => d.status === 'do_weryfikacji').sort((a, b) => a.created_at.localeCompare(b.created_at))
    setS({ loading: false, funnel, total: slots.length, markets, queue, famName: Object.fromEntries(fam.data.map(f => [f.id, f.model_name])),
      chName: Object.fromEntries(ch.data.map(c => [c.id, `${c.marketplace} ${c.language.toUpperCase()}`])),
      quality: { variants: variants.length, autoOk: variants.filter(d => d.qa?.pass && d.status !== 'do_weryfikacji').length,
        qaFail: done.filter(d => d.qa && !d.qa.pass).length, revised: Object.values(latest).filter(d => d.version > 1).length,
        langNotes: done.reduce((n, d) => n + (d.qa?.language_notes?.length || 0), 0) },
      jobs: jobs.count || 0, pendingFacts: facts.count || 0, families: fam.data.length, products: prod.data.length })
  })() }, [])

  if (s.loading) return <section className="page"><p className="muted">Ładowanie danych…</p></section>
  if (s.error) return <section className="page"><h1>Dashboard</h1><div className="panel"><p className="error" role="alert">Nie udało się pobrać danych: {s.error}</p></div></section>
  const pct = (a, b) => b ? Math.round(100 * a / b) : 0
  const age = d => { const days = Math.floor((Date.now() - new Date(d).getTime()) / 864e5); return days === 0 ? 'dziś' : days === 1 ? '1 dzień' : `${days} dni` }

  return (
    <section className="page">
      <header className="page-head">
        <h1>Dashboard</h1>
        <p className="conn ok-dot">{s.products} SKU w {s.families} rodzinach · {s.total} opisów do pokrycia</p>
      </header>
      <div className="pipe" role="list" aria-label="Opisy według statusu">
        {STAGES.map(([k, l], i) => (
          <div key={k} role="listitem" className={'pipe-stage' + (i === STAGES.length - 1 ? ' last' : '') + (k === 'blad' && s.funnel[k] ? ' alert' : '')}>
            <span className="pipe-count">{s.funnel[k]}</span><span className="pipe-label">{l}</span>
          </div>
        ))}
      </div>
      <div className="grid">
        <div className="panel">
          <h2>Rynki</h2>
          <table className="compact">
            <thead><tr><th>Kanał</th><th>Opublikowane</th><th className="bar-col" /><th>Zaakceptowane</th></tr></thead>
            <tbody>{s.markets.map(m => (
              <tr key={m.c.id}>
                <td><strong>{m.c.marketplace} {m.c.language.toUpperCase()}</strong>{!m.c.baselinker_source_id && <span className="tag warn">brak ID integracji</span>}</td>
                <td className="mono">{m.published} / {m.total}</td>
                <td className="bar-col"><span className="bar"><span style={{ width: `${pct(m.published, m.total)}%` }} /></span></td>
                <td className="mono">{m.accepted}</td>
              </tr>))}</tbody>
          </table>
        </div>
        <div className="panel">
          <h2>Jakość</h2>
          <dl className="facts">
            <dt>Warianty zaakceptowane automatycznie</dt><dd>{s.quality.autoOk} / {s.quality.variants}</dd>
            <dt>Opisy z błędami QA</dt><dd>{s.quality.qaFail}</dd>
            <dt>Opisy poprawiane przez recenzenta</dt><dd>{s.quality.revised}</dd>
            <dt>Uwagi językowe AI</dt><dd>{s.quality.langNotes}</dd>
          </dl>
        </div>
        <div className="panel">
          <h2>Kolejka do weryfikacji</h2>
          {s.pendingFacts > 0 && <p className="hint">{s.pendingFacts} faktów czeka na akceptację w <Link to="/wiedza">Księdze wiedzy</Link>.</p>}
          {s.queue.length === 0 ? <p className="muted">Pusto – nic nie czeka.</p> : (
            <table className="compact">
              <thead><tr><th>Opis</th><th>Kanał</th><th>Czeka</th></tr></thead>
              <tbody>{s.queue.slice(0, 6).map(d => (
                <tr key={d.id}><td><Link to={`/weryfikacja/${d.id}`}>{s.famName[d.family_id]}{d.is_base ? ' (bazowy)' : ''}</Link></td><td>{s.chName[d.channel_id]}</td><td className={Date.now() - new Date(d.created_at) > 3 * 864e5 ? 'flags' : 'muted'}>{age(d.created_at)}</td></tr>
              ))}</tbody>
            </table>
          )}
          {s.queue.length > 6 && <p className="muted small"><Link to="/weryfikacja">i {s.queue.length - 6} więcej</Link></p>}
        </div>
        <div className="panel">
          <h2>Wykonania n8n w tym miesiącu</h2>
          <p className="big">{s.jobs} <span className="muted">/ {N8N_LIMIT}</span></p>
          <span className="bar wide"><span className={pct(s.jobs, N8N_LIMIT) > 80 ? 'hot' : ''} style={{ width: `${Math.min(100, pct(s.jobs, N8N_LIMIT))}%` }} /></span>
          <p className="muted small">Liczone są zadania z aplikacji. Inne workflow (np. wizualizacje) korzystają z tego samego limitu planu Starter.</p>
        </div>
        {profile?.role === 'admin' && <N8nTest />}
      </div>
    </section>
  )
}
