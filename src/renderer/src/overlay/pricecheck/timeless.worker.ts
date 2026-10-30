// Worker «умной оценки» timeless-самоцвета (S45): распаковка лукапа (~2–4 МБ) и перебор всех сидов для аналогов —
// не в потоке окна цены. Протокол: { id, req } → { id, progress }… → { id, calc | null }.

import { createTimelessEngine, type TimelessCalc, type TimelessCalcRequest, type TimelessProgress } from './timelessEngine'

export interface TimelessWorkerRequest {
  id: number
  req: TimelessCalcRequest
}
export type TimelessWorkerResponse = { id: number; calc: TimelessCalc | null } | { id: number; progress: TimelessProgress }

const engine = createTimelessEngine()
const scope = self as unknown as {
  postMessage: (msg: TimelessWorkerResponse) => void
  addEventListener: (type: 'message', cb: (e: MessageEvent<TimelessWorkerRequest>) => void) => void
}

scope.addEventListener('message', (e) => {
  const { id, req } = e.data
  void engine
    .calc(req, (progress) => scope.postMessage({ id, progress }))
    .catch(() => null)
    .then((calc) => scope.postMessage({ id, calc }))
})
