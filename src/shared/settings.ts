// Settings v2: дефолты, миграция v1→v2 и применение патча. Чистый модуль без
// electron — используется settingsStore (main) и тестами (vitest).
// ЗАМОРОЖЕН после S0: новые поля/дефолты добавляет только лид.

import { isGameId, isSiteHost } from './games'
import { PRICE_POPUP_POSITIONS, type PopupPoint } from './types/overlay'
import { defaultChatCommands, normalizeChatCommands } from './chatCommands'
import type {
  HotkeyAction,
  HotkeyBinding,
  HotkeyMap,
  HotkeyScope,
  Settings,
  SettingsPatch
} from './types/settings'

export const SETTINGS_VERSION = 2

/** Все действия хоткеев v2 с дефолтами. Порядок = порядок в экране настроек. */
export const HOTKEY_DEFAULTS: Readonly<Record<HotkeyAction, HotkeyBinding>> = {
  priceCheck: { accel: 'Control+D', scope: 'game' },
  overlayToggle: { accel: 'Shift+Space', scope: 'game' },
  whisperLastHit: { accel: '', scope: 'game' },
  pasteSearch1: { accel: '', scope: 'game' },
  pasteSearch2: { accel: '', scope: 'game' },
  pasteSearch3: { accel: '', scope: 'game' },
  pasteSearch4: { accel: '', scope: 'game' },
  pasteSearch5: { accel: '', scope: 'game' },
  // сделки (S8): Alt+цифра в PoE1 по умолчанию свободна; Alt+F1…F3 заняты оверлеем NVIDIA
  dealInvite: { accel: 'Alt+1', scope: 'game' },
  dealTrade: { accel: 'Alt+2', scope: 'game' },
  dealDismiss: { accel: 'Alt+3', scope: 'game' },
  toggleCompanion: { accel: 'Control+Shift+O', scope: 'always' },
  toggleLock: { accel: 'Control+Shift+L', scope: 'always' },
  toggleTradeWindow: { accel: 'Control+Shift+T', scope: 'always' },
  prevStep: { accel: 'Control+Shift+[', scope: 'always' },
  nextStep: { accel: 'Control+Shift+]', scope: 'always' }
}

export const HOTKEY_ACTIONS = Object.keys(HOTKEY_DEFAULTS) as HotkeyAction[]

export function defaultHotkeys(): HotkeyMap {
  const out = {} as HotkeyMap
  for (const a of HOTKEY_ACTIONS) out[a] = { ...HOTKEY_DEFAULTS[a] }
  return out
}

export function defaultSettings(): Settings {
  return {
    schemaVersion: SETTINGS_VERSION,
    game: 'poe1',
    siteHost: 'www.pathofexile.com',
    poe1: { league: 'auto' },
    poe2: { league: 'Standard' },
    activeProfileId: null,
    uiLang: 'ru',
    nameLang: 'en',
    opacity: 0.95,
    locked: false,
    overlayVisible: true,
    showInTaskbar: true,
    clickThroughPollMs: 33,
    logPath: null,
    tailerEnabled: false,
    autoAdvanceZone: true,
    autoCheckQuests: false,
    lastAppTab: 'priceCheck',
    hotkeys: defaultHotkeys(),
    sound: { enabled: true, volume: 0.6 },
    live: { maxSearches: 10 },
    deals: { enabled: true, stashGrid: 'auto', calibration: null },
    regex: {},
    ui: { simpleMode: true },
    overlay: { pricePosition: 'cursor', priceWindowPos: null },
    chatCommands: defaultChatCommands(),
    startup: { withWindows: false, minimized: true, firstRunDone: false },
    updates: { check: true }
  }
}

// ---------------------------------------------------------------------------
// v1 (Exile Companion) → v2
// ---------------------------------------------------------------------------

/** Форма settings.json компаса (schemaVersion 1). */
export interface SettingsV1 {
  schemaVersion?: number
  league?: string
  hotkeys?: {
    toggleVisible?: string
    toggleLock?: string
    prevStep?: string
    nextStep?: string
    priceCheck?: string
  }
  [key: string]: unknown
}

/** Старый дефолт прайс-чека компаса; переносим на новый Ctrl+D. */
const V1_PRICE_CHECK_DEFAULT = 'Alt+D'

type Obj = Record<string, unknown>

function isObj(v: unknown): v is Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** Переложить v1 в форму v2 (без валидации — её делает normalize). */
function upgradeV1(r: SettingsV1): Obj {
  const out: Obj = { ...r }
  delete out.league
  out.poe2 = { league: typeof r.league === 'string' && r.league ? r.league : 'Standard' }
  const hk = isObj(r.hotkeys) ? r.hotkeys : {}
  const map: Partial<Record<HotkeyAction, HotkeyBinding>> = {}
  const take = (action: HotkeyAction, accel: unknown): void => {
    if (typeof accel === 'string') map[action] = { accel, scope: HOTKEY_DEFAULTS[action].scope }
  }
  take('toggleCompanion', hk.toggleVisible)
  take('toggleLock', hk.toggleLock)
  take('prevStep', hk.prevStep)
  take('nextStep', hk.nextStep)
  take('priceCheck', hk.priceCheck === V1_PRICE_CHECK_DEFAULT ? 'Control+D' : hk.priceCheck)
  out.hotkeys = map
  out.schemaVersion = SETTINGS_VERSION
  return out
}

// ---------------------------------------------------------------------------
// normalize: любые входные данные → валидный Settings v2
// ---------------------------------------------------------------------------

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

