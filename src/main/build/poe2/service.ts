import { app } from 'electron'
import { randomBytes } from 'crypto'
import { existsSync, promises as fs } from 'fs'
import path from 'path'
import { inflateNode } from '@shared/advisor/codecNode'
import { importPob2Code } from '@shared/pob/import'
import type { Pob2Build } from '@shared/pob/poe2'
import { POE2_GEMS_FILE, POE2_TREE_FILE, parsePoe2Gems, parsePoe2Tree, type Poe2GemData, type Poe2TreeData } from '@shared/poe2/build/data'
import { buildFileName } from '@shared/poe2/build/fileName'
import { cleanBuildName, serializeGameBuild, toGameBuild, type ItemNames } from '@shared/poe2/build/gameBuild'
import { POE2_INSTILL_FILE, parseInstillData, type InstillData } from '@shared/poe2/build/instill'
import {
  BUILDS2_FILE,
  addBuild2,
  emptyLibrary2,
  findBuild2,
  openBuild2,
  parseLibrary2,
  removeBuild2,
  replaceCode2,
  type Build2Library,
  type StoredBuild2
} from '@shared/poe2/build/library'
import { resolveStages2 } from '@shared/poe2/build/stages'
import { build2Summary } from '@shared/poe2/build/view'
import type { Build2ImportResult, Build2Recent, Build2SaveRequest, Build2SaveResult, Build2State } from '@shared/types/build2'
import { importPob2 } from '../../pob/import'
import { readJson, writeJsonAtomic } from '../../services/atomicJson'
import { resourcesDir } from '../../services/questDataset'
import { buildPlannerDir, saveBuildFile } from './saveToGame'

// Экран «Билд» PoE 2 (S66), main: импорт PoB2 (код или ссылка — S35/links2), библиотека билдов PoE 2
// (userData/builds-poe2.json: код + источник, при чтении — полный разбор заново), сводка и предпросмотр этапов,
// «Сохранить в игру» (файл `.build` в папку игрового планировщика — только по кнопке и после подтверждения пути,
// saveToGame.ts). Данные дерева, камней и вложения — userData/data/poe2/build (канал данных) главнее встроенных.

interface Data2 {
  tree: Poe2TreeData
  gems: Poe2GemData
  instill: InstillData | null
}

let data: Data2 | null = null
let dataFailed = false
let names: ItemNames | null = null

const dataBases = (): string[] => [path.join(app.getPath('userData'), 'data', 'poe2'), path.join(resourcesDir(), 'data', 'poe2')]

async function readFirst<T>(file: string, parse: (raw: unknown) => T | null): Promise<T | null> {
  for (const base of dataBases()) {
    try {
      const v = parse(JSON.parse(await fs.readFile(path.join(base, file), 'utf8')))
      if (v) return v
    } catch {
      // следующий кандидат
    }
  }
  return null
}

async function loadData(): Promise<Data2 | null> {
  if (data || dataFailed) return data
  const [tree, gems, instill] = await Promise.all([
    readFirst(POE2_TREE_FILE, parsePoe2Tree),
    readFirst(POE2_GEMS_FILE, parsePoe2Gems),
    readFirst(POE2_INSTILL_FILE, parseInstillData)
  ])
  if (!tree || !gems) {
    dataFailed = true
    console.error('[build2] tree/gems data not found')
    return null
  }
  data = { tree, gems, instill }
  return data
}

/** RU-имена уников и баз для подсказок слотов — данные EE2 (items.ndjson); нет файла — подсказки по-английски. */
async function itemNamesRu(): Promise<ItemNames | null> {
  if (names) return names
  for (const base of dataBases()) {
    try {
      const unique = new Map<string, string>()
      const item = new Map<string, string>()
      for (const line of (await fs.readFile(path.join(base, 'ru', 'items.ndjson'), 'utf8')).split('\n')) {
        if (!line.includes('"UNIQUE"') && !line.includes('"ITEM"')) continue
        const it = JSON.parse(line) as { name?: unknown; refName?: unknown; namespace?: unknown }
        if (typeof it.name !== 'string' || typeof it.refName !== 'string') continue
        if (it.namespace === 'UNIQUE') unique.set(it.refName, it.name)
        else if (it.namespace === 'ITEM') item.set(it.refName, it.name)
      }
      names = { unique: (en) => unique.get(en) ?? null, base: (en) => item.get(en) ?? null }
      return names
    } catch {
      // следующий кандидат
    }
  }
  return null
}

// ---------------------------------------------------------------------------- библиотека

let lib: Build2Library | null = null
let loading: Promise<Build2Library> | null = null
let writing: Promise<void> = Promise.resolve()
/** разобранные билды по id (код в библиотеке не меняется без нового id или reload) */
const parsed = new Map<string, Pob2Build | null>()

const file = (): string => path.join(app.getPath('userData'), BUILDS2_FILE)
const newId = (): string => randomBytes(9).toString('base64url')

async function load(): Promise<Build2Library> {
  if (lib) return lib
  loading ??= readJson<unknown>(file(), null).then((raw) => {
    lib ??= raw ? parseLibrary2(raw) : emptyLibrary2()
    return lib
  })
  return loading
}

function commit(next: Build2Library): void {
  lib = next
  writing = writing
    .catch(() => undefined)
    .then(() => writeJsonAtomic(file(), next))
    .catch((e) => console.warn('[build2] cannot save builds-poe2.json', e))
}

