import { describe, expect, it } from 'vitest'
import type { LiveWhisperResult } from '@shared/types/live'
import { whisperLastNotice } from '@shared/live/whisperLast'
import { DOMAIN_DICTS } from '../../src/renderer/src/i18n/dicts'

// Хоткей «Whisper последней находки» (S42): не вышло — уведомление поверх игры с причиной, а не тишина.

const has = (key: string): boolean => Object.values(DOMAIN_DICTS).some((d) => key in d.ru && key in d.en)

describe('whisperLastNotice', () => {
  it.each(['no-whisper', 'no-input', 'no-game'] as LiveWhisperResult[])('%s — есть уведомление, строка в RU и EN', (r) => {
    const key = whisperLastNotice(r)
    expect(key).toBeTruthy()
    expect(has(key!)).toBe(true)
  })

  it('ok и busy (двойное нажатие: первое уже сработало) — молча', () => {
    expect(whisperLastNotice('ok')).toBeNull()
    expect(whisperLastNotice('busy')).toBeNull()
  })
})
