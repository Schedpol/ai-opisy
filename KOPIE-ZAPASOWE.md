# Kopie zapasowe i podtrzymanie projektu (plan darmowy Supabase)

Workflow `.github/workflows/backup.yml`:
- codziennie: jedno zapytanie do API Supabase – projekt nie zostanie uśpiony po 7 dniach bez aktywności;
- w każdy poniedziałek (oraz na żądanie: Actions → „Kopia bazy i podtrzymanie projektu” → Run workflow): zaszyfrowana kopia schematu `public` (wszystkie tabele aplikacji), przechowywana 90 dni jako artefakt.

## Konfiguracja (jednorazowo, ok. 10 minut)
1. Supabase → **Connect** → **Session pooler** → skopiuj **URI** i wstaw w nim hasło do bazy.
   (Session pooler, bo serwery GitHub nie łączą się z bezpośrednim adresem bazy.)
2. GitHub → repozytorium → **Settings → Secrets and variables → Actions → Secrets → New repository secret**:
   - `SUPABASE_DB_URL` = URI z punktu 1,
   - `BACKUP_PASSPHRASE` = długie, losowe hasło. **Zapisz je w firmowym menedżerze haseł** – bez niego kopii nie da się odczytać.
3. Zmienne `VITE_SUPABASE_URL` i `VITE_SUPABASE_ANON_KEY` już są (z wdrożenia).
4. Actions → „Kopia bazy i podtrzymanie projektu” → **Run workflow** – pierwsza kopia; oba zadania powinny być zielone.

## Co obejmuje kopia
- **Tak:** wszystkie tabele aplikacji (opisy, Księga wiedzy, wytyczne, szablony, frazy, parametry, mapy, ustawienia).
- **Nie:** konta logowania (Supabase Auth) i pliki w Storage (wgrane dokumenty DOCX, grafiki z Biblioteki). Dokumenty można wgrać ponownie, grafiki z konwencji są na FTP.

## Przywracanie
1. Actions → wybrane uruchomienie → **Artifacts** → pobierz `kopia-bazy-…`.
2. Odszyfruj: `gpg -d kopia-bazy-RRRR-MM-DD.sql.gpg > kopia.sql` (poda o hasło `BACKUP_PASSPHRASE`).
3. Przywróć do pustego schematu: `psql "<URI bazy>" -f kopia.sql`.
   - **Ten sam projekt:** najpierw usuń uszkodzone dane (najlepiej z pomocą opiekuna technicznego).
   - **Nowy projekt:** najpierw zaproś użytkowników (konta logowania), dopiero potem przywróć kopię – profile wskazują na konta.
