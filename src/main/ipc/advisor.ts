import { app, clipboard, ipcMain, shell, webContents, type IpcMainInvokeEvent } from 'electron'
import { promises as fs } from 'fs'
import path from 'path'
import { IPC } from '@shared/ipc'
import type { AdvisorItemHit } from '@shared/ipc/advisor'
import type { GameDef } from '@shared/games'
import type {
  AdvisorData,
  AdvisorFarmResult,
  AdvisorImportMode,
  AdvisorImportNote,
  AdvisorImportPreview,
  AdvisorImportResult,
  AdvisorMapEstimate,
  AdvisorSaveResult,
  AdvisorShareInfo,
  AdvisorState,
  AdvisorStrategy,
  AdvisorStrategyView,
  AdvisorSubmitResult
} from '@shared/types/advisor'
import { ADVISOR_DATA_FILE, parseAdvisorData, strategyTexts, tx } from '@shared/advisor/data'
import { estimateStrategy, priceOf } from '@shared/advisor/estimate'
import { advisorDevFlag, advisorOn } from '@shared/advisor/flag'
import { decodeStrategyNode, encodeStrategyNode } from '@shared/advisor/codecNode'
import {
  COMMUNITY_DIR,
  LIBRARY_FILE,
  MAX_DRAFT_BYTES,
  applyImport,
  asImported,
  cleanNick,
  idFromName,
  importPlan,
  parseCommunityFile,
  parseLibrary,
  removeEntry,
  serializeLibrary,
  today,
  upsertMine,
  type CommunityEntry,
  type Library
} from '@shared/advisor/library'
import { STRATEGY_SCHEME, deepLinkFromArgv, issueUrl, strategyLink } from '@shared/advisor/share'
import { buildItemCatalog, searchItems, type ItemCandidate, type ItemRecord } from '@shared/advisor/items'
import { LIMITS, validateLines, validateStrategy } from '@shared/advisor/validate'
import { STRATEGY_ISSUE_URL, isAllowedExternalUrl } from '@shared/links'
import { buildPriceIndex, type PriceIndex } from '@shared/wealth/prices'
import { isTrustedAppUrl } from '../net/guards'
import { getEffectiveLeague, netLog, onLeaguesChanged } from '../net'
import { getSettings, onSettingsChange } from '../services/settingsStore'
import { readJson, writeJsonAtomic } from '../services/atomicJson'
import { portableExe } from '../services/portable'
import { resourcesDir } from '../services/questDataset'
import { getFarmService } from '../services/farmSession'
import { getFeedStore } from '../games/poe1/exchange/feedService'
import { getCompanionWindow } from '../windows/companionWindow'
import { getPriceIndex } from './wealth'
import type { IpcDomain } from './types'
import { devEnv } from '../devEnv'

// Домен «Советник: что фармить» (main, S16 + S17). Стратегии — данные (advisor/strategies.json: сначала
// обновлённые в userData/data, затем встроенные), каталог сообщества (advisor/community/*.json, тем же каналом
// данных) и свои (userData/advisor/my-strategies.json, атомарная запись): созданные в редакторе и добавленные
// по коду. Цены — индекс учёта богатства (фид обмена GGG + poe.watch, свой источник не заводим). Пересчёт —
// при открытии вкладки, новом часе фида и смене лиги.
// Код POETH1 раскрывает и проверяет только main (zlib с пределом размера, строгий валидатор); импорт —
// только по кнопке игрока. «Открыть в POETH» — протокол poeth-strategy:// (установленная версия, не
// portable): из аргументов запуска берём только путь импорта и открываем окно импорта с предпросмотром.
// В релизе v0.1.0 выключен (features.advisor = false), в разработке — POETH_ADVISOR=1.

/** Расчёт старше — пересчитать при следующем запросе состояния. */
const STALE_MS = 15 * 60_000

function devServerUrl(): string | undefined {
  return devEnv('ELECTRON_RENDERER_URL')
}

function broadcast(channel: string, payload: unknown): void {
  for (const wc of webContents.getAllWebContents()) {
    if (wc.isDestroyed() || !isTrustedAppUrl(wc.getURL(), devServerUrl())) continue
    wc.send(channel, payload)
  }
}

