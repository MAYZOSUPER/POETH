// Клиент worker'а «умной оценки» (S45): запрос → worker; worker не поднялся или упал — тот же расчёт в окне
// (createTimelessEngine), чтобы оценка не пропадала. Простаивающий worker закрывается (данные — несколько МБ).

import type { TimelessDataRaw } from '@shared/poe1/timeless/data'
import { createTimelessEngine, type TimelessCalc, type TimelessCalcRequest, type TimelessProgress } from './timelessEngine'
import type { TimelessWorkerRequest, TimelessWorkerResponse } from './timeless.worker'

const IDLE_MS = 2 * 60_000
const TIMEOUT_MS = 20_000
const MEMO = 32

/** Данные для показа (тексты, гнёзда) и запасной расчёт — в окне. */
const local = createTimelessEngine()
export const timelessData = (): Promise<TimelessDataRaw | null> => local.data()

let worker: Worker | null = null
let broken = false
let idle: ReturnType<typeof setTimeout> | null = null
let seq = 0
const pending = new Map<number, (calc: TimelessCalc | null | undefined) => void>()
const progressOf = new Map<number, (p: TimelessProgress) => void>()
const memo = new Map<string, Promise<TimelessCalc | null>>()
/** прогресс текущего расчёта по ключу — для окна, открытого, пока расчёт уже идёт */
const listeners = new Map<string, Set<(p: TimelessProgress) => void>>()

function stop(): void {
  if (idle) clearTimeout(idle)
  idle = null
  worker?.terminate()
  worker = null
  // undefined — «worker не ответил»: считать в окне
  for (const done of pending.values()) done(undefined)
  pending.clear()
}

function getWorker(): Worker | null {
  if (broken) return null
  if (worker) return worker
  try {
    const w = new Worker(new URL('./timeless.worker.ts', import.meta.url), { type: 'module' })
    w.onmessage = (e: MessageEvent<TimelessWorkerResponse>) => {
      const m = e.data
      if ('progress' in m) return progressOf.get(m.id)?.(m.progress)
      pending.get(m.id)?.(m.calc)
      pending.delete(m.id)
      progressOf.delete(m.id)
    }
    w.onerror = () => {
      broken = true
      stop()
    }
    worker = w
    return w
  } catch {
    broken = true
    return null
  }
}

function viaWorker(req: TimelessCalcRequest, onProgress: (p: TimelessProgress) => void): Promise<TimelessCalc | null | undefined> {
  const w = getWorker()
  if (!w) return Promise.resolve(undefined)
  if (idle) clearTimeout(idle)
  idle = setTimeout(stop, IDLE_MS)
  const id = ++seq
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pending.delete(id)
      progressOf.delete(id)
      resolve(undefined)
    }, TIMEOUT_MS)
    progressOf.set(id, onProgress)
    pending.set(id, (calc) => {
      clearTimeout(timer)
      resolve(calc)
    })
    const msg: TimelessWorkerRequest = { id, req }
    w.postMessage(msg)
  })
}

/**
 * Исход сида по гнёздам, сиды-аналоги и «для вашего билда»; null — данных нет или сид вне диапазона.
 * `onProgress` — «идёт симуляция» (гнёзда, сиды); готовый результат из памяти приходит без прогресса.
 */
export function calcTimeless(req: TimelessCalcRequest, onProgress?: (p: TimelessProgress) => void): Promise<TimelessCalc | null> {
  const key = `${req.kind}:${req.seed}:${req.max}:${req.build?.join(',') ?? ''}`
  if (onProgress) {
    if (!listeners.has(key)) listeners.set(key, new Set())
    listeners.get(key)!.add(onProgress)
  }
  const emit = (pr: TimelessProgress): void => listeners.get(key)?.forEach((f) => f(pr))
  let p = memo.get(key)
  if (!p) {
    p = viaWorker(req, emit).then((r) => (r === undefined ? local.calc(req, emit) : r))
    // последние MEMO результатов (предметы открывают по одному — больше не нужно)
    if (memo.size >= MEMO) memo.delete(memo.keys().next().value as string)
    memo.set(key, p)
    void p.then((r) => {
      if (!r) memo.delete(key)
    })
  }
  return p.finally(() => {
    if (!onProgress) return
    const set = listeners.get(key)
    set?.delete(onProgress)
    if (set && !set.size) listeners.delete(key)
  })
}