/** Значение подходит, если совпадает по типу с дефолтом (null-дефолт = строка/объект/null). */
function sameKind(def: unknown, v: unknown): boolean {
  if (def === null) return v === null || typeof v === 'string' || isObj(v)
  if (typeof def === 'number') return typeof v === 'number' && Number.isFinite(v)
  return typeof v === typeof def && Array.isArray(v) === Array.isArray(def)
}

function mergeSection<T extends object>(def: T, src: unknown): T {
  const d = def as Obj
  const out: Obj = { ...d }
  if (!isObj(src)) return out as T
  for (const k of Object.keys(d)) if (k in src && sameKind(d[k], src[k])) out[k] = src[k]
  return out as T
}

/** Позиция окна цены: конечные числа в разумных пределах (DIP окна игры), округлённые; иначе null. */
function normalizePopupPoint(v: unknown): PopupPoint | null {
  if (!isObj(v)) return null
  const { x, y } = v
  const ok = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 100_000
  return ok(x) && ok(y) ? { x: Math.round(x), y: Math.round(y) } : null
}

function normalizeHotkeys(src: unknown): HotkeyMap {
  const out = defaultHotkeys()
  if (!isObj(src)) return out
  for (const a of HOTKEY_ACTIONS) {
    const v = src[a]
    if (typeof v === 'string') {
      out[a] = { accel: v, scope: HOTKEY_DEFAULTS[a].scope }
    } else if (isObj(v) && typeof v.accel === 'string') {
      const scope: HotkeyScope = v.scope === 'game' || v.scope === 'always' ? v.scope : out[a].scope
      out[a] = { accel: v.accel, scope }
    }
  }
  return out
}

const APP_TABS = ['campaign', 'priceCheck', 'live', 'regex', 'deals', 'wealth', 'flip']
const UI_LANGS = ['ru', 'en']
const STASH_GRIDS = ['auto', 'normal', 'quad']

function normalize(src: Obj): Settings {
  const def = defaultSettings()
  const s = mergeSection(def, src)

  // разделы-объекты: поле за полем
  s.poe1 = mergeSection(def.poe1, src.poe1)
  s.poe2 = mergeSection(def.poe2, src.poe2)
  s.sound = mergeSection(def.sound, src.sound)
  s.live = mergeSection(def.live, src.live)
  s.deals = mergeSection(def.deals, src.deals)
  s.regex = isObj(src.regex) ? { ...src.regex } : {}
  s.ui = mergeSection(def.ui, src.ui)
  s.overlay = mergeSection(def.overlay, src.overlay)
  // нет списка (v1, ранний v2) — пресеты; пустой список — игрок удалил всё сам
  s.chatCommands = normalizeChatCommands(src.chatCommands) ?? def.chatCommands
  s.startup = mergeSection(def.startup, src.startup)
  s.updates = mergeSection(def.updates, src.updates)
  s.hotkeys = normalizeHotkeys(src.hotkeys)

  // перечисления и диапазоны
  if (!isGameId(s.game)) s.game = def.game
  if (!isSiteHost(s.siteHost)) s.siteHost = def.siteHost
  if (!UI_LANGS.includes(s.uiLang)) s.uiLang = def.uiLang
  if (!UI_LANGS.includes(s.nameLang)) s.nameLang = def.nameLang
  if (!APP_TABS.includes(s.lastAppTab)) s.lastAppTab = def.lastAppTab
  if (!STASH_GRIDS.includes(s.deals.stashGrid)) s.deals.stashGrid = def.deals.stashGrid
  if (!PRICE_POPUP_POSITIONS.includes(s.overlay.pricePosition)) s.overlay.pricePosition = def.overlay.pricePosition
  s.overlay.priceWindowPos = normalizePopupPoint(isObj(src.overlay) ? src.overlay.priceWindowPos : null)
  if (s.activeProfileId !== null && typeof s.activeProfileId !== 'string') s.activeProfileId = null
  if (s.logPath !== null && typeof s.logPath !== 'string') s.logPath = null
  if (!s.poe1.league) s.poe1.league = def.poe1.league
  if (!s.poe2.league) s.poe2.league = def.poe2.league
  if (s.deals.calibration !== null && !isObj(s.deals.calibration)) s.deals.calibration = null
  s.opacity = clamp(s.opacity, 0.2, 1)
  s.sound.volume = clamp(s.sound.volume, 0, 1)
  s.live.maxSearches = clamp(Math.round(s.live.maxSearches), 1, 20)
  s.clickThroughPollMs = clamp(Math.round(s.clickThroughPollMs), 8, 1000)

  s.schemaVersion = SETTINGS_VERSION
  return s
}

/** Любой settings.json (v1 компаса, v2, мусор) → валидный Settings v2. */
export function migrateSettings(raw: unknown): Settings {
  if (!isObj(raw)) return defaultSettings()
  const version = typeof raw.schemaVersion === 'number' ? raw.schemaVersion : 1
  // startup.firstRunDone без значения → false: мастер первого запуска (S9) покажется один раз
  // и существующим профилям (компас, ранний POETH)
  return normalize(version < 2 ? upgradeV1(raw as SettingsV1) : raw)
}

/**
 * Применить патч: разделы-объекты сливаются на один уровень вглубь, затем всё
 * проходит через normalize (renderer не может записать мусор).
 */
export function applySettingsPatch(current: Settings, patch: SettingsPatch): Settings {
  const merged: Obj = { ...current }
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue
    const cur = merged[k]
    merged[k] = isObj(cur) && isObj(v) ? { ...cur, ...v } : v
  }
  merged.schemaVersion = SETTINGS_VERSION
  return normalize(merged)
}
