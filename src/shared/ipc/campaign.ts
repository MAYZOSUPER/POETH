// IPC домена «кампания PoE2» (компас): профили, прогресс, датасет, лейауты, тейлер лога.
// Владелец — PoE2-модуль; в v0.1 не меняется (регресс-проверка в S9).

import type {
  BossDefeatEvent,
  Dataset,
  LevelEvent,
  ProfileExportResult,
  ProfileImportResult,
  ProfileMeta,
  ProgressState,
  TailerStatus,
  ZoneEvent
} from '../types'

export const campaignChannels = {
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
  }
} as const

export const campaignEvents = {
  zoneChange: 'event:zoneChange',
  levelChange: 'event:levelChange',
  tailerStatus: 'event:tailerStatus',
  bossDefeat: 'event:bossDefeat',
  activeProfileChanged: 'event:activeProfileChanged'
} as const

export interface CampaignIpcApi {
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
  dataset: {
    get(): Promise<Dataset>
  }
  layout: {
    /** Returns poeth://img/... urls for an area's layout images (lazy-fetched + cached). */
    resolve(areaId: string): Promise<string[]>
  }
  tailer: {
    start(): Promise<TailerStatus>
    stop(): Promise<TailerStatus>
    status(): Promise<TailerStatus>
    /** Open a file dialog to choose Client.txt; returns the chosen path or null. */
    pickLogFile(): Promise<string | null>
  }
  onZoneChange(cb: (e: ZoneEvent) => void): () => void
  onLevelChange(cb: (e: LevelEvent) => void): () => void
  onTailerStatus(cb: (status: TailerStatus) => void): () => void
  onBossDefeat(cb: (e: BossDefeatEvent) => void): () => void
  onActiveProfileChanged(cb: (profileId: string | null) => void): () => void
}
