# AI Opisy – Schedpol

Aplikacja do generowania i weryfikacji opisów produktów na marketplace (eMAG RO, HU, BG).

- Frontend: React + Vite, hosting GitHub Pages (wdrożenie automatyczne po każdej zmianie w gałęzi `main`)
- Baza i logowanie: Supabase
- Silnik AI: n8n + Vertex AI

Adres: https://schedpol-sp-z-o-o.github.io/ai-opisy/

Konfiguracja: zmienne repozytorium `VITE_SUPABASE_URL` i `VITE_SUPABASE_ANON_KEY` (Settings → Secrets and variables → Actions → Variables).
Nigdy nie umieszczaj w repozytorium klucza `service_role` ani kluczy API.
