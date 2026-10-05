import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

export const configMissing = !url || !key
export const supabase = configMissing ? null : createClient(url, key)

export const ROLE_LABELS = { admin: 'Admin', akceptujacy: 'Akceptujący', generujacy: 'Generujący' }

export const STATUS_FLOW = [
  { key: 'do_generacji', label: 'Do generacji' },
  { key: 'do_weryfikacji', label: 'Do weryfikacji' },
  { key: 'poprawki', label: 'Poprawki' },
  { key: 'zaakceptowany', label: 'Zaakceptowane' },
  { key: 'opublikowany', label: 'Opublikowane' },
]

export function plError(message = '') {
  if (message.includes('Invalid login credentials')) return 'Nieprawidłowy e-mail lub hasło.'
  if (message.includes('Email not confirmed')) return 'Konto nie jest potwierdzone. Poproś admina o zaznaczenie „Auto Confirm” w Supabase.'
  if (message.includes('should be different')) return 'Nowe hasło musi się różnić od obecnego.'
  if (message.includes('Password should be at least')) return 'Hasło jest za krótkie.'
  if (message.includes('Failed to fetch')) return 'Brak połączenia z bazą. Sprawdź internet albo adres Supabase w zmiennych repozytorium.'
  return message || 'Nieznany błąd.'
}

export const N8N_URL = import.meta.env.VITE_N8N_WEBHOOK_URL || ''
