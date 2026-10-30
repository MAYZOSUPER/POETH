import { cleanPobRequest, pobOption } from '@shared/build/pobCompare'
import { cleanCompareReply, type EngineSlot } from '@shared/pob/engineProtocol'
import { currentStage, resolveStages } from '@shared/pob/stages'
import { stageXml } from '@shared/pob/stageXml'
import type { StoredBuild } from '@shared/types/build'
import type { EquipState } from '@shared/types/equip'
import type { PobCompareError, PobCompareResponse, PobOptionResult } from '@shared/types/pobCompare'
import { EngineError, type PobEngine } from './engine'

// «Точный расчёт (PoB)» для окна цены (S44, бета): запрос окна (недоверенный: текст вещей и слоты) → билд вкладки
// «Билд» на этапе по уровню персонажа → XML → движок PoB → вердикт. Текст вещей живёт только в памяти: в XML
// и в stdin движка, на диск не пишется. Сети нет ни здесь, ни в движке.

export interface PobCompareDeps {
  engine: Pick<PobEngine, 'request' | 'stop'>
  build: () => Promise<StoredBuild | null>
  equip: () => Promise<EquipState & { pob: boolean }>
  version: () => string
  now?: () => number
}

const fail = (error: PobCompareError): PobCompareResponse => ({ ok: false, error })

export async function pobCompare(raw: unknown, deps: PobCompareDeps): Promise<PobCompareResponse> {
  const now = deps.now ?? Date.now
  const state = await deps.equip()
  if (!state.on || !state.pob) return fail('off')
  const req = cleanPobRequest(raw, state.items)
  if (!req) return fail('bad-input')
  const stored = await deps.build()
  if (!stored) return fail('no-build')

  const plan = resolveStages(stored.build, stored.edits)
  const index = currentStage(plan, { level: state.level, act: null, campaignDone: false }, stored.edits).index
  const weapon = state.items.find((e) => e.slot === 'Weapon 1')
  const twoHand = !!weapon && (weapon.kind === 'weapon2h' || weapon.kind === 'bow')

  try {
    // ping — старт движка и версия дерева для XML
    const first = await deps.engine.request('ping')
    const { xml, slots } = stageXml(stored.build, plan, index, {
      treeVersion: first.ready.tree,
      level: state.level,
      worn: req.worn,
      wornTwoHand: twoHand
    })
    const t0 = now()
    const run = async () => cleanCompareReply((await deps.engine.request('compare', { xml, item: req.item, options: req.options })).reply, req.options.length)
    let res = await run()
    // PoB, загрузив до этого билд другого формата (старые хэши кластерных самоцветов), может не открыть следующий —
    // его состояние после ошибки битое. Один раз — в новом процессе движка.
    if (res && !res.ok && res.error === 'build') {
      deps.engine.stop()
      res = await run()
    }
    const calc = now() - t0
    if (!res) return fail('internal')
    if (!res.ok) {
      // после ошибки загрузки или внутри расчёта — следующий запрос тоже в новом процессе
      if (res.error === 'build' || res.error === 'internal') deps.engine.stop()
      return fail(res.error)
    }
    const against = (opt: EngineSlot[]): PobOptionResult['against'] =>
      opt.every((s) => slots[s] === 'worn') ? 'worn' : opt.some((s) => slots[s]) ? 'build' : 'empty'
    return {
      ok: true,
      options: res.results.map((r, i) => pobOption(res.base, r.ok ? (r.new ?? {}) : null, against(req.options[i]))),
      stage: index !== null ? (plan.stages[index]?.title ?? '') : '',
      level: res.item.level,
      reqLevel: res.item.reqLevel,
      unsupported: res.item.unsupported,
      pob: deps.version(),
      ms: { start: first.started, calc }
    }
  } catch (e) {
    if (e instanceof EngineError) return fail(e.code)
    console.warn('[pob] compare failed', e instanceof Error ? e.message : e)
    return fail('internal')
  }
}