const log = (msg: string): void => netLog('debug', msg)

let def: GameDef | null = null
let data: AdvisorData | null = null
let invalid = 0
let community: CommunityEntry[] = []
let communityInvalid = 0
let library: Library | null = null
let libraryInvalid = 0
let index: PriceIndex = buildPriceIndex([])
let items: ItemCandidate[] | null = null
/** код из «Открыть в POETH», пока окно его не забрало */
let pendingLink: string | null = null
let computing: Promise<AdvisorState> | null = null
let saving: Promise<void> = Promise.resolve()
let unsubs: Array<() => void> = []

const empty = (enabled: boolean, supported: boolean): AdvisorState => ({
  enabled,
  supported,
  league: null,
  loading: false,
  data: null,
  views: [],
  invalid: 0,
  nick: '',
  prices: null,
  problem: null,
  at: null
})

let state: AdvisorState = empty(false, false)

function enabled(): boolean {
  return !!def && advisorOn(def, advisorDevFlag(process.env))
}

/** Кандидаты файла данных: обновлённые (userData/data) главнее встроенных. */
function dataBases(game: GameDef): string[] {
  return [path.join(app.getPath('userData'), 'data', game.dataDir), path.join(resourcesDir(), 'data', game.dataDir)]
}

/** Стратегии: обновлённые данные главнее встроенных; битый или новый формат — следующий кандидат. */
async function loadData(game: GameDef): Promise<void> {
  data = null
  invalid = 0
  for (const base of dataBases(game)) {
    let raw: unknown
    try {
      raw = JSON.parse(await fs.readFile(path.join(base, ADVISOR_DATA_FILE), 'utf8'))
    } catch {
      continue // нет файла — следующий кандидат
    }
    const res = parseAdvisorData(raw)
    for (const e of res.errors) log(`[advisor] ${e}`)
    if (res.data) {
      data = res.data
      invalid = res.invalid
      return
    }
  }
}

/**
 * Каталог сообщества: файлы из встроенных данных и обновлённых (пакет данных кладёт только изменённые файлы,
 * поэтому объединяем по имени файла, обновлённый главнее). Битый файл отбрасывается один.
 */
