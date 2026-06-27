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
