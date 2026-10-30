// Загрузка данных PoE2 (en/ru) с внедряемым fetch и кэшем обоих языков — как src/shared/poe1/data/store.ts.
//  - renderer: fetch по `poeth://data/poe2/<lang>/<file>` (protocol.ts: сначала userData/data, потом bundled);
//  - тесты: fetch-подобная функция, читающая resources/data/poe2 с диска.

import { reviveClientStrings } from '../../poe1/data/clientStrings'
import { buildItemsIndexes, buildStatsIndexes, indexMatchesNdjson } from '../../poe1/data/indexes'
import type { DataFetch, DataResponseLike } from '../../poe1/data/store'
import { POE2_LANGS, type Poe2Lang, type TranslationDict } from './interfaces'
import { Poe2Data } from './Poe2Data'

export interface Poe2DataStoreOptions {
  /** по умолчанию — глобальный fetch */
  fetch?: DataFetch
  /** по умолчанию `poeth://data/poe2` */
  baseUrl?: string
}

export interface Poe2DataStore {
  /** Загрузить (один раз) данные языка. Повторные вызовы возвращают тот же объект. */
  ensureLanguage(lang: Poe2Lang): Promise<Poe2Data>
  /** Уже загруженные данные языка (синхронно) или undefined. */
  get(lang: Poe2Lang): Poe2Data | undefined
  /** Загрузить все языки (en + ru). */
  ensureAll(): Promise<Record<Poe2Lang, Poe2Data>>
  /** Сбросить кэш (например, после обновления данных в userData). */
  clear(): void
}

export const POE2_DATA_BASE_URL = 'poeth://data/poe2'

export function isPoe2Lang(v: unknown): v is Poe2Lang {
  return typeof v === 'string' && (POE2_LANGS as readonly string[]).includes(v)
}

function normalizeNdjson(text: string): string {
  return text.replace(/^﻿/, '').replace(/\r\n/g, '\n')
}

/** client_strings.json PoE2 → словарь (RegExp восстановлены; ключи ITEM_CLASS / RARITY / MODIFIER_LINE обязательны). */
export function revivePoe2ClientStrings(json: unknown): TranslationDict {
  return reviveClientStrings(json) as unknown as TranslationDict
}

export async function loadPoe2Data(lang: Poe2Lang, options: Poe2DataStoreOptions = {}): Promise<Poe2Data> {
  const fetchImpl: DataFetch = options.fetch ?? ((url) => globalThis.fetch(url))
  const base = (options.baseUrl ?? POE2_DATA_BASE_URL).replace(/\/+$/, '')

  const get = async (fileLang: Poe2Lang, file: string): Promise<DataResponseLike> => {
    const res = await fetchImpl(`${base}/${fileLang}/${file}`)
    if (res.ok === false) throw new Error(`Данные PoE2 (${fileLang}/${file}): HTTP ${res.status ?? '?'}`)
    return res
  }
  const text = async (file: string, fileLang: Poe2Lang = lang) => (await get(fileLang, file)).text()
  const bin = async (file: string) => new Uint32Array(await (await get(lang, file)).arrayBuffer())

  const [stringsJson, refStringsJson, itemsRaw, statsRaw] = await Promise.all([
    text('client_strings.json'),
    lang === 'en' ? Promise.resolve(null) : text('client_strings.json', 'en'),
    text('items.ndjson'),
    text('stats.ndjson')
  ])
  const itemsNdjson = normalizeNdjson(itemsRaw)
  const statsNdjson = normalizeNdjson(statsRaw)

  // Готовые индексы; если не скачались или не подходят к ndjson — строим в памяти.
  const indexes: Array<Uint32Array | null> = await Promise.all(
    ['items-name', 'items-ref', 'stats-ref', 'stats-matcher'].map((n) => bin(`${n}.index.bin`).catch(() => null))
  )
  const usable = (idx: Uint32Array | null, ndjson: string): idx is Uint32Array => idx !== null && indexMatchesNdjson(idx, ndjson)
  const [itemsName, itemsRef, statsRef, statsMatcher] = indexes
  const items =
    usable(itemsName, itemsNdjson) && usable(itemsRef, itemsNdjson)
      ? { byName: itemsName, byRefName: itemsRef }
      : buildItemsIndexes(itemsNdjson)
  const stats =
    usable(statsRef, statsNdjson) && usable(statsMatcher, statsNdjson)
      ? { byRef: statsRef, byMatcher: statsMatcher }
      : buildStatsIndexes(statsNdjson)

  const strings = revivePoe2ClientStrings(JSON.parse(stringsJson))
  return new Poe2Data({
    lang,
    strings,
    refStrings: refStringsJson === null ? strings : revivePoe2ClientStrings(JSON.parse(refStringsJson)),
    itemsNdjson,
    itemsByName: items.byName,
    itemsByRefName: items.byRefName,
    statsNdjson,
    statsByRef: stats.byRef,
    statsByMatcher: stats.byMatcher
  })
}

export function createPoe2DataStore(options: Poe2DataStoreOptions = {}): Poe2DataStore {
  const loaded = new Map<Poe2Lang, Poe2Data>()
  const pending = new Map<Poe2Lang, Promise<Poe2Data>>()

  const ensureLanguage = (lang: Poe2Lang): Promise<Poe2Data> => {
    if (!isPoe2Lang(lang)) return Promise.reject(new Error(`Нет данных PoE2 для языка ${String(lang)}`))
    const ready = loaded.get(lang)
    if (ready) return Promise.resolve(ready)
    let p = pending.get(lang)
    if (!p) {
      p = loadPoe2Data(lang, options).then(
        (data) => {
          loaded.set(lang, data)
          pending.delete(lang)
          return data
        },
        (e: unknown) => {
          pending.delete(lang)
          throw e
        }
      )
      pending.set(lang, p)
    }
    return p
  }

  return {
    ensureLanguage,
    get: (lang) => loaded.get(lang),
    async ensureAll() {
      const all = await Promise.all(POE2_LANGS.map((l) => ensureLanguage(l)))
      return Object.fromEntries(all.map((d) => [d.lang, d])) as Record<Poe2Lang, Poe2Data>
    },
    clear() {
      loaded.clear()
      pending.clear()
    }
  }
}

let defaultStore: Poe2DataStore | undefined

/** Общий стор для renderer (fetch по poeth://). */
export function getDefaultPoe2DataStore(): Poe2DataStore {
  defaultStore ??= createPoe2DataStore()
  return defaultStore
}
