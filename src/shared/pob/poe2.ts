// Модель билда Path of Building для PoE 2 (S66; чистый модуль, tests/pob/poe2.test.ts).
// Корень <PathOfBuilding2> (или версии `0_x`) → то, что нужно экрану «Билд» PoE 2 и экспорту в игровой `.build`:
// класс и восхождение, деревья (<Spec>: ноды, ноды наборов оружия, выбор атрибута у нод «+5 к любому атрибуту»,
// гнёзда самоцветов), наборы камней, предметы по слотам, заметки. Разбор PoE 1 (model.ts) не меняется: тот же
// безопасный XML (xml.ts), те же пределы и чистка строк (pobXmlParts). В модель не попадают <Import>, <Calcs>,
// <TreeView>, <URL> дерева и посчитанные статы. Код PoE 1 узнаётся и не разбирается (ошибка `poe1`).

import { pobXmlParts as P, type PobItem, type PobItemSet, type PobJewelSocket, type PobSkillSet } from './model'
import { child, childrenOf, parseXml, XmlError, type XmlElement } from './xml'

/** Нод в одном Spec: в дереве PoE 2 ~5 тыс. нод вообще. */
const NODES_MAX = 6000

export interface Pob2Attributes {
  /** ноды «+5 к любому атрибуту», где выбрана сила / ловкость / интеллект (PoB2 <AttributeOverride>) */
  str: number[]
  dex: number[]
  int: number[]
}

export interface Pob2Spec {
  /** название без цветокодов: «Act 1», «Level 1-20», «Endgame»; '' — без названия */
  title: string
  /** версия дерева: `0_5` */
  treeVersion: string
  classId: number
  ascendClassId: number
  /** id восхождения в данных игры (`Huntress1`, как `ascendancy` в `.build`); null — без восхождения */
  ascendancy: string | null
  /** взятые ноды: hash (ключи `nodes` выгрузки дерева GGG), без повторов, в порядке PoB2 */
  nodes: number[]
  /** ноды, взятые очками набора оружия 1 и 2 (PoB2 <WeaponSet1/2 nodes>) */
  weaponSets: [number[], number[]]
  attributes: Pob2Attributes
  /** самоцветы в гнёздах дерева: id предмета из Pob2Build.items */
  sockets: PobJewelSocket[]
}

export interface Pob2Build {
  game: 'poe2'
  /** targetVersion из <Build> (`0_1`) */
  targetVersion: string
  level: number
  className: string
  /** null — без восхождения */
  ascendClassName: string | null
  /** главная группа камней активного набора (с 1), null — нет */
  mainSocketGroup: number | null
  specs: Pob2Spec[]
  /** индекс активного Spec в specs */
  activeSpec: number
  skillSets: PobSkillSet[]
  activeSkillSet: number
  items: PobItem[]
  itemSets: PobItemSet[]
  activeItemSet: number
  /** заметки автора без цветокодов */
  notes: string
  /** что пришлось пропустить или обрезать — для отладки и тестов */
  warnings: string[]
}

export type Pob2ParseError =
  | 'not-pob' // не XML или корень не PathOfBuilding (detail — код ошибки XML)
  | 'too-large' // предел глубины, числа элементов, длины атрибута или текста
  | 'poe1' // это билд Path of Exile 1

export type Pob2ParseResult = { ok: true; build: Pob2Build } | { ok: false; error: Pob2ParseError; detail?: string }

/** Билд PoE 2: корень PathOfBuilding2 или версии `0_x` (у PoE 1 — `3_x`). */
function isPoe2(root: XmlElement, build: XmlElement | null): boolean {
  if (root.name === 'PathOfBuilding2') return true
  if (/^0_/.test(build?.attrs.get('targetVersion') ?? '')) return true
  return childrenOf(child(root, 'Tree'), 'Spec').some((s) => /^0_/.test(s.attrs.get('treeVersion') ?? ''))
}