async function loadCommunity(game: GameDef): Promise<void> {
  community = []
  communityInvalid = 0
  const files = new Map<string, string>()
  for (const base of dataBases(game).reverse()) {
    const dir = path.join(base, COMMUNITY_DIR)
    let names: string[] = []
    try {
      names = await fs.readdir(dir)
    } catch {
      continue
    }
    for (const n of names) if (n.endsWith('.json') && !n.startsWith('.')) files.set(n, path.join(dir, n))
  }
  const official = new Set(data?.strategies.map((s) => s.id) ?? [])
  for (const [name, file] of [...files.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    let raw: unknown = null
    try {
      raw = JSON.parse(await fs.readFile(file, 'utf8'))
    } catch {
      raw = null
    }
    const res = parseCommunityFile(raw, name.slice(0, -5))
    if (res.ok && !official.has(res.entry.strategy.id)) community.push(res.entry)
    else {
      communityInvalid++
      log(`[advisor] каталог ${name}: ${res.ok ? 'id занят нашей стратегией' : res.error}`)
    }
  }
}

const libraryFile = (): string => path.join(app.getPath('userData'), LIBRARY_FILE)

async function loadLibrary(): Promise<Library> {
  if (library) return library
  const res = parseLibrary(await readJson<unknown>(libraryFile(), null))
  library = res.library
  libraryInvalid = res.invalid
  if (res.invalid) log(`[advisor] свои стратегии: отброшено ${res.invalid}`)
  return library
}

/** Записать свои стратегии (по очереди, атомарно). */
function persist(): Promise<void> {
  const snapshot = library ? serializeLibrary(library) : null
  saving = saving
    .catch(() => undefined)
    .then(() => (snapshot ? writeJsonAtomic(libraryFile(), snapshot) : undefined))
    .catch((e) => log(`[advisor] запись своих стратегий: ${e instanceof Error ? e.message : 'ошибка'}`))
  return saving
}

/** Наши и каталог сообщества — то, что нельзя заменить импортом. */
function builtins(): AdvisorStrategy[] {
  return [...(data?.strategies ?? []), ...community.map((c) => c.strategy)]
}

function setState(next: AdvisorState): AdvisorState {
  state = next
  broadcast(IPC.events.advisorState, state)
  return state
}

function views(): AdvisorStrategyView[] {
  const out: AdvisorStrategyView[] = (data?.strategies ?? []).map((strategy) => ({ strategy, estimate: estimateStrategy(strategy, index) }))
  for (const c of community) out.push({ strategy: c.strategy, estimate: estimateStrategy(c.strategy, index), checked: c.checked })
  for (const e of library?.items ?? []) out.push({ strategy: e.strategy, estimate: estimateStrategy(e.strategy, index), addedAt: e.addedAt })
  return out
}

/** Пересобрать карточки без новых цен (после импорта, сохранения, удаления). */
function republish(): AdvisorState {
  if (!enabled() || state.at === null) return state
  return setState({ ...state, views: views(), invalid: invalid + communityInvalid + libraryInvalid, nick: library?.nick ?? '' })
}

async function computeNow(game: GameDef, reload: boolean): Promise<AdvisorState> {
  setState({ ...state, enabled: true, supported: true, loading: true })
  if (reload || !data) {
    await loadData(game)
    await loadCommunity(game)
  }
  if (reload) library = null
  await loadLibrary()
  const league = await getEffectiveLeague().catch(() => null)
  let prices: AdvisorState['prices'] = null
  let problem: AdvisorState['problem'] = data ? null : 'data'
  index = buildPriceIndex([])
  if (league) {
    try {
      const p = await getPriceIndex(league)
      index = p.index
      prices = p.info
      if (p.info.problem) problem ??= 'prices'
    } catch (e) {
      log(`[advisor] цены: ${e instanceof Error ? e.message : 'ошибка'}`)
      problem ??= 'prices'
    }
  }
  const d = data
  return setState({
    enabled: true,
    supported: true,
    league,
    loading: false,
    data: d ? { patch: d.patch, updatedAt: d.updatedAt, draft: d.draft, defaults: d.defaults, glossary: d.glossary } : null,
    views: views(),
    invalid: invalid + communityInvalid + libraryInvalid,
    nick: library?.nick ?? '',
    prices,
    problem,
    at: Date.now()
  })
}

/** Пересчёт (один за раз; повторный запрос во время расчёта ждёт его). */
function compute(reload = false): Promise<AdvisorState> {
  const game = def
  if (!game || !enabled()) return Promise.resolve(setState(empty(false, !!game && game.id === 'poe1')))
  if (!computing) {
    computing = computeNow(game, reload)
      .catch((e) => {
        log(`[advisor] расчёт: ${e instanceof Error ? e.message : 'ошибка'}`)
        return setState({ ...state, loading: false })
      })
      .finally(() => {
        computing = null
      })
  }
  return computing
}

async function getState(): Promise<AdvisorState> {
  if (!enabled()) return state
  if (state.at === null) return compute()
  if (Date.now() - state.at > STALE_MS) void compute()
  return state
}

/** Данные и свои стратегии загружены (импорт и редактор могут прийти раньше открытия списка). */
async function ready(): Promise<Library> {
  if (state.at === null || !data) await compute()
  return loadLibrary()
}

async function startFarm(id: unknown): Promise<AdvisorFarmResult> {
  if (!enabled() || typeof id !== 'string' || !state.views.some((v) => v.strategy.id === id)) return 'unknown'
  const farm = getFarmService()
  await farm.load()
  if (farm.state(0).session) {
    await farm.setStrategy(id)
    return 'tagged'
  }
  await farm.start(id)
  return 'started'
}

// ---------------------------------------------------------------------------- импорт (S17)

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname
  } catch {
    return null
  }
}

