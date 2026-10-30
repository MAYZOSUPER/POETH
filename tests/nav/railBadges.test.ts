import { describe, expect, it } from 'vitest'
import type { Deal, LiveSnapshot, UiLang } from '@shared/types'
import {
  accelText,
  badgeFor,
  badgeText,
  countText,
  countTitle,
  dealsCount,
  isOpenOffer,
  itemLabel,
  liveCount,
  lockOffText,
  nextSeen
} from '@renderer/panels/railBadges'
import { DOMAIN_DICTS } from '../../src/renderer/src/i18n/dicts'

// Счётчики на иконках рельса и плашка «Сквозной режим» (S32): чистая логика railBadges.ts.

function tr(lang: UiLang) {
  const dict: Record<string, string> = {}
  for (const d of Object.values(DOMAIN_DICTS)) Object.assign(dict, d[lang])
  return (key: string, params?: Record<string, string | number>): string => {
    let s = dict[key] ?? key
    for (const [k, v] of Object.entries(params ?? {})) s = s.replace(`{${k}}`, String(v))
    return s
  }
}
const ru = tr('ru')
const en = tr('en')

let seq = 0
function deal(over: Partial<Deal> = {}): Deal {
  seq++
  return {
    id: `d${seq}`,
    dir: 'in',
    player: `Buyer${seq}`,
    item: 'Tabula Rasa',
    price: '5 chaos',
    league: 'Settlers',
    bulk: false,
    lang: 'en',
    ts: 1_700_000_000_000 + seq * 1000,
    status: 'new',
    ...over
  }
}

function snap(enabled: boolean, active: number): LiveSnapshot {
  return {
    options: { enabled, sound: true, notifyWindows: false },
    searches: [],
    active,
    max: 10,
    loggedIn: true,
    recent: []
  }
}

describe('счётчик Live — активные поиски (как на макете)', () => {
  it('нет состояния — 0', () => {
    expect(liveCount(null)).toBe(0)
    expect(liveCount(undefined)).toBe(0)
  })
  it('live search выключен главным выключателем — 0, даже если поиски включены', () => {
    expect(liveCount(snap(false, 3))).toBe(0)
  })
  it('включён — число активных поисков', () => {
    expect(liveCount(snap(true, 3))).toBe(3)
    expect(liveCount(snap(true, 0))).toBe(0)
  })
})

describe('счётчик «Сделки» — новые предложения', () => {
  it('предложение — только входящее без ответа, не пример и с открытой карточкой', () => {
    expect(isOpenOffer(deal())).toBe(true)
    expect(isOpenOffer(deal({ dir: 'out' }))).toBe(false)
    for (const status of ['invited', 'traded', 'sold', 'ignored'] as const) expect(isOpenOffer(deal({ status }))).toBe(false)
    expect(isOpenOffer(deal({ demo: true }))).toBe(false)
    expect(isOpenOffer(deal({ cardHidden: true }))).toBe(false)
  })

  it('пока состояние «Сделок» не пришло — 0', () => {
    expect(nextSeen(null, undefined, false)).toBeNull()
    expect(dealsCount(undefined, null)).toBe(0)
    expect(dealsCount([deal()], null)).toBe(0)
  })

  it('история до запуска не «новая»: первое состояние видено целиком', () => {
    const old = [deal(), deal()]
    const seen = nextSeen(null, old, false)
    expect(dealsCount(old, seen)).toBe(0)
  })

  it('сценарий: пришло — +1, открыли «Сделки» — 0, пока открыты — не растёт, ушли — снова считает', () => {
    const d1 = deal()
    let deals = [d1]
    let seen = nextSeen(null, deals, false)

    const d2 = deal()
    deals = [d2, d1]
    seen = nextSeen(seen, deals, false)
    expect(dealsCount(deals, seen)).toBe(1)

    seen = nextSeen(seen, deals, true) // вкладка «Сделки» на экране
    expect(dealsCount(deals, seen)).toBe(0)

    const d3 = deal()
    deals = [d3, d2, d1]
    seen = nextSeen(seen, deals, true) // пришло, пока смотрим
    expect(dealsCount(deals, seen)).toBe(0)

    const d4 = deal()
    const d5 = deal({ dir: 'out' })
    deals = [d5, d4, d3, d2, d1]
    seen = nextSeen(seen, deals, false) // ушли на другую вкладку
    expect(dealsCount(deals, seen)).toBe(1)
  })

  it('ответили с карточки поверх игры (пригласили) или закрыли её — счётчик уменьшается без захода во вкладку', () => {
    const d1 = deal()
    const seen = nextSeen(null, [d1], false)
    const d2 = deal()
    const d3 = deal()
    expect(dealsCount([d3, d2, d1], seen)).toBe(2)
    expect(dealsCount([{ ...d3, status: 'invited' }, d2, d1], seen)).toBe(1)
    expect(dealsCount([d3, { ...d2, cardHidden: true }, d1], seen)).toBe(1)
  })

  it('ничего нового — тот же объект «просмотрено» (без лишней перерисовки)', () => {
    const deals = [deal(), deal()]
    const seen = nextSeen(null, deals, false)
    expect(nextSeen(seen, deals, true)).toBe(seen)
    expect(nextSeen(seen, [deal(), ...deals], false)).toBe(seen)
    expect(nextSeen(seen, undefined, true)).toBe(seen)
  })

  it('пример «Показать пример» не считается', () => {
    const seen = nextSeen(null, [], false)
    expect(dealsCount([deal({ demo: true }), deal({ demo: true })], seen)).toBe(0)
  })
})

