import { create } from 'zustand'
import type {
  Dataset,
  HotkeyAction,
  LevelEvent,
  ProfileExportResult,
  ProfileImportResult,
  ProfileMeta,
  ProgressState,
  Settings,
  TailerStatus,
  ZoneEvent
} from '@shared/types'

interface AppState {
  ready: boolean
  dataset: Dataset | null
  profiles: ProfileMeta[]
  activeProfileId: string | null
  progress: ProgressState | null
  settings: Settings | null
  selectedActId: string | null
  selectedZoneAreaId: string | null
  /** zone (our areaId) auto-detected from the game log; for highlighting */
  detectedZoneAreaId: string | null
  /** English name of the detected zone (localized at render); shown even if not in checklist */
  detectedZoneNameEn: string | null
  /** act id of the detected zone, for the banner prefix */
  detectedActId: string | null
  tailerStatus: TailerStatus | null
  /** left-pane view: full checklist or the "What's Next" guided step */
  viewMode: 'checklist' | 'whatsnext'
  /** pointer into the linear route (getRoute()) for "What's Next" */
  currentStepIndex: number

  init: () => Promise<void>
  selectAct: (actId: string) => void
  selectZone: (areaId: string | null) => void
  setViewMode: (mode: 'checklist' | 'whatsnext') => void
  goToStep: (index: number) => void
  stepNext: () => void
  stepPrev: () => void
  toggleQuest: (questId: string, done: boolean) => Promise<void>
  /** manually mark/clear all quests of an act (catch-up for already-played characters) */
  markActQuests: (actId: string, done: boolean) => Promise<void>
  /** auto-progression: batch-mark quests done + flag them auto-completed (never unchecks) */
  applyAutoChecks: (ids: string[]) => Promise<void>
  /** re-run zone-based auto-check from the current detected zone (e.g. after enabling the setting) */
  reapplyAutoCheck: () => Promise<void>
  toggleTrial: (trialId: string, done: boolean) => Promise<void>
  setAscendancy: (ascendancyId: string | null) => Promise<void>
  setLevel: (level: number) => Promise<void>
  setRewardChoice: (questId: string, optionIndex: number) => Promise<void>
  createProfile: (name: string, className?: string) => Promise<void>
  switchProfile: (id: string) => Promise<void>
  renameProfile: (id: string, name: string) => Promise<void>
  setProfileClass: (id: string, className: string) => Promise<void>
  deleteProfile: (id: string) => Promise<void>
  exportActiveProfile: () => Promise<ProfileExportResult>
  importProfile: () => Promise<ProfileImportResult>
  patchSettings: (patch: Partial<Settings>) => Promise<void>
  handleHotkey: (action: HotkeyAction) => Promise<void>
  tailerStart: () => Promise<void>
  tailerStop: () => Promise<void>
  tailerPickFile: () => Promise<void>
}

const api = (): Window['overlayApi'] => window.overlayApi

// Reverse indices: game areaId / display name -> our { actId, zoneAreaId }.
type ZoneRef = { actId: string; zoneAreaId: string }
let zoneByExileId: Record<string, ZoneRef> = {}
let zoneByName: Record<string, ZoneRef> = {}
// Full-area fallback (incl. towns/trials): areaId -> actId, display name -> areaId.
let areaToActId: Record<string, string> = {}
let nameToExileId: Record<string, string> = {}

// Linear campaign route (ordered zones across all acts/interludes) for "What's Next".
export type RouteStep = {
  index: number
  actId: string
  actNumber: number
  actName: string
  kind: string
  areaId: string
  zoneName: string
  isTown: boolean
}
let routeSteps: RouteStep[] = []
let stepByZone: Record<string, number> = {}
export function getRoute(): RouteStep[] {
  return routeSteps
}
export function stepIndexOfZone(areaId: string | null): number {
  return areaId != null && areaId in stepByZone ? stepByZone[areaId] : -1
}

/**
 * Zone-based auto-progression: mandatory quests of zones STRICTLY BEFORE route
 * index K that aren't already done. Strictly-before (not <= K) is the safe side —
 * being IN a zone doesn't mean its boss is dead, so quests tick when you reach
 * the NEXT checklist zone. Language-agnostic (keyed off areaId route order).
 */
function inferAutoCheck(dataset: Dataset, completed: Record<string, true>, K: number): string[] {
  const ids: string[] = []
  for (const act of dataset.acts) {
    for (const q of act.quests) {
      if (q.type !== 'mandatory') continue
      if (completed[q.id]) continue
      const zi = stepByZone[q.zone]
      if (zi !== undefined && zi < K) ids.push(q.id)
    }
  }
  return ids
}

