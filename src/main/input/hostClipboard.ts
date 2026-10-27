// Портировано из Awakened PoE Trade (https://github.com/SnosMe/awakened-poe-trade),
// main/src/shortcuts/HostClipboard.ts, коммит 3188208957. MIT License,
// Copyright (c) SnosMe and contributors. Изменения POETH: буфер очищается перед
// каждым опросом и восстанавливается всегда (не только текст — ещё HTML/RTF/картинка);
// по таймауту возвращается null вместо исключения; детектор — ./itemText (en/ru и др.).

import { clipboard, type NativeImage } from 'electron'
import { isItemText } from './itemText'

/** Как часто читаем буфер, пока игра копирует предмет. */
const POLL_DELAY = 48
/** Сколько ждём текст предмета после Ctrl+C. */
const POLL_LIMIT = 500

// PoE must read clipboard within this timeframe,
// after that we restore clipboard.
// If game lagged for some reason, it will read
// wrong content (= restored clipboard, potentially containing password).
const RESTORE_AFTER = 120

interface ClipboardSnapshot {
  text: string
  html: string
  rtf: string
  image: NativeImage | null
}

function takeSnapshot(): ClipboardSnapshot {
  const formats = clipboard.availableFormats()
  const image = formats.some((f) => f.startsWith('image/')) ? clipboard.readImage() : null
  return {
    text: clipboard.readText(),
    html: formats.includes('text/html') ? clipboard.readHTML() : '',
    rtf: formats.includes('text/rtf') ? clipboard.readRTF() : '',
    image: image && !image.isEmpty() ? image : null
  }
}

function restoreSnapshot(s: ClipboardSnapshot): void {
  const data: Electron.Data = {}
  if (s.text) data.text = s.text
  if (s.html) data.html = s.html
  if (s.rtf) data.rtf = s.rtf
  if (s.image) data.image = s.image
  if (Object.keys(data).length > 0) clipboard.write(data)
  else clipboard.clear()
}

export class HostClipboard {
  private pollPromise?: Promise<string | null>
  private elapsed = 0
  private isRestored = true

  get isPolling(): boolean {
    return this.pollPromise != null
  }

  /**
   * Запомнить буфер, очистить его и ждать, пока игра положит туда текст предмета
   * (опрос каждые 48 мс, до 500 мс). Затем буфер восстанавливается. Синхронная часть
   * (снимок + очистка) выполняется сразу — Ctrl+C в игру отправлять ПОСЛЕ вызова.
   * Повторный вызов во время опроса продлевает ожидание и отдаёт тот же результат.
   */
  readItemText(): Promise<string | null> {
    this.elapsed = 0
    if (this.pollPromise) return this.pollPromise

    const saved = takeSnapshot()
    clipboard.clear()

    this.pollPromise = new Promise((resolve) => {
      const poll = (): void => {
        const textAfter = clipboard.readText()
        if (isItemText(textAfter)) {
          restoreSnapshot(saved)
          this.pollPromise = undefined
          resolve(textAfter)
          return
        }
        this.elapsed += POLL_DELAY
        if (this.elapsed < POLL_LIMIT) {
          setTimeout(poll, POLL_DELAY)
          return
        }
        restoreSnapshot(saved)
        this.pollPromise = undefined
        console.warn('[clipboard] no item text after Ctrl+C (cursor not over an item?)')
        resolve(null)
      }
      setTimeout(poll, POLL_DELAY)
    })
    return this.pollPromise
  }

  /**
   * Положить в буфер свой текст для игры (cb), а через 120 мс вернуть прежний буфер.
   * Пока прошлое восстановление не завершилось, cb не вызывается (возвращает false):
   * этот троттлинг спасает от дисконнекта «Too many actions».
   */
  restoreShortly(cb: (cb: typeof clipboard) => void): boolean {
    // Not only do we not overwrite the clipboard, but we don't exec callback.
    // This throttling helps against disconnects from "Too many actions".
    if (!this.isRestored) return false

    this.isRestored = false
    const saved = takeSnapshot()
    try {
      cb(clipboard)
    } finally {
      setTimeout(() => {
        restoreSnapshot(saved)
        this.isRestored = true
      }, RESTORE_AFTER)
    }
    return true
  }
}

/** Один на процесс: опрос и восстановление не должны пересекаться. */
export const hostClipboard = new HostClipboard()
