import { create } from 'zustand'
import type {
  Act,
  Dataset,
  HotkeyAction,
  ProfileMeta,
  ProgressState,
  Settings
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
}

const api = (): Window['overlayApi'] => window.overlayApi

function actOf(dataset: Dataset | null, actId: string | null): Act | undefined {
  return dataset?.acts.find((a) => a.id === actId)
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

  async init() {
    const dataset = await api().dataset.get()
    const settings = await api().settings.get()
    let profiles = await api().profiles.list()

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

    set({
      dataset,
      settings,
      profiles,
      activeProfileId,
      progress,
      selectedActId,
      selectedZoneAreaId: null,
      ready: true
    })
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
  }
}))
