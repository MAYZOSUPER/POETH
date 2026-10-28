import { describe, expect, it } from 'vitest'
import { normalizeListing, type TradeFetchItem } from '@shared/poe1/pricecheck/results'
import { createClickGuard, lotActions, whisperCommand, WRITE_THROTTLE_MS } from '@shared/poe1/pricecheck/lotActions'
import { applySettingsPatch, defaultSettings, migrateSettings } from '@shared/settings'

const WHISPER_EN = '@Char Hi, I would like to buy your Sidhebreath Paua Amulet listed for 15 chaos in Standard (stash tab "~price 15 chaos"; position: left 3, top 7)'
const WHISPER_RU = '@Герой Здравствуйте, хочу купить у вас Сидхебрет, амулет из пауа за 15 chaos в лиге Standard (секция "$"; позиция: 3 слева, 7 сверху) — «ок»?'

const person = (whisper?: string): TradeFetchItem => ({
  id: 'p',
  listing: { price: { amount: 15, currency: 'chaos' }, whisper, account: { name: 'B', online: { status: 'online' } } }
})
const merchant: TradeFetchItem = {
  id: 'm',
  listing: {
    price: { amount: 2, currency: 'divine' },
    fee: 2400,
    // у лотов выкупа сайт тоже может прислать whisper — писать мерчанту всё равно некому
    whisper: '@Char Hi, I would like to buy your …',
    account: { name: 'Seller#1234', online: null }
  }
}

describe('кнопки у лота: что видно', () => {
  it('лично (whisper): «Написать» — главная, «Открыть лот» — рядом', () => {
    expect(lotActions(normalizeListing(person(WHISPER_EN)))).toEqual({ buyout: false, write: true, open: true, primary: 'write' })
  })

  it('выкуп (fee): значок «Выкуп», «Написать» скрыт, главная — «Открыть лот»', () => {
    expect(lotActions(normalizeListing(merchant))).toEqual({ buyout: true, write: false, open: true, primary: 'open' })
  })

  it('лично без текста whisper: только «Открыть лот»', () => {
    expect(lotActions(normalizeListing(person()))).toEqual({ buyout: false, write: false, open: true, primary: 'open' })
    expect(lotActions(normalizeListing(person('')))).toMatchObject({ write: false, primary: 'open' })
  })

  it('комиссия 0 — всё равно выкуп', () => {
    expect(lotActions({ fee: 0, whisper: WHISPER_EN })).toMatchObject({ buyout: true, write: false })
  })
})

describe('«Написать»: что уйдёт в чат', () => {
  it.each([WHISPER_EN, WHISPER_RU])('текст whisper — ровно из ответа fetch: %s', (w) => {
    const cmd = whisperCommand(normalizeListing(person(w)), false)
    expect(cmd).toEqual({ text: w, send: false })
    expect(cmd!.text).toBe(w)
  })

  it('настройка «Отправлять whisper сразу» → send: true; текст тот же', () => {
    expect(whisperCommand(normalizeListing(person(WHISPER_RU)), true)).toEqual({ text: WHISPER_RU, send: true })
  })

  it('у выкупа и без whisper — ничего не отправляем', () => {
    expect(whisperCommand(normalizeListing(merchant), true)).toBeNull()
    expect(whisperCommand(normalizeListing(person()), false)).toBeNull()
  })
})

describe('защита от двойного клика', () => {
  it(`не чаще раза в ${WRITE_THROTTLE_MS} мс; пропущенный клик таймер не продлевает`, () => {
    let now = 1000
    const guard = createClickGuard(WRITE_THROTTLE_MS, () => now)
    expect(guard()).toBe(true)
    now += 100
    expect(guard()).toBe(false)
    now += 249 // 349 мс после первого
    expect(guard()).toBe(false)
    now += 1 // 350 мс
    expect(guard()).toBe(true)
    now += 349
    expect(guard()).toBe(false)
    now += 1
    expect(guard()).toBe(true)
  })

  it('двойной клик (≈80 мс) — одно сообщение', () => {
    let now = 0
    const guard = createClickGuard(undefined, () => now)
    const sent = [0, 80, 160].filter((t) => ((now = t), guard())).length
    expect(sent).toBe(1)
  })
})

describe('Settings v2: priceCheck.sendWhisper', () => {
  it('по умолчанию выключено; старые профили без раздела — тоже', () => {
    expect(defaultSettings().priceCheck).toEqual({ sendWhisper: false })
    expect(migrateSettings({ schemaVersion: 2, game: 'poe1' }).priceCheck).toEqual({ sendWhisper: false })
    expect(migrateSettings({ league: 'Standard' }).priceCheck).toEqual({ sendWhisper: false })
  })

  it('сохраняется; мусор → выключено; патч не трогает остальное', () => {
    expect(migrateSettings({ schemaVersion: 2, priceCheck: { sendWhisper: true } }).priceCheck.sendWhisper).toBe(true)
    expect(migrateSettings({ schemaVersion: 2, priceCheck: { sendWhisper: 'yes' } }).priceCheck.sendWhisper).toBe(false)
    const s = applySettingsPatch(defaultSettings(), { priceCheck: { sendWhisper: true } })
    expect(s.priceCheck.sendWhisper).toBe(true)
    expect(s.overlay).toEqual(defaultSettings().overlay)
  })
})
