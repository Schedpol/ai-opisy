import { useEffect, useMemo, useState } from 'react'
import mammoth from 'mammoth/mammoth.browser.js'
import { supabase, plError } from '../supabase.js'
import { applies, scopeLabel, LEVEL_LABEL } from '../knowledge.js'
import { runJob } from '../jobs.js'

const plural = (n, one, few, many) => n === 1 ? one : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) ? few : many

const TABS = [['do_akceptacji', 'Do akceptacji'], ['zatwierdzony', 'Zatwierdzone'], ['odrzucony', 'Odrzucone'], ['dokumenty', 'Dokumenty']]

function FactCard({ fact, ctx, canApprove, onChanged }) {
  const [content, setContent] = useState(fact.content)
  const [source, setSource] = useState(fact.source || '')
  const [err, setErr] = useState('')
  const notes = (fact.source_note || '').split(' · ').filter(Boolean)
  const needsSource = (fact.source_note || '').startsWith('WYMAGA ŹRÓDŁA')
  const fams = ctx.families.filter(f => applies(fact, f)).map(f => f.model_name)
  const dirty = content.trim() !== fact.content || source.trim() !== (fact.source || '')

  async function update(patch) {
    setErr('')
    const { error } = await supabase.from('kb_facts').update(patch).eq('id', fact.id)
    if (error) setErr(plError(error.message)); else onChanged()
  }

  return (
    <article className="fact">
      <div className="fact-main">
        <textarea value={content} onChange={e => setContent(e.target.value)} rows={Math.max(2, Math.ceil(content.length / 90))} aria-label="Treść faktu" />
        <p className="fact-meta">
          <span className="tag">{scopeLabel(fact, ctx.brands, ctx.families)}</span>
          <span className={fams.length ? 'muted' : 'hint-inline'}>{fams.length ? `Dotyczy: ${fams.join(', ')}` : 'Nie dotyczy żadnej rodziny w katalogu'}</span>
        </p>
        <ul className="notes">
          {notes.map((n, i) => <li key={i} className={n.startsWith('WYMAGA') ? 'tag warn' : 'muted'}>{n}</li>)}
        </ul>
        {err && <p className="error" role="alert">{err}</p>}
      </div>
      <div className="fact-side">
        <label>Źródło{needsSource && <span className="req"> (wymagane)</span>}
          <input value={source} onChange={e => setSource(e.target.value)} placeholder="np. Raport z badania nr…" />
        </label>
        {dirty && <button className="btn ghost" onClick={() => update({ content: content.trim(), source: source.trim() || null })}>Zapisz zmiany</button>}
        {canApprove && fact.status === 'do_akceptacji' && (
          <div className="fact-actions">
            <button className="btn" disabled={needsSource && !source.trim()} title={needsSource && !source.trim() ? 'Najpierw wpisz źródło' : ''}
              onClick={() => update({ content: content.trim(), source: source.trim() || null, status: 'zatwierdzony' })}>Zatwierdź</button>
            <button className="btn ghost danger" onClick={() => update({ status: 'odrzucony' })}>Odrzuć</button>
          </div>
        )}
        {fact.status !== 'do_akceptacji' && (
          <button className="link-dark" onClick={() => update({ status: 'do_akceptacji' })}>Cofnij do akceptacji</button>
        )}
      </div>
    </article>
  )
}

