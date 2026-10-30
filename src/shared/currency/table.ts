// Валюта по данным APT (S18): items.ndjson языка → tradeTag ('divine', 'chaos', …) → название на языке данных,
// английское имя и иконка web.poecdn.com. Названия не хардкодим; вне данных только золото (у APT его нет).

import { declineRu, ruCount, type RuCase } from './ru'
import { pluralEn } from './en'

export type CurrencyLang = 'ru' | 'en'

export interface CurrencyEntry {
  tag: string
  /** на языке данных: «Божественная сфера» / «Divine Orb» */
  name: string
  /** английское имя («Divine Orb») */
  refName: string
  /** https://web.poecdn.com/… (качает и проверяет main, renderer берёт через poeth://icon) */
  icon?: string
}

export type CurrencyTable = ReadonlyMap<string, CurrencyEntry>

/** Строки items.ndjson с tradeTag → таблица; при повторе тега первая запись главнее. Битые строки пропускаем. */
export function parseCurrencyTable(ndjson: string): Map<string, CurrencyEntry> {
  const out = new Map<string, CurrencyEntry>()
  for (const line of ndjson.split('\n')) {
    // APT пишет компактно ("tradeTag":"x"), EE2 (данные PoE2, S47) — с пробелом ("tradeTag": "x")
    if (!line.includes('"tradeTag":')) continue
    let r: { name?: unknown; refName?: unknown; tradeTag?: unknown; icon?: unknown }
    try {
      r = JSON.parse(line)
    } catch {
      continue
    }
    if (typeof r.tradeTag !== 'string' || typeof r.name !== 'string' || out.has(r.tradeTag)) continue
    out.set(r.tradeTag, {
      tag: r.tradeTag,
      name: r.name,
      refName: typeof r.refName === 'string' ? r.refName : r.name,
      ...(typeof r.icon === 'string' ? { icon: r.icon } : {})
    })
  }
  return out
}

/** Валюта, которой нет в items.ndjson: золото — комиссия мерчанта и Фаустуса (не имя предмета — со строчной). */
const EXTRA: Record<string, Record<CurrencyLang, string>> = {
  gold: { ru: 'золото', en: 'gold' }
}

/** Неисчисляемые: «1 500 золота», «1,500 Gold». */
export const MASS_TAGS: ReadonlySet<string> = new Set(['gold'])

/** Коротко для экспертного режима и сленга трейда. */
const SHORT: Record<string, string> = {
  divine: 'div',
  chaos: 'c',
  exalted: 'ex',
  gold: 'gold',
  mirror: 'mirror',
  'mirror-shard': 'shard',
  'chaos-shard': 'chaos shard'
}

export function currencyShort(tag: string): string {
  return SHORT[tag] ?? tag
}

/** Полное название в именительном (как в игре на этом языке) или null, если валюта неизвестна. */
export function currencyName(table: CurrencyTable | null | undefined, tag: string, lang: CurrencyLang): string | null {
  return table?.get(tag)?.name ?? EXTRA[tag]?.[lang] ?? null
}

/** Название после числа: RU — с падежом («149 Сфер хаоса», «на 1 Сферу хаоса»), EN — с множественным. */
export function amountName(name: string, value: number | string, lang: CurrencyLang, tag = '', c: RuCase = 'nom'): string {
  return lang === 'ru' ? declineRu(name, ruCount(value), c) : pluralEn(name, value, MASS_TAGS.has(tag))
}

/**
 * Название (на языке nameLang) после числа в тексте на языке textLang (S26: имена — на языке клиента игры, текст —
 * на языке интерфейса). Языки совпадают — по правилам языка (amountName). Английское имя в русском тексте — как в
 * игре, без падежей и окончаний: «1 Divine Orb = 340 Chaos Orb». Русское имя в английском тексте согласуется с
 * числом, но всегда в именительном (предлоги в тексте английские): «for 14 Сфер хаоса».
 */
export function amountNameIn(
  name: string,
  value: number | string,
  nameLang: CurrencyLang,
  textLang: CurrencyLang,
  tag = '',
  c: RuCase = 'nom'
): string {
  if (nameLang === textLang) return amountName(name, value, nameLang, tag, c)
  return nameLang === 'ru' ? declineRu(name, ruCount(value), 'nom') : name
}

/** Язык названия валюты: предметы игры — на языке клиента, золото (слово, а не предмет) — на языке текста. */
export function currencyNameLang(tag: string, gameLang: CurrencyLang, textLang: CurrencyLang): CurrencyLang {
  return tag in EXTRA ? textLang : gameLang
}

export interface CurrencyNames {
  /** полное название в именительном: на языке клиента игры («Divine Orb»), золото — на языке текста */
  name(tag: string): string
  /** название после числа в тексте на языке интерфейса: «149 Сфер хаоса», «340 Chaos Orb», «за 1 Сферу хаоса» */
  after(tag: string, value: number | string, c?: RuCase): string
}

/** Имена валют для текста на языке textLang; table — таблица языка клиента игры gameLang (null — ещё грузится). */
export function currencyNames(table: CurrencyTable | null, gameLang: CurrencyLang, textLang: CurrencyLang): CurrencyNames {
  const name = (tag: string): string =>
    currencyName(table, tag, currencyNameLang(tag, gameLang, textLang)) ?? currencyShort(tag)
  return {
    name,
    after: (tag, value, c = 'nom') => amountNameIn(name(tag), value, currencyNameLang(tag, gameLang, textLang), textLang, tag, c)
  }
}

/**
 * Тег валюты по свободному тексту (цена из шёпота: «chaos», «divine», «Сфера хаоса», «div»): точное совпадение
 * с тегом или именем в таблицах, затем сленг. Неизвестное — null.
 */
export function guessCurrencyTag(text: string | undefined, tables: ReadonlyArray<CurrencyTable | null | undefined> = []): string | null {
  const c = (text ?? '').trim().toLowerCase()
  if (!c) return null
  for (const t of tables) {
    if (!t) continue
    if (t.has(c)) return c
    for (const e of t.values()) if (e.name.toLowerCase() === c || e.refName.toLowerCase() === c) return e.tag
  }
  const shard = /shard|осколок|осколк/.test(c)
  if (/mirror|зеркал/.test(c)) return shard ? 'mirror-shard' : 'mirror'
  if (/chaos|хаос/.test(c)) return shard ? 'chaos-shard' : 'chaos'
  if (/div|боже|дивайн/.test(c)) return 'divine'
  if (/exa|возвыш|экзальт/.test(c)) return 'exalted'
  if (/^gold$|золот/.test(c)) return 'gold'
  return null
}