/** Замечания: нет цены у предмета, текст на одном языке, сторонняя ссылка, другая версия игры. */
function importNotes(s: AdvisorStrategy, e: AdvisorMapEstimate, uiLang: string): AdvisorImportNote[] {
  const notes: AdvisorImportNote[] = []
  s.inputs.forEach((l, i) => {
    if (l.item.ref && !l.own && e.inputs[i].unit === null) notes.push({ kind: 'noPrice', ref: l.item.ref })
  })
  s.outputs.forEach((l, i) => {
    if (l.item.ref && e.outputs[i].unit === null) notes.push({ kind: 'noPrice', ref: l.item.ref })
  })
  const texts = strategyTexts(s)
  const ui = uiLang === 'ru' ? 'ru' : 'en'
  const other = ui === 'ru' ? 'en' : 'ru'
  if (texts.some((t) => !t[ui])) notes.push({ kind: 'lang', lang: other })
  for (const url of [s.atlasTree, s.source.url]) {
    const host = url ? hostOf(url) : null
    if (url && host && !isAllowedExternalUrl(url)) notes.push({ kind: 'link', host })
  }
  if (data && s.patch !== data.patch) notes.push({ kind: 'outdated', patch: s.patch })
  return notes
}

async function decode(text: unknown): Promise<AdvisorImportPreview> {
  if (!enabled() || typeof text !== 'string') return { ok: false, error: 'notcode' }
  const lib = await ready()
  const res = await decodeStrategyNode(text).catch(() => ({ ok: false as const, error: 'broken' as const }))
  if (!res.ok) return res
  const s = asImported(res.strategy)
  const plan = importPlan(s, lib, builtins())
  const estimate = estimateStrategy(s, index)
  const uiLang = await getSettings()
    .then((st) => st.uiLang)
    .catch(() => 'ru')
  return {
    ok: true,
    code: res.code,
    view: { strategy: s, estimate, addedAt: today() },
    match: plan.match,
    existing: plan.existing,
    notes: importNotes(s, estimate, uiLang)
  }
}

async function importCode(code: unknown, mode: unknown): Promise<AdvisorImportResult> {
  if (!enabled()) return { ok: false, error: 'disabled' }
  if (typeof code !== 'string' || (mode !== 'add' && mode !== 'replace' && mode !== 'copy')) return { ok: false, error: 'invalid' }
  const lib = await ready()
  const res = await decodeStrategyNode(code).catch(() => ({ ok: false as const, error: 'broken' as const }))
  if (!res.ok) return { ok: false, error: res.error }
  const applied = applyImport(lib, res.strategy, mode as AdvisorImportMode, builtins(), today())
  if (!applied.ok) return { ok: false, error: 'exists' }
  library = applied.library
  await persist()
  republish()
  log(`[advisor] импорт «${applied.id}» (${mode})`)
  return { ok: true, id: applied.id }
}

// ---------------------------------------------------------------------------- свои (S17)

async function save(raw: unknown, id: unknown): Promise<AdvisorSaveResult> {
  if (!enabled()) return { ok: false, error: 'disabled' }
  const lib = await ready()
  const res = validateStrategy(raw)
  if (!res.ok) return { ok: false, error: res.error }
  const taken = new Set([...builtins().map((s) => s.id), ...lib.items.map((e) => e.strategy.id)])
  let target: string
  if (typeof id === 'string' && id) {
    const own = lib.items.find((e) => e.strategy.id === id)
    if (!own || own.strategy.source.kind !== 'mine') return { ok: false, error: 'не своя стратегия' }
    target = id
  } else {
    target = idFromName(res.strategy.name.en ?? res.strategy.name.ru ?? '', taken)
  }
  // источник своей ставит main: вид mine и сегодняшняя дата (ник добавляется при «Поделиться»)
  const s: AdvisorStrategy = { ...res.strategy, id: target, source: { kind: 'mine', date: today() }, draft: false }
  const r = upsertMine(lib, s, today())
  if (!r.ok) return { ok: false, error: 'достигнут предел своих стратегий' }
  library = r.library
  await persist()
  republish()
  return { ok: true, id: target }
}

async function remove(id: unknown): Promise<boolean> {
  if (!enabled() || typeof id !== 'string') return false
  const lib = await ready()
  if (!lib.items.some((e) => e.strategy.id === id)) return false
  library = removeEntry(lib, id)
  await persist()
  republish()
  return true
}

