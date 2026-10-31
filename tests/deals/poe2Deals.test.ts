import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { promises as fs, readFileSync } from 'fs'
import os from 'os'
import path from 'path'
import type { Deal } from '@shared/types'
import { parseLogLine, parseSystemMessage, type WhisperEvent } from '@shared/deals/whisperParse'
import { applySystemEvent, clearDeals, dealGame, emptyDealsFile, normalizeDealsConfig } from '@shared/deals/history'
import { chatCommand } from '@shared/deals/commands'
import { DealsStore, demoLines } from '../../src/main/services/dealsStore'

// Сделки PoE 2 (S63): whisper'ы trade2 EN/RU (шаблоны — с живых лотов 31.10.2026), системные строки PoE 2
// из данных игры, история по игре. Фикстуры — tests/deals/fixtures/poe2 (README — откуда строки).

const FIX = path.resolve(__dirname, 'fixtures/poe2')
const lines = (lang: 'en' | 'ru'): string[] =>
  readFileSync(path.join(FIX, `client-${lang}.txt`), 'utf8').split(/\r?\n/).filter(Boolean)

function whisper(line: string): WhisperEvent {
  const ev = parseLogLine(line, 'poe2')
  expect(ev?.type).toBe('whisper')
  return ev as WhisperEvent
}

describe('whisper PoE 2 — разбор EN', () => {
  const [inBuy, inOffer, outBuy, chat] = lines('en')

  it('входящая покупка: предмет, цена в exalted, лига, вкладка и позиция', () => {
    const ev = whisper(inBuy)
    expect(ev).toMatchObject({ dir: 'in', player: 'MarshWitch', guild: 'GG', clientLang: 'en' })
    expect(ev.trade).toMatchObject({
      kind: 'item',
      lang: 'en',
      item: 'Wanderlust Wrapped Sandals',
      price: '3 exalted',
      priceValue: { amount: 3, currency: 'exalted' },
      league: 'Runes of Aldur',
      tab: '~price 3 exalted',
      pos: { left: 7, top: 3 }
    })
  })

  it('приписка покупателя и лига Standard', () => {
    expect(whisper(inOffer).trade).toMatchObject({ item: 'Gold Ring', league: 'Standard', message: '0.5 ex?' })
  })

  it('исходящая (@To) и обычный разговор', () => {
    expect(whisper(outBuy)).toMatchObject({ dir: 'out', player: 'MoonWarden' })
    expect(whisper(outBuy).trade?.item).toBe('Whisper of the Brotherhood Sapphire Ring')
    expect(whisper(chat).trade).toBeNull()
  })

  it('системные: вход, сделка, выход, DND', () => {
    const sys = lines('en')
      .slice(4)
      .map((l) => parseLogLine(l, 'poe2'))
    expect(sys.map((e) => (e?.type === 'system' ? e.event.kind : null))).toEqual(['joined', 'tradeAccepted', 'left', 'dnd'])
  })
})

describe('whisper PoE 2 — разбор RU', () => {
  const [inBuy, inOffer, outBuy, chat] = lines('ru')

  it('входящая покупка: RU-шаблон, цена — id валюты сайта', () => {
    const ev = whisper(inBuy)
    expect(ev).toMatchObject({ dir: 'in', player: 'Ведьма_Ладоги', guild: 'РУС', clientLang: 'ru' })
    expect(ev.trade).toMatchObject({
      lang: 'ru',
      item: 'Странники Плетёные сандалии',
      price: '3 exalted',
      priceValue: { amount: 3, currency: 'exalted' },
      league: 'Runes of Aldur',
      pos: { left: 7, top: 3 }
    })
  })

  it('приписка с запятой, исходящая, разговор', () => {
    expect(whisper(inOffer).trade).toMatchObject({ item: 'Золотое кольцо', league: 'Standard', message: '0,5 ex?' })
    expect(whisper(outBuy)).toMatchObject({ dir: 'out', player: 'ЛунныйСтраж' })
    expect(whisper(outBuy).trade?.item).toBe('Шёпот братства Кольцо с сапфиром')
    expect(whisper(chat).trade).toBeNull()
  })

  it('системные RU PoE 2: «Сделка совершена.», DND — из данных игры', () => {
    const sys = lines('ru')
      .slice(4)
      .map((l) => parseLogLine(l, 'poe2'))
    expect(sys.map((e) => (e?.type === 'system' ? e.event.kind : null))).toEqual(['joined', 'tradeAccepted', 'left', 'dnd'])
    expect(parseSystemMessage('Сделка отклонена.', 'poe2')).toEqual({ kind: 'tradeCancelled', lang: 'ru' })
    expect(parseSystemMessage('Режим "недоступен" выключен.', 'poe2')).toEqual({ kind: 'dnd', on: false, lang: 'ru' })
  })

  it('PoE 1 не меняется: RU-строки PoE 2 там не распознаются', () => {
    expect(parseSystemMessage('Сделка совершена.')).toBeNull()
    expect(parseSystemMessage('Сделка совершена.', 'poe1')).toBeNull()
    expect(parseSystemMessage('Trade accepted.', 'poe1')).toEqual({ kind: 'tradeAccepted', lang: 'en' })
  })
})

