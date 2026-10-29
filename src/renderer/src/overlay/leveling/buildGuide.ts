import { useEffect, useMemo, useState } from 'react'
import { GAMES } from '@shared/games'
import { buildOn } from '@shared/build/flag'
import type { GemsData } from '@shared/build/types'
import { buildGemGameIds, guideBuildLines, stageGems, stageLevel, type GuideBuildLine } from '@shared/build/view'
import { actOf } from '@shared/leveling/route'
import { currentStage, resolveStages } from '@shared/pob/stages'
import type { LevelingProgress, LvPart } from '@shared/types/leveling'
import type { GameLang } from '@shared/types/settings'
import type { StoredBuild } from '@shared/types/build'
import { loadBuildGems } from '../../store/useBuildStore'

// Строка «Билд: …» в текущем шаге гида прокачки (S39, макет v0.2, раздел 2): камень билда этого шага — взять за
// квест или купить у NPC после него, имена на языке клиента игры. Одна строка; вторая — только у того же NPC.
// Без билда гид такой же, как был. Билд и этап — из main (build:state), этап — по уровню персонажа (S22).

const api = () => (typeof window === 'undefined' ? undefined : window.overlayApi?.build)

/** Вкладка «Билд» включена (флаг v0.2 или POETH_BUILD=1) — гид может говорить про билд. */
export const buildGuideOn = (): boolean => buildOn(GAMES.poe1, api()?.devFlag === true)

/** Активный билд и камни S36 в окне (оверлей, «Кампания»): один раз, потом — событие build.state. */
export function useActiveBuild(): { build: StoredBuild | null; gems: GemsData | null } {
  const [build, setBuild] = useState<StoredBuild | null>(null)
  const [gems, setGems] = useState<GemsData | null>(null)
  useEffect(() => {
    const b = api()
    if (!b || !buildGuideOn()) return
    let alive = true
    void b
      .state()
      .then((s) => alive && setBuild(s.active))
      .catch(() => undefined)
    void loadBuildGems().then((g) => alive && setGems(g))
    const off = window.overlayApi.onBuildState((s) => setBuild(s.active))
    return () => {
      alive = false
      off()
    }
  }, [])
  return { build, gems }
}

/** id предметов камней билда (все этапы прокачки) — «Кампания» показывает их, а не все камни класса; null — билда нет. */
export function useBuildGemIds(): Set<string> | null {
  const { build, gems } = useActiveBuild()
  return useMemo(() => (build && gems ? buildGemGameIds(build.build, resolveStages(build.build, build.edits), gems) : null), [build, gems])
}

/** Квесты в частях шага (фрагменты {k:'quest'}). */
export function stepQuests(parts: LvPart[]): string[] {
  const out: string[] = []
  for (const p of parts) if (typeof p === 'object' && 'k' in p && p.k === 'quest' && !out.includes(p.q)) out.push(p.q)
  return out
}

/** Строки билда для шага: камни текущего этапа, которые берутся за квесты шага. */
export function useBuildLines(parts: LvPart[] | null, progress: LevelingProgress, gameLang: GameLang): { lines: GuideBuildLine[]; active: boolean } {
  const { build, gems } = useActiveBuild()
  const level = progress.level
  const act = progress.areaId ? actOf(progress.areaId) : null
  const done = !!progress.finished
  const lines = useMemo(() => {
    if (!build || !gems || !parts) return []
    const quests = stepQuests(parts)
    if (!quests.length) return []
    const plan = resolveStages(build.build, build.edits)
    const cur = currentStage(plan, { level, act, campaignDone: done }, build.edits).index
    if (cur === null || !plan.stages[cur]?.leveling) return []
    const view = stageGems(build.build, plan, cur, gems, gameLang, stageLevel(plan, cur, cur, level))
    return guideBuildLines(view, quests, gameLang)
  }, [build, gems, parts, level, act, done, gameLang])
  return { lines, active: !!build }
}
