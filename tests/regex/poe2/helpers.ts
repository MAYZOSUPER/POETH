import { readFileSync } from 'fs'
import { resolve } from 'path'
import type { EmulatorOptions } from '@shared/regex'
import type { Poe2ModData, Poe2RegexData, RegexLang } from '@shared/types'

// Данные генератора PoE 2 (resources/data/poe2/regex) и синтетические подсказки путевых камней и плиток
// в расширенном формате 0.5 (поиск игры идёт по нему: числа с диапазоном тира, заголовки `{ … }`).

export const LANGS: RegexLang[] = ['en', 'ru']

/** Режимы эмулятора: как есть, ё=е, и для RU — регистр кириллицы важен (поведение игры не проверено). */
export function modes(lang: RegexLang): EmulatorOptions[] {
  return lang === 'ru' ? [{}, { foldYo: true }, { asciiCaseOnly: true }] : [{}, { foldYo: true }]
}

const cache = new Map<RegexLang, Poe2RegexData>()

export function loadPoe2Data(lang: RegexLang): Poe2RegexData {
  let d = cache.get(lang)
  if (!d) {
    d = JSON.parse(
      readFileSync(resolve(__dirname, `../../../resources/data/poe2/regex/regex.${lang}.json`), 'utf8')
    ) as Poe2RegexData
    cache.set(lang, d)
  }
  return d
}

export interface Corpus {
  lines: string[]
  own: Record<string, string[]>
}

export function loadCorpus(lang: RegexLang): Corpus {
  return JSON.parse(readFileSync(resolve(__dirname, `fixtures/corpus.${lang}.json`), 'utf8')) as Corpus
}

export function readFixture(lang: RegexLang, name: string): string {
  return readFileSync(resolve(__dirname, `../../fixtures/poe2/${lang}/${name}`), 'utf8').replace(/\r\n/g, '\n')
}

/** Число в строке: в расширенном формате — с диапазоном тира («25(21-30)»), иначе просто «25». */
export function num(v: number, advanced: boolean): string {
  return advanced ? `${v}(${Math.max(0, v - 4)}-${v + 5})` : String(v)
}

