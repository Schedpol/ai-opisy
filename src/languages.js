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
