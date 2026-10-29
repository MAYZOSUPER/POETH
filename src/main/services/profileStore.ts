import { app } from 'electron'
import path from 'path'
import { promises as fs } from 'fs'
import { randomUUID } from 'crypto'
import type { ProfileMeta, ProgressState } from '@shared/types'
import { readJson, writeJsonAtomic } from './atomicJson'

const PROGRESS_VERSION = 1

function profilesFile(): string {
  return path.join(app.getPath('userData'), 'profiles.json')
}

function progressFile(id: string): string {
  return path.join(app.getPath('userData'), 'progress', `${id}.json`)
}

// Все чтения и изменения profiles.json и файлов прогресса — строго по очереди (S32). writeJsonAtomic пишет
// через общий `<файл>.tmp`: две одновременные записи одного файла делили его, и rename второй падал с ENOENT
// (первый запуск: компаньон дважды зовёт init() и создаёт профиль), а запись, прочитавшая список до соседней,
// её затирала. Внутри очереди — только внутренние функции (readProfiles, loadProgress, addProfile), не экспорт.
let queue: Promise<unknown> = Promise.resolve()

function serial<T>(run: () => Promise<T>): Promise<T> {
  const result = queue.then(run, run)
  queue = result.catch(() => undefined)
  return result
}

/** Каталог — до записи (userData из POETH_USER_DATA_DIR может ещё не существовать), запись — атомарная. */
async function save(file: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true })
  await writeJsonAtomic(file, data)
}

function readProfiles(): Promise<ProfileMeta[]> {
  return readJson<ProfileMeta[]>(profilesFile(), [])
}

/** Список ждёт идущие изменения: запрошенный во время создания профиля уже видит его. */
export function listProfiles(): Promise<ProfileMeta[]> {
  return serial(readProfiles)
}

function defaultProgress(profileId: string): ProgressState {
  return {
    profileId,
    schemaVersion: PROGRESS_VERSION,
    currentAct: 1,
    level: 1,
    completedQuestIds: {},
    autoCompletedQuestIds: {},
    rewardChoices: {},
    completedTrialIds: {},
    ascendancyId: null,
    updatedAt: Date.now()
  }
}

async function addProfile(name: string, className?: string): Promise<ProfileMeta> {
  const profiles = await readProfiles()
  const now = Date.now()
  const meta: ProfileMeta = {
    id: randomUUID(),
    name: name.trim() || 'Новый персонаж',
    className: className?.trim() || undefined,
    createdAt: now,
    updatedAt: now
  }
  profiles.push(meta)
  await save(profilesFile(), profiles)
  await save(progressFile(meta.id), defaultProgress(meta.id))
  return meta
}

export function createProfile(name: string, className?: string): Promise<ProfileMeta> {
  return serial(() => addProfile(name, className))
}

export function renameProfile(id: string, name: string): Promise<ProfileMeta[]> {
  return serial(async () => {
    const profiles = await readProfiles()
    const p = profiles.find((x) => x.id === id)
    if (p) {
      p.name = name.trim() || p.name
      p.updatedAt = Date.now()
      await save(profilesFile(), profiles)
    }
    return profiles
  })
}

export function setProfileClass(id: string, className: string): Promise<ProfileMeta[]> {
  return serial(async () => {
    const profiles = await readProfiles()
    const p = profiles.find((x) => x.id === id)
    if (p) {
      p.className = className.trim() || undefined
      p.updatedAt = Date.now()
      await save(profilesFile(), profiles)
    }
    return profiles
  })
}

export function deleteProfile(id: string): Promise<ProfileMeta[]> {
  return serial(async () => {
    const profiles = (await readProfiles()).filter((x) => x.id !== id)
    await save(profilesFile(), profiles)
    for (const f of [progressFile(id), `${progressFile(id)}.bak`]) {
      try {
        await fs.rm(f)
      } catch {
        // already gone
      }
    }
    return profiles
  })
}

function migrateProgress(profileId: string, p: ProgressState): ProgressState {
  return {
    ...defaultProgress(profileId),
    ...p,
    completedQuestIds: p.completedQuestIds ?? {},
    autoCompletedQuestIds: p.autoCompletedQuestIds ?? {},
    rewardChoices: p.rewardChoices ?? {},
    completedTrialIds: p.completedTrialIds ?? {},
    ascendancyId: p.ascendancyId ?? null,
    profileId,
    schemaVersion: PROGRESS_VERSION
  }
}

