import { app } from 'electron'
import { randomBytes } from 'crypto'
import path from 'path'
import {
  BUILDS_FILE,
  addBuild,
  emptyLibrary,
  openBuild,
  parseLibrary,
  removeBuild,
  replaceBuild,
  setBuildEdits,
  stateOf,
  type AddBuildOptions,
  type BuildLibrary
} from '@shared/build/library'
import type { PobBuild } from '@shared/pob/model'
import type { BuildState, PobSource, StoredBuild } from '@shared/types/build'
import { readJson, writeJsonAtomic } from '../services/atomicJson'

// Библиотека билдов вкладки «Билд» (S39): userData/builds.json — только на этом компьютере, атомарная запись по
// одной очереди. Проверка файла и все изменения — чистые функции src/shared/build/library.ts.

type Listener = (state: BuildState, active: StoredBuild | null) => void

let lib: BuildLibrary | null = null
let loading: Promise<BuildLibrary> | null = null
let writing: Promise<void> = Promise.resolve()
const listeners = new Set<Listener>()

const file = (): string => path.join(app.getPath('userData'), BUILDS_FILE)
const newId = (): string => randomBytes(9).toString('base64url')

async function load(): Promise<BuildLibrary> {
  if (lib) return lib
  loading ??= readJson<unknown>(file(), null).then((raw) => {
    lib ??= raw ? parseLibrary(raw) : emptyLibrary()
    return lib
  })
  return loading
}

function commit(next: BuildLibrary): BuildState {
  lib = next
  writing = writing
    .catch(() => undefined)
    .then(() => writeJsonAtomic(file(), next))
    .catch((e) => console.warn('[build] cannot save builds.json', e))
  const state = stateOf(next)
  for (const cb of listeners) cb(state, state.active)
  return state
}

export async function getBuildState(): Promise<BuildState> {
  return stateOf(await load())
}

export async function getActiveBuild(): Promise<StoredBuild | null> {
  return stateOf(await load()).active
}

/** S59: opts — «только в библиотеку» (activate: false) и метка «из Стартеров». */
export async function saveImported(build: PobBuild, source: PobSource, opts?: AddBuildOptions): Promise<BuildState> {
  return commit(addBuild(await load(), build, source, Date.now(), newId, opts))
}

export async function replaceImported(id: string, build: PobBuild): Promise<BuildState> {
  return commit(replaceBuild(await load(), id, build, Date.now()))
}

export async function openStored(id: string | null): Promise<BuildState> {
  return commit(openBuild(await load(), id, Date.now()))
}

export async function removeStored(id: string): Promise<BuildState> {
  return commit(removeBuild(await load(), id))
}

export async function setStoredEdits(id: string, edits: unknown): Promise<BuildState> {
  return commit(setBuildEdits(await load(), id, edits))
}

export async function findStored(id: string): Promise<StoredBuild | null> {
  return (await load()).builds.find((b) => b.id === id) ?? null
}

/** Изменение библиотеки (окна, дерево поверх игры). */
export function onBuildLibrary(cb: Listener): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}
