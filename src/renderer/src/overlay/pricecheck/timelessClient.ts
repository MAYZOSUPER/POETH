// Клиент worker'а «умной оценки» (S45): запрос → worker; worker не поднялся или упал — тот же расчёт в окне
// (createTimelessEngine), чтобы оценка не пропадала. Простаивающий worker закрывается (данные — несколько МБ).

import type { TimelessDataRaw } from '@shared/poe1/timeless/data'
import { createTimelessEngine, type TimelessCalc, type TimelessCalcRequest } from './timelessEngine'
import type { TimelessWorkerRequest, TimelessWorkerResponse } from './timeless.worker'

const IDLE_MS = 2 * 60_000
const TIMEOUT_MS = 20_000

/** Данные для показа (тексты, гнёзда) и запасной расчёт — в окне. */
const local = createTimelessEngine()
export const timelessData = (): Promise<TimelessDataRaw | null> => local.data()

let worker: Worker | null = null
let broken = false
let idle: ReturnType<typeof setTimeout> | null = null
let seq = 0
const pending = new Map<number, (calc: TimelessCalc | null | undefined) => void>()
const memo = new Map<string, Promise<TimelessCalc | null>>()

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
      pending.get(e.data.id)?.(e.data.calc)
      pending.delete(e.data.id)
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

function viaWorker(req: TimelessCalcRequest): Promise<TimelessCalc | null | undefined> {
  const w = getWorker()
  if (!w) return Promise.resolve(undefined)
  if (idle) clearTimeout(idle)
  idle = setTimeout(stop, IDLE_MS)
  const id = ++seq
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pending.delete(id)
      resolve(undefined)
    }, TIMEOUT_MS)
    pending.set(id, (calc) => {
      clearTimeout(timer)
      resolve(calc)
    })
    const msg: TimelessWorkerRequest = { id, req }
    w.postMessage(msg)
  })
}

/** Исход сида по гнёздам и сиды-аналоги; null — данных нет или сид вне диапазона. */
export function calcTimeless(req: TimelessCalcRequest): Promise<TimelessCalc | null> {
  const key = `${req.kind}:${req.seed}:${req.max}`
  let p = memo.get(key)
  if (!p) {
    p = viaWorker(req).then((r) => (r === undefined ? local.calc(req) : r))
    memo.set(key, p)
    void p.then((r) => {
      if (!r) memo.delete(key)
    })
  }
  return p
}
