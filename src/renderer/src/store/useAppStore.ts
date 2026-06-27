import { create } from 'zustand'
import type {
  Act,
  Dataset,
  HotkeyAction,
  LevelEvent,
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
  /** human label of the detected zone (shown even if it's not in the checklist) */
  detectedZoneLabel: string | null
  tailerStatus: TailerStatus | null

  init: () => Promise<void>
  selectAct: (actId: string) => void
  selectZone: (areaId: string | null) => void
  toggleQuest: (questId: string, done: boolean) => Promise<void>
  setLevel: (level: number) => Promise<void>
  setRewardChoice: (questId: string, optionIndex: number) => Promise<void>
  createProfile: (name: string, className?: string) => Promise<void>
  switchProfile: (id: string) => Promise<void>
  renameProfile: (id: string, name: string) => Promise<void>
  deleteProfile: (id: string) => Promise<void>
  patchSettings: (patch: Partial<Settings>) => Promise<void>
  handleHotkey: (action: HotkeyAction) => Promise<void>
  tailerStart: () => Promise<void>
  tailerStop: () => Promise<void>
  tailerPickFile: () => Promise<void>
}

const api = (): Window['overlayApi'] => window.overlayApi

function actOf(dataset: Dataset | null, actId: string | null): Act | undefined {
  return dataset?.acts.find((a) => a.id === actId)
}

// Reverse indices: game areaId / display name -> our { actId, zoneAreaId }.
type ZoneRef = { actId: string; zoneAreaId: string }
let zoneByExileId: Record<string, ZoneRef> = {}
let zoneByName: Record<string, ZoneRef> = {}
// Full-area fallback (incl. towns/trials): areaId -> actId, display name -> areaId.
let areaToActId: Record<string, string> = {}
let nameToExileId: Record<string, string> = {}

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
  for (const act of dataset.acts) {
    for (const zone of act.zones) {
      const ref: ZoneRef = { actId: act.id, zoneAreaId: zone.areaId }
      const ex = zone.xref?.exileUiAreaId
      if (ex && !(ex.toLowerCase() in zoneByExileId)) zoneByExileId[ex.toLowerCase()] = ref
      const n = zone.name.toLowerCase()
      if (!(n in zoneByName)) zoneByName[n] = ref
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
    patch.detectedZoneLabel = zone ? `A${act?.actNumber}: ${zone.name}` : null
    if (autoAdvance) {
      patch.selectedActId = ref.actId
      patch.selectedZoneAreaId = ref.zoneAreaId
    }
    set(patch)
    return
  }

  // Not a tracked zone (town/trial/etc.) — still identify the act from the map.
  const exileId = (
    e.areaId ?? (e.areaName ? nameToExileId[e.areaName.toLowerCase()] : undefined)
  )?.toLowerCase()
  const actId = exileId ? areaToActId[exileId] : null
  const canonical =
    (exileId && dataset?.areas?.[exileId]) || e.areaName || e.areaId || null
  patch.detectedZoneAreaId = null
  if (actId) {
    const act = dataset?.acts.find((a) => a.id === actId)
    patch.detectedZoneLabel = canonical ? `A${act?.actNumber}: ${canonical}` : (act?.actName ?? null)
    if (autoAdvance) patch.selectedActId = actId
  } else {
    patch.detectedZoneLabel = canonical ? `${canonical} — вне кампании` : null
  }
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
  detectedZoneLabel: null,
  tailerStatus: null,

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

    const tailerStatus = await api().tailer.status()

    set({
      dataset,
      settings,
      profiles,
      activeProfileId,
      progress,
      selectedActId,
      selectedZoneAreaId: null,
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
    set({ selectedActId: actId, selectedZoneAreaId: null })
  },

  selectZone(areaId) {
    set({ selectedZoneAreaId: areaId })
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

  async deleteProfile(id) {
    const remaining = await api().profiles.delete(id)
    set({ profiles: remaining })
    if (get().activeProfileId === id) {
      if (remaining.length > 0) await get().switchProfile(remaining[0].id)
      else await get().createProfile('Персонаж 1')
    }
  },

  async patchSettings(patch) {
    const settings = await api().settings.set(patch)
    set({ settings })
  },

  async handleHotkey(action) {
    const { dataset, selectedActId, selectedZoneAreaId } = get()
    if (action === 'toggleLock') {
      // main already flipped the lock; refresh settings to reflect it
      const settings = await api().settings.get()
      set({ settings })
      return
    }
    if (action === 'prevStep' || action === 'nextStep') {
      const act = actOf(dataset, selectedActId)
      if (!act || act.zones.length === 0) return
      const idx = act.zones.findIndex((z) => z.areaId === selectedZoneAreaId)
      const dir = action === 'nextStep' ? 1 : -1
      const nextIdx = Math.max(0, Math.min(act.zones.length - 1, (idx < 0 ? 0 : idx) + dir))
      set({ selectedZoneAreaId: act.zones[nextIdx].areaId })
    }
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
    set({ tailerStatus: status, settings, detectedZoneAreaId: null, detectedZoneLabel: null })
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