/** Стратегия для кода: своя — с ником автора (если указан). */
function forShare(id: string): AdvisorStrategy | null {
  const own = library?.items.find((e) => e.strategy.id === id)?.strategy
  if (own) {
    if (own.source.kind !== 'mine') return own
    const nick = library?.nick
    return { ...own, source: nick ? { kind: 'mine', author: nick, date: own.source.date } : { kind: 'mine', date: own.source.date } }
  }
  return builtins().find((s) => s.id === id) ?? null
}

async function share(id: unknown): Promise<AdvisorShareInfo | null> {
  if (!enabled() || typeof id !== 'string') return null
  await ready()
  const s = forShare(id)
  if (!s) return null
  const code = await encodeStrategyNode(s)
  return { code, link: strategyLink(code) }
}

/** «Отправить в каталог»: форма GitHub Issue с кодом — только этот адрес, открывает main. */
async function submit(id: unknown): Promise<AdvisorSubmitResult> {
  const info = await share(id)
  const s = typeof id === 'string' ? forShare(id) : null
  if (!info || !s) return 'error'
  const { url, withCode } = issueUrl(info.code, tx(s.name, 'en') || tx(s.name, 'ru'))
  if (!url.startsWith(`${STRATEGY_ISSUE_URL}?`)) return 'error'
  if (!withCode) clipboard.writeText(info.code)
  try {
    await shell.openExternal(url)
  } catch {
    return 'error'
  }
  return withCode ? 'opened' : 'copied'
}

async function setNick(nick: unknown): Promise<string> {
  if (!enabled()) return ''
  const lib = await ready()
  const clean = cleanNick(nick)
  if (clean !== lib.nick) {
    library = { ...lib, nick: clean }
    await persist()
    republish()
  }
  return clean
}

async function getDraft(): Promise<unknown | null> {
  if (!enabled()) return null
  return (await ready()).draft
}

async function setDraft(draft: unknown): Promise<void> {
  if (!enabled()) return
  const lib = await ready()
  let ok = draft === null
  if (draft && typeof draft === 'object' && !Array.isArray(draft)) {
    try {
      ok = JSON.stringify(draft).length <= MAX_DRAFT_BYTES
    } catch {
      ok = false
    }
  }
  if (!ok) return
  library = { ...lib, draft }
  await persist()
}

/** Строки черновика по живым ценам (без остальной стратегии). */
async function estimate(lines: unknown): Promise<AdvisorMapEstimate | null> {
  if (!enabled() || !lines || typeof lines !== 'object') return null
  await ready()
  const o = lines as { inputs?: unknown; outputs?: unknown }
  const inputs = validateLines(o.inputs ?? [], 'inputs', 0, LIMITS.inputs)
  const outputs = validateLines(o.outputs ?? [], 'outputs', 0, LIMITS.outputs)
  if (!inputs.ok || !outputs.ok) return null
  return estimateStrategy({ inputs: inputs.lines, outputs: outputs.lines, draft: false } as AdvisorStrategy, index)
}

/** Кандидаты поиска: русские данные APT + имена фида обмена (обновлённые данные главнее встроенных). */
async function itemCatalog(game: GameDef): Promise<ItemCandidate[]> {
  if (items) return items
  const readFirst = async (rel: string): Promise<string | null> => {
    for (const base of dataBases(game)) {
      try {
        return await fs.readFile(path.join(base, rel), 'utf8')
      } catch {
        /* следующий кандидат */
      }
    }
    return null
  }
  const records: ItemRecord[] = []
  for (const line of ((await readFirst('ru/items.ndjson')) ?? '').split('\n')) {
    if (!line) continue
    try {
      records.push(JSON.parse(line) as ItemRecord)
    } catch {
      /* битая строка */
    }
  }
  let names: string[] = []
  try {
    const ex = JSON.parse((await readFirst('wealth/exchange-ids.json')) ?? '{}') as { names?: Record<string, string> }
    names = Object.values(ex.names ?? {})
  } catch {
    names = []
  }
  items = buildItemCatalog(records, names)
  return items
}

