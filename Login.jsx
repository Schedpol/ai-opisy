import { useState } from 'react'
import { supabase, plError } from '../supabase.js'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setBusy(true); setError('')
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) setError(plError(error.message))
    setBusy(false)
  }

  return (
    <main className="login">
      <section className="login-side" aria-hidden="true">
        <div className="drain">
          <span /><span /><span /><span /><span /><span /><span />
        </div>
        <p className="login-claim">Opisy produktów na eMAG RO, HU i BG z jednej księgi wiedzy.</p>
      </section>
      <section className="login-form">
        <form onSubmit={submit} className="panel narrow" noValidate>
          <h1>Zaloguj się</h1>
          <p className="muted">Konto zakłada admin aplikacji.</p>
          <label>E-mail
            <input type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required />
          </label>
          <label>Hasło
            <input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required />
          </label>
          {error && <p className="error" role="alert">{error}</p>}
          <button className="btn" disabled={busy || !email || !password}>{busy ? 'Logowanie…' : 'Zaloguj się'}</button>
        </form>
      </section>
    </main>
  )
}
