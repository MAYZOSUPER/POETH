import { BrowserWindow, dialog, screen } from 'electron'
import path from 'path'
import type { GameDef } from '@shared/games'
import type { InteractiveRect, OverlayPoint, OverlayStatus } from '@shared/types'
import { IPC } from '@shared/ipc'
import { keyPressToAccelerator, sameAccelerator } from '@shared/accelerators'
import { loadRendererPage } from './rendererPage'
import { getGameFocus, isOverlayActive, onGameFocusChange, setGameFocus } from '../focus/gameFocus'
import { getSettings } from '../services/settingsStore'
import { isDevServer } from '../gameContext'
import { windowIcon } from '../appIcon'
import { devEnv } from '../devEnv'

// Игровой оверлей (S1): прозрачное окно поверх клиентской области игры.
// electron-overlay-window (OverlayController) следит за окном с заголовком
// GameDef.windowTitle: двигает/масштабирует оверлей вместе с игрой, прячет его, когда
// игра теряет фокус, и сообщает focus/blur — по ним гейтятся хоткеи (hotkeys.ts).
// По умолчанию оверлей пропускает мышь; Shift+Space/клик активируют его,
// Esc / Shift+Space / клик по пустому фону возвращают фокус игре (focusTarget).
// Логика активации — как OverlayWindow/GameWindow в Awakened PoE Trade (MIT).
//
// Библиотека цепляется к окну ОДИН раз за процесс — смена игры = перезапуск
// (в dev мягкий перезапуск оставляет прежний заголовок, см. initGameOverlay).
// Если нативный модуль не загрузился — запасной режим: окно поверх основного
// экрана без привязки к игре, фокус не отслеживается (хоткеи работают как до S1).

type OverlayLib = typeof import('electron-overlay-window')
type AttachEvent = import('electron-overlay-window').AttachEvent
type MoveresizeEvent = import('electron-overlay-window').MoveresizeEvent
type FullscreenEvent = import('electron-overlay-window').FullscreenEvent

let win: BrowserWindow | null = null
let lib: OverlayLib | null = null
let toggleAccel = 'Shift+Space'
let priceCheckAccel = 'Control+D'
let adminWarned = false
let statusTimer: NodeJS.Timeout | null = null

let status: OverlayStatus = {
  windowTitle: '',
  tracking: false,
  attached: false,
  hasAccess: null,
  fullscreen: null,
  bounds: null
}

/** Окно для запасного режима (те же флаги, что OVERLAY_WINDOW_OPTS на Windows). */
const FALLBACK_WINDOW_OPTS: Electron.BrowserWindowConstructorOptions = {
  fullscreenable: true,
  skipTaskbar: true,
  frame: false,
  show: false,
  transparent: true,
  resizable: true,
  hasShadow: false
}

function loadOverlayLib(): OverlayLib | null {
  if (process.env.POETH_OVERLAY_NO_ATTACH === '1') {
    console.warn('[overlay] POETH_OVERLAY_NO_ATTACH=1 — fallback mode without attach')
    return null
  }
  try {
    // require, а не import: если .node не загрузится (упаковка, антивирус),
    // приложение должно запуститься в запасном режиме, а не упасть при старте.
    return require('electron-overlay-window') as OverlayLib
  } catch (e) {
    console.error('[overlay] electron-overlay-window failed to load — fallback mode:', e)
    return null
  }
}

export function getOverlayWindow(): BrowserWindow | null {
  return win && !win.isDestroyed() ? win : null
}

/** Отправить событие в renderer оверлея (no-op, если окна нет). */
export function sendToOverlay(channel: string, payload?: unknown): void {
  const w = getOverlayWindow()
  if (w && !w.webContents.isDestroyed()) w.webContents.send(channel, payload)
}

export function getOverlayStatus(): OverlayStatus {
  return { ...status, bounds: status.bounds ? { ...status.bounds } : null }
}

/** Акселератор overlayToggle — его же ловим в самом оверлее (when active), как APT. */
export function setOverlayToggleAccel(accel: string): void {
  toggleAccel = accel
}

/** Акселератор priceCheck: в активном оверлее повторный Ctrl+D закрывает окно цены. */
export function setOverlayPriceCheckAccel(accel: string): void {
  priceCheckAccel = accel
}

/** Курсор (экран, DIP) → координаты окна оверлея (CSS px). */
export function toOverlayPoint(screenPoint: OverlayPoint): OverlayPoint {
  const w = getOverlayWindow()
  if (!w) return { ...screenPoint }
  const b = w.getContentBounds()
  return { x: screenPoint.x - b.x, y: screenPoint.y - b.y }
}

export function getCursorInOverlay(): OverlayPoint {
  return toOverlayPoint(screen.getCursorScreenPoint())
}

