import type { Rectangle } from 'electron'
import { RAIL_INLINE_MIN, railWide, type RailPref } from '@shared/rail'

// Разметка трейд-окна (S5, S43, S58), без electron — tests/fav/tradeLayout.test.ts. Сайдбар (наша страница) лежит
// на всё окно и рисует шапку, рельс, колонку избранного и адресную строку; вью сайтов — поверх него, правее и ниже.
// Числа совпадают с trade-sidebar.css и .ui-rail в styles/components.css.

/** ширина колонки избранного и высота адресной строки */
export const SIDEBAR_WIDTH = 300
export const BAR_HEIGHT = 40
/** своя шапка обычного окна: значок, название, «свернуть / развернуть / закрыть» (S58). Поверх игры её нет —
 *  там шапка окна — адресная строка (место над игрой дороже) */
export const TITLE_HEIGHT = 32
/** рельс вкладок сайтов (PoE 1): свёрнут — значки, развёрнут — с названиями (.ui-rail, .ui-rail--wide) */
export const RAIL_WIDTH = 52
export const RAIL_WIDE_WIDTH = 188
/**
 * Развёрнутый рельс встаёт рядом с сайтом, если окно не уже этого: рельс + сайт — те же 820 px, что окно компаньона
 * (RAIL_INLINE_MIN), плюс колонка избранного. Порог один для всех вкладок и не зависит от того, свёрнута ли колонка:
 * переключение вкладок и избранного не перекладывает рельс. На окне уже — развёрнутый открывается поверх, шторкой.
 */
export const TRADE_RAIL_INLINE_MIN = RAIL_INLINE_MIN + SIDEBAR_WIDTH

/** Хватает ли окну места под развёрнутый рельс рядом с сайтом и развёрнут ли он (правила рельса компаньона). */
export function tradeRail(width: number, pref: RailPref | null, simple: boolean): { room: boolean; wide: boolean } {
  const room = width >= TRADE_RAIL_INLINE_MIN
  return { room, wide: railWide(room, pref, simple) }
}

export interface TradeLayoutInput {
  /** клиентская область окна */
  width: number
  height: number
  /** поверх игры — без своей шапки */
  overGame: boolean
  /** вкладки сайтов включены (рельс есть только у PoE 1) */
  sites: boolean
  /** рельс развёрнут рядом с сайтом (tradeRail().wide) */
  railWide: boolean
  /** колонка избранного свёрнута */
  sidebarCollapsed: boolean
}

export interface TradeLayout {
  /** сайт трейда (вкладка «Трейд»): правее рельса и колонки избранного */
  site: Rectangle
  /** вью вкладок сайтов: правее рельса (колонки избранного у них нет) */
  tabs: Rectangle
}

export function tradeLayout(i: TradeLayoutInput): TradeLayout {
  const top = (i.overGame ? 0 : TITLE_HEIGHT) + BAR_HEIGHT
  const rail = !i.sites ? 0 : i.railWide ? RAIL_WIDE_WIDTH : RAIL_WIDTH
  const side = rail + (i.sidebarCollapsed ? 0 : SIDEBAR_WIDTH)
  const height = Math.max(0, i.height - top)
  return {
    site: { x: side, y: top, width: Math.max(0, i.width - side), height },
    tabs: { x: rail, y: top, width: Math.max(0, i.width - rail), height }
  }
}
