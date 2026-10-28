import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { promises as fs, readFileSync } from 'fs'
import os from 'os'
import path from 'path'
import type { Deal, DealCardAction } from '@shared/types'
import { CARD_TTL_MS, activeCards, ageParts, cardActions, cardEffect, cardsFit, topCard } from '@shared/deals/cards'
import { defaultDealsConfig } from '@shared/deals/history'
import { GAMES, type GameDef } from '@shared/games'
import { DealsStore } from '../../src/main/services/dealsStore'
import { setGameLogPath, subscribeGameLog } from '../../src/main/services/gameLog'

const T0 = new Date(2026, 9, 28, 21, 41, 0).getTime()
const cfg = defaultDealsConfig()

function d(over: Partial<Deal>): Deal {
  return {
    id: 'x',
    dir: 'in',
    player: 'P',
    item: 'I',
    price: '1 chaos',
    league: 'Settlers',
    bulk: false,
    lang: 'en',
    ts: T0 - 60_000,
    status: 'new',
    ...over
  }
}

describe('activeCards / topCard', () => {
  it('открытые свежие сверху; закрытые, примеры, игнор и старые — нет', () => {
    const list = [
      d({ id: 'old', ts: T0 - CARD_TTL_MS - 1 }),
      d({ id: 'a', ts: T0 - 5000 }),
      d({ id: 'b', ts: T0 - 1000, status: 'invited' }),
      d({ id: 'hidden', cardHidden: true }),
      d({ id: 'demo', demo: true }),
      d({ id: 'ign', status: 'ignored' }),
      d({ id: 'sold', status: 'sold' }),
      d({ id: 'out', dir: 'out' })
    ]
    // по умолчанию исходящие видны, завершённые — нет
    expect(activeCards(list, cfg, T0).map((x) => x.id)).toEqual(['b', 'a', 'out'])
    expect(activeCards(list, { showOutgoing: false, hideAfterSold: true }, T0).map((x) => x.id)).toEqual(['b', 'a'])
    // исходящие и завершённые — по настройкам
    const all = activeCards(list, { showOutgoing: true, hideAfterSold: false }, T0).map((x) => x.id)
    expect(all).toEqual(['b', 'a', 'sold', 'out'])
  })

  it('старая сделка со свежим статусом остаётся', () => {
    const x = d({ ts: T0 - CARD_TTL_MS - 10, updatedAt: T0 - 1000, status: 'invited' })
    expect(activeCards([x], cfg, T0)).toHaveLength(1)
  })

  it('верхняя карточка — свежая открытая, по направлению', () => {
    const cards = [d({ id: 'o', dir: 'out', ts: T0 }), d({ id: 's', status: 'sold' }), d({ id: 'i', ts: T0 - 10 })]
    expect(topCard(cards)?.id).toBe('o')
    expect(topCard(cards, 'in')?.id).toBe('i')
    expect(topCard([], 'in')).toBeNull()
  })
})

