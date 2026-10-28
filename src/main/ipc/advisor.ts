import { app, ipcMain, webContents, type IpcMainInvokeEvent } from 'electron'
import { promises as fs } from 'fs'
import path from 'path'
import { IPC } from '@shared/ipc'
import type { GameDef } from '@shared/games'
import type { AdvisorData, AdvisorFarmResult, AdvisorState } from '@shared/types/advisor'
import { ADVISOR_DATA_FILE, parseAdvisorData } from '@shared/advisor/data'
import { estimateStrategy } from '@shared/advisor/estimate'
import { advisorDevFlag, advisorOn } from '@shared/advisor/flag'
import { buildPriceIndex, type PriceIndex } from '@shared/wealth/prices'
import { isTrustedAppUrl } from '../net/guards'
import { getEffectiveLeague, netLog, onLeaguesChanged } from '../net'
import { onSettingsChange } from '../services/settingsStore'
import { resourcesDir } from '../services/questDataset'
import { getFarmService } from '../services/farmSession'
import { getFeedStore } from '../games/poe1/exchange/feedService'
import { getPriceIndex } from './wealth'
import type { IpcDomain } from './types'

// Домен «Советник: что фармить» (main, S16). Стратегии — данные (advisor/strategies.json: сначала
// обновлённые в userData/data, затем встроенные), цены — индекс учёта богатства (фид обмена GGG +
// poe.watch, свой источник не заводим). Пересчёт — при открытии вкладки, новом часе фида и смене лиги.
// В релизе v0.1.0 выключен (features.advisor = false), в разработке — POETH_ADVISOR=1.
// Только подсказки: действий в игре нет, сессию фарма игрок начинает кнопкой.

/** Расчёт старше — пересчитать при следующем запросе состояния. */
const STALE_MS = 15 * 60_000

function devServerUrl(): string | undefined {
  return process.env.ELECTRON_RENDERER_URL
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
let computing: Promise<AdvisorState> | null = null
let unsubs: Array<() => void> = []

const empty = (enabled: boolean, supported: boolean): AdvisorState => ({
  enabled,
  supported,
  league: null,
  loading: false,
  data: null,
  views: [],
  invalid: 0,
  prices: null,
  problem: null,
  at: null
})

let state: AdvisorState = empty(false, false)

function enabled(): boolean {
  return !!def && advisorOn(def, advisorDevFlag(process.env))
}

/** Стратегии: обновлённые данные главнее встроенных; битый или новый формат — следующий кандидат. */
async function loadData(game: GameDef): Promise<void> {
  data = null
  invalid = 0
  for (const base of [path.join(app.getPath('userData'), 'data'), path.join(resourcesDir(), 'data')]) {
    let raw: unknown
    try {
      raw = JSON.parse(await fs.readFile(path.join(base, game.dataDir, ADVISOR_DATA_FILE), 'utf8'))
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

function setState(next: AdvisorState): AdvisorState {
  state = next
  broadcast(IPC.events.advisorState, state)
  return state
}

async function computeNow(game: GameDef, reload: boolean): Promise<AdvisorState> {
  setState({ ...state, enabled: true, supported: true, loading: true })
  if (reload || !data) await loadData(game)
  const league = await getEffectiveLeague().catch(() => null)
  let index: PriceIndex = buildPriceIndex([])
  let prices: AdvisorState['prices'] = null
  let problem: AdvisorState['problem'] = data ? null : 'data'
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
    views: d ? d.strategies.map((strategy) => ({ strategy, estimate: estimateStrategy(strategy, index) })) : [],
    invalid,
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

async function startFarm(id: unknown): Promise<AdvisorFarmResult> {
  if (!enabled() || typeof id !== 'string' || !data?.strategies.some((s) => s.id === id)) return 'unknown'
  const farm = getFarmService()
  await farm.load()
  if (farm.state(0).session) {
    await farm.setStrategy(id)
    return 'tagged'
  }
  await farm.start(id)
  return 'started'
}

function handle(channel: string, fn: (...args: unknown[]) => unknown): void {
  ipcMain.handle(channel, (e: IpcMainInvokeEvent, ...args: unknown[]) => {
    if (!isTrustedAppUrl(e.senderFrame?.url, devServerUrl())) throw new Error('advisor: untrusted IPC sender')
    return fn(...args)
  })
}

function register(): void {
  handle(IPC.advisor.state, () => getState())
  handle(IPC.advisor.refresh, () => compute(true))
  handle(IPC.advisor.startFarm, (id) => startFarm(id))
}

function setupForGame(game: GameDef): void {
  for (const u of unsubs) u()
  unsubs = []
  def = game
  data = null
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
