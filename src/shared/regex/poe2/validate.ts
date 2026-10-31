// Проверка файла данных regex PoE 2 (S62): main читает его сначала из userData/data (обновление без переустановки),
// и битый или старый файл не должен ронять страницу. Проверяем всё, что нужно движку и страницам; токены и метки —
// ещё и как регулярки. Не прошёл — main берёт встроенный файл.

import type { Poe2RegexData } from '../../types/regex'
import { TABLET_TYPES } from './tablet'
import { POE2_ITEM_CLASSES, POE2_VENDOR_KEYS } from './vendor'
import { WAYSTONE_LABEL_KEYS } from './waystone'
import { POE2_RARITIES } from './common'

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const isStr = (v: unknown): v is string => typeof v === 'string'
const strList = (v: unknown): boolean => Array.isArray(v) && v.every(isStr)

/** Строка — рабочая регулярка (как её соберёт движок). */
function isRe(v: unknown): boolean {
  if (!isStr(v) || !v) return false
  try {
    new RegExp(v, 'i')
    return true
  } catch {
    return false
  }
}

/** Все ключи есть и значения — регулярки. */
const reMap = (v: unknown, keys: readonly string[]): boolean => isObj(v) && keys.every((k) => isRe(v[k]))
const strMap = (v: unknown, keys: readonly string[]): boolean => isObj(v) && keys.every((k) => isStr(v[k]))

function isMods(v: unknown): boolean {
  return (
    Array.isArray(v) &&
    v.every(
      (m) =>
        isObj(m) &&
        isStr(m.id) &&
        isStr(m.text) &&
        isStr(m.display) &&
        isRe(m.token) &&
        isStr(m.kind) &&
        strList(m.tags) &&
        (m.head === undefined || isStr(m.head)) &&
        (m.alsoMatches === undefined || strList(m.alsoMatches)) &&
        (m.trade === undefined || strList(m.trade)) &&
        (m.types === undefined || strList(m.types))
    )
  )
}

function isSection(v: unknown): v is Obj {
  return isObj(v) && isMods(v.mods) && strList(v.extra) && (v.rareWords === undefined || strList(v.rareWords))
}

export function isPoe2RegexData(v: unknown): v is Poe2RegexData {
  if (!isObj(v) || !isObj(v.meta) || !isStr(v.meta.lang)) return false
  const w = v.waystone
  if (
    !isSection(w) ||
    !reMap(w.labels, WAYSTONE_LABEL_KEYS) ||
    !isRe(w.tier) ||
    !reMap(w.rarity, POE2_RARITIES) ||
    !reMap(w.flags, ['corrupted', 'unidentified'])
  ) {
    return false
  }
  const t = v.tablet
  if (
    !isSection(t) ||
    !reMap(t.types, TABLET_TYPES) ||
    !strMap(t.names, TABLET_TYPES) ||
    !strMap(t.tradeType, TABLET_TYPES) ||
    !isObj(t.uses) ||
    !isStr(t.uses.pre) ||
    !isStr(t.uses.post) ||
    !isRe(`${t.uses.pre}1${t.uses.post}`) ||
    !reMap(t.rarity, POE2_RARITIES)
  ) {
    return false
  }
  const s = v.vendor
  if (
    !isObj(s) ||
    !isObj(s.props) ||
    !reMap(s.classes, POE2_ITEM_CLASSES) ||
    !strMap(s.classNames, POE2_ITEM_CLASSES) ||
    !reMap(s.rarity, POE2_RARITIES) ||
    !isRe(s.sockets) ||
    !isRe(s.quality)
  ) {
    return false
  }
  const props = s.props
  return POE2_VENDOR_KEYS.every((k) => {
    const p = props[k]
    if (!isObj(p) || !strList(p.text)) return false
    if (p.token !== undefined) return isRe(p.token)
    return (
      isStr(p.pre) &&
      strList(p.posts) &&
      (p.posts as string[]).length > 0 &&
      isRe(`${p.pre}1(${(p.posts as string[]).join('|')})`)
    )
  })
}