/** Монитор под точкой экрана (DIP) — в координатах окна оверлея (для позиции виджетов). */
export function displayAreaInOverlay(screenPoint: OverlayPoint): InteractiveRect | null {
  const w = getOverlayWindow()
  if (!w) return null
  const b = w.getContentBounds()
  const d = screen.getDisplayNearestPoint({ x: Math.round(screenPoint.x), y: Math.round(screenPoint.y) }).bounds
  return { x: d.x - b.x, y: d.y - b.y, width: d.width, height: d.height }
}

function pushStatus(): void {
  if (statusTimer) {
    clearTimeout(statusTimer)
    statusTimer = null
  }
  sendToOverlay(IPC.events.overlayStatus, getOverlayStatus())
}

/** moveresize приходит до 30 раз/с — renderer достаточно знать итог. */
function pushStatusSoon(): void {
  if (statusTimer) return
  statusTimer = setTimeout(pushStatus, 250)
}

// ---------------------------------------------------------------------------
// Активация / возврат фокуса игре
// ---------------------------------------------------------------------------

/** Активировать оверлей: мышь и клавиатура уходят в оверлей (Shift+Space). */
export function activateOverlay(viaHotkey = false): void {
  const w = getOverlayWindow()
  if (!w || isOverlayActive()) return
  if (lib) {
    // без игры оверлей скрыт — активировать нечего
    if (!status.attached) return
    setGameFocus({ overlay: true, game: false, usingHotkey: viaHotkey })
    lib.OverlayController.activateOverlay()
  } else {
    setGameFocus({ overlay: true, usingHotkey: viaHotkey })
    w.setIgnoreMouseEvents(false)
    w.focus()
  }
}

/** Вернуть фокус игре (Esc, Shift+Space, клик по фону или по пассивному виджету). */
export function focusGame(viaHotkey = false): void {
  const w = getOverlayWindow()
  if (!w) return
  const active = isOverlayActive()
  if (!active && !w.isFocused()) return
  if (lib) {
    setGameFocus({ overlay: false, usingHotkey: viaHotkey })
    lib.OverlayController.focusTarget()
    // как APT (assertGameActive): игра активна сразу, не дожидаясь события focus
    if (status.attached) setGameFocus({ game: true })
  } else {
    setGameFocus({ overlay: false, usingHotkey: viaHotkey })
    w.setIgnoreMouseEvents(true)
    w.blur()
  }
}

export function toggleOverlay(viaHotkey = false): void {
  if (isOverlayActive()) focusGame(viaHotkey)
  else activateOverlay(viaHotkey)
}

/**
 * Перед вводом в игру (чат, поиск в стэше): убедиться, что фокус у игры.
 * false — игра не найдена или нет нативного модуля оверлея — вводить нельзя, иначе клавиши уйдут в чужое окно.
 */
export function ensureGameForeground(): boolean {
  // запасной режим (модуль оверлея не загрузился): какое окно в фокусе — не знаем, значит не вводим (S29)
  if (!lib) return false
  if (!status.attached) return false
  const f = getGameFocus()
  if (f.game && !f.overlay) return true
  setGameFocus({ overlay: false })
  lib.OverlayController.focusTarget()
  setGameFocus({ game: true })
  return true
}

// ---------------------------------------------------------------------------
// Клавиши внутри активного оверлея (глобальные хоткеи игры в это время сняты)
// ---------------------------------------------------------------------------

function handleOverlayKeys(event: Electron.Event, input: Electron.Input): void {
  if (input.type !== 'keyDown') return
  const accel = keyPressToAccelerator({
    code: input.code,
    key: input.key,
    control: input.control,
    alt: input.alt,
    shift: input.shift,
    meta: input.meta
  })
  if (!accel) return
  if (accel === 'Escape' || accel === 'Control+W' || (priceCheckAccel && sameAccelerator(accel, priceCheckAccel))) {
    event.preventDefault()
    // макет: Esc (и повторный Ctrl+D, пока оверлей активен) закрывает окно цены и возвращает фокус игре
    sendToOverlay(IPC.events.overlayDismiss)
    process.nextTick(() => focusGame())
  } else if (toggleAccel && sameAccelerator(accel, toggleAccel)) {
    event.preventDefault()
    process.nextTick(() => focusGame(true))
  } else if (accel === 'F12' && isDevServer()) {
    event.preventDefault()
    win?.webContents.toggleDevTools()
  }
}

// ---------------------------------------------------------------------------
// «Игра запущена от администратора»
// ---------------------------------------------------------------------------

const ADMIN_TEXT = {
  ru: {
    title: 'POETH — нет доступа к игре',
    message: 'Path of Exile запущена от имени администратора, а POETH — нет.',
    detail:
      'Windows не даёт обычной программе управлять окном администратора, поэтому Ctrl+D ' +
      '(прайс-чек) и другие действия в игре работать не будут.\n\n' +
      'Закройте POETH и запустите его тоже от имени администратора (правый клик по ярлыку → ' +
      '«Запуск от имени администратора»). Или запускайте игру без прав администратора.',
    ok: 'Понятно'
  },
  en: {
    title: 'POETH — no access to the game',
    message: 'Path of Exile is running as administrator, but POETH is not.',
    detail:
      'Windows does not let a regular program control an administrator window, so Ctrl+D ' +
      '(price check) and other in-game actions will not work.\n\n' +
      'Close POETH and run it as administrator too (right-click the shortcut → ' +
      '"Run as administrator"). Or start the game without administrator rights.',
    ok: 'OK'
  }
}

