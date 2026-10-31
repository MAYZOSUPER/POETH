import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { promises as fs, readFileSync } from 'fs'
import os from 'os'
import path from 'path'
import type { Deal } from '@shared/types'
import { parseLogLine, parseSystemMessage, parseTradeMessage, type WhisperEvent } from '@shared/deals/whisperParse'
import {
  addDeal,
  applySystemEvent,
  clearDeals,
  dealGame,
  emptyDealsFile,
  ignoreKey,
  normalizeDealsConfig,
  normalizeDealsFile,
  setDealStatus,
  trimHistory,
  withConfig
} from '@shared/deals/history'
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

describe('исходящий whisper PoE 2 на языке продавца (de, fr, ko, zh)', () => {
  // тела — живые listing.whisper trade2 (31.10.2026), ник продавца заменён
  const OUT = '2026/10/31 21:40:00 74519921 cffb0658 [INFO Client 19012] @To Seller: '
  const cases: [string, string, Record<string, unknown>][] = [
    [
      'de',
      `Hi, ich möchte 'Schwefel-Finger Saphirring' zum angebotenen Preis von 20 exalted in der Standard-Liga kaufen (Truhenfach "~price 20 exalted"; Position: 4 von links, 22 von oben)`,
      { item: 'Schwefel-Finger Saphirring', price: '20 exalted', league: 'Standard', tab: '~price 20 exalted', pos: { left: 4, top: 22 } }
    ],
    [
      'fr',
      `Bonjour, je souhaiterais t'acheter Polcirkeln Bague de saphir pour 1 exalted dans la ligue Standard (onglet de réserve "~b/o 1 exalted" ; 9e en partant de la gauche, 12e en partant du haut)`,
      { item: 'Polcirkeln Bague de saphir', price: '1 exalted', league: 'Standard', tab: '~b/o 1 exalted', pos: { left: 9, top: 12 } }
    ],
    [
      'ko',
      '안녕하세요, 1 exalted(으)로 올려놓은 Standard 리그의 대재앙 선회 사파이어 반지(을)를 구매하고 싶습니다 (보관함 탭 "~price 1 exalted", 위치: 왼쪽 5, 상단 9)',
      { item: '대재앙 선회 사파이어 반지', price: '1 exalted', league: 'Standard', tab: '~price 1 exalted', pos: { left: 5, top: 9 } }
    ],
    [
      'zh',
      '你好，我想購買 復仇 之旋 藍玉戒指 標價 1 exalted 在 Standard (倉庫頁 "~price 1 divine"; 位置: 左 1, 上 13)',
      { item: '復仇 之旋 藍玉戒指', price: '1 exalted', league: 'Standard', tab: '~price 1 divine', pos: { left: 1, top: 13 } }
    ]
  ]

  for (const [lang, body, want] of cases) {
    it(`${lang}: предмет, цена, лига, ячейка; ответы — по-английски`, () => {
      const ev = whisper(OUT + body)
      expect(ev.dir).toBe('out')
      expect(ev.trade).toMatchObject({ kind: 'item', lang: 'en', priceValue: { currency: 'exalted' }, ...want })
    })
  }

  it('PoE 1 не меняется: эти шаблоны там не разбираются', () => {
    for (const [, body] of cases) expect(parseTradeMessage(body)).toBeNull()
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

  it('лимит истории — у каждой игры свой: PoE 2 не вытесняет PoE 1', () => {
    const p2 = Array.from({ length: 25 }, (_, i) => deal(`p2-${i}`, 'poe2', { ts: T0 - i }))
    const p1 = Array.from({ length: 5 }, (_, i) => deal(`p1-${i}`, undefined, { ts: T0 - 1000 - i }))
    // trimHistory: свежие первыми, по 20 на игру
    const kept = trimHistory([...p2, ...p1], 20)
    expect(kept.filter((d) => d.game === 'poe2')).toHaveLength(20)
    expect(kept.filter((d) => !d.game).map((d) => d.id)).toEqual(p1.map((d) => d.id))
    // addDeal: новая сделка PoE 2 при полном лимите PoE 2 вытесняет старую PoE 2, а не PoE 1
    let data = withConfig(emptyDealsFile(), normalizeDealsConfig({ historyLimit: 20 }))
    data = { ...data, deals: kept }
    const r = addDeal(data, deal('p2-new', 'poe2', { ts: T0 + 1, player: 'New' }), T0 + 1)
    expect(r.data.deals.filter((d) => d.game === 'poe2')).toHaveLength(20)
    expect(r.data.deals.filter((d) => !d.game)).toHaveLength(5)
    // deals.json: обрезка при чтении — тоже по игре
    const f = normalizeDealsFile({ version: 2, config: { historyLimit: 20 }, deals: [...p2, ...p1] }, T0)
    expect(f.deals.filter((d) => !d.game)).toHaveLength(5)
    expect(f.deals.filter((d) => d.game === 'poe2')).toHaveLength(20)
  })

  it('«Продано» глушит повторы только в своей игре; повтор запроса — тоже по игре', () => {
    const at = { tab: 'Sale', pos: { left: 2, top: 3 } }
    let data = { ...emptyDealsFile(), deals: [deal('p1', undefined, at)] }
    data = setDealStatus(data, 'p1', 'sold', T0)
    // тот же предмет и ячейка в PoE 2 — не игнор, и это не повтор сделки PoE 1
    const r2 = addDeal(data, deal('p2', 'poe2', { ...at, ts: T0 + 1 }), T0 + 1)
    expect(r2.kind).toBe('added')
    expect(r2.deal.status).toBe('new')
    // в PoE 1 — игнор, как и было
    const r1 = addDeal(data, deal('p1b', undefined, { ...at, ts: T0 + 2 }), T0 + 2)
    expect(r1.deal.status).toBe('ignored')
    // проданное в PoE 2 глушит только PoE 2
    let d2 = { ...emptyDealsFile(), deals: [deal('q2', 'poe2', at)] }
    d2 = setDealStatus(d2, 'q2', 'sold', T0)
    expect(addDeal(d2, deal('q2b', 'poe2', { ...at, ts: T0 + 1 }), T0 + 1).deal.status).toBe('ignored')
    expect(addDeal(d2, deal('q1', undefined, { ...at, ts: T0 + 1 }), T0 + 1).deal.status).toBe('new')
    // одинаковый запрос в другой игре в окне повтора — новая сделка
    const same = { ...at, player: 'Buyer' }
    const open = { ...emptyDealsFile(), deals: [deal('o1', undefined, same)] }
    expect(addDeal(open, deal('o2', 'poe2', { ...same, ts: T0 + 60_000 }), T0 + 60_000).kind).toBe('added')
    expect(addDeal(open, deal('o3', undefined, { ...same, ts: T0 + 60_000 }), T0 + 60_000).kind).toBe('repeated')
  })

  it('ключ игнора PoE 1 прежний (старые записи deals.json совпадают), у PoE 2 — с игрой', () => {
    const at = { tab: 'Sale', pos: { left: 2, top: 3 } }
    expect(ignoreKey(deal('a', undefined, at))).toBe('gold ring|sale|2,3')
    expect(ignoreKey(deal('b', 'poe2', at))).toBe('poe2|gold ring|sale|2,3')
  })

  it('свой Client.txt PoE 2 в настройках менеджера', () => {
    expect(normalizeDealsConfig(null).logPathPoe2).toBeNull()
    expect(normalizeDealsConfig({ logPathPoe2: 'D:\\PoE2\\logs\\Client.txt', logPath: 'E:\\PoE\\logs\\Client.txt' })).toMatchObject({
      logPathPoe2: 'D:\\PoE2\\logs\\Client.txt',
      logPath: 'E:\\PoE\\logs\\Client.txt'
    })
  })
})
