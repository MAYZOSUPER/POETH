// Single source of truth for IPC channel names and the typed bridge contract.
// Imported by main (handlers), preload (bridge) and renderer (consumer) so the
// channel names and payload shapes can never drift apart.

import type {
  BossDefeatEvent,
  Dataset,
  HotkeyAction,
  LevelEvent,
  PriceCheckResult,
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
    setClass: 'profiles:setClass',
    delete: 'profiles:delete',
    setActive: 'profiles:setActive',
    getActive: 'profiles:getActive',
    export: 'profiles:export',
    import: 'profiles:import'
  },
  progress: {
    get: 'progress:get',
    setQuestDone: 'progress:setQuestDone',
    setQuestsDone: 'progress:setQuestsDone',
    setManyQuests: 'progress:setManyQuests',
    setAct: 'progress:setAct',
    setLevel: 'progress:setLevel',
    setRewardChoice: 'progress:setRewardChoice',
    setTrialDone: 'progress:setTrialDone',
    setAscendancy: 'progress:setAscendancy'
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
  trade: {
    priceCheck: 'trade:priceCheck',
    setSession: 'trade:setSession',
    hasSession: 'trade:hasSession',
    getLeagues: 'trade:getLeagues'
  },
  window: {
    setLocked: 'window:setLocked',
    toggleVisible: 'window:toggleVisible',
    minimize: 'window:minimize',
    openExternal: 'window:openExternal'
  },
  hotkeys: {
    suspend: 'hotkeys:suspend',
    resume: 'hotkeys:resume'
  },
  events: {
    zoneChange: 'event:zoneChange',
    levelChange: 'event:levelChange',
    tailerStatus: 'event:tailerStatus',
    bossDefeat: 'event:bossDefeat',
    hotkey: 'event:hotkey',
    activeProfileChanged: 'event:activeProfileChanged',
    priceResult: 'event:priceResult'
  }
} as const

/** The API surface exposed on `window.overlayApi` by the preload bridge. */
export interface OverlayApi {
  profiles: {
    list(): Promise<ProfileMeta[]>
    create(name: string, className?: string): Promise<ProfileMeta>
    rename(id: string, name: string): Promise<ProfileMeta[]>
    /** Set (or clear, when empty) the character class of a profile. */
    setClass(id: string, className: string): Promise<ProfileMeta[]>
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
    /** Batch auto-check: marks each id done AND flags it auto-completed (never unchecks). */
    setQuestsDone(profileId: string, questIds: string[]): Promise<ProgressState>
    /** Manual batch set/clear (e.g. "mark act done"); clears the auto flag. */
    setManyQuests(profileId: string, questIds: string[], done: boolean): Promise<ProgressState>
    setAct(profileId: string, act: number): Promise<ProgressState>
    setLevel(profileId: string, level: number): Promise<ProgressState>
    setRewardChoice(
      profileId: string,
      questId: string,
      optionIndex: number
    ): Promise<ProgressState>
    setTrialDone(profileId: string, trialId: string, done: boolean): Promise<ProgressState>
    setAscendancy(profileId: string, ascendancyId: string | null): Promise<ProgressState>
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
  trade: {
    /** Price-check the given item clipboard text against the trade2 API. */
    priceCheck(itemText: string): Promise<PriceCheckResult>
    /** Store the POESESSID (encrypted at rest). Returns true once a session is set. */
    setSession(poesessid: string): Promise<boolean>
    /** Whether a POESESSID is currently stored. */
    hasSession(): Promise<boolean>
    /** Current PoE2 trade leagues (ids); falls back to a static list when offline. */
    getLeagues(): Promise<string[]>
  }
  window: {
    /** true = overlay ignores the mouse entirely (clicks pass through to the game) */
    setLocked(locked: boolean): void
    toggleVisible(): void
    minimize(): void
    /** open an https URL in the user's default browser */
    openExternal(url: string): void
  }
  hotkeys: {
    /** Temporarily unregister all global shortcuts (while the user rebinds one). */
    suspend(): void
    /** Re-register global shortcuts from the saved settings. */
    resume(): void
  }
  onZoneChange(cb: (e: ZoneEvent) => void): () => void
  onLevelChange(cb: (e: LevelEvent) => void): () => void
  onTailerStatus(cb: (status: TailerStatus) => void): () => void
  onBossDefeat(cb: (e: BossDefeatEvent) => void): () => void
  onHotkey(cb: (action: HotkeyAction) => void): () => void
  onActiveProfileChanged(cb: (profileId: string | null) => void): () => void
  /** A hotkey-triggered price-check finished (main read the clipboard for us). */
  onPriceResult(cb: (result: PriceCheckResult) => void): () => void
}
