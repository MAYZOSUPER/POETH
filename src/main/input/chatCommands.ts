import type { GameDef } from '@shared/games'
import type { ChatCommand, OverlayNotice } from '@shared/types'
import { IPC } from '@shared/ipc'
import { ChatLogContext, chatHotkeyId, chatPlaceholders, resolveChatText } from '@shared/chatCommands'
import { clearHotkeyActions, onHotkeyAction, setExtraHotkeys } from '../hotkeys'
import { getSettings, onSettingsChange } from '../services/settingsStore'
import { readLogTail, subscribeGameLog } from '../services/gameLog'
import { sendToOverlay } from '../windows/gameOverlay'
import { typeInChat } from './gameInput'

// Команды чата по хоткеям (Settings.chatCommands; как в APT: F5 → /hideout).
// Правило GGG: нажатие = ровно одна команда через typeInChat — без цепочек, таймеров и
// повторов. Хоткеи — область 'game' (только пока игра в фокусе), регистрируются динамически
// (`chat:<id>`) по тем же правилам, что и остальные (запрещённые сочетания, повторы).
// Подстановки @last / <char> берутся из Client.txt (services/gameLog.ts); неизвестна — команду
// не отправляем, а показываем тост поверх игры.

const context = new ChatLogContext()
let activeDef: GameDef | null = null
let logOff: (() => void) | null = null
let logGame: string | null = null

function notify(key: string): void {
  const notice: OverlayNotice = { key, kind: 'warn' }
  sendToOverlay(IPC.events.overlayNotice, notice)
}

function runCommand(cmd: ChatCommand): void {
  const r = resolveChatText(cmd.text, context)
  if (!r.ok) {
    notify(r.missing === 'last' ? 'overlay.chat.noLast' : 'overlay.chat.noChar')
    return
  }
  const res = typeInChat(r.text, { send: cmd.send })
  if (res === 'no-input') notify('overlay.chat.noInput')
  // 'busy' — прошлое действие ещё не вернуло буфер: молча (одно действие на нажатие)
}

function stopLog(): void {
  logOff?.()
  logOff = null
  logGame = null
  context.reset()
}

async function trackLog(def: GameDef): Promise<void> {
  if (logOff && logGame === def.id) return
  stopLog()
  logGame = def.id
  const sub = await subscribeGameLog(def, (lines) => context.feed(lines))
  if (logGame !== def.id) {
    sub.off() // успели отменить, пока искали лог
    return
  }
  logOff = sub.off
  // хвост файла: whisper, пришедший до запуска POETH, тоже считается «последним»
  if (sub.logPath) {
    try {
      context.feed(await readLogTail(sub.logPath))
    } catch (e) {
      console.warn('[chat] cannot read Client.txt tail:', e)
    }
  }
}

/** Только PoE1: пресеты — команды PoE1 (/menagerie, /delve…). */
function applyCommands(list: readonly ChatCommand[], def: GameDef): void {
  clearHotkeyActions('chat:')
  const active = def.id === 'poe1' ? list.filter((c) => c.enabled && c.hotkey && c.text) : []
  for (const c of active) onHotkeyAction(chatHotkeyId(c.id), () => runCommand(c))
  setExtraHotkeys(active.map((c) => ({ action: chatHotkeyId(c.id), accel: c.hotkey, scope: 'game' })))
  // лог нужен, только если команда с хоткеем использует подстановки
  const needLog = active.some((c) => {
    const p = chatPlaceholders(c.text)
    return p.last || p.char
  })
  if (needLog) void trackLog(def)
  else stopLog()
}

/** Из overlayDomain.setupForGame: до registerHotkeys() в setupGame. */
export async function setupChatCommands(def: GameDef): Promise<void> {
  activeDef = def
  applyCommands((await getSettings()).chatCommands, def)
}

// список поменяли в настройках — перерегистрировать хоткеи команд
onSettingsChange((next, patch) => {
  if ('chatCommands' in patch && activeDef) applyCommands(next.chatCommands, activeDef)
})
