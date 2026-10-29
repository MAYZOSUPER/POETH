// Id поиска сайта трейда (slug в адресе …/trade/search/<лига>/<slug>) — одна проверка для избранного,
// импорта Better Trading и открытия поиска.
//
// Раньше slug был коротким ключом на сервере («Lk9a2bQ»). Сейчас PoE1 отдаёт и кладёт в адрес само состояние
// поиска: gzip + base64url от JSON запроса (docs/poe1-trade-api.md) — с «-» и «_», а длина растёт с запросом
// (поиск окна цены по фикстурам: медиана 336, максимум 478 символов, 29.10.2026). Старые короткие id тоже годятся.

/** Длиннее не бывает у разумного поиска (8000 символов JSON сжимаются в разы); защита хранилища от мусора. */
export const SLUG_MAX = 4096

export const SLUG_RE = new RegExp(`^[A-Za-z0-9_-]{1,${SLUG_MAX}}$`)

export function isTradeSlug(s: unknown): s is string {
  return typeof s === 'string' && SLUG_RE.test(s)
}