/** Map a game areaId prefix to our act id: g2_* -> act-2, p1_* -> interlude-1. */
function actIdFromAreaId(areaId: string): string | null {
  const m = areaId.toLowerCase().match(/^([gp])(\d+)/)
  if (!m) return null
  const n = Number(m[2])
  return m[1] === 'g' ? `act-${n}` : `interlude-${n}`
}

function buildZoneIndex(dataset: Dataset): void {
  zoneByExileId = {}
  zoneByName = {}
  areaToActId = {}
  nameToExileId = {}
  routeSteps = []
  stepByZone = {}
  for (const act of dataset.acts) {
    for (const zone of act.zones) {
      const ref: ZoneRef = { actId: act.id, zoneAreaId: zone.areaId }
      const ex = zone.xref?.exileUiAreaId
      if (ex && !(ex.toLowerCase() in zoneByExileId)) zoneByExileId[ex.toLowerCase()] = ref
      const n = zone.name.toLowerCase()
      if (!(n in zoneByName)) zoneByName[n] = ref

      const index = routeSteps.length
      routeSteps.push({
        index,
        actId: act.id,
        actNumber: act.actNumber,
        actName: act.actName,
        kind: act.kind,
        areaId: zone.areaId,
        zoneName: zone.name,
        isTown: !!zone.isTown
      })
      stepByZone[zone.areaId] = index
    }
  }
  for (const [areaId, name] of Object.entries(dataset.areas ?? {})) {
    const act = actIdFromAreaId(areaId)
    if (act) areaToActId[areaId.toLowerCase()] = act
    const n = name.toLowerCase()
    if (!(n in nameToExileId)) nameToExileId[n] = areaId
  }
}

function resolveZone(e: ZoneEvent): ZoneRef | null {
  if (e.areaId && zoneByExileId[e.areaId.toLowerCase()]) return zoneByExileId[e.areaId.toLowerCase()]
  if (e.areaName && zoneByName[e.areaName.toLowerCase()]) return zoneByName[e.areaName.toLowerCase()]
  return null
}

type SetState = (partial: Partial<AppState>) => void

// Apply a detected zone. Tracked checklist zones get highlighted + auto-advanced.
// Towns/trials still identify the act (switch tab) and show their name in the
// banner. Quest completion is never touched.
function applyZoneEvent(get: () => AppState, set: SetState, e: ZoneEvent): void {
  const dataset = get().dataset
  const autoAdvance = get().settings?.autoAdvanceZone ?? true
  const patch: Partial<AppState> = {}

  const ref = resolveZone(e)
  if (ref) {
    const act = dataset?.acts.find((a) => a.id === ref.actId)
    const zone = act?.zones.find((z) => z.areaId === ref.zoneAreaId)
    patch.detectedZoneAreaId = ref.zoneAreaId
    patch.detectedZoneNameEn = zone?.name ?? null
    patch.detectedActId = ref.actId
    if (autoAdvance) {
      patch.selectedActId = ref.actId
      patch.selectedZoneAreaId = ref.zoneAreaId
      const stepIdx = stepByZone[ref.zoneAreaId]
      if (stepIdx !== undefined) patch.currentStepIndex = stepIdx
    }
    set(patch)
    // Advisory auto-check of mandatory quests of zones we've passed (opt-in).
    if (dataset && get().settings?.autoCheckQuests) {
      const K = stepByZone[ref.zoneAreaId]
      if (K !== undefined) {
        const ids = inferAutoCheck(dataset, get().progress?.completedQuestIds ?? {}, K)
        if (ids.length) void get().applyAutoChecks(ids)
      }
    }
    return
  }

  // Not a tracked zone (town/trial/etc.) — still identify the act from the map.
  const exileId = (
    e.areaId ?? (e.areaName ? nameToExileId[e.areaName.toLowerCase()] : undefined)
  )?.toLowerCase()
  const actId = exileId ? areaToActId[exileId] : null
  const canonical = (exileId && dataset?.areas?.[exileId]) || e.areaName || e.areaId || null
  patch.detectedZoneAreaId = null
  patch.detectedZoneNameEn = canonical
  patch.detectedActId = actId
  if (actId && autoAdvance) patch.selectedActId = actId
  set(patch)
}