function parsedOf(b: StoredBuild2): Pob2Build | null {
  if (!parsed.has(b.id)) {
    const res = importPob2Code(b.code, inflateNode, b.source)
    parsed.set(b.id, res.ok ? res.build : null)
  }
  return parsed.get(b.id) ?? null
}

async function stateOf(l: Build2Library): Promise<Build2State> {
  const d = await loadData()
  if (!d) return { active: null, recent: [], dataError: true }
  const recent: Build2Recent[] = []
  let active: Build2State['active'] = null
  for (const b of l.builds) {
    const build = parsedOf(b)
    if (!build) continue
    const plan = resolveStages2(build, d.tree)
    const summary = build2Summary(b, build, plan, d.tree, d.gems, d.instill)
    recent.push({ id: b.id, name: summary.defaultName, importedAt: b.importedAt })
    if (b.id === l.active) active = summary
  }
  return { active, recent, dataError: false }
}

export async function getState2(): Promise<Build2State> {
  return stateOf(await load())
}

export async function import2(text: string): Promise<Build2ImportResult> {
  if (!(await loadData())) return { ok: false, error: 'no-data' }
  const res = await importPob2(text)
  if (!res.ok) return { ok: false, error: res.error, copySite: res.copySite, host: res.host, fetchError: res.fetchError }
  if (!res.code) return { ok: false, error: 'not-pob' }
  const entry: StoredBuild2 = { id: newId(), code: res.code, source: res.source, importedAt: Date.now() }
  parsed.set(entry.id, res.build)
  const next = addBuild2(await load(), entry)
  commit(next)
  return { ok: true, state: await stateOf(next) }
}

export async function reload2(id: string): Promise<Build2ImportResult> {
  const l = await load()
  const stored = findBuild2(l, id)
  if (!stored || stored.source.kind !== 'link' || !stored.source.pageUrl) return { ok: false, error: 'empty' }
  const res = await importPob2(stored.source.pageUrl)
  if (!res.ok) return { ok: false, error: res.error, copySite: res.copySite, host: res.host, fetchError: res.fetchError }
  if (!res.code) return { ok: false, error: 'not-pob' }
  parsed.set(id, res.build)
  const next = replaceCode2(openBuild2(l, id), id, res.code)
  commit(next)
  return { ok: true, state: await stateOf(next) }
}

export async function open2(id: string | null): Promise<Build2State> {
  const next = openBuild2(await load(), id)
  commit(next)
  return stateOf(next)
}

export async function remove2(id: string): Promise<Build2State> {
  parsed.delete(id)
  const next = removeBuild2(await load(), id)
  commit(next)
  return stateOf(next)
}

// ---------------------------------------------------------------------------- «Сохранить в игру»

const isBool = (v: unknown): v is boolean => typeof v === 'boolean'

/** Запрос из окна (недоверенный): типы и пределы. null — мусор. */
export function cleanSaveRequest(v: unknown): Build2SaveRequest | null {
  if (!v || typeof v !== 'object') return null
  const r = v as Record<string, unknown>
  if (typeof r.id !== 'string' || r.id.length > 64 || typeof r.name !== 'string' || r.name.length > 200) return null
  if (r.lang !== 'ru' && r.lang !== 'en') return null
  if (r.confirm !== undefined && !isBool(r.confirm)) return null
  if (r.overwrite !== undefined && !isBool(r.overwrite)) return null
  if (r.fileName !== undefined && (typeof r.fileName !== 'string' || r.fileName.length > 100)) return null
  return {
    id: r.id,
    name: r.name,
    lang: r.lang,
    ...(r.confirm ? { confirm: true } : {}),
    ...(r.overwrite ? { overwrite: true } : {}),
    ...(typeof r.fileName === 'string' ? { fileName: r.fileName } : {})
  }
}

/** Папка игрового планировщика на этом компьютере. */
export function plannerDir(): ReturnType<typeof buildPlannerDir> {
  return buildPlannerDir(app.getPath('documents'), process.env, (p) => existsSync(p))
}

export async function save2(raw: unknown): Promise<Build2SaveResult> {
  const req = cleanSaveRequest(raw)
  if (!req) return { ok: false, error: 'no-build' }
  const d = await loadData()
  if (!d) return { ok: false, error: 'no-data' }
  const stored = findBuild2(await load(), req.id)
  const build = stored ? parsedOf(stored) : null
  if (!stored || !build) return { ok: false, error: 'no-build' }
  const name = cleanBuildName(req.name)
  const fileName = buildFileName(name)
  const plan = resolveStages2(build, d.tree)
  // ссылку пишем только на публичную пасту, откуда взят код (без неё — ничего)
  const link = stored.source.kind === 'link' ? stored.source.pageUrl ?? null : null
  const items = req.lang === 'ru' ? await itemNamesRu() : null
  const { file: obj } = toGameBuild(build, plan, d.tree, d.gems, { name, lang: req.lang, link, items })
  const res = await saveBuildFile({
    dir: plannerDir(),
    fileName,
    text: serializeGameBuild(obj),
    confirm: req.confirm,
    confirmedName: req.fileName,
    overwrite: req.overwrite
  })
  if (res.ok) console.log(`[build2] .build saved (${res.replaced ? 'replaced' : 'new'})`)
  return res
}
