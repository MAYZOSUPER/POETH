import type { LiveWhisperResult } from '../types/live'

// Хоткей whisperLastHit не вставил whisper (S42): почему — коротким уведомлением поверх игры (ключ i18n),
// а не молча. В игру по-прежнему одно действие на нажатие: уведомление ничего в игру не шлёт.

/** Ключ уведомления по результату; null — показывать нечего. */
export function whisperLastNotice(r: LiveWhisperResult): string | null {
  switch (r) {
    case 'no-whisper':
      return 'live.hk.noHit'
    case 'no-input':
      return 'live.hk.noInput'
    case 'no-game':
      return 'live.act.err.no-game'
    // 'busy' — прошлое нажатие ещё не вернуло буфер (двойное нажатие): первое уже сработало,
    // молча — как у команд чата (input/chatCommands.ts)
    case 'busy':
    case 'ok':
      return null
  }
}
