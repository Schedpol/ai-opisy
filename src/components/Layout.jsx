import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import HelpDrawer from '../help/HelpDrawer.jsx'
import JobOverlay from './JobOverlay.jsx'
import { jobActivity, activeJobCount } from '../jobs.js'
import { supabase, ROLE_LABELS } from '../supabase.js'

// Menu w kolejności pracy; „Konfiguracja” tylko dla admina
const GROUPS = [
  { label: 'Start', items: [{ to: '/', label: 'Dashboard', end: true }] },
  { label: 'Produkty', items: [{ to: '/drzewo', label: 'Drzewo produktów' }, { to: '/produkty', label: 'Produkty' }] },
  { label: 'Przygotowanie treści', items: [{ to: '/wiedza', label: 'Księga wiedzy' }, { to: '/frazy', label: 'Frazy kluczowe' }, { to: '/szablony', label: 'Szablony' }, { to: '/biblioteka', label: 'Biblioteka grafik' }] },
  { label: 'Kontrola i publikacja', items: [{ to: '/weryfikacja', label: 'Weryfikacja', badge: 'review' }, { to: '/publikacja', label: 'Publikacja' }, { to: '/parametry', label: 'Parametry Base' }] },
  { label: 'Konfiguracja', admin: true, items: [{ to: '/slownik', label: 'Słownik importu' }, { to: '/reguly', label: 'Reguły QA' }, { to: '/ustawienia', label: 'Ustawienia' }, { to: '/uzytkownicy', label: 'Użytkownicy' }] },
]

export default function Layout({ profile }) {
  const [help, setHelp] = useState(false)
  const loc = useLocation()
  const [working, setWorking] = useState(activeJobCount())
  // licznik opisów czekających na weryfikację (odświeżany przy zmianie ekranu)
  const [review, setReview] = useState(0)
  useEffect(() => { supabase.from('descriptions').select('id', { count: 'exact', head: true }).in('status', ['do_weryfikacji', 'poprawki']).then(r => setReview(r.count || 0)) }, [loc.pathname])
  useEffect(() => { const f = e => setWorking(e.detail); jobActivity.addEventListener('change', f); return () => jobActivity.removeEventListener('change', f) }, [])
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className={working ? 'brand-mark flowing' : 'brand-mark'} aria-hidden="true"><i /><i /><i /><i /><i /></span>
          <span className="sr-only" role="status">{working ? 'Trwa zadanie AI' : ''}</span>
          <span title={working ? `Trwa zadanie AI (${working})` : undefined}>AI Opisy</span>
        </div>
        <nav aria-label="Główna nawigacja">
          {GROUPS.filter(g => !g.admin || profile?.role === 'admin').map(g => (
            <div key={g.label} className="nav-group">
              <span className="nav-group-label">{g.label}</span>
              {g.items.map(n => (
                <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
                  {n.label}{n.badge === 'review' && review > 0 && <span className="nav-badge" aria-label={`${review} czeka na weryfikację`}>{review}</span>}
                </NavLink>
              ))}
            </div>
          ))}
          {profile?.role !== 'admin' && <div className="nav-group"><span className="nav-group-label">Konfiguracja</span><NavLink to="/reguly" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>Reguły QA</NavLink></div>}
        </nav>
        <div className="help-links">
          <NavLink to="/pomoc" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>Instrukcja</NavLink>
          {loc.pathname !== '/pomoc' && <button className="nav-link help-btn" onClick={() => setHelp(v => !v)} aria-expanded={help}>? Pomoc do tego ekranu</button>}
        </div>
        <div className="sidebar-foot">
          <NavLink to="/konto" className="me">
            <span className="me-name">{profile?.full_name || profile?.email || '…'}</span>
            <span className="me-role">{ROLE_LABELS[profile?.role] || ''}</span>
          </NavLink>
          <button className="link-btn" onClick={() => supabase.auth.signOut()}>Wyloguj</button>
        </div>
      </aside>
      <main className="content">
        <Outlet />
      </main>
      <HelpDrawer open={help && loc.pathname !== '/pomoc'} onClose={() => setHelp(false)} />
      <JobOverlay />
    </div>
  )
}