describe('cardActions / cardEffect', () => {
  it('кнопки по макету: входящая, исходящая, чёрный список', () => {
    expect(cardActions(d({}))).toEqual(['invite', 'trade', 'kick', 'thanks', 'sold', 'wait', 'whois'])
    expect(cardActions(d({ dir: 'out' }))).toEqual(['still', 'hideout', 'trade', 'thanks', 'leave', 'whois'])
    expect(cardActions(d({ blacklist: { account: 'a', reason: 'r', since: '', matchedBy: 'account' } }))).toEqual([
      'invite',
      'whois'
    ])
  })

  it('последствия кнопок', () => {
    expect(cardEffect('invite', d({}), cfg)).toEqual({ status: 'invited' })
    expect(cardEffect('invite', d({ status: 'invited' }), cfg)).toEqual({})
    expect(cardEffect('trade', d({}), cfg)).toEqual({ status: 'invited' })
    expect(cardEffect('kick', d({}), cfg)).toEqual({ hide: true })
    expect(cardEffect('thanks', d({ status: 'invited' }), cfg)).toEqual({ status: 'traded', hide: true })
    expect(cardEffect('thanks', d({}), { hideAfterSold: false })).toEqual({ status: 'traded' })
    expect(cardEffect('sold', d({}), cfg)).toEqual({ status: 'sold', hide: true })
    expect(cardEffect('sold', d({ dir: 'out' }), cfg)).toEqual({})
    // исходящая: в убежище продавца и обмен — вы в группе; выйти из группы — карточка закрыта
    expect(cardEffect('hideout', d({ dir: 'out' }), cfg)).toEqual({ status: 'invited' })
    expect(cardEffect('hideout', d({ dir: 'out', status: 'invited' }), cfg)).toEqual({})
    expect(cardEffect('trade', d({ dir: 'out' }), cfg)).toEqual({ status: 'invited' })
    expect(cardEffect('leave', d({ dir: 'out', status: 'invited' }), cfg)).toEqual({ hide: true })
    for (const a of ['wait', 'whois', 'still', 'hideout'] as DealCardAction[]) expect(cardEffect(a, d({}), cfg)).toEqual({})
  })

  it('сколько карточек влезает по высоте окна', () => {
    expect(cardsFit(720)).toBe(2)
    expect(cardsFit(900)).toBe(3)
    expect(cardsFit(1080)).toBe(4)
    expect(cardsFit(2160)).toBe(4)
    expect(cardsFit(300)).toBe(1)
  })

  it('возраст карточки', () => {
    expect(ageParts(T0 - 15_000, T0)).toEqual({ n: 15, unit: 's' })
    expect(ageParts(T0 - 125_000, T0)).toEqual({ n: 2, unit: 'm' })
    expect(ageParts(T0 - 2 * 3600_000, T0)).toEqual({ n: 2, unit: 'h' })
    expect(ageParts(T0 + 5000, T0)).toEqual({ n: 0, unit: 's' })
  })
})

// ---------------------------------------------------------------------------
// Стор: кнопки карточек и строки лога (фикстуры EN/RU)
// ---------------------------------------------------------------------------

let dir = ''
beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'poeth-cards-'))
})
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true })
})

const fixture = (name: string): string[] =>
  readFileSync(path.join(__dirname, 'fixtures', name), 'utf8').split(/\r?\n/).filter(Boolean)

// Строки идут через общий тейлер процесса (services/gameLog.ts), как в ipc/deals.ts: свой путь
// игры = временный Client.txt, подписка → store.ingestLines. Тейлер опрашивает файл раз в секунду.
const POE1: GameDef = { ...GAMES.poe1, logSubdirs: ['POETH test nowhere/logs'] }

async function until(pred: () => boolean, ms = 3500): Promise<boolean> {
  const end = Date.now() + ms
  while (!pred()) {
    if (Date.now() > end) return false
    await new Promise((r) => setTimeout(r, 50))
  }
  return true
}

/** Подписать стор на лог (как reconcileLog в ipc/deals.ts) и вернуть «дописать строки» и отписку. */
async function storeOnGameLog(store: DealsStore): Promise<{ write: (lines: string[]) => Promise<void>; off: () => void }> {
  const file = path.join(dir, 'Client.txt')
  await fs.writeFile(file, '', 'utf8')
  await setGameLogPath('poe1', file)
  const sub = await subscribeGameLog(POE1, (lines) => void store.ingestLines(lines))
  return { write: (lines) => fs.appendFile(file, lines.map((l) => `${l}\n`).join(''), 'utf8'), off: sub.off }
}

