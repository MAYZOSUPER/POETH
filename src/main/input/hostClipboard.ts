// Портировано из Awakened PoE Trade (https://github.com/SnosMe/awakened-poe-trade),
// main/src/shortcuts/HostClipboard.ts, коммит 3188208957. MIT License,
// Copyright (c) SnosMe and contributors. Изменения POETH: буфер очищается перед
// каждым опросом и восстанавливается всегда (не только текст — ещё HTML/RTF/картинка);
// по таймауту возвращается null вместо исключения; детектор — ./itemText (en/ru и др.);
// API буфера Electron 44 (W3C: всё на Promise) — клавиши жмёт сам HostClipboard после снимка.

import { clipboard, ClipboardItem } from 'electron'
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

/** Что запоминаем и возвращаем: текст, HTML, RTF, картинка (как до Electron 44). */
const KEPT_TYPES = ['text/plain', 'text/html', 'text/rtf', 'image/png'] as const

/** MIME → содержимое. Прочитано при снимке: элемент из clipboard.read() читает буфер лишь в getType(). */
type ClipboardSnapshot = Record<string, Blob>

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

async function takeSnapshot(): Promise<ClipboardSnapshot> {
  const snap: ClipboardSnapshot = {}
  const [item] = await clipboard.read()
  if (!item) return snap
  for (const type of KEPT_TYPES) {
    const has = type === 'image/png' ? item.types.some((t) => t.startsWith('image/')) : item.types.includes(type)
    if (!has) continue
    const blob = await item.getType(type)
    if (blob.size > 0) snap[type] = blob
  }
  return snap
}

/** Вернуть буфер как был. Не бросает: не вышло — в логе. */
async function restoreSnapshot(s: ClipboardSnapshot): Promise<void> {
  try {
    if (Object.keys(s).length > 0) await clipboard.write([new ClipboardItem(s)])
    else clipboard.clear()
  } catch (e) {
    // не вышло целиком (битая картинка и т.п.) — вернуть хотя бы текст, но не оставлять текст предмета
    console.warn('[clipboard] restore failed, text only:', e)
    try {
      const text = s['text/plain']
      if (text) await clipboard.writeText(await text.text())
      else clipboard.clear()
    } catch (e2) {
      console.error('[clipboard] restore failed:', e2)
    }
  }
}

interface ItemTextRead {
  /** снимок сделан, буфер очищен, клавиши копирования нажаты (false — снимок не удался, клавиш не было) */
  pressed: Promise<boolean>
  result: Promise<string | null>
}

export class HostClipboard {
  private reading?: ItemTextRead
  private elapsed = 0
  private isRestored = true
  /**
   * Прошлое действие (Ctrl+D или ввод в игру) вернуло буфер: новый снимок — только после этого,
   * иначе запомним текст предмета или свою строку для чата вместо буфера игрока. Не отклоняется.
   */
  private settled: Promise<void> = Promise.resolve()

  get isPolling(): boolean {
    return this.reading != null
  }

  /**
   * Запомнить буфер, очистить его, нажать копирование в игре (pressKeys) и ждать, пока игра
   * положит туда текст предмета (опрос каждые 48 мс, до 500 мс). Затем буфер восстанавливается.
   * Повторный вызов во время опроса продлевает ожидание, снова жмёт копирование и отдаёт тот же результат.
   */
  readItemText(pressKeys: () => void): Promise<string | null> {
    this.elapsed = 0
    if (this.reading) {
      void this.reading.pressed.then((ok) => ok && pressKeys())
      return this.reading.result
    }

    let saved: ClipboardSnapshot = {}
    const pressed = this.settled.then(takeSnapshot).then(
      (snap) => {
        saved = snap
        clipboard.clear()
        pressKeys()
        return true
      },
      (e: unknown) => {
        console.error('[clipboard] snapshot failed — Ctrl+C not sent:', e)
        return false
      }
    )
    const reading: ItemTextRead = {
      pressed,
      result: pressed.then(async (ok) => {
        let text: string | null = null
        try {
          if (ok) text = await this.pollItemText()
        } catch (e) {
          console.error('[clipboard] read failed:', e)
        }
        // следующий Ctrl+D — уже новый цикл: он подождёт settled (возврат буфера)
        if (this.reading === reading) this.reading = undefined
        if (ok) await restoreSnapshot(saved)
        return text
      })
    }
    this.reading = reading
    this.settled = reading.result.then(
      () => undefined,
      () => undefined
    )
    return reading.result
  }

  private async pollItemText(): Promise<string | null> {
    for (;;) {
      await sleep(POLL_DELAY)
      const textAfter = await clipboard.readText()
      if (isItemText(textAfter)) return textAfter
      this.elapsed += POLL_DELAY
      if (this.elapsed >= POLL_LIMIT) {
        console.warn('[clipboard] no item text after Ctrl+C (cursor not over an item?)')
        return null
      }
    }
  }

  /**
   * Положить в буфер свой текст для игры и нажать клавиши (cb: дождаться записи, потом жать),
   * а через 120 мс вернуть прежний буфер. Пока прошлое восстановление не завершилось, cb не
   * вызывается (возвращает false): этот троттлинг спасает от дисконнекта «Too many actions».
   * true — действие принято; снимок и cb выполняются сразу следом (асинхронно).
   */
  restoreShortly(cb: (cb: typeof clipboard) => Promise<void>): boolean {
    // Not only do we not overwrite the clipboard, but we don't exec callback.
    // This throttling helps against disconnects from "Too many actions".
    if (!this.isRestored) return false

    this.isRestored = false
    this.settled = this.settled.then(async () => {
      let saved: ClipboardSnapshot | null = null
      try {
        saved = await takeSnapshot()
        await cb(clipboard)
      } catch (e) {
        console.error('[clipboard] game input failed:', e)
      } finally {
        await sleep(RESTORE_AFTER)
        // снимок не удался — cb не вызывался, буфер не трогали
        if (saved) await restoreSnapshot(saved)
        this.isRestored = true
      }
    })
    return true
  }
}

/** Один на процесс: опрос и восстановление не должны пересекаться. */
export const hostClipboard = new HostClipboard()