async function loadProgress(profileId: string): Promise<ProgressState> {
  const loaded = await readJson<ProgressState>(progressFile(profileId), defaultProgress(profileId))
  return migrateProgress(profileId, loaded)
}

export function getProgress(profileId: string): Promise<ProgressState> {
  return serial(() => loadProgress(profileId))
}

async function saveProgress(p: ProgressState): Promise<ProgressState> {
  p.updatedAt = Date.now()
  await save(progressFile(p.profileId), p)
  return p
}

/** Прочитать прогресс, изменить и сохранить — одним шагом очереди (без потерянных обновлений). */
function editProgress(profileId: string, edit: (p: ProgressState) => void): Promise<ProgressState> {
  return serial(async () => {
    const p = await loadProgress(profileId)
    edit(p)
    return saveProgress(p)
  })
}

export function setQuestDone(profileId: string, questId: string, done: boolean): Promise<ProgressState> {
  return editProgress(profileId, (p) => {
    if (done) p.completedQuestIds[questId] = true
    else delete p.completedQuestIds[questId]
    // A manual toggle "claims" the tick — drop any auto-progression flag on it.
    delete p.autoCompletedQuestIds[questId]
  })
}

/** Auto-progression batch: mark each id done AND flag it auto-completed. Add-only
 * (never unchecks). Single atomic write. */
export function setQuestsDone(profileId: string, questIds: string[]): Promise<ProgressState> {
  return editProgress(profileId, (p) => {
    for (const id of questIds) {
      p.completedQuestIds[id] = true
      p.autoCompletedQuestIds[id] = true
    }
  })
}

/** Manual batch set/clear (e.g. "mark act done/clear"). Treated as manual — clears
 * the auto-completed flag either way. Single atomic write. */
export function setManyQuests(profileId: string, questIds: string[], done: boolean): Promise<ProgressState> {
  return editProgress(profileId, (p) => {
    for (const id of questIds) {
      if (done) p.completedQuestIds[id] = true
      else delete p.completedQuestIds[id]
      delete p.autoCompletedQuestIds[id]
    }
  })
}

export function setAct(profileId: string, act: number): Promise<ProgressState> {
  return editProgress(profileId, (p) => {
    p.currentAct = act
  })
}

export function setLevel(profileId: string, level: number): Promise<ProgressState> {
  return editProgress(profileId, (p) => {
    p.level = Math.max(1, Math.min(100, Math.round(level)))
  })
}

export function setRewardChoice(profileId: string, questId: string, optionIndex: number): Promise<ProgressState> {
  return editProgress(profileId, (p) => {
    p.rewardChoices[questId] = optionIndex
  })
}

export function setTrialDone(profileId: string, trialId: string, done: boolean): Promise<ProgressState> {
  return editProgress(profileId, (p) => {
    if (done) p.completedTrialIds[trialId] = true
    else delete p.completedTrialIds[trialId]
  })
}

export function setAscendancy(profileId: string, ascendancyId: string | null): Promise<ProgressState> {
  return editProgress(profileId, (p) => {
    p.ascendancyId = ascendancyId || null
  })
}

// ---------------------------------------------------------------------------
// Import / export — a self-contained, portable profile bundle (meta + progress).
// Progress is keyed by STABLE quest id, so a bundle survives dataset/patch drift.
// ---------------------------------------------------------------------------

const EXPORT_FORMAT = 'act-compass-profile'
const EXPORT_VERSION = 3

export interface ProfileBundle {
  format: string
  formatVersion: number
  exportedAt: number
  app: { name: string; version: string }
  profile: { name: string; className?: string }
  progress: {
    schemaVersion: number
    currentAct: number
    level: number
    completedQuestIds: Record<string, true>
    autoCompletedQuestIds: Record<string, true>
    rewardChoices: Record<string, number>
    completedTrialIds: Record<string, true>
    ascendancyId: string | null
  }
}

/** Build the portable bundle for a profile, or null if it doesn't exist. */
export function getProfileBundle(id: string): Promise<ProfileBundle | null> {
  return serial(() => buildBundle(id))
}

