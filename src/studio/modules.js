// Moduły SchedpolAI eCommerce Studio – jedno źródło dla menu, pulpitu i stron modułów w budowie.
// status: 'aktywny' (działa) | 'w_budowie'. Widoczność dla zespołu: tabela app_modules (admin widzi wszystko).
export const MODULES = [
  { key: 'tresci', name: 'Generator Treści', short: 'Treści', status: 'aktywny', home: '/tresci',
    desc: 'Dane z PIM, Księga wiedzy, opisy AI z weryfikacją, parametry w 13 językach, grafiki.',
    owner: 'Jakub (dane), Ola (treść)',
    prefixes: ['/tresci', '/drzewo', '/produkty', '/slownik', '/wiedza', '/szablony', '/frazy', '/weryfikacja', '/biblioteka', '/publikacja', '/parametry', '/nauka', '/grafiki', '/reguly'] },
  { key: 'oferta', name: 'Oferta i kanały', short: 'Oferta', status: 'w_budowie', phase: 'Faza 1', home: '/oferta',
    desc: 'Gotowość oferty per kanał i rynek: czego brakuje produktowi, żeby trafił na eMAG, Kaufland, Allegro, Amazon czy Mirakl.',
    owner: 'Natalia (PL), Roman (Export)',
    scope: ['lista wymagań każdego kanału (pola, zdjęcia, EAN, kategorie)', 'status gotowości każdego SKU na każdym kanale', 'mapowanie kategorii marketplace\'ów', 'obecność produktów u sprzedawców w Polsce (Dealavo)'],
    needs: ['lista wymagań kanałów – szkic do weryfikacji przez zespół', 'dostęp do API Dealavo'] },
  { key: 'pozyskiwanie', name: 'Pozyskiwanie klientów', short: 'Klienci', status: 'w_budowie', phase: 'Faza 2', home: '/pozyskiwanie',
    desc: 'Research i kwalifikacja firm (dystrybutorzy, e-tailerzy, operatorzy marketplace\'ów), przekazanie do CRM w ClickUp, pakiet startowy dla partnera.',
    owner: 'Roman (Export), Małgorzata (DACH)',
    scope: ['research firm z obowiązkowym źródłem', 'kwalifikacja i ocena dopasowania do asortymentu', 'przekazanie do ClickUp (CRM POLSKA / CRM EXPORT)', 'pakiet startowy: co z asortymentu jest gotowe na rynek partnera'],
    needs: ['procedura RODO dla kontaktów B2B', 'struktura list w ClickUp do zasilania'] },
  { key: 'ceny', name: 'Ceny i marża', short: 'Ceny', status: 'w_budowie', phase: 'Faza 3', home: '/ceny',
    desc: 'Kaskady cenowe per rynek, prowizje kanałów, kalkulator marży i alerty; ceny rynkowe z Dealavo.',
    owner: 'Patryk',
    scope: ['kaskady cenowe i polityka cenowa', 'prowizje i opłaty kanałów', 'marża per produkt i kanał', 'przestrzeganie cen minimalnych u sprzedawców (Dealavo)'],
    needs: ['jedna definicja marży przyjęta przez zarząd', 'historia cen z Dealavo (zbierana od fazy 1)'] },
  { key: 'operacje', name: 'Operacje (KPI)', short: 'Operacje', status: 'w_budowie', phase: 'przy potrzebie', home: '/operacje',
    desc: 'Wskaźniki zdrowia kont marketplace, terminowość wysyłek S4H, zwroty – tylko wyjątki wymagające reakcji.',
    owner: 'Natalia + S4H',
    scope: ['zdrowie kont marketplace', 'terminowość wysyłek dropshipping (S4H)', 'zwroty i anulacje', 'lista wyjątków do reakcji'],
    needs: ['lista wskaźników, które dziś sprawdzacie ręcznie'] },
  { key: 'analityka', name: 'Analityka', short: 'Analityka', status: 'aktywny', phase: 'Faza 1', home: '/analityka',
    desc: 'Raporty Power BI osadzone w Studio – jedna wersja liczb dla zespołu i zarządu.',
    owner: 'Mateusz + zarząd', prefixes: ['/analityka'] },
]

export const moduleOfPath = path => {
  if (path === '/' || path === '') return null
  return MODULES.find(m => (m.prefixes || [m.home]).some(p => path === p || path.startsWith(p + '/'))) || null
}