async function warnNoAccess(): Promise<void> {
  if (adminWarned) return
  adminWarned = true
  console.error('[overlay] the game is running as administrator — no input access')
  const lang = (await getSettings()).uiLang === 'en' ? 'en' : 'ru'
  const t = ADMIN_TEXT[lang]
  await dialog.showMessageBox({
    type: 'warning',
    title: t.title,
    message: t.message,
    detail: t.detail,
    buttons: [t.ok],
    noLink: true
  })
}

// ---------------------------------------------------------------------------
// Создание окна и attach
// ---------------------------------------------------------------------------

function boundsOf(e: { x: number; y: number; width: number; height: number }): OverlayStatus['bounds'] {
  return { x: e.x, y: e.y, width: e.width, height: e.height }
}

function attachToGame(w: BrowserWindow, l: OverlayLib, title: string): void {
  const C = l.OverlayController
  // Обработчики библиотеки (показать/спрятать окно, границы) подписаны раньше наших.
  C.events.on('attach', (e: AttachEvent) => {
    status = {
      ...status,
      attached: true,
      hasAccess: e.hasAccess ?? null,
      fullscreen: e.isFullscreen ?? null,
      bounds: boundsOf(e)
    }
    console.log(`[overlay] attached to "${title}" ${e.width}x${e.height} hasAccess=${e.hasAccess}`)
    pushStatus()
    if (e.hasAccess === false) void warnNoAccess()
  })
  C.events.on('detach', () => {
    status = { ...status, attached: false, bounds: null, fullscreen: null }
    console.log('[overlay] game window closed (detach)')
    setGameFocus({ game: false, overlay: false })
    pushStatus()
  })
  C.events.on('focus', () => setGameFocus({ game: true }))
  C.events.on('blur', () => setGameFocus({ game: false }))
  C.events.on('fullscreen', (e: FullscreenEvent) => {
    status = { ...status, fullscreen: e.isFullscreen }
    pushStatus()
  })
  C.events.on('moveresize', (e: MoveresizeEvent) => {
    status = { ...status, bounds: boundsOf(e) }
    pushStatusSoon()
  })
  C.attachByTitle(w, title)
}

/** Запасной режим: окно на весь основной экран, мышь — насквозь. */
function showFallback(w: BrowserWindow): void {
  const area = screen.getPrimaryDisplay().workArea
  w.setBounds(area)
  w.setIgnoreMouseEvents(true)
  w.setAlwaysOnTop(true, 'screen-saver')
  w.showInactive()
}

/**
 * Создать окно оверлея и прицепить его к окну игры (один раз за процесс).
 * Вызывается из overlayDomain.setupForGame (реестр доменов → setupGame() в bootstrap).
 * Повторный вызов (мягкий перезапуск в dev) возвращает то же окно.
 */
export function initGameOverlay(def: GameDef): BrowserWindow {
  const existing = getOverlayWindow()
  if (existing) {
    if (status.windowTitle !== def.windowTitle) {
      console.warn(
        `[overlay] attach stays on "${status.windowTitle}" — restart the app (npm run dev) ` +
          `to follow "${def.windowTitle}"`
      )
    }
    return existing
  }

  lib = loadOverlayLib()
  status = { ...status, windowTitle: def.windowTitle, tracking: !!lib }
  setGameFocus({ tracking: !!lib })

  win = new BrowserWindow({
    ...(lib?.OVERLAY_WINDOW_OPTS ?? FALLBACK_WINDOW_OPTS),
    title: 'POETH overlay',
    icon: windowIcon(),
    width: 800,
    height: 600,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // таймеры/анимации оверлея не должны засыпать, пока окно «невидимо» для Chromium
      backgroundThrottling: false,
      spellcheck: false
    }
  })
  const w = win
  w.setMenu(null)
  w.webContents.on('before-input-event', handleOverlayKeys)
  w.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  w.webContents.on('will-navigate', (e) => e.preventDefault())
  // оверлей сам потерял фокус (Alt+Tab, клик в другое окно) — он больше не активен
  w.on('blur', () => {
    if (isOverlayActive()) setGameFocus({ overlay: false })
  })
  w.on('closed', () => {
    win = null
  })

  // renderer узнаёт о смене фокуса событием (подсказка «Esc — вернуться в игру» и т.п.)
  onGameFocusChange((focus) => sendToOverlay(IPC.events.overlayFocus, focus))

  loadRendererPage(w, 'overlay')
  if (devEnv('POETH_OVERLAY_DEVTOOLS') === '1') w.webContents.openDevTools({ mode: 'detach', activate: false })

  if (lib) attachToGame(w, lib, def.windowTitle)
  else showFallback(w)
  return w
}
