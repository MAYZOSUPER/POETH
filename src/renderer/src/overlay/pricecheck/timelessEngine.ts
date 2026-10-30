// Расчёт «умной оценки» timeless-самоцвета (S45): загрузка данных (poeth://data/poe1/build/…) и исход сида по гнёздам
// + сиды-аналоги. Один и тот же код работает в worker'е (timeless.worker.ts) и, если worker не поднялся, в окне.
// Сеть не трогает: только локальные файлы приложения. Лукап проверяется по SHA-256 из timeless.json.

import {
  TIMELESS_DATA_FILE,
  inflateZlib,
  makeTable,
  parseTimelessData,
  type TimelessDataKind,
  type TimelessDataRaw,
  type TimelessTable
} from '@shared/poe1/timeless/data'
import { evaluateSeed, findAnalogs, type TimelessAnalogs, type TimelessEvaluation } from '@shared/poe1/timeless/evaluate'

export const TIMELESS_BASE = 'poeth://data/poe1/'

export interface TimelessCalcRequest {
  kind: TimelessDataKind
  /** сид в данных (у Elegant Hubris — «монеты» ÷ 20) */
  seed: number
  /** сколько сидов-аналогов вернуть (лимит count-запроса) */
  max: number
}

export interface TimelessCalc {
  evaluation: TimelessEvaluation
  analogs: TimelessAnalogs
}

async function sha256Hex(buf: ArrayBuffer): Promise<string | null> {
  const subtle = globalThis.crypto?.subtle
  if (!subtle) return null
  const hash = new Uint8Array(await subtle.digest('SHA-256', buf))
  return Array.from(hash, (b) => b.toString(16).padStart(2, '0')).join('')
}

export interface TimelessEngine {
  data: () => Promise<TimelessDataRaw | null>
  calc: (req: TimelessCalcRequest) => Promise<TimelessCalc | null>
}

export function createTimelessEngine(base = TIMELESS_BASE): TimelessEngine {
  let dataP: Promise<TimelessDataRaw | null> | null = null
  const tables = new Map<TimelessDataKind, Promise<TimelessTable | null>>()

  const data = (): Promise<TimelessDataRaw | null> => {
    dataP ??= fetch(base + TIMELESS_DATA_FILE)
      .then((r) => (r.ok ? r.json() : null))
      .then((raw) => parseTimelessData(raw))
      .catch(() => null)
      .then((d) => {
        if (!d) dataP = null // не вышло — следующая попытка заново
        return d
      })
    return dataP
  }

  const table = (kind: TimelessDataKind): Promise<TimelessTable | null> => {
    let p = tables.get(kind)
    if (!p) {
      p = (async () => {
        const d = await data()
        if (!d) return null
        const j = d.jewels[kind]
        const res = await fetch(`${base}build/${j.file}`)
        if (!res.ok) return null
        const buf = await res.arrayBuffer()
        const sha = await sha256Hex(buf)
        if (sha !== null && sha !== j.sha256) return null
        return makeTable(kind, j, d.rows.length, await inflateZlib(buf))
      })().catch(() => null)
      tables.set(kind, p)
      void p.then((t) => {
        if (!t) tables.delete(kind)
      })
    }
    return p
  }

  const calc = async (req: TimelessCalcRequest): Promise<TimelessCalc | null> => {
    const [d, t] = await Promise.all([data(), table(req.kind)])
    if (!d || !t || req.seed < t.seedMin || req.seed > t.seedMax) return null
    const evaluation = evaluateSeed(d, t, req.seed)
    return { evaluation, analogs: findAnalogs(d, t, evaluation, req.max) }
  }

  return { data, calc }
}
