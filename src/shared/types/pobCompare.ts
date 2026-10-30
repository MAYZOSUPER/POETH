// Типы «Точного расчёта (PoB)» блока «Против надетого» (S44, бета): запрос окна цены и ответ main.
// Текст вещей (EN) идёт из окна в main и в локальный процесс движка только в памяти — на диск не пишется.

import type { EquipAttribute, EquipElement, EquipGearSlot } from './equip'

/** Запрос окна цены: предмет и варианты слотов (как в упрощённом сравнении), надетые вещи с текстом (этот сеанс). */
export interface PobCompareRequest {
  /** текст предмета для PoB (EN; RU пересобран окном — pobItemEn.ts) */
  item: string
  /** варианты замены: [['Ring 1'], ['Ring 2']], [['Weapon 1', 'Weapon 2']] (двуручное против пары) */
  options: EquipGearSlot[][]
  /** надетые вещи, текст которых окно видело в этом сеансе (Ctrl+D по надетой, «Запомнить») */
  worn: Array<{ slot: EquipGearSlot; item: string }>
}

export type PobCompareError =
  | 'off' // бета выключена или вкладка «Билд» скрыта
  | 'no-build' // нет активного билда во вкладке «Билд»
  | 'no-engine' // движок не установлен (сборка без vendor/pob-engine)
  | 'unavailable' // движок падал несколько раз подряд — пауза
  | 'timeout'
  | 'crashed'
  | 'bad-input'
  | 'build' // PoB не загрузил билд
  | 'item' // PoB не узнал предмет
  | 'kind' // флакон, самоцвет — движок их не сравнивает
  | 'internal'

/** Число до и после; pct — изменение в процентах (null — «до» ноль). */
export interface PobDelta {
  before: number
  after: number
  pct: number | null
}

export interface PobResRow {
  el: EquipElement
  /** сопротивление с учётом капа (как в окне персонажа) */
  before: number
  after: number
  cap: number
  /** был на капе — станет ниже */
  lost: boolean
  /** был ниже капа — дойдёт */
  reach: boolean
  /** после — ниже капа */
  below: boolean
}

export interface PobAttrRow {
  a: EquipAttribute
  /** сколько будет после замены и сколько требуют камни и вещи */
  have: number
  need: number
}

export interface PobOptionResult {
  ok: boolean
  /** не подходит для слота */
  error?: 'slot'
  /** чей урон: весь билд (Full DPS), главный навык, приспешники */
  dpsKind?: 'full' | 'combined' | 'minion'
  dps?: PobDelta
  ehp?: PobDelta
  life?: PobDelta
  es?: PobDelta
  /** сопротивления, которые изменятся (огонь, холод, молния, хаос) */
  res: PobResRow[]
  /** атрибутов не хватит после замены (камни или вещи отключатся) */
  short: PobAttrRow[]
  /** против чего: надетой вещи (текст этого сеанса), вещи этапа билда, пустого слота */
  against: 'worn' | 'build' | 'empty'
}

export interface PobCompareOk {
  ok: true
  options: PobOptionResult[]
  /** название этапа билда, по которому считали ('' — активный набор автора) */
  stage: string
  /** уровень персонажа в расчёте и требование уровня предмета */
  level: number
  reqLevel: number
  /** строки предмета, которые PoB не понял (не учтены) */
  unsupported: string[]
  /** версия PoB движка (`v2.67.2`) */
  pob: string
  /** мс: старт движка (если стартовал для этого запроса) и сам расчёт с загрузкой билда */
  ms: { start: number | null; calc: number }
}

export type PobCompareResponse = PobCompareOk | { ok: false; error: PobCompareError }
