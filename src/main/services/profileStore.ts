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

export async function listProfiles(): Promise<ProfileMeta[]> {
  return readJson<ProfileMeta[]>(profilesFile(), [])
}

function defaultProgress(profileId: string): ProgressState {
  return {
    profileId,
    schemaVersion: PROGRESS_VERSION,
    currentAct: 1,
    level: 1,
    completedQuestIds: {},
    rewardChoices: {},
    updatedAt: Date.now()
  }
}

export async function createProfile(name: string, className?: string): Promise<ProfileMeta> {
  const profiles = await listProfiles()
  const now = Date.now()
  const meta: ProfileMeta = {
    id: randomUUID(),
    name: name.trim() || 'Новый персонаж',
    className: className?.trim() || undefined,
    createdAt: now,
    updatedAt: now
  }
  profiles.push(meta)
  await writeJsonAtomic(profilesFile(), profiles)
  await writeJsonAtomic(progressFile(meta.id), defaultProgress(meta.id))
  return meta
}

export async function renameProfile(id: string, name: string): Promise<ProfileMeta[]> {
  const profiles = await listProfiles()
  const p = profiles.find((x) => x.id === id)
  if (p) {
    p.name = name.trim() || p.name
    p.updatedAt = Date.now()
    await writeJsonAtomic(profilesFile(), profiles)
  }
  return profiles
}

export async function deleteProfile(id: string): Promise<ProfileMeta[]> {
  const profiles = (await listProfiles()).filter((x) => x.id !== id)
  await writeJsonAtomic(profilesFile(), profiles)
  for (const f of [progressFile(id), `${progressFile(id)}.bak`]) {
    try {
      await fs.rm(f)
    } catch {
      // already gone
    }
  }
  return profiles
}

function migrateProgress(profileId: string, p: ProgressState): ProgressState {
  return {
    ...defaultProgress(profileId),
    ...p,
    completedQuestIds: p.completedQuestIds ?? {},
    rewardChoices: p.rewardChoices ?? {},
    profileId,
    schemaVersion: PROGRESS_VERSION
  }
}

export async function getProgress(profileId: string): Promise<ProgressState> {
  const loaded = await readJson<ProgressState>(progressFile(profileId), defaultProgress(profileId))
  return migrateProgress(profileId, loaded)
}

async function saveProgress(p: ProgressState): Promise<ProgressState> {
  p.updatedAt = Date.now()
  await writeJsonAtomic(progressFile(p.profileId), p)
  return p
}

export async function setQuestDone(
  profileId: string,
  questId: string,
  done: boolean
): Promise<ProgressState> {
  const p = await getProgress(profileId)
  if (done) p.completedQuestIds[questId] = true
  else delete p.completedQuestIds[questId]
  return saveProgress(p)
}

export async function setAct(profileId: string, act: number): Promise<ProgressState> {
  const p = await getProgress(profileId)
  p.currentAct = act
  return saveProgress(p)
}

export async function setLevel(profileId: string, level: number): Promise<ProgressState> {
  const p = await getProgress(profileId)
  p.level = Math.max(1, Math.min(100, Math.round(level)))
  return saveProgress(p)
}

export async function setRewardChoice(
  profileId: string,
  questId: string,
  optionIndex: number
): Promise<ProgressState> {
  const p = await getProgress(profileId)
  p.rewardChoices[questId] = optionIndex
  return saveProgress(p)
}

// ---------------------------------------------------------------------------
// Import / export — a self-contained, portable profile bundle (meta + progress).
// Progress is keyed by STABLE quest id, so a bundle survives dataset/patch drift.
// ---------------------------------------------------------------------------

const EXPORT_FORMAT = 'act-compass-profile'
const EXPORT_VERSION = 1

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
    rewardChoices: Record<string, number>
  }
}

/** Build the portable bundle for a profile, or null if it doesn't exist. */
export async function getProfileBundle(id: string): Promise<ProfileBundle | null> {
  const meta = (await listProfiles()).find((p) => p.id === id)
  if (!meta) return null
  const progress = await getProgress(id)
  return {
    format: EXPORT_FORMAT,
    formatVersion: EXPORT_VERSION,
    exportedAt: Date.now(),
    app: { name: 'Act Compass', version: app.getVersion() },
    profile: { name: meta.name, className: meta.className },
    progress: {
      schemaVersion: progress.schemaVersion,
      currentAct: progress.currentAct,
      level: progress.level,
      completedQuestIds: progress.completedQuestIds,
      rewardChoices: progress.rewardChoices
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
  const rewardChoices: Record<string, number> = {}
  if (p.rewardChoices && typeof p.rewardChoices === 'object') {
    for (const [k, v] of Object.entries(p.rewardChoices as Record<string, unknown>)) {
      const n = Number(v)
      if (Number.isFinite(n)) rewardChoices[k] = n
    }
  }

  return {
    format: EXPORT_FORMAT,
    formatVersion: clampInt(b.formatVersion, 1, 9999, 1),
    exportedAt: Number(b.exportedAt) || 0,
    app: { name: 'Act Compass', version: app.getVersion() },
    profile: {
      name: profile.name.trim() || 'Импортированный',
      className: typeof profile.className === 'string' ? profile.className : undefined
    },
    progress: {
      schemaVersion: PROGRESS_VERSION,
      currentAct: clampInt(p.currentAct, 1, 12, 1),
      level: clampInt(p.level, 1, 100, 1),
      completedQuestIds,
      rewardChoices
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
  const meta = await createProfile(bundle.profile.name, bundle.profile.className)
  const progress: ProgressState = {
    profileId: meta.id,
    schemaVersion: PROGRESS_VERSION,
    currentAct: bundle.progress.currentAct,
    level: bundle.progress.level,
    completedQuestIds: bundle.progress.completedQuestIds,
    rewardChoices: bundle.progress.rewardChoices,
    updatedAt: Date.now()
  }
  await writeJsonAtomic(progressFile(meta.id), progress)
  return meta
}