/** Строки мода как в подсказке: исходный регистр, числа подставлены. */
export function modLines(m: Poe2ModData, value = 25, advanced = true): string[] {
  return m.display.split('\n').map((l) => l.replace(/#/g, () => num(value, advanced)))
}

/** Строка числа в нормализованной строке корпуса: # → значение. */
export function fillLine(line: string, value = 25, advanced = true): string {
  return line.replace(/#/g, () => num(value, advanced))
}

/** Мод s — «надмножество» мода m: в s есть все строки m (без $ и ^ его не отделить). */
export function isSuperset(s: Poe2ModData, m: Poe2ModData): boolean {
  const sl = s.text.split('\n')
  return m.text.split('\n').every((l) => sl.includes(l))
}

const WAYSTONE_HEAD: Record<RegexLang, (tier: number, rarity: string) => string[]> = {
  en: (tier, rarity) => [
    'Item Class: Waystones',
    `Rarity: ${rarity}`,
    'Grim Route',
    `Waystone (Tier ${tier})`,
    '--------'
  ],
  ru: (tier, rarity) => [
    'Класс предмета: Путевые камни',
    `Редкость: ${rarity}`,
    'Grim Route',
    `Путевой камень (Ур. ${tier})`,
    '--------'
  ]
}

export const WAYSTONE_PROPS: Record<RegexLang, Record<string, string>> = {
  en: {
    packSize: 'Pack Size: +{v}% (augmented)',
    magicMonsters: 'Magic Monsters: +{v}% (augmented)',
    rareMonsters: 'Rare Monsters: +{v}% (augmented)',
    dropChance: 'Waystone Drop Chance: +{v}% (augmented)',
    itemRarity: 'Item Rarity: +{v}% (augmented)',
    monsterRarity: 'Monster Rarity: +{v}% (augmented)',
    effectiveness: 'Monster Effectiveness: +{v}% (augmented)'
  },
  ru: {
    packSize: 'Размер групп монстров: +{v}% (augmented)',
    magicMonsters: 'Волшебные монстры: +{v}% (augmented)',
    rareMonsters: 'Редкие монстры: +{v}% (augmented)',
    dropChance: 'Шанс выпадения путевого камня: +{v}% (augmented)',
    itemRarity: 'Редкость предметов: +{v}% (augmented)',
    monsterRarity: 'Редкость монстров: +{v}% (augmented)',
    effectiveness: 'Эффективность монстров: +{v}% (augmented)'
  }
}

const RARITY_NAME: Record<RegexLang, Record<string, string>> = {
  en: { normal: 'Normal', magic: 'Magic', rare: 'Rare', unique: 'Unique' },
  ru: {
    normal: 'Обычный',
    magic: 'Волшебный',
    rare: 'Редкий',
    unique: 'Уникальный'
  }
}

export interface WaystoneSpec {
  tier?: number
  rarity?: 'normal' | 'magic' | 'rare' | 'unique'
  props?: Record<string, number>
  mods?: Poe2ModData[]
  value?: number
  corrupted?: boolean
  unidentified?: boolean
}

/** Синтетическая подсказка путевого камня в расширенном формате 0.5. */
export function waystoneTooltip(lang: RegexLang, s: WaystoneSpec): string {
  const lines = [...WAYSTONE_HEAD[lang](s.tier ?? 15, RARITY_NAME[lang][s.rarity ?? 'rare'])]
  for (const [k, v] of Object.entries(s.props ?? {})) lines.push(WAYSTONE_PROPS[lang][k].replace('{v}', String(v)))
  lines.push('--------', `${lang === 'ru' ? 'Уровень предмета' : 'Item Level'}: 80`, '--------')
  if (s.unidentified) lines.push(lang === 'ru' ? 'Неопознано' : 'Unidentified')
  for (const m of s.mods ?? []) {
    const kind =
      lang === 'ru'
        ? m.kind === 'suffix'
          ? 'Суффикс'
          : 'Префикс'
        : m.kind === 'suffix'
          ? 'Suffix Modifier'
          : 'Prefix Modifier'
    lines.push(lang === 'ru' ? `{ ${kind} "Painful" (Уровень: 1) }` : `{ ${kind} "Painful" (Tier: 1) }`)
    lines.push(...modLines(m, s.value ?? 25))
  }
  lines.push('--------', 'Can be used in a Map Device, allowing you to enter a Map. Waystones can only be used once.')
  if (s.corrupted) lines.push('--------', lang === 'ru' ? 'Осквернено' : 'Corrupted')
  return lines.join('\n')
}

export interface TabletSpec {
  type: string
  rarity?: 'normal' | 'magic' | 'rare' | 'unique'
  uses?: number
  mods?: Poe2ModData[]
}

/** Строка имплисита плитки из данных («adds ritual altars to a map» / «добавляет … на карту»). */
export function implicitLine(lang: RegexLang, data: Poe2RegexData): string {
  const hit = data.tablet.extra.find((l) =>
    lang === 'ru' ? /^добавляет .* на карту$/.test(l) : /^adds .* to a map$/.test(l)
  )
  if (!hit) throw new Error('нет строки имплисита плитки')
  return hit
}

/** Синтетическая подсказка плитки (имплисит и «# uses remaining» — по данным). */
export function tabletTooltip(lang: RegexLang, data: Poe2RegexData, s: TabletSpec, baseName: string): string {
  const lines = [
    lang === 'ru' ? 'Класс предмета: Плитки' : 'Item Class: Tablet',
    `${lang === 'ru' ? 'Редкость' : 'Rarity'}: ${RARITY_NAME[lang][s.rarity ?? 'rare']}`,
    'Voidtouched Invocation',
    baseName,
    '--------',
    `${lang === 'ru' ? 'Уровень предмета' : 'Item Level'}: 79`,
    '--------',
    lang === 'ru' ? '{ Собственное свойство }' : '{ Implicit Modifier }',
    implicitLine(lang, data),
    lang === 'ru' ? `Осталось зарядов - ${s.uses ?? 10}` : `${s.uses ?? 10} uses remaining`,
    '--------'
  ]
  for (const m of s.mods ?? []) {
    lines.push(
      lang === 'ru' ? '{ Префикс "Collector\'s" (Уровень: 1) }' : '{ Prefix Modifier "Collector\'s" (Tier: 1) }'
    )
    lines.push(...modLines(m, 25))
  }
  lines.push('--------', 'Can be used in a personal Map Device to add modifiers to a Map.')
  return lines.join('\n')
}

/** Детерминированный ГСЧ для «случайных» наборов. */
export function rng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 2 ** 32
  }
}
