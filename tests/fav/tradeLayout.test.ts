import { describe, expect, it } from 'vitest'
import {
  BAR_HEIGHT,
  RAIL_WIDE_WIDTH,
  RAIL_WIDTH,
  SIDEBAR_WIDTH,
  TITLE_HEIGHT,
  TRADE_RAIL_INLINE_MIN,
  tradeLayout,
  tradeRail
} from '../../src/main/windows/tradeLayout'
import { RAIL_INLINE_MIN, normalizeRailPref, railWide } from '@shared/rail'
import { RAIL_INLINE_MIN as NAV_INLINE_MIN, railWide as navRailWide } from '../../src/renderer/src/tabs'

// Разметка трейд-окна (S58): своя шапка обычного окна, рельс сайтов свёрнут / развёрнут, колонка избранного.
// Числа — те же, что в trade-sidebar.css и .ui-rail (styles/components.css).

const base = { width: 1280, height: 820, overGame: false, sites: true, railWide: false, sidebarCollapsed: false }

describe('tradeLayout — где лежат вью сайтов', () => {
  it('обычное окно: под шапкой и адресной строкой, правее рельса и избранного', () => {
    const top = TITLE_HEIGHT + BAR_HEIGHT
    expect(tradeLayout(base)).toEqual({
      site: { x: RAIL_WIDTH + SIDEBAR_WIDTH, y: top, width: 1280 - 52 - 300, height: 820 - top },
      tabs: { x: RAIL_WIDTH, y: top, width: 1280 - 52, height: 820 - top }
    })
  })

  it('поверх игры шапки нет — шапка там адресная строка', () => {
    const l = tradeLayout({ ...base, overGame: true })
    expect(l.site.y).toBe(BAR_HEIGHT)
    expect(l.tabs.y).toBe(BAR_HEIGHT)
  })

  it('развёрнутый рельс сдвигает сайт и вкладки сайтов', () => {
    const l = tradeLayout({ ...base, railWide: true })
    expect(l.site.x).toBe(RAIL_WIDE_WIDTH + SIDEBAR_WIDTH)
    expect(l.tabs.x).toBe(RAIL_WIDE_WIDTH)
    expect(l.tabs.width).toBe(1280 - RAIL_WIDE_WIDTH)
  })

  it('избранное свёрнуто — сайт сразу правее рельса; у PoE 2 рельса нет вовсе', () => {
    expect(tradeLayout({ ...base, sidebarCollapsed: true }).site.x).toBe(RAIL_WIDTH)
    expect(tradeLayout({ ...base, sites: false, railWide: true }).site.x).toBe(SIDEBAR_WIDTH)
  })

  it('крошечное окно — без отрицательных размеров', () => {
    const l = tradeLayout({ ...base, width: 100, height: 50 })
    expect(l.site.width).toBe(0)
    expect(l.site.height).toBe(0)
  })

  it('ширины — как у .ui-rail рельса компаньона', () => {
    expect([RAIL_WIDTH, RAIL_WIDE_WIDTH]).toEqual([52, 188])
  })
})

describe('tradeRail — развёрнут ли рельс (правила рельса компаньона)', () => {
  it('порог — 820 компаньона плюс колонка избранного', () => {
    expect(TRADE_RAIL_INLINE_MIN).toBe(RAIL_INLINE_MIN + SIDEBAR_WIDTH)
    expect(tradeRail(TRADE_RAIL_INLINE_MIN, 'wide', false)).toEqual({ room: true, wide: true })
    expect(tradeRail(TRADE_RAIL_INLINE_MIN - 1, 'wide', true)).toEqual({ room: false, wide: false })
  })

  it('не выбирал — простой режим развёрнут, экспертный свёрнут; выбор игрока важнее режима', () => {
    expect(tradeRail(1280, null, true).wide).toBe(true)
    expect(tradeRail(1280, null, false).wide).toBe(false)
    expect(tradeRail(1280, 'narrow', true).wide).toBe(false)
    expect(tradeRail(1280, 'wide', false).wide).toBe(true)
  })

  it('поверх игры 1920×1080 (окно 1344) — рядом; 1366×768 (окно 956) — шторкой', () => {
    expect(tradeRail(1344, null, true).room).toBe(true)
    expect(tradeRail(956, null, true)).toEqual({ room: false, wide: false })
  })

  it('NavRail берёт те же правила из @shared/rail (не копия)', () => {
    expect(navRailWide).toBe(railWide)
    expect(NAV_INLINE_MIN).toBe(RAIL_INLINE_MIN)
  })

  it('выбор из файла: только wide / narrow', () => {
    expect(normalizeRailPref('wide')).toBe('wide')
    expect(normalizeRailPref('narrow')).toBe('narrow')
    for (const v of ['WIDE', '', null, undefined, 1, {}, ['wide']]) expect(normalizeRailPref(v)).toBeNull()
  })
})
