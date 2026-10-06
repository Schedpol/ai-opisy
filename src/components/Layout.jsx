import { NavLink, Outlet } from 'react-router-dom'
import { supabase, ROLE_LABELS } from '../supabase.js'

const NAV = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/produkty', label: 'Produkty' },
  { to: '/slownik', label: 'Słownik importu' },
  { to: '/wiedza', label: 'Księga wiedzy' },
  { to: '/szablony', label: 'Szablony' },
  { to: '/biblioteka', label: 'Biblioteka grafik' },
  { to: '/frazy', label: 'Frazy kluczowe' },
  { to: '/weryfikacja', label: 'Weryfikacja' },
  { to: '/publikacja', label: 'Publikacja' },
  { to: '/reguly', label: 'Reguły QA' },
]

export default function Layout({ profile }) {
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <span>AI Opisy</span>
        </div>
        <nav aria-label="Główna nawigacja">
          {NAV.map(n => (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
              {n.label}
            </NavLink>
          ))}
          {profile?.role === 'admin' && (
            <><NavLink to="/uzytkownicy" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>Użytkownicy</NavLink>
            <NavLink to="/ustawienia" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>Ustawienia</NavLink></>
          )}
        </nav>
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
    </div>
  )
}
