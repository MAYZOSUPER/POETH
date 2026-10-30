// Settings v2 — настройки приложения (%APPDATA%/POETH/settings.json).
// ЗАМОРОЖЕН после S0: новые поля добавляет только лид (вместе с дефолтами и
// миграцией в src/shared/settings.ts). Разделы доменов (live/deals/regex)
// описаны в их собственных файлах типов и могут уточняться владельцем этапа.

import type { GameId, SiteHost } from '../games'
import type { LiveSettings } from './live'
import type { DealsSettings } from './deals'
import type { RegexSettings } from './regex'
import type { ChatCommand, OverlaySettings } from './overlay'
import type { StartupSettings, UpdatesSettings } from './updates'
import type { PriceCheckSettings } from './trade'

export type UiLang = 'ru' | 'en'

/** Язык клиента игры (S26): на нём названия предметов, валют и баз (не путать с языком интерфейса). */
export type GameLang = 'ru' | 'en'

/** Откуда узнали язык клиента: текст предмета по Ctrl+D или строки Client.txt (шёпот, вход в зону…). */
export type GameLangSource = 'item' | 'log'

export interface GameLangDetected {
  lang: GameLang
  by: GameLangSource
  /** когда узнали, мс */
  at: number
}

export interface GameLangSettings {
  /** 'auto' — по игре (src/shared/gameLang.ts), пока не узнали — как язык интерфейса */
  choice: 'auto' | GameLang
  /** что узнали по игре; хранится и при ручном выборе — для подсказки «похоже, игра на другом языке» */
  detected: GameLangDetected | null
}

/** top-level tab of the companion window */
export type AppTab = 'campaign' | 'priceCheck' | 'live' | 'regex' | 'deals' | 'wealth' | 'flip' | 'advisor' | 'build'

/**
 * Область хоткея: 'game' — работает только пока окно игры в фокусе (гейтинг — S1),
 * 'always' — глобально.
 */
export type HotkeyScope = 'game' | 'always'

export interface HotkeyBinding {
  /** Electron accelerator ('Control+D'); '' = не назначен */
  accel: string
  scope: HotkeyScope
}

export type HotkeyAction =
  // game scope
  | 'priceCheck'
  | 'overlayToggle'
  | 'whisperLastHit'
  | 'pasteSearch1'
  | 'pasteSearch2'
  | 'pasteSearch3'
  | 'pasteSearch4'
  | 'pasteSearch5'
  // менеджер сделок (S8): верхняя карточка — одно действие на нажатие
  | 'dealInvite'
  | 'dealTrade'
  | 'dealDismiss'
  // прокачка PoE1 (S14): показать / свернуть гид поверх игры
  | 'levelingToggle'
  // «Обмен» (S28): считать стакан «Курс / Кол-во» с экрана, пока игрок держит Alt над «Рыночным курсом»
  | 'bookRead'
  // «Билд» (S38): дерево этапа поверх игрового дерева пассивок — показать / спрятать
  | 'buildTree'
  // always
  | 'toggleCompanion'
  | 'toggleLock'
  | 'toggleTradeWindow'
  // вкладки сайтов трейд-окна (S43): показать окно на последней вкладке сайта / спрятать
  | 'toggleSites'
  | 'prevStep'
  | 'nextStep'

export type HotkeyMap = Record<HotkeyAction, HotkeyBinding>

/** 'auto' = автоматически брать актуальную лигу (S3), иначе id лиги. */
export type LeagueChoice = 'auto' | (string & {})

export interface SoundSettings {
  enabled: boolean
  /** 0..1 */
  volume: number
}

export interface UiSettings {
  /** простой режим для новичков (по умолчанию) */
  simpleMode: boolean
}

export interface Settings {
  schemaVersion: number
  // ---- игра / сайт ----
  /** выбранная игра; смена = перезапуск приложения */
  game: GameId
  /** хост сайта/API трейда (cookies сессии привязаны к хосту) */
  siteHost: SiteHost
  poe1: { league: LeagueChoice }
  /** PoE2 trade league for price-check, e.g. "Standard" (v1: `league`) */
  poe2: { league: string }
  // ---- общее (из компаса) ----
  activeProfileId: string | null
  /** interface language */
  uiLang: UiLang
  /** language for game zone/boss names (independent of uiLang) */
  nameLang: UiLang
  /** язык клиента игры PoE1 (S26): названия предметов и валют, строки regex */
  gameLang: GameLangSettings
  /** 0.2 .. 1.0 */
  opacity: number
  /** force full click-through (companion never steals clicks) */
  locked: boolean
  overlayVisible: boolean
  /** show the companion window on the Windows taskbar */
  showInTaskbar: boolean
  /** cursor poll interval for selective click-through, ms */
  clickThroughPollMs: number
  /** path to Client.txt; null = not configured */
  logPath: string | null
  /** enable the advisory log tailer */
  tailerEnabled: boolean
  autoAdvanceZone: boolean
  /** default OFF — quest completion can never be reliably auto-detected */
  autoCheckQuests: boolean
  /** last opened top-level tab */
  lastAppTab: AppTab
  hotkeys: HotkeyMap
  // ---- новое в v2 ----
  sound: SoundSettings
  live: LiveSettings
  deals: DealsSettings
  regex: RegexSettings
  ui: UiSettings
  /** игровой оверлей (S1): где открывать окно цены по Ctrl+D */
  overlay: OverlaySettings
  /** окно цены (S4): «Написать» у лота — вставить whisper или сразу отправить */
  priceCheck: PriceCheckSettings
  /** команды чата по хоткеям (F5 → /hideout и др.), см. src/shared/chatCommands.ts */
  chatCommands: ChatCommand[]
  /** запуск: вместе с Windows, свёрнутым; firstRunDone — мастер первого запуска пройден (S10a, S9) */
  startup: StartupSettings
  /** проверка обновлений приложения и данных (S10a) */
  updates: UpdatesSettings
}

/**
 * Патч настроек: разделы-объекты сливаются на один уровень вглубь
 * (`{ poe2: { league } }` не затирает остальные поля poe2).
 */
export type SettingsPatch = {
  [K in keyof Settings]?: Settings[K] extends object ? Partial<Settings[K]> : Settings[K]
}
