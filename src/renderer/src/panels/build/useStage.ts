import { useMemo } from 'react'
import { currentStage, resolveStages, type PobStagePlan } from '@shared/pob/stages'
import { stageLevel } from '@shared/build/view'
import { actOf } from '@shared/leveling/route'
import type { StoredBuild } from '@shared/types/build'
import { useBuildStore } from '../../store/useBuildStore'
import { useLevelingStore } from '../../store/useLevelingStore'

// Этапы открытого билда для разделов вкладки «Билд» (S39; S40 «Предметы этапа» берёт этап отсюда же):
// план с правками игрока, текущий этап по уровню и акту персонажа (журнал игры, гид S22), этап на экране.

export interface Progress {
  /** уровень персонажа из журнала; null — журнала нет */
  level: number | null
  act: number | null
  /** кампания пройдена */
  done: boolean
}

/** Уровень, акт и «кампания пройдена» — из гида прокачки (S22, журнал игры). */
export function useProgress(): Progress {
  const st = useLevelingStore((s) => s.state)
  if (!st) return { level: null, act: null, done: false }
  const p = st.progress
  const fromLog = st.log.connected || p.level > 1
  return { level: fromLog ? p.level : null, act: p.areaId ? actOf(p.areaId) : null, done: !!p.finished }
}

export interface StageView {
  plan: PobStagePlan
  /** текущий этап (по уровню или выбранный игроком); null — этапов нет */
  current: number | null
  /** текущий выбран игроком в «Этапы…» */
  manual: boolean
  /** этап на экране (игрок может смотреть вперёд) */
  shown: number
  /** уровень персонажа для расчётов этапа на экране */
  level: number
  progress: Progress
}

export function useStage(build: StoredBuild): StageView {
  const view = useBuildStore((s) => s.view)
  const progress = useProgress()
  const plan = useMemo(() => resolveStages(build.build, build.edits), [build])
  const cs = currentStage(plan, { level: progress.level, act: progress.act, campaignDone: progress.done }, build.edits)
  const firstLeveling = plan.stages.findIndex((s) => s.leveling)
  const current = cs.index ?? (firstLeveling >= 0 ? firstLeveling : plan.stages.length ? 0 : null)
  const shown = view !== null && view < plan.stages.length ? view : (current ?? 0)
  return { plan, current, manual: cs.source === 'manual', shown, level: stageLevel(plan, shown, current, progress.level), progress }
}