describe('значок на пункте рельса', () => {
  it('только у Live и «Сделок», ноль не показывается', () => {
    const counts = { live: 3, deals: 0 }
    expect(badgeFor('live', counts)).toEqual({ kind: 'live', n: 3 })
    expect(badgeFor('deals', counts)).toBeNull()
    expect(badgeFor('deals', { live: 0, deals: 2 })).toEqual({ kind: 'deals', n: 2 })
    // S55: «Справочник» — новые и обновлённые статьи; нет числа — нет значка
    expect(badgeFor('guide', { live: 0, deals: 0, guide: 2 })).toEqual({ kind: 'guide', n: 2 })
    expect(badgeFor('guide', { live: 5, deals: 5 })).toBeNull()
    expect(countText(ru, { kind: 'guide', n: 2 })).toBe('новых статей: 2')
    expect(countText(en, { kind: 'guide', n: 2 })).toBe('new articles: 2')
    for (const tab of ['priceCheck', 'flip', 'advisor', 'wealth', 'regex', 'campaign'] as const) {
      expect(badgeFor(tab, { live: 5, deals: 5 })).toBeNull()
    }
  })

  it('больше 99 — «99+»', () => {
    expect(badgeText(7)).toBe('7')
    expect(badgeText(99)).toBe('99')
    expect(badgeText(100)).toBe('99+')
  })

  it('aria-label — название и счётчик одной фразой, RU и EN', () => {
    expect(itemLabel(ru, 'Сделки', { kind: 'deals', n: 2 })).toBe('Сделки, новых предложений: 2')
    expect(itemLabel(ru, 'Live', { kind: 'live', n: 3 })).toBe('Live, активных поисков live search: 3')
    expect(itemLabel(en, 'Trades', { kind: 'deals', n: 2 })).toBe('Trades, new offers: 2')
    expect(itemLabel(en, 'Live', { kind: 'live', n: 1 })).toBe('Live, active live searches: 1')
    expect(itemLabel(ru, 'Сделки', null)).toBe('Сделки')
  })

  it('подсказка и title — с заглавной буквы', () => {
    expect(countTitle(ru, { kind: 'deals', n: 2 })).toBe('Новых предложений: 2')
    expect(countTitle(en, { kind: 'live', n: 3 })).toBe('Active live searches: 3')
    expect(countText(en, { kind: 'live', n: 3 })).toBe('active live searches: 3')
  })
})

describe('плашка «Сквозной режим»', () => {
  it('сочетание — как в шапке: Control → Ctrl', () => {
    expect(accelText('Control+Shift+L')).toBe('Ctrl+Shift+L')
    expect(accelText('CommandOrControl+Alt+K')).toBe('Ctrl+Alt+K')
    expect(accelText('')).toBe('')
  })

  it('как снять: хоткей из настроек или меню трея (кнопка замка во время замка не нажимается)', () => {
    expect(lockOffText(ru, 'Control+Shift+L')).toBe('Снять — Ctrl+Shift+L или в меню значка POETH в трее.')
    expect(lockOffText(en, 'Alt+F9')).toBe('Turn it off with Alt+F9 or from the POETH tray icon menu.')
    expect(lockOffText(ru, '')).toBe('Снять — в меню значка POETH в трее.')
    expect(lockOffText(en, undefined)).toBe('Turn it off from the POETH tray icon menu.')
  })

  it('строки плашки и счётчиков есть в RU и EN', () => {
    const keys = ['nav.count.deals', 'nav.count.live', 'nav.item.withCount', 'nav.lock.title', 'nav.lock.text', 'nav.lock.off', 'nav.lock.off.tray']
    for (const d of [DOMAIN_DICTS.common.ru, DOMAIN_DICTS.common.en]) for (const k of keys) expect(d[k], k).toBeTruthy()
  })
})
