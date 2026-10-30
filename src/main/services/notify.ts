import { app, Notification } from 'electron'
import type { OverlayNotice } from '@shared/types'
import { IPC } from '@shared/ipc'
import { getSettings } from './settingsStore'
import { getGameFocus } from '../focus/gameFocus'
import { getOverlayStatus, sendToOverlay } from '../windows/gameOverlay'
import { notificationIcon } from '../appIcon'
import { portableExe } from './portable'
import { windowsToastsPolicy } from './toastPolicy'

// Короткие сообщения игроку из main (S10a): «POETH запущен…», «Данные обновлены», результат
// ручной проверки обновлений. Если игра в фокусе и оверлей прицеплен — тост поверх игры,
// иначе — уведомление Windows (тихое, без звука). Строки main — здесь (у main нет i18n renderer).
// Portable — только поверх игры (см. windowsToastsAllowed).

const TEXT = {
  ru: {
    started: 'POETH запущен — наведите курсор на предмет в игре и нажмите {key}.',
    startedNoKey: 'POETH запущен и ждёт в трее. Назначьте хоткей прайс-чека в настройках.',
    dataUpdated: 'Данные обновлены ({version}). Перезапустите POETH, чтобы применить.',
    upToDate: 'У вас последняя версия POETH ({version}).',
    checkFailed: 'Не удалось проверить обновления: нет связи с GitHub.',
    hotkeyTaken:
      '{key} занят другой программой (возможно, Awakened PoE Trade или Sidekick). Закройте её или назначьте другую клавишу.',
    /** S53: «Проверять» у фильтра лута нашло новую версию NeverSink (один раз на версию) */
    lootFilterUpdate: 'Вышел фильтр NeverSink {version}. Обновить: Настройки → «Фильтр лута».'
  },
  en: {
    started: 'POETH is running — hover an item in the game and press {key}.',
    startedNoKey: 'POETH is running in the tray. Set a price check hotkey in the settings.',
    dataUpdated: 'Data updated ({version}). Restart POETH to apply it.',
    upToDate: 'You have the latest POETH ({version}).',
    checkFailed: 'Could not check for updates: no connection to GitHub.',
    hotkeyTaken: '{key} is taken by another program (maybe Awakened PoE Trade or Sidekick). Close it or choose another key.',
    lootFilterUpdate: 'NeverSink filter {version} is out. To update: Settings → “Loot filter”.'
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

/**
 * Можно ли показывать уведомления Windows: установленная версия — да; portable и dev — нет (dev — только с
 * POETH_DEV_TOASTS=1); POETH_NO_WINDOWS_TOASTS=1 — нет. Правило и причины — services/toastPolicy.ts.
 * Notification.isSupported вызывается последним: он уже создаёт NotificationPresenter, а с ним ярлык в «Пуске».
 */
export function windowsToastsAllowed(): boolean {
  return windowsToastsPolicy({ packaged: app.isPackaged, portable: !!portableExe(), env: process.env }) && Notification.isSupported()
}

/** Показать сообщение: поверх игры, если она в фокусе, иначе уведомлением Windows. */
export async function notifyUser(
  key: NoticeKey,
  params?: Record<string, string | number>,
  kind: OverlayNotice['kind'] = 'info',
  action?: OverlayNotice['action']
): Promise<void> {
  const text = await noticeText(key, params)
  if (getGameFocus().game && getOverlayStatus().attached) {
    const notice: OverlayNotice = { key: `main.${key}`, text, kind, ...(action ? { action } : {}) }
    sendToOverlay(IPC.events.overlayNotice, notice)
    return
  }
  if (!windowsToastsAllowed()) {
    console.log(`[notify] ${text}`)
    return
  }
  new Notification({ title: 'POE Trade Helper', body: text, icon: notificationIcon(), silent: true }).show()
}
