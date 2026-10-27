import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { EventEmitter } from 'events'
import { promises as fs, readFileSync } from 'fs'
import os from 'os'
import path from 'path'
import type { Deal, DealCardAction } from '@shared/types'
import { CARD_TTL_MS, activeCards, ageParts, cardActions, cardEffect, topCard } from '@shared/deals/cards'
import { defaultDealsConfig } from '@shared/deals/history'
import { DealsStore, attachLogSource } from '../../src/main/services/dealsStore'

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
    expect(activeCards(list, cfg, T0).map((x) => x.id)).toEqual(['b', 'a'])
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
    expect(cardActions(d({ dir: 'out' }))).toEqual(['still', 'hideout', 'thanks', 'whois'])
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
    for (const a of ['wait', 'whois', 'still', 'hideout'] as DealCardAction[]) expect(cardEffect(a, d({}), cfg)).toEqual({})
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

/** Фейковый LogTailer после патча: событие 'lines' пачками за опрос. */
class FakeTailer extends EventEmitter {
  push(lines: string[]): void {
    this.emit('lines', lines)
  }
}

async function flush(): Promise<void> {
  for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 5))
}

describe("attachLogSource — подписка на 'lines' (фикстуры)", () => {
  it('EN: сделки, карточки, Trade accepted закрывает приглашённую', async () => {
    const store = new DealsStore(path.join(dir, 'd.json'), () => T0)
    const tail = new FakeTailer()
    const off = attachLogSource(tail, store)
    const lines = fixture('client-en.txt')
    const newDeals: string[] = []
    store.on('deal', (x: Deal) => newDeals.push(x.player))
    tail.push(lines.slice(0, 7)) // до «joined»
    await flush()
    expect(newDeals).toEqual(['MarshWitch', 'GemBuyer', 'BulkGuy', 'MoonWarden'])
    let st = store.getState()
    // исходящая скрыта (showOutgoing выключен), свежие сверху
    expect(activeCards(st.deals, st.config, T0).map((x) => x.player)).toEqual(['BulkGuy', 'GemBuyer', 'MarshWitch'])
    // игрок пригласил покупателя кнопкой → обмен в логе → сделка traded
    const witch = st.deals.find((x) => x.player === 'MarshWitch')!
    await store.cardAction(witch.id, 'invite', () => 'ok')
    tail.push(lines.slice(7))
    await flush()
    st = store.getState()
    expect(st.deals.find((x) => x.id === witch.id)?.status).toBe('traded')
    off()
    tail.push(lines.slice(2, 3))
    await flush()
    expect(store.getState().deals).toHaveLength(4)
  })

  it('RU: те же сделки, камень quad-вкладки, ответ на RU', async () => {
    const store = new DealsStore(path.join(dir, 'd.json'), () => T0)
    const tail = new FakeTailer()
    attachLogSource(tail, store)
    tail.push(fixture('client-ru.txt'))
    await flush()
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
