import { ipcMain, webContents, type IpcMainInvokeEvent } from 'electron'
import { IPC } from '@shared/ipc'
import type { GameDef } from '@shared/games'
import { isTrustedAppUrl } from '../net/guards'
import { onHotkeyAction } from '../hotkeys'
import { LiveManager } from '../games/poe1/liveSearch'
import { registerFavLiveAdapter } from './fav'
import type { IpcDomain } from './types'
import { devEnv } from '../devEnv'
import { isAppPageUrl } from '../security'

// Домен «live search» (main, S6): менеджер live-поисков PoE1, хоткей whisperLastHit.
// Звать каналы могут только наши страницы (file:// или dev-сервер); события уходят в
// компаньон и оверлей, но не в окна сайта GGG.

function devServerUrl(): string | undefined {
  return devEnv('ELECTRON_RENDERER_URL')
}

function broadcast(channel: string, payload: unknown): void {
  for (const wc of webContents.getAllWebContents()) {
    if (wc.isDestroyed() || !isAppPageUrl(wc.getURL())) continue
    wc.send(channel, payload)
  }
}

const manager = new LiveManager({
  state: (s) => broadcast(IPC.events.liveState, s),
  hit: (e) => broadcast(IPC.events.liveHit, e)
})

/**
 * Адаптер live для избранного трейд-окна — по контракту FavLiveAdapter S5 (src/main/ipc/fav.ts).
 * Регистрируется в setupForGame: только PoE1, в PoE2 молния в избранном неактивна.
 */
export function getFavLiveAdapter(): {
  setLive: LiveManager['setFavoriteLive']
  setNotify(favId: string, notify: boolean): void
  snapshot: LiveManager['favoriteSnapshot']
  onChange: LiveManager['onChange']
} {
  return {
    setLive: (target, enabled) => manager.setFavoriteLive(target, enabled),
    setNotify: (favId, notify) => manager.setFavoriteNotify(favId, notify),
    snapshot: () => manager.favoriteSnapshot(),
    onChange: (cb) => manager.onChange(cb)
  }
}

function handle(channel: string, fn: (...args: unknown[]) => unknown): void {
  ipcMain.handle(channel, (e: IpcMainInvokeEvent, ...args: unknown[]) => {
    if (!isTrustedAppUrl(e.senderFrame?.url, devServerUrl())) throw new Error('live: untrusted IPC sender')
    return fn(...args)
  })
}

function register(): void {
  handle(IPC.live.state, () => manager.snapshot())
  handle(IPC.live.add, (input, title) => manager.add(input, title))
  handle(IPC.live.remove, (id) => manager.remove(id))
  handle(IPC.live.setEnabled, (id, on) => manager.setEnabled(id, on))
  handle(IPC.live.update, (id, patch) => manager.update(id, (patch ?? {}) as { title?: unknown; sound?: unknown }))
  handle(IPC.live.setOptions, (patch) => manager.setOptions(patch))
  handle(IPC.live.whisper, (key) => manager.whisper(key))
  handle(IPC.live.copyWhisper, (key) => manager.copyWhisper(key))
  handle(IPC.live.openHit, (key) => manager.openHit(key))
}

async function setupForGame(def: GameDef): Promise<void> {
  if (def.id !== 'poe1') {
    registerFavLiveAdapter(null)
    manager.stop()
    return
  }
  // вставляет whisper последней in-person находки в чат и НЕ отправляет — Enter жмёт игрок
  onHotkeyAction('whisperLastHit', () => {
    const r = manager.whisperLast()
    if (r !== 'ok') console.log('[live] whisperLastHit:', r)
  })
  await manager.start()
  // после start: до него setLive отвечает 'unsupported' и включённые поиски избранного не поднялись бы
  registerFavLiveAdapter(getFavLiveAdapter())
}

export const liveDomain: IpcDomain = { register, setupForGame }
