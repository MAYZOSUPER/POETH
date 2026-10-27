import { describe, expect, it } from 'vitest'
import type { Deal } from '@shared/types'
import { parseLogLine, type WhisperEvent } from '@shared/deals/whisperParse'
import {
  IGNORE_TTL_MS,
  REPEAT_WINDOW_MS,
  addDeal,
  applyDealsConfigPatch,
  applySystemEvent,
  clearDeals,
  dealFromWhisper,
  dealsToCsv,
  defaultDealsConfig,
  emptyDealsFile,
  filterDeals,
  ignoreKey,
  isKnownQuadTab,
  normalizeDealsConfig,
  normalizeDealsFile,
  removeDeal,
  setDealStatus,
  withConfig
} from '@shared/deals/history'

const T0 = new Date(2026, 9, 28, 21, 40, 0).getTime()
const P = '2026/10/28 21:40:00 1000 abcdef12 [INFO Client 1] '
const IN_EN =
  P + '@From <GG> MarshWitch: Hi, I would like to buy your Storm Stride Two-Toned Boots listed for 2 divine in Settlers (stash tab "Sale"; position: left 7, top 3)'
const IN_RU =
  P + '@От кого Ведьма_Ладоги: Здравствуйте, хочу купить у вас Петля Рока за 1,5 divine в лиге Поселенцы (секция "Продажа"; позиция: 14 столбец, 3 ряд) торг?'

let seq = 0
function deal(line: string, now = T0): Deal {
  const ev = parseLogLine(line) as WhisperEvent
  return dealFromWhisper(ev, `d${++seq}`, now)!
}

describe('dealFromWhisper', () => {
  it('EN: поля сделки', () => {
    const d = deal(IN_EN)
    expect(d).toMatchObject({
      dir: 'in',
      player: 'MarshWitch',
      guild: 'GG',
      item: 'Storm Stride Two-Toned Boots',
      price: '2 divine',
      priceValue: { amount: 2, currency: 'divine' },
      league: 'Settlers',
      tab: 'Sale',
      pos: { left: 7, top: 3 },
      bulk: false,
      lang: 'en',
      ts: T0,
      status: 'new'
    })
    expect(d.raw).toContain('Storm Stride')
  })

  it('RU: приписка и quad-позиция', () => {
    const d = deal(IN_RU)
    expect(d).toMatchObject({ lang: 'ru', player: 'Ведьма_Ладоги', message: 'торг?', pos: { left: 14, top: 3 } })
  })

  it('обычный разговор — не сделка', () => {
    const ev = parseLogLine(P + '@From X: ty') as WhisperEvent
    expect(dealFromWhisper(ev, 'x', T0)).toBeNull()
  })
})

describe('addDeal — повторы, игнор, лимит', () => {
  it('новая сделка наверху', () => {
    const r = addDeal(emptyDealsFile(), deal(IN_EN), T0)
    expect(r.kind).toBe('added')
    expect(r.data.deals).toHaveLength(1)
  })

  it('повтор того же сообщения поднимает старую сделку', () => {
    const a = addDeal(emptyDealsFile(), deal(IN_EN), T0)
    const again = { ...deal(IN_EN), ts: T0 + 60_000, message: 'still?' }
    const b = addDeal(a.data, again, T0 + 60_000)
    expect(b.kind).toBe('repeated')
    expect(b.data.deals).toHaveLength(1)
    expect(b.deal.id).toBe(a.deal.id)
    expect(b.deal.ts).toBe(T0 + 60_000)
    expect(b.deal.message).toBe('still?')
  })

  it('повтор позже окна — новая сделка', () => {
    const a = addDeal(emptyDealsFile(), deal(IN_EN), T0)
    const late = { ...deal(IN_EN), ts: T0 + REPEAT_WINDOW_MS + 1 }
    expect(addDeal(a.data, late, late.ts).kind).toBe('added')
  })

  it('«продано» → предмет в игноре, следующая входящая на него — ignored', () => {
    const a = addDeal(emptyDealsFile(), deal(IN_EN), T0)
    const sold = setDealStatus(a.data, a.deal.id, 'sold', T0 + 1000)
    expect(sold.deals[0].status).toBe('sold')
    expect(sold.deals[0].updatedAt).toBe(T0 + 1000)
    expect(sold.ignored).toHaveLength(1)
    const other = { ...deal(IN_EN.replace('MarshWitch', 'Other')), ts: T0 + 5000 }
    const b = addDeal(sold, other, T0 + 5000)
    expect(b.kind).toBe('added')
    expect(b.deal.status).toBe('ignored')
    // через сутки игнор истекает
    const later = { ...deal(IN_EN.replace('MarshWitch', 'Third')), ts: T0 + IGNORE_TTL_MS + 2000 }
    expect(addDeal(b.data, later, later.ts).deal.status).toBe('new')
  })

  it('лимит истории обрезает самые старые', () => {
    let data = withConfig(emptyDealsFile(), normalizeDealsConfig({ historyLimit: 20 }))
    for (let i = 0; i < 25; i++) {
      const d = { ...deal(IN_EN.replace('MarshWitch', `P${i}`)), ts: T0 + i }
      data = addDeal(data, d, d.ts).data
    }
    expect(data.deals).toHaveLength(20)
    expect(data.deals[0].player).toBe('P24')
    expect(data.deals.at(-1)?.player).toBe('P5')
  })

  it('уменьшение лимита применяется сразу; меньше 20 не бывает', () => {
    let data = emptyDealsFile()
    for (let i = 0; i < 30; i++) data = addDeal(data, { ...deal(IN_EN.replace('MarshWitch', `P${i}`)), ts: T0 + i }, T0).data
    expect(data.deals).toHaveLength(30)
    const cut = withConfig(data, applyDealsConfigPatch(data.config, { historyLimit: 5 }))
    expect(cut.config.historyLimit).toBe(20)
    expect(cut.deals).toHaveLength(20)
  })

  it('вкладка с позицией > 12 запоминается как quad', () => {
    const r = addDeal(emptyDealsFile(), deal(IN_RU), T0)
    expect(isKnownQuadTab(r.data.quadTabs, 'продажа')).toBe(true)
    expect(isKnownQuadTab(r.data.quadTabs, 'Sale')).toBe(false)
  })
})