/** id восхождения (`Huntress1`): буквы, цифры, «_»; `nil` и пусто — нет. */
function ascendancyId(v: string | undefined): string | null {
  const s = (v ?? '').trim()
  return /^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(s) && s !== 'nil' && s !== 'None' ? s : null
}

function parseSpec(el: XmlElement): Pob2Spec {
  const sockets: PobJewelSocket[] = []
  for (const s of childrenOf(child(el, 'Sockets'), 'Socket')) {
    const nodeId = P.intOrNull(s.attrs.get('nodeId'))
    const itemId = P.intOrNull(s.attrs.get('itemId'))
    if (nodeId !== null && itemId) sockets.push({ nodeId, itemId })
  }
  const attr = child(child(el, 'Overrides'), 'AttributeOverride')
  return {
    title: P.short(el.attrs.get('title')),
    treeVersion: P.short(el.attrs.get('treeVersion'), 16),
    classId: P.int(el.attrs.get('classId'), 0, 0, 255),
    ascendClassId: P.int(el.attrs.get('ascendClassId'), 0, 0, 255),
    ascendancy: ascendancyId(el.attrs.get('ascendancyInternalId')),
    nodes: P.numberList(el.attrs.get('nodes'), NODES_MAX),
    weaponSets: [
      P.numberList(child(el, 'WeaponSet1')?.attrs.get('nodes'), NODES_MAX),
      P.numberList(child(el, 'WeaponSet2')?.attrs.get('nodes'), NODES_MAX)
    ],
    attributes: {
      str: P.numberList(attr?.attrs.get('strNodes'), NODES_MAX),
      dex: P.numberList(attr?.attrs.get('dexNodes'), NODES_MAX),
      int: P.numberList(attr?.attrs.get('intNodes'), NODES_MAX)
    },
    sockets
  }
}

/** XML PoB2 → модель. Ошибки XML и пределов — результат, а не исключение. */
export function parsePob2Xml(xml: string): Pob2ParseResult {
  let root: XmlElement
  try {
    root = parseXml(xml)
  } catch (e) {
    if (e instanceof XmlError) {
      const big = e.code === 'too-deep' || e.code === 'too-many-elements' || e.code === 'too-long' || e.code === 'too-many-attrs'
      return { ok: false, error: big ? 'too-large' : 'not-pob', detail: e.code }
    }
    throw e
  }
  if (root.name !== 'PathOfBuilding' && root.name !== 'PathOfBuilding2') return { ok: false, error: 'not-pob', detail: 'root' }
  const b = child(root, 'Build')
  if (!isPoe2(root, b)) return { ok: false, error: 'poe1' }
  if (!b) return { ok: false, error: 'not-pob', detail: 'no Build' }

  const warnings: string[] = []
  const tree = child(root, 'Tree')
  const specs = childrenOf(tree, 'Spec').map(parseSpec)
  const skills = P.parseSkills(child(root, 'Skills'))
  const items = P.parseItems(child(root, 'Items'), warnings)

  return {
    ok: true,
    build: {
      game: 'poe2',
      targetVersion: P.short(b.attrs.get('targetVersion'), 16),
      level: P.int(b.attrs.get('level'), 1, 1, 100),
      className: P.short(b.attrs.get('className'), 40),
      ascendClassName: P.opt(b.attrs.get('ascendClassName')),
      mainSocketGroup: P.intOrNull(b.attrs.get('mainSocketGroup'), 1, 1000),
      specs,
      activeSpec: specs.length ? P.int(tree?.attrs.get('activeSpec'), 1, 1, specs.length) - 1 : 0,
      skillSets: skills.sets,
      activeSkillSet: skills.active,
      items: items.items,
      itemSets: items.sets,
      activeItemSet: items.active,
      notes: P.parseNotes(child(root, 'Notes'), warnings),
      warnings
    }
  }
}
