import { readdirSync, readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'
import type { RegexLang, VendorItemClass, VendorModKey, VendorQuery, VendorRarity } from '@shared/types'
import {
  REGEX_LIMIT,
  VENDOR_DATA,
  VENDOR_ITEM_CLASSES,
  VENDOR_MOD_KEYS,
  VENDOR_PRESETS,
  VENDOR_RARITIES,
  buildVendorRegex,
  compileSearch,
  emptyVendorQuery,
  isPresetQuery,
  isThresholdMod,
  joinPosts,
  normalizeLibrary,
  presetQuery,
  type EmulatorOptions,
  type VendorSideReason
} from '@shared/regex'
import { LANGS } from './helpers'

// Свойства предметов «Торговца» (S27): каждая строка совпадает со своим модом и не задевает чужие строки
// корпуса (моды предметов торговца, метки свойств, классы, редкости, базы, строки фикстур) — EN и RU,
// с ё=е и без, RU — даже при регистрозависимой кириллице. Корпус пишет tools/regex/build-vendor-data.mjs.

interface Corpus {
  own: Record<VendorModKey, string[]>
  labels: Record<string, string[]>
  lines: string[]
}

const corpora = new Map<RegexLang, Corpus>()
function corpus(lang: RegexLang): Corpus {
  let c = corpora.get(lang)
  if (!c) {
    c = JSON.parse(readFileSync(resolve(__dirname, `fixtures/vendor-corpus.${lang}.json`), 'utf8')) as Corpus
    corpora.set(lang, c)
  }
  return c
}

const MODES: EmulatorOptions[] = [{}, { foldYo: true }, { asciiCaseOnly: true }, { foldYo: true, asciiCaseOnly: true }]
const fold = (s: string): string => s.replace(/ё/g, 'е')
const fill = (line: string, ...v: number[]): string => {
  let i = 0
  return line.replace(/#/g, () => String(v[Math.min(i++, v.length - 1)]))
}
const q = (p: Partial<VendorQuery>): VendorQuery => ({ ...emptyVendorQuery(), ...p })
const modQuery = (key: VendorModKey, n = 1): VendorQuery => q({ mods: { [key]: n } })

/** Шапка предмета без свойств: класс, редкость, имя, база, уровень предмета. */
const HEAD: Record<RegexLang, string[]> = {
  en: ['Item Class: Rings', 'Rarity: Rare', 'Doom Loop', 'Iron Ring', '--------', 'Item Level: 70', '--------'],
  ru: ['Класс предмета: Кольца', 'Редкость: Редкий', 'Петля рока', 'Железное кольцо', '--------', 'Уровень предмета: 70', '--------']
}
const item = (lang: RegexLang, lines: string[]): string => [...HEAD[lang], ...lines].join('\n')

const MINIONS: Record<RegexLang, string> = { en: 'minions have ', ru: 'приспешники имеют ' }

/** Своя строка + продолжение («… during effect», в RU «… камней огня») — без $ не отделить. */
function isVariant(line: string, own: string[]): boolean {
  const l = fold(line)
  return own.some((t) => {
    const f = fold(t)
    return l !== f && (l.startsWith(f + ' ') || l.startsWith(f + ','))
  })
}

type Why = 'own' | 'variant' | { also: VendorModKey } | { side: VendorSideReason } | null

/** Почему строка корпуса может совпасть со строкой свойства key (null — не может: ложное совпадение). */
function classify(lang: RegexLang, key: VendorModKey, line: string): Why {
  const c = corpus(lang)
  const own = c.own[key]
  if (own.includes(line)) return 'own'
  if (isVariant(line, own)) return 'variant'
  for (const k of VENDOR_MOD_KEYS) if (k !== key && c.own[k].includes(line)) return { also: k }
  if (line.startsWith(MINIONS[lang])) {
    const rest = line.slice(MINIONS[lang].length)
    if (own.includes(rest) || isVariant(rest, own)) return { side: 'minions' }
  }
  if (line.startsWith('-') && isVariant('+' + line.slice(1), own)) return { side: 'negative' }
  if (/enemies take #% increased/.test(line)) return { side: 'gems' }
  return null
}

describe('данные торговца', () => {
  it('ключи EN и RU совпадают с корпусом', () => {
    for (const lang of LANGS) {
      expect(Object.keys(VENDOR_DATA[lang].mods)).toEqual(VENDOR_MOD_KEYS)
      expect(Object.keys(corpus(lang).own)).toEqual(VENDOR_MOD_KEYS)
      expect(Object.keys(VENDOR_DATA[lang].classes)).toEqual(VENDOR_ITEM_CLASSES)
      expect(Object.keys(VENDOR_DATA[lang].rarity).sort()).toEqual([...VENDOR_RARITIES].sort())
    }
  })

  it('порог есть у свойств с одним числом, у «+ к уровню камней» и добавленного урона — нет', () => {
    for (const k of VENDOR_MOD_KEYS) {
      const one = corpus('en').own[k].every((l) => (l.match(/#/g) ?? []).length === 1)
      if (isThresholdMod(k)) expect(one, k).toBe(true)
    }
    expect(isThresholdMod('moveSpeed')).toBe(true)
    expect(isThresholdMod('gemFire')).toBe(false)
    expect(isThresholdMod('addAttackFire')).toBe(false)
  })

  it('фрагменты без кавычек и «!», RU — без заглавных букв (регистр кириллицы в игре не проверен)', () => {
    for (const lang of LANGS) {
      const d = VENDOR_DATA[lang]
      const all = [
        ...Object.values(d.mods).flatMap((m) => [m.pre ?? '', ...(m.posts ?? []), m.token ?? '']),
        ...Object.values(d.classes),
        ...Object.values(d.rarity),
        d.notItemLevel
      ]
      for (const s of all) {
        expect(s).not.toMatch(/["!]/)
        expect(s).toBe(s.toLowerCase())
      }
    }
  })
})

describe.each(LANGS)('свойства предметов %s', (lang) => {
  const data = VENDOR_DATA[lang]
  const c = corpus(lang)

  it.each(VENDOR_MOD_KEYS)('%s: своя строка совпадает (порог ≥ N), шапка предмета — нет', (key) => {
    const texts = data.mods[key].text
    for (const opts of MODES) {
      if (isThresholdMod(key)) {
        for (const n of [1, 5, 10, 15, 30, 45, 99, 100, 150]) {
          const r = buildVendorRegex(lang, modQuery(key, n))
          expect(r.ok).toBe(true)
          const match = compileSearch(r.text, opts)
          expect(match(item(lang, [])), `${n}: шапка`).toBe(false)
          for (const t of texts) {
            for (const v of [1, 4, 5, 9, 10, 14, 15, 29, 30, 31, 44, 45, 60, 98, 99, 100, 101, 149, 150, 151, 230]) {
              expect(match(item(lang, [fill(t, v)])), `${JSON.stringify(opts)} ≥${n} на «${fill(t, v)}»`).toBe(v >= n)
            }
          }
        }
      } else {
        const match = compileSearch(buildVendorRegex(lang, modQuery(key)).text, opts)
        expect(match(item(lang, []))).toBe(false)
        for (const t of texts) expect(match(item(lang, [fill(t, 1, 3, 25)])), `${JSON.stringify(opts)} «${t}»`).toBe(true)
      }
    }
  })

  it.each(VENDOR_MOD_KEYS)('%s: не задевает чужие строки корпуса (кроме вариантов, also и пометок side)', (key) => {
    const d = data.mods[key]
    const text = buildVendorRegex(lang, modQuery(key, 1)).text
    for (const opts of [{}, { foldYo: true }] as EmulatorOptions[]) {
      const match = compileSearch(text, opts)
      for (const line of c.lines) {
        // большие числа — пороги совпадают охотнее всего
        if (!match(fill(line, 99, 150))) continue
        const why = classify(lang, key, line)
        expect(why, `«${line}»`).not.toBeNull()
        if (why && typeof why === 'object' && 'also' in why) {
          expect(d.also ?? [], `«${line}» — свойство ${why.also} не в also`).toContain(why.also)
        }
        if (why && typeof why === 'object' && 'side' in why) {
          expect(d.side ?? [], `«${line}» — нет пометки ${why.side}`).toContain(why.side)
        }
      }
    }
  })

  it.each(VENDOR_ITEM_CLASSES)('класс %s: своя строка «Item Class:» и ничего больше', (cls: VendorItemClass) => {
    const token = data.classes[cls]
    const own = c.labels[`class.${cls}`]
    for (const opts of MODES) {
      const match = compileSearch(`"${token}"`, opts)
      for (const l of own) expect(match(l), `${JSON.stringify(opts)} ${l}`).toBe(true)
    }
    const ownLower = own.map((l) => l.toLowerCase())
    const match = compileSearch(`"${token}"`, { foldYo: true })
    for (const line of c.lines) if (!ownLower.includes(line)) expect(match(fill(line, 99)), `«${line}»`).toBe(false)
  })

  it.each(VENDOR_RARITIES)('редкость %s: своя строка «Rarity:» и ничего больше', (r: VendorRarity) => {
    const token = data.rarity[r]
    const [own] = c.labels[`rarity.${r}`]
    for (const opts of MODES) expect(compileSearch(`"${token}"`, opts)(own)).toBe(true)
    const match = compileSearch(`"${token}"`, { foldYo: true })
    for (const line of c.lines) if (line !== own.toLowerCase()) expect(match(fill(line, 99)), `«${line}»`).toBe(false)
  })

  it('«уровень предмета» для фильтра камней: только строка Item Level', () => {
    const [own] = c.labels.itemLevel
    for (const opts of MODES) expect(compileSearch(`"${data.notItemLevel}"`, opts)(fill(own, 84))).toBe(true)
    const match = compileSearch(`"${data.notItemLevel}"`, { foldYo: true })
    for (const line of c.lines) if (line !== own.toLowerCase()) expect(match(fill(line, 84)), `«${line}»`).toBe(false)
  })

  it('класс и редкость — отдельные условия «И»', () => {
    const boots = q({ itemClass: 'boots', rarity: ['magic', 'rare'], mods: { moveSpeed: 10 } })
    const r = buildVendorRegex(lang, boots)
    const match = compileSearch(r.text)
    const [bootsLine] = c.labels['class.boots']
    const [glovesLine] = c.labels['class.gloves']
    const [magic] = c.labels['rarity.magic']
    const [normal] = c.labels['rarity.normal']
    const ms = fill(data.mods.moveSpeed.text[0], 20)
    expect(match([bootsLine, magic, 'X', '--------', ms].join('\n'))).toBe(true)
    expect(match([bootsLine, normal, 'X', '--------', ms].join('\n'))).toBe(false)
    expect(match([glovesLine, magic, 'X', '--------', ms].join('\n'))).toBe(false)
    expect(match([bootsLine, magic, 'X', '--------', fill(data.mods.moveSpeed.text[0], 5)].join('\n'))).toBe(false)
    // все три редкости — то же, что «любая»: терма нет
    expect(buildVendorRegex(lang, q({ rarity: ['normal', 'magic', 'rare'] })).text).toBe('')
  })

  it('also и side попадают в результат, если «заденет» не выбрано', () => {
    const r = buildVendorRegex(lang, q({ mods: { addAttackFire: 1 } }))
    expect(r.also).toContain('addSpellFire')
    expect(buildVendorRegex(lang, q({ mods: { addAttackFire: 1, addSpellFire: 1 } })).also).not.toContain('addSpellFire')
    expect(buildVendorRegex(lang, q({ mods: { moveSpeed: 10 } })).side).toEqual(['minions'])
  })
})

// ---------------------------------------------------------------------------
// Настоящие подсказки предметов (фикстуры парсера, Ctrl+C EN/RU)
// ---------------------------------------------------------------------------

function normLine(s: string): string {
  return s
    .replace(/\d+(?:[.,]\d+)?/g, '#')
    .replace(/#(?:#)+/g, '#')
    .replace(/[ \t ]+/g, ' ')
    .trim()
    .toLowerCase()
}

describe.each(LANGS)('фикстуры предметов %s', (lang) => {
  const dir = resolve(__dirname, `../fixtures/poe1/${lang}`)
  const files = readdirSync(dir).filter((f) => f.endsWith('.txt') && !f.startsWith('adv-'))

  it.each(VENDOR_MOD_KEYS)('%s: подсвечивает предмет ⇔ у него есть своя строка (или допустимая побочная)', (key) => {
    const match = compileSearch(buildVendorRegex(lang, modQuery(key, 1)).text, { foldYo: true })
    for (const f of files) {
      const text = readFileSync(resolve(dir, f), 'utf8')
      const lines = text.split(/\r?\n/).map(normLine)
      const own = lines.some((l) => corpus(lang).own[key].includes(l))
      const hit = match(text)
      if (own) expect(hit, `${f}: своя строка не найдена`).toBe(true)
      if (hit) expect(lines.some((l) => classify(lang, key, l) !== null), `${f}: ложное совпадение`).toBe(true)
    }
  })

  it('класс предмета из фикстуры находится своим фильтром', () => {
    const classLine = new Map<string, VendorItemClass>()
    for (const cls of VENDOR_ITEM_CLASSES) for (const l of corpus(lang).labels[`class.${cls}`]) classLine.set(l, cls)
    let seen = 0
    for (const f of files) {
      const text = readFileSync(resolve(dir, f), 'utf8')
      const first = text.split(/\r?\n/)[0].trim()
      const own = classLine.get(first)
      for (const cls of VENDOR_ITEM_CLASSES) {
        const hit = compileSearch(buildVendorRegex(lang, q({ itemClass: cls })).text)(text)
        expect(hit, `${f}: ${cls}`).toBe(own === cls)
      }
      if (own) seen++
    }
    expect(seen).toBeGreaterThan(10)
  })
})

// ---------------------------------------------------------------------------
// Готовые наборы, лимит, библиотека
// ---------------------------------------------------------------------------

describe('готовые наборы торговца', () => {
  it.each(LANGS)('%s: каждый набор ≤ 250 символов в обоих режимах', (lang) => {
    for (const p of VENDOR_PRESETS) {
      for (const mode of ['any', 'all'] as const) {
        const r = buildVendorRegex(lang, { ...presetQuery(p), mode })
        expect(r.ok, `${p.id} ${mode}: ${r.length}`).toBe(true)
        expect(r.length).toBeLessThanOrEqual(REGEX_LIMIT)
        expect(r.text).not.toBe('')
      }
    }
  })

  it.each(LANGS)('%s: «Старт лиги» — только ботинки со скоростью ≥ 10%%', (lang) => {
    const c = corpus(lang)
    const p = VENDOR_PRESETS.find((x) => x.id === 'leagueBoots')!
    const match = compileSearch(buildVendorRegex(lang, presetQuery(p)).text)
    const [bootsLine] = c.labels['class.boots']
    const [glovesLine] = c.labels['class.gloves']
    const [magic] = c.labels['rarity.magic']
    const ms = (v: number): string => fill(VENDOR_DATA[lang].mods.moveSpeed.text[0], v)
    expect(match([bootsLine, magic, 'X', '--------', ms(15)].join('\n'))).toBe(true)
    expect(match([bootsLine, magic, 'X', '--------', ms(5)].join('\n'))).toBe(false)
    expect(match([glovesLine, magic, 'X', '--------', ms(15)].join('\n'))).toBe(false)
  })

  it.each(LANGS)('%s: кастер, атака, сопротивления — находят предмет с любым своим свойством', (lang) => {
    for (const p of VENDOR_PRESETS.filter((x) => x.id !== 'leagueBoots')) {
      const query = presetQuery(p)
      const match = compileSearch(buildVendorRegex(lang, query).text)
      expect(match(item(lang, []))).toBe(false)
      for (const [key, n] of Object.entries(query.mods) as [VendorModKey, number][]) {
        for (const t of VENDOR_DATA[lang].mods[key].text) {
          expect(match(item(lang, [fill(t, Math.max(n, 3), 25)])), `${p.id}/${key}`).toBe(true)
        }
      }
    }
  })

  it('isPresetQuery узнаёт набор независимо от режима', () => {
    for (const p of VENDOR_PRESETS) {
      expect(isPresetQuery(p, presetQuery(p))).toBe(true)
      expect(isPresetQuery(p, { ...presetQuery(p), mode: 'all' })).toBe(true)
      expect(isPresetQuery(p, { ...presetQuery(p), links: 4 })).toBe(false)
    }
  })
})

describe('режим «любое»: пороги одной группой', () => {
  it('joinPosts: общее начало за скобку, без повторов и покрытых хвостов, не режет \d+ и \+', () => {
    expect(joinPosts(['% to fire r'])).toBe('% to fire r')
    expect(joinPosts(['% to fire r', '% to cold r', '% to fire r'])).toBe('% to (fire r|cold r)')
    expect(joinPosts(['% к сопротивлению о', '% к сопротивлению огню и х'])).toBe('% к сопротивлению о')
    expect(joinPosts(['\d+ a', '\d+ b'])).toBe('\d+ (a|b)')
    expect(joinPosts(['\+x', '\.y'])).toBe('(\+x|\.y)')
    expect(joinPosts(['\d+x', '\dy'])).toBe('(\d+x|\dy)')
  })

  it.each(LANGS)('%s: сопротивления с разными и одинаковыми порогами — та же логика, что по отдельности', (lang) => {
    const t = (k: VendorModKey, v: number): string => item(lang, [fill(VENDOR_DATA[lang].mods[k].text[0], v)])
    for (const mods of [
      { resFire: 15, resCold: 15, resLightning: 15 },
      { resFire: 15, resCold: 30, resLightning: 15, resAll: 6 },
      { life: 40, mana: 40, resFire: 40 }
    ] as Partial<Record<VendorModKey, number>>[]) {
      const any = compileSearch(buildVendorRegex(lang, q({ mods })).text)
      const sep = Object.entries(mods).map(([k, n]) => compileSearch(buildVendorRegex(lang, modQuery(k as VendorModKey, n)).text))
      for (const k of ['resFire', 'resCold', 'resLightning', 'resAll', 'life', 'mana'] as VendorModKey[]) {
        for (const v of [3, 6, 14, 15, 16, 29, 30, 39, 40, 41, 120]) {
          expect(any(t(k, v)), `${JSON.stringify(mods)} ${k}=${v}`).toBe(sep.some((m) => m(t(k, v))))
        }
      }
    }
  })
})

describe('лимит 250: все свойства сразу', () => {
  it.each(LANGS)('%s: переполнение с подсказкой, что убрать', (lang) => {
    const mods = Object.fromEntries(VENDOR_MOD_KEYS.map((k) => [k, 1]))
    const r = buildVendorRegex(lang, q({ mods }))
    expect(r.ok).toBe(false)
    expect(r.overflow!.by).toBe(r.length - REGEX_LIMIT)
    const saved = r.overflow!.suggest.reduce((n, s) => n + s.saves, 0)
    expect(saved).toBeGreaterThanOrEqual(r.overflow!.by)
    expect(r.overflow!.suggest.every((s) => s.kind === 'option' && s.key.startsWith('mod.'))).toBe(true)
  })
})

describe('библиотека: настройки торговца', () => {
  it('старое поле movementSpeed переносится в mods.moveSpeed, мусор отбрасывается', () => {
    let n = 0
    const lib = normalizeLibrary(
      {
        prefs: {
          vendor: {
            movementSpeed: 15,
            mods: { life: 40, gemFire: 7, nope: 3, resAll: -1 },
            itemClass: 'boots',
            rarity: ['rare', 'epic']
          }
        }
      },
      () => `id${++n}`
    )
    const v = lib.prefs.vendor
    expect(v.mods).toEqual({ life: 40, gemFire: 1, moveSpeed: 15 })
    expect(v.itemClass).toBe('boots')
    expect(v.rarity).toEqual(['rare'])
    expect(normalizeLibrary({ prefs: { vendor: { itemClass: 'spoon' } } }, () => 'x').prefs.vendor.itemClass).toBe('')
  })
})