function AddFact({ ctx, onAdded }) {
  const aedler = ctx.brands.find(b => b.name === 'Aedler')?.id || ctx.brands[0]?.id
  const [f, setF] = useState({ content: '', level: 'seria', brand_id: aedler, technology: '', series: '', family_id: '' })
  const [err, setErr] = useState('')
  async function add(e) {
    e.preventDefault(); setErr('')
    const row = { content: f.content.trim(), level: f.level, brand_id: f.brand_id || null, source_note: 'Dodany ręcznie',
      technology: f.level === 'technologia' ? f.technology.trim() : null, series: f.level === 'seria' ? f.series.trim() : null,
      family_id: ['model', 'wariant'].includes(f.level) ? f.family_id || null : null }
    const { error } = await supabase.from('kb_facts').insert(row)
    if (error) setErr(plError(error.message)); else { setF({ ...f, content: '' }); onAdded() }
  }
  return (
    <details className="panel add-fact">
      <summary>Dodaj fakt ręcznie</summary>
      <form onSubmit={add}>
        <label>Treść faktu (jedno zdanie, z nazwą technologii, serii lub modelu)
          <textarea rows={2} value={f.content} onChange={e => setF({ ...f, content: e.target.value })} />
        </label>
        <div className="grid-form">
          <label>Poziom<select value={f.level} onChange={e => setF({ ...f, level: e.target.value })}>
            {Object.entries(LEVEL_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label>Marka<select value={f.brand_id || ''} onChange={e => setF({ ...f, brand_id: e.target.value })}>
            {ctx.brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
          {f.level === 'technologia' && <label>Technologia<input list="tech-list" value={f.technology} onChange={e => setF({ ...f, technology: e.target.value })} /></label>}
          {f.level === 'seria' && <label>Seria<input list="series-list" value={f.series} onChange={e => setF({ ...f, series: e.target.value })} /></label>}
          {['model', 'wariant'].includes(f.level) && <label>Rodzina<select value={f.family_id} onChange={e => setF({ ...f, family_id: e.target.value })}>
            <option value="">— wybierz —</option>{ctx.families.map(x => <option key={x.id} value={x.id}>{x.model_name}</option>)}</select></label>}
        </div>
        <datalist id="tech-list">{ctx.technologies.map(t => <option key={t} value={t} />)}</datalist>
        <datalist id="series-list">{ctx.series.map(t => <option key={t} value={t} />)}</datalist>
        {err && <p className="error">{err}</p>}
        <button className="btn" disabled={f.content.trim().length < 10}>Dodaj do akceptacji</button>
      </form>
    </details>
  )
}

function Documents({ ctx, docs, onDone }) {
  const aedler = ctx.brands.find(b => b.name === 'Aedler')?.id || ctx.brands[0]?.id
  const [brandId, setBrandId] = useState(aedler)
  const [stage, setStage] = useState('')
  const [err, setErr] = useState('')
  const [result, setResult] = useState(null)

  async function upload(e) {
    const file = e.target.files?.[0]; e.target.value = ''
    if (!file) return
    setErr(''); setResult(null)
    try {
      if (!/\.docx$/i.test(file.name)) throw new Error('Obsługiwany format to DOCX (Word 2007 i nowsze).')
      setStage('Odczytywanie tekstu z dokumentu…')
      const { value: text } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })
      if (text.trim().length < 50) throw new Error('Dokument nie zawiera tekstu (może to skan albo same obrazki).')
      setStage('Zapisywanie pliku…')
      const { data: { session } } = await supabase.auth.getSession()
      const path = `${crypto.randomUUID()}-${file.name.replace(/[^\w.\-]+/g, '_')}`
      const up = await supabase.storage.from('kb-docs').upload(path, file)
      if (up.error) throw up.error
      const ins = await supabase.from('kb_documents').insert({ file_name: file.name, file_path: path, status: 'przetwarzanie', uploaded_by: session.user.id }).select('id').single()
      if (ins.error) throw ins.error
      setStage('AI wyciąga fakty (do ok. 2 minut)…')
      const brand = ctx.brands.find(b => b.id === brandId)
      const fams = ctx.families.filter(f => f.brand_id === brandId)
      const res = await runJob('kb_extract', {
        document_id: ins.data.id, file_name: file.name, brand_id: brandId, brand_name: brand?.name, text: text.slice(0, 60000),
        families: fams.map(f => ({ id: f.id, model_name: f.model_name, series: f.series })), technologies: ctx.technologies, series: ctx.series,
      }, { timeoutSec: 240 })
      setResult(res); onDone()
    } catch (e2) { setErr(plError(e2.message)) } finally { setStage('') }
  }

  return (
    <>
      <div className="panel">
        <h2>Wgraj dokument</h2>
        <p className="muted">AI wyciągnie z niego fakty według zasad księgi wiedzy: bez haseł reklamowych, z flagami twierdzeń wymagających źródła. Wszystkie trafią do akceptacji.</p>
        <div className="row-form">
          <label>Marka<select value={brandId || ''} onChange={e => setBrandId(e.target.value)}>
            {ctx.brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
          <label>Plik DOCX<input type="file" accept=".docx" onChange={upload} disabled={!!stage} /></label>
        </div>
        {stage && <p className="muted" role="status">{stage}</p>}
        {err && <p className="error" role="alert">{err}</p>}
        {result && (
          <div className="extract-result">
            <p className="ok">Wyciągnięto {result.inserted} {plural(result.inserted, 'fakt', 'fakty', 'faktów')}{result.needs_source ? `, w tym ${result.needs_source} ${plural(result.needs_source, 'wymagający', 'wymagające', 'wymagających')} źródła` : ''}. Znajdziesz je w zakładce „Do akceptacji”.</p>
            {result.rejected?.length > 0 && (
              <details><summary>Pominięte fragmenty ({result.rejected.length})</summary>
                <ul className="rejected">{result.rejected.map((r, i) => <li key={i}><q>{r.text}</q> <span className="muted">– {r.reason}</span></li>)}</ul>
              </details>
            )}
          </div>
        )}
      </div>
      <div className="panel table-wrap">
        <table className="compact">
          <thead><tr><th>Dokument</th><th>Wgrany</th><th>Status</th><th>Fakty</th><th>Pominięte</th></tr></thead>
          <tbody>
            {docs.length === 0 && <tr><td colSpan={5} className="muted">Brak dokumentów.</td></tr>}
            {docs.map(d => (
              <tr key={d.id}>
                <td>{d.file_name}</td>
                <td>{new Date(d.created_at).toLocaleDateString('pl-PL')}</td>
                <td>{{ wgrany: 'wgrany', przetwarzanie: 'w trakcie', fakty_wyciagniete: 'gotowy', blad: 'błąd' }[d.status]}</td>
                <td>{d.extraction?.facts ?? '—'}</td>
                <td>{d.extraction?.rejected?.length ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

export default function Knowledge({ profile }) {
  const [tab, setTab] = useState('do_akceptacji')
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const canApprove = ['akceptujacy', 'admin'].includes(profile?.role)

  async function load() {
    const [f, b, fam, d] = await Promise.all([
      supabase.from('kb_facts').select('*').order('created_at'),
      supabase.from('brands').select('id, name'),
      supabase.from('product_families').select('id, brand_id, model_name, series, technologies').order('model_name'),
      supabase.from('kb_documents').select('*').order('created_at', { ascending: false }),
    ])
    const err = [f, b, fam, d].find(x => x.error)?.error
    if (err) { setError(plError(err.message)); return }
    setData({ facts: f.data, brands: b.data, families: fam.data, docs: d.data })
  }
  useEffect(() => { load() }, [])

  const ctx = useMemo(() => {
    if (!data) return null
    const uniq = arr => [...new Set(arr.filter(Boolean).map(s => s.trim()))].sort()
    return { brands: data.brands, families: data.families,
      technologies: uniq([...data.facts.map(f => f.technology), ...data.families.flatMap(f => f.technologies || [])]),
      series: uniq([...data.facts.map(f => f.series), ...data.families.map(f => f.series)]) }
  }, [data])

  if (error) return <section className="page"><h1>Księga wiedzy</h1><p className="error">{error}</p></section>
  if (!data) return <section className="page"><p className="muted">Ładowanie…</p></section>

  const count = s => data.facts.filter(f => f.status === s).length
  const shown = data.facts.filter(f => f.status === tab)

  return (
    <section className="page">
      <h1>Księga wiedzy</h1>
      <div className="tabs" role="tablist">
        {TABS.map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'tab on' : 'tab'} onClick={() => setTab(k)}>
            {l}{k !== 'dokumenty' && <span className="count">{count(k)}</span>}
          </button>
        ))}
      </div>
      {tab === 'dokumenty' ? <Documents ctx={ctx} docs={data.docs} onDone={load} /> : (
        <>
          {tab === 'do_akceptacji' && !canApprove && <p className="hint">Fakty zatwierdza osoba z rolą Akceptujący. Możesz poprawiać ich treść i dodawać źródła.</p>}
          {tab === 'do_akceptacji' && data.facts.some(f => f.level === 'technologia' && !data.families.some(fam => applies(f, fam))) &&
            <p className="hint">Fakty o technologii trafiają do rodzin, którym tę technologię przypiszesz na ekranie Produkty. Przypisuj wyłącznie technologie, które rodzina faktycznie ma – inaczej fakty trafią do niewłaściwych opisów.</p>}
          {tab === 'do_akceptacji' && <AddFact ctx={ctx} onAdded={load} />}
          {shown.length === 0 && <div className="panel empty"><p className="muted">Brak faktów w tej zakładce.</p></div>}
          {shown.map(f => <FactCard key={f.id + f.status + (f.source || '') + f.content} fact={f} ctx={ctx} canApprove={canApprove} onChanged={load} />)}
        </>
      )}
    </section>
  )
}