describe('кнопки карточки PoE 2 — одна команда в чат', () => {
  it('те же команды и шаблоны ответов, язык — по сообщению', () => {
    const ev = whisper(lines('ru')[0])
    const deal = { id: 'd', dir: ev.dir, player: ev.player, item: ev.trade!.item, price: ev.trade!.price, league: ev.trade!.league, bulk: false, lang: 'ru', ts: 0, status: 'new' } as Deal
    const cfg = normalizeDealsConfig(null)
    expect(chatCommand('invite', deal, cfg)).toBe('/invite Ведьма_Ладоги')
    expect(chatCommand('trade', deal, cfg)).toBe('/tradewith Ведьма_Ладоги')
    expect(chatCommand('sold', deal, cfg)).toBe('@Ведьма_Ладоги Извините, уже продано: Странники Плетёные сандалии.')
  })
})

let dir = ''
beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'poeth-deals2-'))
})
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true })
})

const T0 = new Date(2026, 9, 31, 21, 41, 30).getTime()

describe('DealsStore — история по игре', () => {
  it('журнал PoE 2: сделки помечены game, «Сделка совершена.» закрывает приглашённую', async () => {
    const file = path.join(dir, 'deals.json')
    const s = new DealsStore(file, () => T0)
    s.setGame('poe2')
    const added = await s.ingestLines(lines('ru').slice(0, 3))
    expect(added.map((d) => d.game)).toEqual(['poe2', 'poe2', 'poe2'])
    const first = added[0]
    await s.setStatus(first.id, 'invited')
    await s.ingestLines([lines('ru')[5]])
    expect(s.getState().deals.find((d) => d.id === first.id)?.status).toBe('traded')
    const disk = JSON.parse(await fs.readFile(file, 'utf8'))
    expect(disk.deals.every((d: Deal) => d.game === 'poe2')).toBe(true)
  })

  it('состояние, экспорт и очистка — только сделки запущенной игры', async () => {
    const file = path.join(dir, 'deals.json')
    const s = new DealsStore(file, () => T0)
    await s.ingestLines(['2026/10/28 21:40:00 1000 abcdef12 [INFO Client 1] @From Buyer: Hi, I would like to buy your Doom Loop Ruby Ring listed for 1 divine in Settlers (stash tab "Sale"; position: left 2, top 3)'])
    s.setGame('poe2')
    await s.ingestLines(lines('en').slice(0, 1))
    expect(s.getState().deals.map((d) => d.player)).toEqual(['MarshWitch'])
    expect(s.exportCsv()).toContain('MarshWitch')
    expect(s.exportCsv()).not.toContain('Buyer')
    await s.clear()
    expect(s.getState().deals).toEqual([])
    s.setGame('poe1')
    // история PoE 1 не тронута
    expect(s.getState().deals.map((d) => d.player)).toEqual(['Buyer'])
    expect(s.getState().deals[0].game).toBeUndefined()
  })

  it('пример PoE 2 разбирается тем же парсером (EN и RU), имена — из данных EE2', async () => {
    for (const lang of ['en', 'ru'] as const) {
      const s = new DealsStore(path.join(dir, `demo-${lang}.json`), () => T0)
      s.setGame('poe2')
      const st = await s.addDemo(lang)
      expect(st.deals).toHaveLength(demoLines(lang, T0, 'poe2').length)
      expect(st.deals.every((d) => d.demo && d.game === 'poe2' && d.league === 'Runes of Aldur')).toBe(true)
      expect(st.deals.some((d) => d.blacklist)).toBe(true)
    }
  })
})

describe('история: функции по игре', () => {
  const deal = (id: string, game?: 'poe2', extra: Partial<Deal> = {}): Deal => ({
    id,
    dir: 'in',
    player: id,
    item: 'Gold Ring',
    price: '1 exalted',
    league: 'Standard',
    bulk: false,
    lang: 'en',
    ts: T0,
    status: 'new',
    ...(game ? { game } : {}),
    ...extra
  })

  it('dealGame: без поля — PoE 1', () => {
    expect(dealGame(deal('a'))).toBe('poe1')
    expect(dealGame(deal('b', 'poe2'))).toBe('poe2')
  })

  it('clearDeals(game) и applySystemEvent(game) не трогают другую игру', () => {
    const data = { ...emptyDealsFile(), deals: [deal('p2', 'poe2', { status: 'invited' }), deal('p1', undefined, { status: 'invited' })] }
    expect(clearDeals(data, false, 'poe2').deals.map((d) => d.id)).toEqual(['p1'])
    expect(clearDeals(data, false).deals).toEqual([])
    const r = applySystemEvent(data, { kind: 'tradeAccepted', lang: 'en' }, T0, 'poe1')
    expect(r.changedId).toBe('p1')
    expect(applySystemEvent(data, { kind: 'tradeAccepted', lang: 'en' }, T0).changedId).toBe('p2')
  })

  it('свой Client.txt PoE 2 в настройках менеджера', () => {
    expect(normalizeDealsConfig(null).logPathPoe2).toBeNull()
    expect(normalizeDealsConfig({ logPathPoe2: 'D:\\PoE2\\logs\\Client.txt', logPath: 'E:\\PoE\\logs\\Client.txt' })).toMatchObject({
      logPathPoe2: 'D:\\PoE2\\logs\\Client.txt',
      logPath: 'E:\\PoE\\logs\\Client.txt'
    })
  })
})
