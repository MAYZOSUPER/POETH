import path from 'path'
import { fileURLToPath } from 'url'
import { IPC } from '@shared/ipc'

// Чистые правила безопасности окон приложения (S29; без electron — tests/security/**).
//  - Чья страница: только наши три страницы renderer (index — компаньон и служебные окна ?view=…,
//    overlay — игровой оверлей, trade-sidebar — сайдбар трейд-окна) из собранной папки renderer или
//    с dev-сервера electron-vite. Сайт GGG (siteView, окно входа) и любые другие адреса — не наши.
//  - Какие каналы IPC может звать страница: всё приложение — только наши страницы; ввод в игру —
//    компаньон и оверлей (сайдбару он не нужен); секреты (вставить POESESSID) — только компаньон;
//    шапка и рельс трейд-окна (свернуть, развернуть, рельс) — только его сайдбар (S58).
//  - Куда можно уйти нашей странице и какие разрешения ей дать.

export type AppPage = 'index' | 'overlay' | 'trade-sidebar'

const PAGES: readonly AppPage[] = ['index', 'overlay', 'trade-sidebar']

export interface AppOrigin {
  /** папка собранных страниц (out/renderer); file:// вне её — не наша страница */
  rendererDir: string
  /** dev-сервер electron-vite; в упакованной сборке не задаётся никогда */
  devServerUrl?: string
}

function parse(url: unknown): URL | null {
  if (typeof url !== 'string' || !url) return null
  try {
    return new URL(url)
  } catch {
    return null
  }
}

function insideDir(file: string, dir: string): boolean {
  const rel = path.relative(path.resolve(dir), path.resolve(file))
  return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel)
}

/** Адрес — наше приложение: file:// из папки renderer или origin dev-сервера. */
export function isAppUrl(url: unknown, o: AppOrigin): boolean {
  const u = parse(url)
  if (!u) return false
  if (u.protocol === 'file:') {
    try {
      return insideDir(fileURLToPath(u), o.rendererDir)
    } catch {
      return false
    }
  }
  const dev = parse(o.devServerUrl)
  return !!dev && (u.protocol === 'http:' || u.protocol === 'https:') && u.origin === dev.origin
}

/** Какая наша страница открыта по этому адресу; null — не наша. */
export function appPageOf(url: unknown, o: AppOrigin): AppPage | null {
  if (!isAppUrl(url, o)) return null
  const name = /\/([\w-]+)\.html$/.exec((parse(url) as URL).pathname)?.[1]
  return PAGES.find((p) => p === name) ?? null
}

/** Ввод в игру (чат, поиск в тайнике, команды карточек сделок и live). */
export const GAME_INPUT_CHANNELS: ReadonlySet<string> = new Set([
  IPC.overlay.typeInChat,
  IPC.overlay.stashSearch,
  IPC.deals.action,
  IPC.live.whisper
])

/** Секреты аккаунта: вставка POESESSID в partition (S47: своего ключа у PoE2 больше нет — вход общий). */
export const SECRET_CHANNELS: ReadonlySet<string> = new Set([IPC.auth.pasteSession])

/** Каналы, нужные только игровому оверлею: наложение дерева билда (S38), «Против надетого» окна цены (S41). */
export const OVERLAY_CHANNELS: ReadonlySet<string> = new Set([...Object.values(IPC.buildTree), ...Object.values(IPC.equip)])

/**
 * Только компаньон: вставка кода PoB и загрузка билда по ссылке (недоверенный ввод, сеть по действию игрока; S39);
 * «Играть по этому гайду» и ссылки автора стартера — сеть по кнопке и системный браузер (S59);
 * фильтр лута — сеть GitHub и запись в папку игры по кнопке (S53).
 */
export const COMPANION_CHANNELS: ReadonlySet<string> = new Set([
  IPC.build.importPob,
  IPC.build.reload,
  IPC.build.playStarter,
  IPC.build.openStarterLink,
  ...Object.values(IPC.lootFilter)
])

/**
 * Управление трейд-окном из его шапки и рельса (S58): свернуть, развернуть, рельс и его шторка — только сайдбар
 * трейд-окна. Обработчик (main/ipc/fav.ts) вдобавок проверяет, что звал главный кадр сайдбара именно этого окна
 * (isMainFrameOf). Сайт GGG и вкладки сайтов (без preload, чужой адрес) сюда не достают вовсе.
 */
export const TRADE_WINDOW_CHANNELS: ReadonlySet<string> = new Set([
  IPC.tradeWindow.minimize,
  IPC.tradeWindow.toggleMaximize,
  IPC.tradeWindow.setRail,
  IPC.tradeWindow.railDrawer
])

/** Может ли страница звать этот канал IPC. */
export function ipcAllowed(page: AppPage | null, channel: string): boolean {
  if (!page) return false
  if (TRADE_WINDOW_CHANNELS.has(channel)) return page === 'trade-sidebar'
  if (OVERLAY_CHANNELS.has(channel)) return page === 'overlay'
  if (GAME_INPUT_CHANNELS.has(channel)) return page === 'index' || page === 'overlay'
  if (SECRET_CHANNELS.has(channel) || COMPANION_CHANNELS.has(channel)) return page === 'index'
  return true
}

/** Кадр, приславший IPC (WebFrameMain): процесс и номер кадра в нём. */
export interface IpcFrameRef {
  processId: number
  routingId: number
}

/**
 * Звал главный кадр именно этих webContents (S58): отправитель — те же webContents, кадр — их главный, а не iframe
 * и не уже ушедший (senderFrame null). owner null — окна нет, звать некому.
 */
export function isMainFrameOf(
  sender: unknown,
  frame: IpcFrameRef | null | undefined,
  owner: { readonly mainFrame: IpcFrameRef } | null | undefined
): boolean {
  if (!owner || sender !== owner || !frame) return false
  return frame.processId === owner.mainFrame.processId && frame.routingId === owner.mainFrame.routingId
}

/**
 * Переход нашей страницы по её же действию (ссылка, location, форма): только на наши страницы.
 * Загрузки из main (loadFile/loadURL) и перезагрузка сюда не попадают. devtools: — консоль разработчика.
 */
export function appNavigationAllowed(url: unknown, o: AppOrigin): boolean {
  const u = parse(url)
  if (u?.protocol === 'devtools:') return true
  return appPageOf(url, o) !== null
}

/**
 * Разрешения Chromium для наших страниц: только запись в буфер обмена (кнопки «Скопировать») и чтение
 * по кнопке «Вставить». Камера, микрофон, геолокация, уведомления страниц, HID/USB, внешние протоколы — нет.
 */
export const APP_PERMISSIONS: ReadonlySet<string> = new Set(['clipboard-sanitized-write', 'clipboard-read'])

export function appPermissionAllowed(permission: string, requestingUrl: unknown, o: AppOrigin): boolean {
  return APP_PERMISSIONS.has(permission) && isAppUrl(requestingUrl, o)
}
