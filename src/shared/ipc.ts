// Single source of truth for IPC channel names and the typed bridge contract.
// Imported by main (handlers), preload (bridge) and renderer (consumer) so the
// channel names and payload shapes can never drift apart.

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
} from './types'

export const IPC = {
  profiles: {
    list: 'profiles:list',
    create: 'profiles:create',
    rename: 'profiles:rename',
    delete: 'profiles:delete',
    setActive: 'profiles:setActive',
    getActive: 'profiles:getActive',
    export: 'profiles:export',
    import: 'profiles:import'
  },
  progress: {
    get: 'progress:get',
    setQuestDone: 'progress:setQuestDone',
    setAct: 'progress:setAct',
    setLevel: 'progress:setLevel',
    setRewardChoice: 'progress:setRewardChoice'
  },
  settings: {
    get: 'settings:get',
    set: 'settings:set'
  },
  dataset: {
    get: 'dataset:get'
  },
  layout: {
    resolve: 'layout:resolve'
  },
  tailer: {
    start: 'tailer:start',
    stop: 'tailer:stop',
    status: 'tailer:status',
    pickLogFile: 'tailer:pickLogFile'
  },
  window: {
    setLocked: 'window:setLocked',
    toggleVisible: 'window:toggleVisible',
    minimize: 'window:minimize'
  },
  events: {
    zoneChange: 'event:zoneChange',
    levelChange: 'event:levelChange',
    tailerStatus: 'event:tailerStatus',
    hotkey: 'event:hotkey',
    activeProfileChanged: 'event:activeProfileChanged'
  }
} as const

/** The API surface exposed on `window.overlayApi` by the preload bridge. */
export interface OverlayApi {
  profiles: {
    list(): Promise<ProfileMeta[]>
    create(name: string, className?: string): Promise<ProfileMeta>
    rename(id: string, name: string): Promise<ProfileMeta[]>
    delete(id: string): Promise<ProfileMeta[]>
    setActive(id: string): Promise<void>
    getActive(): Promise<string | null>
    /** Save the given profile (meta + progress) to a user-chosen file. */
    export(id: string): Promise<ProfileExportResult>
    /** Pick a profile file and import it as a NEW profile (fresh id). */
    import(): Promise<ProfileImportResult>
  }
  progress: {
    get(profileId: string): Promise<ProgressState>
    setQuestDone(profileId: string, questId: string, done: boolean): Promise<ProgressState>
    setAct(profileId: string, act: number): Promise<ProgressState>
    setLevel(profileId: string, level: number): Promise<ProgressState>
    setRewardChoice(
      profileId: string,
      questId: string,
      optionIndex: number
    ): Promise<ProgressState>
  }
  settings: {
    get(): Promise<Settings>
    set(patch: Partial<Settings>): Promise<Settings>
  }
  dataset: {
    get(): Promise<Dataset>
  }
  layout: {
    /** Returns local file:// urls for an area's layout images (lazy-fetched + cached). */
    resolve(areaId: string): Promise<string[]>
  }
  tailer: {
    start(): Promise<TailerStatus>
    stop(): Promise<TailerStatus>
    status(): Promise<TailerStatus>
    /** Open a file dialog to choose Client.txt; returns the chosen path or null. */
    pickLogFile(): Promise<string | null>
  }
  window: {
    /** true = overlay ignores the mouse entirely (clicks pass through to the game) */
    setLocked(locked: boolean): void
    toggleVisible(): void
    minimize(): void
  }
  onZoneChange(cb: (e: ZoneEvent) => void): () => void
  onLevelChange(cb: (e: LevelEvent) => void): () => void
  onTailerStatus(cb: (status: TailerStatus) => void): () => void
  onHotkey(cb: (action: HotkeyAction) => void): () => void
  onActiveProfileChanged(cb: (profileId: string | null) => void): () => void
}
