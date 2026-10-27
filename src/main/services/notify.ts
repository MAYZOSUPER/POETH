import { Notification } from 'electron'
import type { OverlayNotice } from '@shared/types'
import { IPC } from '@shared/ipc'
import { getSettings } from './settingsStore'
import { getGameFocus } from '../focus/gameFocus'
import { getOverlayStatus, sendToOverlay } from '../windows/gameOverlay'

// Короткие сообщения игроку из main (S10a): «POETH запущен…», «Данные обновлены», результат
// ручной проверки обновлений. Если игра в фокусе и оверлей прицеплен — тост поверх игры,
// иначе — уведомление Windows (тихое, без звука). Строки main — здесь (у main нет i18n renderer).

const TEXT = {
  ru: {
    started: 'POETH запущен — наведите курсор на предмет в игре и нажмите {key}.',
    startedNoKey: 'POETH запущен и ждёт в трее. Назначьте хоткей прайс-чека в настройках.',
    dataUpdated: 'Данные обновлены ({version}). Перезапустите POETH, чтобы применить.',
    upToDate: 'У вас последняя версия POETH ({version}).',
    checkFailed: 'Не удалось проверить обновления: нет связи с GitHub.'
  },
  en: {
    started: 'POETH is running — hover an item in the game and press {key}.',
    startedNoKey: 'POETH is running in the tray. Set a price check hotkey in the settings.',
    dataUpdated: 'Data updated ({version}). Restart POETH to apply it.',
    upToDate: 'You have the latest POETH ({version}).',
    checkFailed: 'Could not check for updates: no connection to GitHub.'
  }
} as const

export type NoticeKey = keyof (typeof TEXT)['ru']

function format(s: string, params?: Record<string, string | number>): string {
  let out = s
  for (const [k, v] of Object.entries(params ?? {})) out = out.replace(`{${k}}`, String(v))
  return out
}

/** Текст сообщения на языке интерфейса. */
export async function noticeText(key: NoticeKey, params?: Record<string, string | number>): Promise<string> {
  const lang = (await getSettings()).uiLang === 'en' ? 'en' : 'ru'
  return format(TEXT[lang][key], params)
}

/** Показать сообщение: поверх игры, если она в фокусе, иначе уведомлением Windows. */
export async function notifyUser(
  key: NoticeKey,
  params?: Record<string, string | number>,
  kind: OverlayNotice['kind'] = 'info'
): Promise<void> {
  const text = await noticeText(key, params)
  if (getGameFocus().game && getOverlayStatus().attached) {
    const notice: OverlayNotice = { key: `main.${key}`, text, kind }
    sendToOverlay(IPC.events.overlayNotice, notice)
    return
  }
  if (!Notification.isSupported()) return
  new Notification({ title: 'POE Trade Helper', body: text, silent: true }).show()
}