describe('сделки на общем тейлере gameLog (фикстуры Client.txt)', () => {
  afterEach(async () => {
    await setGameLogPath('poe1', null)
  })

  it('EN: сделки и карточки, Trade accepted закрывает приглашённую, после отписки строк нет', async () => {
    const store = new DealsStore(path.join(dir, 'd.json'), () => T0)
    const log = await storeOnGameLog(store)
    const lines = fixture('client-en.txt')
    const newDeals: string[] = []
    store.on('deal', (x: Deal) => newDeals.push(x.player))
    await log.write(lines.slice(0, 7)) // до «joined»
    expect(await until(() => newDeals.length === 4)).toBe(true)
    expect(newDeals).toEqual(['MarshWitch', 'GemBuyer', 'BulkGuy', 'MoonWarden'])
    let st = store.getState()
    // исходящая тоже карточка (showOutgoing по умолчанию включён), свежие сверху
    expect(activeCards(st.deals, st.config, T0).map((x) => x.player)).toEqual(['MoonWarden', 'BulkGuy', 'GemBuyer', 'MarshWitch'])
    expect(activeCards(st.deals, { ...st.config, showOutgoing: false }, T0).map((x) => x.player)).not.toContain('MoonWarden')
    // игрок пригласил покупателя кнопкой → обмен в логе → сделка traded
    const witch = st.deals.find((x) => x.player === 'MarshWitch')!
    await store.cardAction(witch.id, 'invite', () => 'ok')
    await log.write(lines.slice(7))
    expect(await until(() => store.getState().deals.find((x) => x.id === witch.id)?.status === 'traded')).toBe(true)
    log.off()
    await log.write([lines[2].replace('MarshWitch', 'AfterOff')])
    await new Promise((r) => setTimeout(r, 1300))
    st = store.getState()
    expect(st.deals.some((x) => x.player === 'AfterOff')).toBe(false)
    expect(st.deals).toHaveLength(4)
  })

  it('RU: те же сделки, камень quad-вкладки, ответ на RU', async () => {
    const store = new DealsStore(path.join(dir, 'd.json'), () => T0)
    const log = await storeOnGameLog(store)
    await log.write(fixture('client-ru.txt'))
    expect(await until(() => store.getState().deals.length === 4)).toBe(true)
    log.off()
    const st = store.getState()
    expect(st.deals.map((x) => x.player).sort()).toEqual(['Ведьма_Ладоги', 'Камнелюб', 'ЛунныйСтраж', 'Оптовик'].sort())
    const gem = st.deals.find((x) => x.player === 'Камнелюб')!
    expect(gem).toMatchObject({ lang: 'ru', gem: { level: 20, quality: 20 }, pos: { left: 24, top: 12 } })
    expect(st.quadTabs).toContain('камни')
    const sent: string[] = []
    const r = await store.cardAction(gem.id, 'sold', (c) => {
      sent.push(c)
      return 'ok'
    })
    expect(sent).toEqual(['@Камнелюб Извините, уже продано: Многократный удар.'])
    expect(r.result).toBe('ok')
    expect(r.state.deals.find((x) => x.id === gem.id)).toMatchObject({ status: 'sold', cardHidden: true })
    expect(r.state.ignoredCount).toBe(1)
  })
})

describe('DealsStore.cardAction — одна команда на нажатие', () => {
  async function storeWithEn(): Promise<{ store: DealsStore; deal: Deal }> {
    const store = new DealsStore(path.join(dir, 'd.json'), () => T0)
    const [deal] = await store.ingestLines(fixture('client-en.txt').slice(2, 3))
    return { store, deal }
  }

  it('каждая кнопка — ровно одна команда в чат', async () => {
    const { store, deal } = await storeWithEn()
    const expected: Record<DealCardAction, string> = {
      invite: '/invite MarshWitch',
      trade: '/tradewith MarshWitch',
      kick: '/kick MarshWitch',
      whois: '/whois MarshWitch',
      hideout: '/hideout MarshWitch',
      leave: '/leave',
      thanks: '@MarshWitch Thanks for the trade, good luck!',
      sold: '@MarshWitch Sorry, Storm Stride Two-Toned Boots is already sold.',
      still: '@MarshWitch Hi! Is Storm Stride Two-Toned Boots for 2 divine still available?',
      wait: '@MarshWitch One minute please, I will invite you soon.'
    }
    for (const [action, cmd] of Object.entries(expected) as [DealCardAction, string][]) {
      const sent: string[] = []
      const r = await store.cardAction(deal.id, action, (c) => {
        sent.push(c)
        return 'ok'
      })
      expect(sent, action).toEqual([cmd])
      expect(r.command).toBe(cmd)
    }
  })

  it('не ушло в игру — статус не меняется; неизвестная сделка — no-deal', async () => {
    const { store, deal } = await storeWithEn()
    const r = await store.cardAction(deal.id, 'invite', () => 'no-game')
    expect(r.result).toBe('no-game')
    expect(r.state.deals[0].status).toBe('new')
    const ok = await store.cardAction(deal.id, 'invite', async () => 'ok' as const)
    expect(ok.state.deals[0].status).toBe('invited')
    expect((await store.cardAction('нет', 'invite', () => 'ok')).result).toBe('no-deal')
  })

  it('кик и ✕ закрывают карточку, сделка остаётся в истории', async () => {
    const { store, deal } = await storeWithEn()
    await store.cardAction(deal.id, 'kick', () => 'ok')
    let st = store.getState()
    expect(st.deals[0].cardHidden).toBe(true)
    expect(activeCards(st.deals, st.config, T0)).toHaveLength(0)
    st = await store.hideCard(deal.id, false)
    expect(activeCards(st.deals, st.config, T0)).toHaveLength(1)
    st = await store.hideCard(deal.id)
    expect(st.deals).toHaveLength(1)
    expect(activeCards(st.deals, st.config, T0)).toHaveLength(0)
  })
})

