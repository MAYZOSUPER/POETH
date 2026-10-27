import { readFileSync } from 'fs'
import { resolve } from 'path'
import type { MapModData, MapRegexData, RegexLang } from '@shared/types'

// Данные генератора (resources/data/poe1/regex) и синтетические подсказки карт для эмулятора.

export const LANGS: RegexLang[] = ['en', 'ru']

const cache = new Map<RegexLang, MapRegexData>()

export function loadMapData(lang: RegexLang): MapRegexData {
  let d = cache.get(lang)
  if (!d) {
    const file = resolve(__dirname, `../../resources/data/poe1/regex/maps.${lang}.json`)
    d = JSON.parse(readFileSync(file, 'utf8')) as MapRegexData
    cache.set(lang, d)
  }
  return d
}

/** Строки мода как в подсказке игры: исходный регистр, числа подставлены. */
export function modLines(m: MapModData, value = 25): string[] {
  return m.display.split('\n').map((l) => l.replace(/#/g, String(value)))
}

export const PROPS: Record<RegexLang, Record<string, string>> = {
  en: {
    quantity: 'Item Quantity: +{v}% (augmented)',
    rarity: 'Item Rarity: +{v}% (augmented)',
    packSize: 'Monster Pack Size: +{v}% (augmented)',
    moreMaps: 'More Maps: +{v}% (augmented)',
    moreScarabs: 'More Scarabs: +{v}% (augmented)',
    moreCurrency: 'More Currency: +{v}% (augmented)',
    moreDivCards: 'More Divination Cards: +{v}% (augmented)'
  },
  ru: {
    quantity: 'Количество предметов: +{v}% (augmented)',
    rarity: 'Редкость предметов: +{v}% (augmented)',
    packSize: 'Размер групп монстров: +{v}% (augmented)',
    moreMaps: 'Больше карт: +{v}% (augmented)',
    moreScarabs: 'Больше скарабеев: +{v}% (augmented)',
    moreCurrency: 'Больше валюты: +{v}% (augmented)',
    moreDivCards: 'Больше гадальных карт: +{v}% (augmented)'
  }
}

const HEAD: Record<RegexLang, string[]> = {
  en: ['Item Class: Maps', 'Rarity: Rare', 'Grim Pit', 'Cemetery Map (Tier 16)', '--------'],
  ru: ['Класс предмета: Карты', 'Редкость: Редкий', 'Мрачная яма', 'Карта кладбища (Ур. 16)', '--------']
}

/** Синтетическая подсказка карты: шапка, свойства, моды, флаги. */
export function mapTooltip(
  lang: RegexLang,
  mods: MapModData[],
  props: Record<string, number> = {},
  flags: { corrupted?: boolean; unidentified?: boolean } = {}
): string {
  const lines = [...HEAD[lang]]
  for (const [key, v] of Object.entries(props)) lines.push(PROPS[lang][key].replace('{v}', String(v)))
  lines.push(lang === 'en' ? 'Item Level: 83' : 'Уровень предмета: 83', '--------')
  if (flags.unidentified) lines.push(lang === 'en' ? 'Unidentified' : 'Неопознано')
  else for (const m of mods) lines.push(...modLines(m))
  if (flags.corrupted) lines.push('--------', lang === 'en' ? 'Corrupted' : 'Осквернено')
  return lines.join('\n')
}

/** Детерминированный ГПСЧ (mulberry32) для «случайных» наборов. */
export function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function pick<T>(list: T[], n: number, rand: () => number): T[] {
  const copy = [...list]
  const out: T[] = []
  while (out.length < n && copy.length) out.push(copy.splice(Math.floor(rand() * copy.length), 1)[0])
  return out
}

/** Все строки мода M' есть в моде M (M — «надмножество» M'). */
export function hasAllLines(sup: MapModData, sub: MapModData): boolean {
  const s = sup.text.split('\n')
  return sub.text.split('\n').every((l) => s.includes(l))
}
