// Загрузка данных PoE1 (en/ru) с внедряемым fetch и кэшем обоих языков.
//  - renderer: fetch по `poeth://data/poe1/<lang>/<file>` (protocol.ts: сначала userData/data, потом bundled);
//  - тесты: fetch-подобная функция, читающая resources/data/poe1 с диска.

import { reviveClientStrings } from './clientStrings'
import { buildItemsIndexes, buildStatsIndexes, indexMatchesNdjson } from './indexes'
import { POE1_LANGS, type Poe1Lang } from './interfaces'
import { Poe1Data } from './Poe1Data'

/** Минимум от Response, который нужен загрузчику. */
export interface DataResponseLike {
  ok?: boolean
  status?: number
  text(): Promise<string>
  arrayBuffer(): Promise<ArrayBuffer>
}

export type DataFetch = (url: string) => Promise<DataResponseLike>

export interface Poe1DataStoreOptions {
  /** по умолчанию — глобальный fetch */
  fetch?: DataFetch
  /** по умолчанию `poeth://data/poe1` */
  baseUrl?: string
}

export interface Poe1DataStore {
  /** Загрузить (один раз) данные языка. Повторные вызовы возвращают тот же объект. */
  ensureLanguage(lang: Poe1Lang): Promise<Poe1Data>
  /** Уже загруженные данные языка (синхронно) или undefined. */
  get(lang: Poe1Lang): Poe1Data | undefined
  /** Загрузить все языки (en + ru). */
  ensureAll(): Promise<Record<Poe1Lang, Poe1Data>>
  /** Сбросить кэш (например, после обновления данных в userData). */
  clear(): void
}

export const DEFAULT_DATA_BASE_URL = 'poeth://data/poe1'

export function isPoe1Lang(v: unknown): v is Poe1Lang {
  return typeof v === 'string' && (POE1_LANGS as readonly string[]).includes(v)
}

/** ndjson с LF — смещения в индексах считаются по такой строке. */
function normalizeNdjson(text: string): string {
  return text.replace(/^﻿/, '').replace(/\r\n/g, '\n')
}

export async function loadPoe1Data(lang: Poe1Lang, options: Poe1DataStoreOptions = {}): Promise<Poe1Data> {
  const fetchImpl: DataFetch = options.fetch ?? ((url) => globalThis.fetch(url))
  const base = (options.baseUrl ?? DEFAULT_DATA_BASE_URL).replace(/\/+$/, '')

  const get = async (file: string): Promise<DataResponseLike> => {
    const res = await fetchImpl(`${base}/${lang}/${file}`)
    if (res.ok === false) throw new Error(`Данные PoE1 (${lang}/${file}): HTTP ${res.status ?? '?'}`)
    return res
  }
  const text = async (file: string) => (await get(file)).text()
  const bin = async (file: string) => new Uint32Array(await (await get(file)).arrayBuffer())

  const [stringsJson, itemsRaw, statsRaw] = await Promise.all([
    text('client_strings.json'),
    text('items.ndjson'),
    text('stats.ndjson')
  ])
  const itemsNdjson = normalizeNdjson(itemsRaw)
  const statsNdjson = normalizeNdjson(statsRaw)

  // Готовые индексы; если не скачались или не подходят к ndjson (другая версия/CRLF) — строим в памяти.
  const indexes: Array<Uint32Array | null> = await Promise.all(
    ['items-name', 'items-ref', 'stats-ref', 'stats-matcher'].map((n) => bin(`${n}.index.bin`).catch(() => null))
  )
  const usable = (idx: Uint32Array | null, ndjson: string): idx is Uint32Array =>
    idx !== null && indexMatchesNdjson(idx, ndjson)
  const [itemsName, itemsRef, statsRef, statsMatcher] = indexes
  const items =
    usable(itemsName, itemsNdjson) && usable(itemsRef, itemsNdjson)
      ? { byName: itemsName, byRefName: itemsRef }
      : buildItemsIndexes(itemsNdjson)
  const stats =
    usable(statsRef, statsNdjson) && usable(statsMatcher, statsNdjson)
      ? { byRef: statsRef, byMatcher: statsMatcher }
      : buildStatsIndexes(statsNdjson)

  return new Poe1Data({
    lang,
    strings: reviveClientStrings(JSON.parse(stringsJson)),
    itemsNdjson,
    itemsByName: items.byName,
    itemsByRefName: items.byRefName,
    statsNdjson,
    statsByRef: stats.byRef,
    statsByMatcher: stats.byMatcher
  })
}

export function createPoe1DataStore(options: Poe1DataStoreOptions = {}): Poe1DataStore {
  const loaded = new Map<Poe1Lang, Poe1Data>()
  const pending = new Map<Poe1Lang, Promise<Poe1Data>>()

  const ensureLanguage = (lang: Poe1Lang): Promise<Poe1Data> => {
    if (!isPoe1Lang(lang)) return Promise.reject(new Error(`Нет данных PoE1 для языка ${String(lang)}`))
    const ready = loaded.get(lang)
    if (ready) return Promise.resolve(ready)
    let p = pending.get(lang)
    if (!p) {
      p = loadPoe1Data(lang, options).then(
        (data) => {
          loaded.set(lang, data)
          pending.delete(lang)
          return data
        },
        (e: unknown) => {
          pending.delete(lang) // следующая попытка загрузит заново
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
      const all = await Promise.all(POE1_LANGS.map((l) => ensureLanguage(l)))
      return Object.fromEntries(all.map((d) => [d.lang, d])) as Record<Poe1Lang, Poe1Data>
    },
    clear() {
      loaded.clear()
      pending.clear()
    }
  }
}

let defaultStore: Poe1DataStore | undefined

/** Общий стор для renderer (fetch по poeth://). */
export function getDefaultPoe1DataStore(): Poe1DataStore {
  defaultStore ??= createPoe1DataStore()
  return defaultStore
}