async function findItems(query: unknown): Promise<AdvisorItemHit[]> {
  const game = def
  if (!enabled() || !game || typeof query !== 'string') return []
  await ready()
  return searchItems(await itemCatalog(game), query, 8).map((c) => {
    const p = priceOf({ kind: c.kind, ref: c.ref }, index)
    const hit: AdvisorItemHit = { ref: c.ref, kind: c.kind, unit: p ? p.chaos : null }
    if (c.ru) hit.ru = c.ru
    if (p?.low) hit.low = true
    return hit
  })
}

// ---------------------------------------------------------------------------- «Открыть в POETH» (S17)

/**
 * Регистрация протокола poeth-strategy:// в Windows: только установленная версия с включённым советником.
 * Portable не регистрируем (exe распаковывается во временную папку) — там только «Скопировать код»;
 * в разработке реестр не трогаем. NSIS electron-builder протоколы не регистрирует — только здесь.
 */
export function registerStrategyProtocol(): void {
  if (!app.isPackaged || portableExe() || !enabled()) return
  try {
    if (!app.isDefaultProtocolClient(STRATEGY_SCHEME)) app.setAsDefaultProtocolClient(STRATEGY_SCHEME)
  } catch (e) {
    log(`[advisor] протокол: ${e instanceof Error ? e.message : 'ошибка'}`)
  }
}

/**
 * Аргументы запуска (первый запуск или second-instance): берём только poeth-strategy://import#<код>, всё
 * остальное игнорируем. Код не раскрываем и ничего не добавляем — окно импорта покажет предпросмотр.
 */
export function handleStrategyArgv(argv: readonly string[]): void {
  const code = deepLinkFromArgv(argv)
  if (!code || !enabled()) return
  pendingLink = code
  broadcast(IPC.events.advisorLink, code)
  const win = getCompanionWindow()
  if (win && !win.isDestroyed()) {
    if (!win.isVisible()) win.show()
    win.focus()
  }
}

function takeLink(): string | null {
  const code = pendingLink
  pendingLink = null
  return code
}

// ---------------------------------------------------------------------------- регистрация

function handle(channel: string, fn: (...args: unknown[]) => unknown): void {
  ipcMain.handle(channel, (e: IpcMainInvokeEvent, ...args: unknown[]) => {
    if (!isTrustedAppUrl(e.senderFrame?.url, devServerUrl())) throw new Error('advisor: untrusted IPC sender')
    return fn(...args)
  })
}

function register(): void {
  const a = IPC.advisor
  handle(a.state, () => getState())
  handle(a.refresh, () => compute(true))
  handle(a.startFarm, (id) => startFarm(id))
  handle(a.decode, (text) => decode(text))
  handle(a.import, (code, mode) => importCode(code, mode))
  handle(a.save, (raw, id) => save(raw, id))
  handle(a.remove, (id) => remove(id))
  handle(a.share, (id) => share(id))
  handle(a.submit, (id) => submit(id))
  handle(a.setNick, (nick) => setNick(nick))
  handle(a.getDraft, () => getDraft())
  handle(a.setDraft, (draft) => setDraft(draft))
  handle(a.estimate, (lines) => estimate(lines))
  handle(a.searchItems, (query) => findItems(query))
  handle(a.takeLink, () => takeLink())
}

function setupForGame(game: GameDef): void {
  for (const u of unsubs) u()
  unsubs = []
  def = game
  data = null
  community = []
  items = null
  if (!enabled()) {
    setState(empty(false, game.id === 'poe1'))
    return
  }
  state = empty(true, true)
  // пересчитываем, только если вкладку уже открывали (иначе считать незачем): новый час фида — всегда,
  // настройки и список лиг — если сменилась лига (настройки меняются и от выбора вкладки)
  const newHour = (): void => {
    if (state.at !== null) void compute()
  }
  const leagueMaybe = (): void => {
    if (state.at === null) return
    void getEffectiveLeague()
      .then((l) => {
        if (l !== state.league) void compute()
      })
      .catch(() => undefined)
  }
  unsubs.push(getFeedStore().onUpdate(newHour))
  unsubs.push(onLeaguesChanged(leagueMaybe))
  unsubs.push(onSettingsChange(leagueMaybe))
}

export const advisorDomain: IpcDomain = { register, setupForGame }