async function buildBundle(id: string): Promise<ProfileBundle | null> {
  const meta = (await readProfiles()).find((p) => p.id === id)
  if (!meta) return null
  const progress = await loadProgress(id)
  return {
    format: EXPORT_FORMAT,
    formatVersion: EXPORT_VERSION,
    exportedAt: Date.now(),
    app: { name: 'POETH', version: app.getVersion() },
    profile: { name: meta.name, className: meta.className },
    progress: {
      schemaVersion: progress.schemaVersion,
      currentAct: progress.currentAct,
      level: progress.level,
      completedQuestIds: progress.completedQuestIds,
      autoCompletedQuestIds: progress.autoCompletedQuestIds,
      rewardChoices: progress.rewardChoices,
      completedTrialIds: progress.completedTrialIds,
      ascendancyId: progress.ascendancyId
    }
  }
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Math.round(Number(value))
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, n))
}

/** Validate + sanitize untrusted JSON into a bundle, or null if it isn't one. */
function sanitizeBundle(raw: unknown): ProfileBundle | null {
  if (!raw || typeof raw !== 'object') return null
  const b = raw as Record<string, unknown>
  if (b.format !== EXPORT_FORMAT) return null
  const profile = b.profile as Record<string, unknown> | undefined
  if (!profile || typeof profile.name !== 'string') return null
  const p = (b.progress ?? {}) as Record<string, unknown>

  const completedQuestIds: Record<string, true> = {}
  if (p.completedQuestIds && typeof p.completedQuestIds === 'object') {
    for (const [k, v] of Object.entries(p.completedQuestIds as Record<string, unknown>)) {
      if (v) completedQuestIds[k] = true
    }
  }
  const autoCompletedQuestIds: Record<string, true> = {}
  if (p.autoCompletedQuestIds && typeof p.autoCompletedQuestIds === 'object') {
    for (const [k, v] of Object.entries(p.autoCompletedQuestIds as Record<string, unknown>)) {
      if (v && completedQuestIds[k]) autoCompletedQuestIds[k] = true // keep only completed ones
    }
  }
  const rewardChoices: Record<string, number> = {}
  if (p.rewardChoices && typeof p.rewardChoices === 'object') {
    for (const [k, v] of Object.entries(p.rewardChoices as Record<string, unknown>)) {
      const n = Number(v)
      if (Number.isFinite(n)) rewardChoices[k] = n
    }
  }
  const completedTrialIds: Record<string, true> = {}
  if (p.completedTrialIds && typeof p.completedTrialIds === 'object') {
    for (const [k, v] of Object.entries(p.completedTrialIds as Record<string, unknown>)) {
      if (v) completedTrialIds[k] = true
    }
  }
  const ascendancyId = typeof p.ascendancyId === 'string' ? p.ascendancyId : null

  return {
    format: EXPORT_FORMAT,
    formatVersion: clampInt(b.formatVersion, 1, 9999, 1),
    exportedAt: Number(b.exportedAt) || 0,
    app: { name: 'POETH', version: app.getVersion() },
    profile: {
      name: profile.name.trim() || 'Импортированный',
      className: typeof profile.className === 'string' ? profile.className : undefined
    },
    progress: {
      schemaVersion: PROGRESS_VERSION,
      currentAct: clampInt(p.currentAct, 1, 12, 1),
      level: clampInt(p.level, 1, 100, 1),
      completedQuestIds,
      autoCompletedQuestIds,
      rewardChoices,
      completedTrialIds,
      ascendancyId
    }
  }
}

/**
 * Import a parsed bundle as a brand-new profile (fresh id, never overwriting an
 * existing one). Returns the new profile meta, or null if the bundle is invalid.
 */
export async function importProfileBundle(raw: unknown): Promise<ProfileMeta | null> {
  const bundle = sanitizeBundle(raw)
  if (!bundle) return null
  return serial(() => addImported(bundle))
}

async function addImported(bundle: ProfileBundle): Promise<ProfileMeta> {
  const meta = await addProfile(bundle.profile.name, bundle.profile.className)
  const progress: ProgressState = {
    profileId: meta.id,
    schemaVersion: PROGRESS_VERSION,
    currentAct: bundle.progress.currentAct,
    level: bundle.progress.level,
    completedQuestIds: bundle.progress.completedQuestIds,
    autoCompletedQuestIds: bundle.progress.autoCompletedQuestIds,
    rewardChoices: bundle.progress.rewardChoices,
    completedTrialIds: bundle.progress.completedTrialIds,
    ascendancyId: bundle.progress.ascendancyId,
    updatedAt: Date.now()
  }
  await save(progressFile(meta.id), progress)
  return meta
}
