// Формат данных «Торговца» (S27) — что пишет tools/regex/build-vendor-data.mjs в vendorData.ts.

import type { RegexLang, VendorItemClass, VendorModKey, VendorRarity } from '../types/regex'

/**
 * Почему строка может задеть чужое свойство: minions — та же строка у приспешников («Minions have …»),
 * negative — та же строка с минусом («-1 к уровню …»), gems — описание камня («Cursed enemies take …»).
 */
export type VendorSideReason = 'minions' | 'negative' | 'gems'

export interface VendorModPattern {
  /** Свои строки свойства как в подсказке игры (числа → #) — для подсказки в UI. */
  text: string[]
  /** Порог «≥ N»: <pre><atLeast(N)><post>; digit — чем обозначать цифру в atLeast. */
  pre?: string
  post?: string
  digit?: '.' | '\\d'
  /** Свойство без порога: готовый фрагмент (может быть «a|b»). */
  token?: string
  /** Чьи строки строка заденет неизбежно (без ^ и $ не отделить). */
  also?: VendorModKey[]
  side?: VendorSideReason[]
}

export interface VendorLangData {
  mods: Record<VendorModKey, VendorModPattern>
  /** Класс → фрагмент строки «Item Class: …» (с «:»). */
  classes: Record<VendorItemClass, string>
  /** Редкость → фрагмент строки «Rarity: …». */
  rarity: Record<VendorRarity, string>
  /** Терм-исключение «Item Level: 84» для фильтра «уровень камня» (у камней этой строки нет). */
  notItemLevel: string
}

export type VendorData = Record<RegexLang, VendorLangData>
