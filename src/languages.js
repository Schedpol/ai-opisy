// Języki obsługiwane w całym łańcuchu (aplikacja + prompty n8n + DataForSEO).
// Nowy język = wpis tutaj ORAZ w mapie LANG w węzłach „GEN: przygotuj” i „VAR: przygotuj” workflow n8n.
export const LANGS = {
  ro: { name: 'rumuński', country: 'Rumunia', location: 2642 },
  hu: { name: 'węgierski', country: 'Węgry', location: 2348 },
  bg: { name: 'bułgarski', country: 'Bułgaria', location: 2100 },
  de: { name: 'niemiecki', country: 'Niemcy', location: 2276 },
  pl: { name: 'polski', country: 'Polska', location: 2616 },
}
// Podstawowe zakazane sformułowania (superlatywy, rankingi) dla języków bez reguł wbudowanych w n8n
export const BASE_FORBIDDEN = {
  de: ['der beste', 'die beste', 'das beste', 'Nr. 1', 'Testsieger', 'unschlagbar', 'am billigsten'],
  pl: ['najlepszy', 'najlepsza', 'najlepsze', 'nr 1', 'najtańszy', 'bezkonkurencyjny'],
}

// Wzorce tytułu (instrukcja dla AI) – domyślny i podpowiedzi per marketplace; edytowalne w Ustawieniach kanału
export const DEFAULT_TITLE_PATTERN = '[typ produktu] [marka] [model], [wymiary] cm, [materiał], [kolor/wykończenie]'
export const TITLE_PRESETS = {
  emag: { pattern: '[typ produktu] [marka] [model], [wymiary] cm, [materiał], [kolor/wykończenie] – zgodnie ze standardem nazw eMAG', max: 200 },
  kaufland: { pattern: '[marka] [model] [typ produktu] [wymiary] cm, [kolor/wykończenie] – marka i nazwa produktu na początku, zwięźle, bez ciągu słów kluczowych', max: 80 },
}
export const titlePresetFor = mp => TITLE_PRESETS[String(mp || '').toLowerCase().replace(/[^a-z]/g, '')] || null
