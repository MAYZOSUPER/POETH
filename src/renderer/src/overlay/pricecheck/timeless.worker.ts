// Worker «умной оценки» timeless-самоцвета (S45): распаковка лукапа (~2–4 МБ) и перебор всех сидов для аналогов —
// не в потоке окна цены. Протокол: { id, req } → { id, calc | null }.

import { createTimelessEngine, type TimelessCalc, type TimelessCalcRequest } from './timelessEngine'

export interface TimelessWorkerRequest {
  id: number
  req: TimelessCalcRequest
}
export interface TimelessWorkerResponse {
  id: number
  calc: TimelessCalc | null
}

const engine = createTimelessEngine()
const scope = self as unknown as {
  postMessage: (msg: TimelessWorkerResponse) => void
  addEventListener: (type: 'message', cb: (e: MessageEvent<TimelessWorkerRequest>) => void) => void
}

scope.addEventListener('message', (e) => {
  const { id, req } = e.data
  void engine
    .calc(req)
    .catch(() => null)
    .then((calc) => scope.postMessage({ id, calc }))
})