describe('статусы и системные события', () => {
  it('Trade accepted → последняя приглашённая сделка traded', () => {
    const a = addDeal(emptyDealsFile(), deal(IN_EN), T0)
    const inv = setDealStatus(a.data, a.deal.id, 'invited', T0 + 1000)
    const r = applySystemEvent(inv, { kind: 'tradeAccepted', lang: 'en' }, T0 + 60_000)
    expect(r.changedId).toBe(a.deal.id)
    expect(r.data.deals[0].status).toBe('traded')
    // без приглашённых — ничего
    expect(applySystemEvent(a.data, { kind: 'tradeAccepted', lang: 'en' }, T0).changedId).toBeNull()
    expect(applySystemEvent(inv, { kind: 'joined', player: 'x', lang: 'en' }, T0).changedId).toBeNull()
  })

  it('удаление и очистка (в т.ч. только примеров)', () => {
    let data = addDeal(emptyDealsFile(), deal(IN_EN), T0).data
    data = addDeal(data, { ...deal(IN_RU), demo: true }, T0).data
    expect(clearDeals(data, true).deals).toHaveLength(1)
    // проданный пример уходит из игнора вместе с примерами, настоящий — остаётся
    const demoId = data.deals.find((d) => d.demo)!.id
    const realId = data.deals.find((d) => !d.demo)!.id
    const sold = setDealStatus(setDealStatus(data, demoId, 'sold', T0), realId, 'sold', T0)
    expect(sold.ignored).toHaveLength(2)
    expect(clearDeals(sold, true).ignored.map((x) => x.item)).toEqual(['Storm Stride Two-Toned Boots'])
    expect(clearDeals(sold).ignored).toHaveLength(2)
    expect(clearDeals(data).deals).toHaveLength(0)
    expect(removeDeal(data, data.deals[0].id).deals).toHaveLength(1)
    expect(setDealStatus(data, 'нет-такой', 'sold', T0)).toBe(data)
  })
})

describe('фильтры', () => {
  const a = deal(IN_EN)
  const b = { ...deal(IN_RU), status: 'sold' as const }
  const c = { ...deal(IN_EN.replace('@From <GG> MarshWitch', '@To Seller')), dir: 'out' as const }
  const all = [a, b, c]
  it('по направлению, проданным и поиску по игроку/предмету', () => {
    expect(filterDeals(all, 'all')).toHaveLength(3)
    expect(filterDeals(all, 'in')).toEqual([a, b])
    expect(filterDeals(all, 'out')).toEqual([c])
    expect(filterDeals(all, 'sold')).toEqual([b])
    expect(filterDeals(all, 'all', 'ведьма')).toEqual([b])
    expect(filterDeals(all, 'all', 'storm')).toEqual([a, c])
  })
})

describe('настройки и файл', () => {
  it('мусор → дефолты; шаблоны без переводов строк', () => {
    expect(normalizeDealsConfig(null)).toEqual(defaultDealsConfig())
    const c = normalizeDealsConfig({ sound: 'yes', historyLimit: 3, replyLang: 'de', templates: { ru: { thanks: 'a\nb' } } })
    expect(c.sound).toBe(true)
    expect(c.historyLimit).toBe(20)
    expect(c.replyLang).toBe('auto')
    expect(c.templates.ru.thanks).toBe('a b')
    expect(c.templates.en).toEqual(defaultDealsConfig().templates.en)
  })

  it('патч шаблона не трогает остальные', () => {
    const c = applyDealsConfigPatch(defaultDealsConfig(), { templates: { en: { sold: 'gone' } }, sound: false })
    expect(c.templates.en.sold).toBe('gone')
    expect(c.templates.en.thanks).toBe(defaultDealsConfig().templates.en.thanks)
    expect(c.sound).toBe(false)
  })

  it('normalizeDealsFile отбрасывает битые записи и просроченный игнор', () => {
    const good = deal(IN_EN)
    const raw = {
      deals: [good, { id: 1 }, null],
      ignored: [
        { key: ignoreKey(good), item: good.item, ts: T0 },
        { key: 'old', item: 'x', ts: T0 - IGNORE_TTL_MS - 1 }
      ],
      quadTabs: ['q', 5]
    }
    const f = normalizeDealsFile(raw, T0)
    expect(f.deals).toEqual([good])
    expect(f.ignored.map((x) => x.key)).toEqual([ignoreKey(good)])
    expect(f.quadTabs).toEqual(['q'])
    expect(normalizeDealsFile('мусор', T0)).toEqual(emptyDealsFile())
  })
})

describe('экспорт CSV', () => {
  it('BOM, заголовок, кавычки и кириллица', () => {
    const csv = dealsToCsv([deal(IN_RU)])
    expect(csv.startsWith('﻿date,dir,status,player,item')).toBe(true)
    expect(csv).toContain('Ведьма_Ладоги,Петля Рока,,"1,5 divine",Поселенцы')
    expect(csv).toContain(',Продажа,14,3,торг?')
  })
})
