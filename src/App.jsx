import { useEffect, useState } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { supabase, configMissing } from './supabase.js'
import Layout from './components/Layout.jsx'
import Login from './pages/Login.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Account from './pages/Account.jsx'
import Users from './pages/Users.jsx'
import Soon from './pages/Soon.jsx'

export default function App() {
  const [session, setSession] = useState(undefined)
  const [profile, setProfile] = useState(null)

  useEffect(() => {
    if (configMissing) return
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) { setProfile(null); return }
    supabase.from('profiles').select('id, email, full_name, role').eq('id', session.user.id).single()
      .then(({ data }) => setProfile(data))
  }, [session])

  if (configMissing) {
    return (
      <main className="center-screen">
        <div className="panel narrow">
          <h1>Brakuje konfiguracji</h1>
          <p>Strona nie zna adresu bazy. Dodaj w repozytorium GitHub zmienne <code>VITE_SUPABASE_URL</code> i <code>VITE_SUPABASE_ANON_KEY</code> (Settings → Secrets and variables → Actions → Variables), a potem uruchom wdrożenie ponownie.</p>
        </div>
      </main>
    )
  }
  if (session === undefined) return <main className="center-screen"><p className="muted">Ładowanie…</p></main>
  if (!session) return <Login />

  const soon = (title, stage) => <Soon title={title} stage={stage} />
  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout profile={profile} />}>
          <Route index element={<Dashboard profile={profile} />} />
          <Route path="produkty" element={soon('Produkty', 'Etap 2: import z Baselinkera i Excela, rodziny produktów.')} />
          <Route path="wiedza" element={soon('Księga wiedzy', 'Etap 2: wgrywanie DOCX i akceptacja faktów.')} />
          <Route path="szablony" element={soon('Szablony', 'Etap 3: wizualny edytor szablonów.')} />
          <Route path="frazy" element={soon('Frazy kluczowe', 'Etap 3: bank fraz RO, HU i BG.')} />
          <Route path="weryfikacja" element={soon('Weryfikacja', 'Etap 3: oryginał i tłumaczenie PL obok siebie.')} />
          <Route path="publikacja" element={soon('Publikacja', 'Etap 4: zapis opisów do Baselinkera.')} />
          <Route path="reguly" element={soon('Reguły QA', 'Etap 4: zakazane sformułowania i limity.')} />
          <Route path="uzytkownicy" element={profile?.role === 'admin' ? <Users /> : <Navigate to="/" />} />
          <Route path="konto" element={<Account profile={profile} />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