export const useAppStore = create<AppState>((set, get) => ({
  ready: false,
  dataset: null,
  profiles: [],
  activeProfileId: null,
  progress: null,
  settings: null,
  selectedActId: null,
  selectedZoneAreaId: null,
  detectedZoneAreaId: null,
  detectedZoneNameEn: null,
  detectedActId: null,
  tailerStatus: null,
  viewMode: 'whatsnext',
  currentStepIndex: 0,

  async init() {
    const dataset = await api().dataset.get()
    const settings = await api().settings.get()
    let profiles = await api().profiles.list()
    buildZoneIndex(dataset)

    let activeProfileId = settings.activeProfileId
    if (!activeProfileId || !profiles.some((p) => p.id === activeProfileId)) {
      if (profiles.length === 0) {
        const created = await api().profiles.create('Персонаж 1')
        profiles = [created]
      }
      activeProfileId = profiles[0].id
      await api().profiles.setActive(activeProfileId)
    }

    const progress = await api().progress.get(activeProfileId)
    const selectedActId =
      dataset.acts.find((a) => a.actNumber === progress.currentAct)?.id ??
      dataset.acts[0]?.id ??
      null
    const initialStep = routeSteps.find((s) => s.actId === selectedActId)?.index ?? 0

    // keep renderer in sync with main-driven changes
    api().onActiveProfileChanged(async (id) => {
      if (!id) return
      const prog = await api().progress.get(id)
      set({ activeProfileId: id, progress: prog })
    })
    api().onHotkey((action) => void get().handleHotkey(action))

    // Advisory auto-detection from the game log (zone + level). Never auto-checks quests.
    api().onTailerStatus((status) => set({ tailerStatus: status }))
    api().onZoneChange((e: ZoneEvent) => applyZoneEvent(get, set, e))
    api().onLevelChange((e: LevelEvent) => void get().setLevel(e.level))
    api().onBossDefeat((e) => {
      const st = get()
      if (!st.settings?.autoCheckQuests) return
      if (st.progress?.completedQuestIds[e.questId]) return
      void st.applyAutoChecks([e.questId])
    })

    const tailerStatus = await api().tailer.status()

    set({
      dataset,
      settings,
      profiles,
      activeProfileId,
      progress,
      selectedActId,
      selectedZoneAreaId: null,
      currentStepIndex: initialStep,
      tailerStatus,
      ready: true
    })

    // Sync the current zone/level now that settings are loaded (the tailer may
    // have detected them during startup, before the renderer was listening).
    if (tailerStatus.areaId || tailerStatus.areaName) {
      applyZoneEvent(get, set, {
        areaId: tailerStatus.areaId,
        areaName: tailerStatus.areaName,
        at: Date.now()
      })
    }
    if (tailerStatus.level) void get().setLevel(tailerStatus.level)
  },

  selectAct(actId) {
    const firstStep = routeSteps.find((s) => s.actId === actId)
    set({
      selectedActId: actId,
      selectedZoneAreaId: null,
      ...(firstStep ? { currentStepIndex: firstStep.index } : {})
    })
  },

  selectZone(areaId) {
    set({ selectedZoneAreaId: areaId })
  },

  setViewMode(mode) {
    set({ viewMode: mode })
  },

  goToStep(index) {
    if (routeSteps.length === 0) return
    const i = Math.max(0, Math.min(routeSteps.length - 1, index))
    const s = routeSteps[i]
    set({ currentStepIndex: i, selectedActId: s.actId, selectedZoneAreaId: s.areaId })
  },

  stepNext() {
    get().goToStep(get().currentStepIndex + 1)
  },

  stepPrev() {
    get().goToStep(get().currentStepIndex - 1)
  },

  async toggleQuest(questId, done) {
    const { progress, activeProfileId } = get()
    if (!progress || !activeProfileId) return
    // optimistic update
    const completed = { ...progress.completedQuestIds }
    if (done) completed[questId] = true
    else delete completed[questId]
    set({ progress: { ...progress, completedQuestIds: completed } })
    const saved = await api().progress.setQuestDone(activeProfileId, questId, done)
    set({ progress: saved })
  },

  async markActQuests(actId, done) {
    const { progress, activeProfileId, dataset } = get()
    if (!progress || !activeProfileId || !dataset) return
    const act = dataset.acts.find((a) => a.id === actId)
    if (!act) return
    const ids = act.quests.map((q) => q.id)
    // optimistic
    const completedQuestIds = { ...progress.completedQuestIds }
    const autoCompletedQuestIds = { ...progress.autoCompletedQuestIds }
    for (const id of ids) {
      if (done) completedQuestIds[id] = true
      else delete completedQuestIds[id]
      delete autoCompletedQuestIds[id]
    }
    set({ progress: { ...progress, completedQuestIds, autoCompletedQuestIds } })
    const saved = await api().progress.setManyQuests(activeProfileId, ids, done)
    set({ progress: saved })
  },

  async applyAutoChecks(ids) {
    const { progress, activeProfileId, settings } = get()
    if (!progress || !activeProfileId || !settings?.autoCheckQuests) return
    const fresh = ids.filter((id) => !progress.completedQuestIds[id])
    if (!fresh.length) return
    // optimistic: mark done + auto-flagged
    const completedQuestIds = { ...progress.completedQuestIds }
    const autoCompletedQuestIds = { ...progress.autoCompletedQuestIds }
    for (const id of fresh) {
      completedQuestIds[id] = true
      autoCompletedQuestIds[id] = true
    }
    set({ progress: { ...progress, completedQuestIds, autoCompletedQuestIds } })
    const saved = await api().progress.setQuestsDone(activeProfileId, fresh)
    set({ progress: saved })
  },

  async reapplyAutoCheck() {
    const { detectedZoneAreaId, dataset, progress } = get()
    if (!dataset || !detectedZoneAreaId || !progress) return
    const K = stepByZone[detectedZoneAreaId]
    if (K === undefined) return
    await get().applyAutoChecks(inferAutoCheck(dataset, progress.completedQuestIds, K))
  },

  async toggleTrial(trialId, done) {
    const { progress, activeProfileId } = get()
    if (!progress || !activeProfileId) return
    const completed = { ...progress.completedTrialIds }
    if (done) completed[trialId] = true
    else delete completed[trialId]
    set({ progress: { ...progress, completedTrialIds: completed } })
    const saved = await api().progress.setTrialDone(activeProfileId, trialId, done)
    set({ progress: saved })
  },

  async setAscendancy(ascendancyId) {
    const { progress, activeProfileId } = get()
    if (!progress || !activeProfileId) return
    set({ progress: { ...progress, ascendancyId } })
    const saved = await api().progress.setAscendancy(activeProfileId, ascendancyId)
    set({ progress: saved })
  },

  async setLevel(level) {
    const { activeProfileId } = get()
    if (!activeProfileId) return
    const saved = await api().progress.setLevel(activeProfileId, level)
    set({ progress: saved })
  },

  async setRewardChoice(questId, optionIndex) {
    const { activeProfileId } = get()
    if (!activeProfileId) return
    const saved = await api().progress.setRewardChoice(activeProfileId, questId, optionIndex)
    set({ progress: saved })
  },

  async createProfile(name, className) {
    const created = await api().profiles.create(name, className)
    const profiles = await api().profiles.list()
    set({ profiles })
    await get().switchProfile(created.id)
  },

  async switchProfile(id) {
    await api().profiles.setActive(id)
    const progress = await api().progress.get(id)
    const { dataset } = get()
    const selectedActId =
      dataset?.acts.find((a) => a.actNumber === progress.currentAct)?.id ??
      dataset?.acts[0]?.id ??
      null
    set({ activeProfileId: id, progress, selectedActId, selectedZoneAreaId: null })
  },

  async renameProfile(id, name) {
    const profiles = await api().profiles.rename(id, name)
    set({ profiles })
  },

  async setProfileClass(id, className) {
    const profiles = await api().profiles.setClass(id, className)
    set({ profiles })
  },

  async deleteProfile(id) {
    const remaining = await api().profiles.delete(id)
    set({ profiles: remaining })
    if (get().activeProfileId === id) {
      if (remaining.length > 0) await get().switchProfile(remaining[0].id)
      else await get().createProfile('Персонаж 1')
    }
  },

  async exportActiveProfile() {
    const id = get().activeProfileId
    if (!id) return { status: 'error' as const }
    return api().profiles.export(id)
  },

  async importProfile() {
    const res = await api().profiles.import()
    if (res.status === 'created') {
      set({ profiles: res.profiles })
      await get().switchProfile(res.profile.id)
    }
    return res
  },

  async patchSettings(patch) {
    const settings = await api().settings.set(patch)
    set({ settings })
    // Enabling auto-check should immediately back-fill from the current zone.
    if (patch.autoCheckQuests) void get().reapplyAutoCheck()
  },

  async handleHotkey(action) {
    if (action === 'toggleLock') {
      // main already flipped the lock; refresh settings to reflect it
      const settings = await api().settings.get()
      set({ settings })
      return
    }
    if (action === 'nextStep') get().stepNext()
    else if (action === 'prevStep') get().stepPrev()
  },

  async tailerStart() {
    const status = await api().tailer.start()
    const settings = await api().settings.get()
    set({ tailerStatus: status, settings })
    if (status.areaId || status.areaName) {
      applyZoneEvent(get, set, { areaId: status.areaId, areaName: status.areaName, at: Date.now() })
    }
    if (status.level) void get().setLevel(status.level)
  },

  async tailerStop() {
    const status = await api().tailer.stop()
    const settings = await api().settings.get()
    set({
      tailerStatus: status,
      settings,
      detectedZoneAreaId: null,
      detectedZoneNameEn: null,
      detectedActId: null
    })
  },

  async tailerPickFile() {
    await api().tailer.pickLogFile()
    const status = await api().tailer.status()
    const settings = await api().settings.get()
    set({ tailerStatus: status, settings })
    if (status.areaId || status.areaName) {
      applyZoneEvent(get, set, { areaId: status.areaId, areaName: status.areaName, at: Date.now() })
    }
    if (status.level) void get().setLevel(status.level)
  }
}))