describe('исходящая карточка — как у PoE Overlay', () => {
  // строка @To появляется, когда игрок отправил whisper сам: из окна цены (вставил скопированное или
  // «Написать»), из live search или со страницы сайта — формат один и тот же
  const P = '2026/10/28 21:40:30 74519951 cffb0658 [INFO Client 19012] '
  const OUT_EN =
    P + '@To MoonWarden: Hi, I would like to buy your Wanderer Path Hubris Circlet listed for 45 chaos in Settlers (stash tab "1"; position: left 2, top 5)'
  const OUT_RU =
    P + '@Кому ЛунныйСтраж: Здравствуйте, хочу купить у вас Путь Странника за 45 chaos в лиге Поселенцы (секция "1"; позиция: 2 столбец, 5 ряд)'
  const OUT_BULK = P + "@To CurrencyShop: Hi, I'd like to buy your 50 Chaos Orb for my 1 Divine Orb in Settlers."

  it.each([
    ['EN', OUT_EN, 'MoonWarden', 'en'],
    ['RU', OUT_RU, 'ЛунныйСтраж', 'ru'],
    ['bulk', OUT_BULK, 'CurrencyShop', 'en']
  ])('%s: @To → исходящая карточка с кнопками PoE Overlay', async (_name, line, player, lang) => {
    const store = new DealsStore(path.join(dir, 'd.json'), () => T0)
    const [deal] = await store.ingestLines([line])
    expect(deal).toMatchObject({ dir: 'out', player, lang, status: 'new' })
    const st = store.getState()
    const cards = activeCards(st.deals, st.config, T0)
    expect(cards.map((x) => x.id)).toEqual([deal.id])
    expect(cardActions(cards[0])).toEqual(['still', 'hideout', 'trade', 'thanks', 'leave', 'whois'])
  })

  it('каждая кнопка исходящей — ровно одна команда; убежище → в группе, выйти из группы → карточки нет', async () => {
    const store = new DealsStore(path.join(dir, 'd.json'), () => T0)
    const [deal] = await store.ingestLines([OUT_EN])
    const run = async (action: DealCardAction): Promise<string[]> => {
      const sent: string[] = []
      const r = await store.cardAction(deal.id, action, (c) => {
        sent.push(c)
        return 'ok'
      })
      expect(r.result, action).toBe('ok')
      return sent
    }
    expect(await run('still')).toEqual(['@MoonWarden Hi! Is Wanderer Path Hubris Circlet for 45 chaos still available?'])
    expect(await run('whois')).toEqual(['/whois MoonWarden'])
    expect(await run('hideout')).toEqual(['/hideout MoonWarden'])
    expect(store.getState().deals[0].status).toBe('invited')
    expect(await run('trade')).toEqual(['/tradewith MoonWarden'])
    expect(await run('leave')).toEqual(['/leave'])
    const st = store.getState()
    expect(st.deals[0]).toMatchObject({ status: 'invited', cardHidden: true })
    expect(activeCards(st.deals, st.config, T0)).toEqual([])
  })

  it('RU-сделка: «Ещё актуально?» — на языке сообщения', async () => {
    const store = new DealsStore(path.join(dir, 'd.json'), () => T0)
    const [deal] = await store.ingestLines([OUT_RU])
    const sent: string[] = []
    await store.cardAction(deal.id, 'still', (c) => {
      sent.push(c)
      return 'ok'
    })
    expect(sent).toEqual(['@ЛунныйСтраж Здравствуйте! Ещё продаёте Путь Странника за 45 chaos?'])
  })
})
