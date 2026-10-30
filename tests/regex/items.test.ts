import { readdirSync, readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'
import type { ItemModData, ItemRegexData, ItemsQuery, RegexLang, VendorModKey } from '@shared/types'
import {
  FLASK_MOD_IDS,
  INFLUENCE_KEYS,
  ITEMS_PRESETS,
  ITEM_CLASS_KEYS,
  ITEM_RARITIES,
  REGEX_LIMIT,
  VENDOR_DATA,
  buildItemsRegex,
  compileSearch,
  emptyItemsQuery,
  escapeRegex,
  formatTerm,
  isItemsPresetQuery,
  itemsPresetQuery,
  normalizeLibrary,
  type EmulatorOptions
} from '@shared/regex'
import { LANGS } from './helpers'

// «Предметы» (S46): строки модов, базы, классы, редкость, влияние, «осквернено» и «уровень предмета» — EN и RU.
// Каждый фрагмент совпадает со своей строкой (во всех режимах эмулятора: ё=е, регистрозависимая кириллица) и не
// задевает чужие строки корпуса (моды предметов, имплиситы, зачарования, уникальные, названия свойств, метки,
// базы, фикстуры), кроме строк, где своя есть целиком. Данные и корпус пишет tools/regex/build-item-data.mjs.

interface Corpus {
  labels: Record<string, string[]>
  lines: string[]
}

const dataCache = new Map<RegexLang, ItemRegexData>()
const corpusCache = new Map<RegexLang, Corpus>()

function data(lang: RegexLang): ItemRegexData {
  let d = dataCache.get(lang)
  if (!d) {
    d = JSON.parse(readFileSync(resolve(__dirname, `../../resources/data/poe1/regex/items.${lang}.json`), 'utf8')) as ItemRegexData
    dataCache.set(lang, d)
  }
  return d
}

function corpus(lang: RegexLang): Corpus {
  let c = corpusCache.get(lang)
  if (!c) {
    c = JSON.parse(readFileSync(resolve(__dirname, `fixtures/item-corpus.${lang}.json`), 'utf8')) as Corpus
    corpusCache.set(lang, c)
  }
  return c
}

const MODES: EmulatorOptions[] = [{}, { foldYo: true }, { asciiCaseOnly: true }, { foldYo: true, asciiCaseOnly: true }]
const fold = (s: string): string => s.replace(/ё/g, 'е')
const fill = (line: string, ...v: number[]): string => {
  let i = 0
  return line.replace(/#/g, () => String(v[Math.min(i++, v.length - 1)]))
}
const q = (p: Partial<ItemsQuery>): ItemsQuery => ({ ...emptyItemsQuery(), ...p })
/** «секунд(-ы)» → «секунд»: одна из форм, которую клиент игры показывает сам («на 5 секунд»). */
const resolved = (l: string): string => l.replace(/\((?:-|\+)?[a-zа-яё]{1,6}\)/giu, '')
/** Строка мода из данных («"» — склоняемое слово, его клиент пишет сам) → регулярка для строки подсказки. */
const ownRe = (l: string, whole = true): RegExp => {
  const body = l.split('"').map(escapeRegex).join('\\S*')
  return new RegExp(whole ? `^${body}$` : body)
}
const term = (body: string): string => formatTerm({ negate: false, body })

/** Шапка предмета без свойств: класс, редкость, имя, база, уровень предмета. */
const HEAD: Record<RegexLang, string[]> = {
  en: ['Item Class: Rings', 'Rarity: Rare', 'Doom Loop', 'Iron Ring', '--------', 'Item Level: 70', '--------'],
  ru: ['Класс предмета: Кольца', 'Редкость: Редкий', 'Петля рока', 'Железное кольцо', '--------', 'Уровень предмета: 70', '--------']
}
const item = (lang: RegexLang, lines: string[], head = HEAD[lang]): string => [...head, ...lines].join('\n')

/**
 * Свёрнутые строки корпуса с числами (# → 25) и без — для прогона фрагмента по всему корпусу одной регуляркой
 * (то же, что эмулятор с foldYo: регистр не важен, «.» не переходит через строку).
 */
function sweep(lang: RegexLang, value = 25): { raw: string[]; filled: string[] } {
  const raw = corpus(lang).lines.map(fold)
  return { raw, filled: raw.map((l) => fill(l, value)) }
}

/** Строки корпуса, где совпал фрагмент, но нет ни одной своей строки целиком («"» — любое слово). */
function strangers(re: RegExp, own: string[], s: { raw: string[]; filled: string[] }): string[] {
  const ownR = own.map((o) => ownRe(fold(o), false))
  const out: string[] = []
  s.filled.forEach((l, i) => {
    if (re.test(l) && !ownR.some((o) => o.test(s.raw[i]))) out.push(s.raw[i])
  })
  return out
}

describe('данные «Предметов»', () => {
  it('EN и RU: одни и те же строки модов, базы, классы и влияние', () => {
    const [en, ru] = [data('en'), data('ru')]
    expect(en.mods.map((m) => m.id)).toEqual(ru.mods.map((m) => m.id))
    expect(en.bases.map((b) => b.id)).toEqual(ru.bases.map((b) => b.id))
    for (const d of [en, ru]) {
      expect(Object.keys(d.classes)).toEqual([...ITEM_CLASS_KEYS])
      expect(Object.keys(d.influence)).toEqual([...INFLUENCE_KEYS])
      expect(Object.keys(d.rarity).sort()).toEqual([...ITEM_RARITIES, 'gem'].sort())
      expect(new Set(d.mods.map((m) => m.id)).size).toBe(d.mods.length)
    }
    expect(en.mods.length).toBeGreaterThan(900)
    expect(en.bases.length).toBeGreaterThan(800)
  })

  it('фрагменты без кавычек и «!», в нижнем регистре (RU: заглавная буква — «.» или «[дД]»)', () => {
    for (const lang of LANGS) {
      const d = data(lang)
      const all = [
        ...d.mods.flatMap((m) => [m.token, m.pre ?? '', ...(m.posts ?? [])]),
        ...d.bases.map((b) => b.token),
        ...Object.values(d.classes),
        ...Object.values(d.rarity),
        ...Object.values(d.influence),
        d.flags.corrupted,
        d.itemLevel
      ]
      for (const s of all) {
        expect(s).not.toMatch(/["!]/)
        // класс из строчной и заглавной той же буквы — верен при любом регистре поиска
        const plain = s.replace(/\[(\p{Ll})(\p{Lu})\]/gu, (m, l: string, u: string) => (u.toLowerCase() === l ? l : m))
        expect(plain, s).toBe(plain.toLowerCase())
      }
    }
  })

  it('классы строк модов — из списка страницы; флаконные строки — только на флаконах', () => {
    const d = data('en')
    for (const m of d.mods) for (const c of m.cls ?? []) expect(ITEM_CLASS_KEYS).toContain(c)
    const effect = d.mods.find((m) => m.id === FLASK_MOD_IDS.effect)!
    expect(effect.cls).toEqual(['utilityFlask'])
    const life = d.mods.find((m) => m.id === 'base_maximum_life')!
    expect(life.cls).toContain('boots')
    expect(life.cls).not.toContain('lifeFlask')
  })
})

describe.each(LANGS)('строки модов %s', (lang) => {
  const d = data(lang)

  it('каждая строка находится своим фрагментом во всех режимах, шапка предмета — нет', () => {
    for (const m of d.mods) {
      const own = m.display.split('\n')
      for (const opts of MODES) {
        const match = compileSearch(term(m.token), opts)
        expect(match(item(lang, [])), `${m.id}: шапка`).toBe(false)
        expect(
          own.some((l) => match(item(lang, [fill(l, 25)]))),
          `${JSON.stringify(opts)} ${m.id} «${m.display}» ← ${m.token}`
        ).toBe(true)
        // клиент сам склоняет «секунд(-ы)» → «секунд» / «секунды»
        expect(own.some((l) => match(item(lang, [fill(resolved(l), 25)]))), `${m.id}: без «(-ы)»`).toBe(true)
      }
      // дробные статы: «Regenerate 1.5 Life per second»
      if (m.token.includes('[\\d.]+')) expect(own.some((l) => compileSearch(term(m.token))(fill(l, 1.5)))).toBe(true)
    }
  })

  it('фрагменты не задевают чужие строки корпуса (кроме строк, где своя есть целиком)', { timeout: 120_000 }, () => {
    const s = sweep(lang)
    const bad: string[] = []
    for (const m of d.mods) {
      const hits = strangers(new RegExp(fold(m.token), 'im'), m.text.split('\n'), s)
      if (hits.length) bad.push(`${m.id} ← ${m.token}: ${hits.slice(0, 2).join(' / ')}`)
    }
    expect(bad).toEqual([])
  })

  it('also — строки других модов, где эта есть целиком', () => {
    const byId = new Map(d.mods.map((m) => [m.id, m]))
    for (const m of d.mods) {
      for (const id of m.also ?? []) {
        const o = byId.get(id)!
        expect(o, id).toBeDefined()
        const re = new RegExp(fold(m.token), 'im')
        const thr = m.posts?.length ? new RegExp(fold(`${m.pre ?? ''}\\d+${m.posts[0]}`), 'im') : null
        const hit = o.text.split('\n').some((l) => re.test(fill(fold(l), 25)) || !!thr?.test(fill(fold(l), 25)))
        expect(hit, `${m.id} → ${id}`).toBe(true)
      }
    }
  })

  it('порог «≥ N»: своя строка совпадает только при значении ≥ N', () => {
    const values = [1, 4, 5, 9, 10, 24, 25, 26, 49, 50, 99, 100, 101, 150, 230]
    for (const m of d.mods.filter((x) => x.posts?.length)) {
      const [line] = m.display.split('\n').map(resolved)
      for (const n of [1, 10, 25, 50, 100]) {
        const r = buildItemsRegex(d, lang, q({ want: { [m.id]: n } }))
        for (const opts of [{}, { foldYo: true, asciiCaseOnly: true }] as EmulatorOptions[]) {
          const match = compileSearch(r.text, opts)
          for (const v of values) {
            expect(match(item(lang, [fill(line, v)])), `${m.id} ≥${n} на «${fill(line, v)}» ${r.text}`).toBe(v >= n)
          }
        }
      }
    }
  })

  it('порог не задевает чужие строки корпуса (большие числа)', { timeout: 120_000 }, () => {
    const s99 = sweep(lang, 99)
    const s150 = sweep(lang, 150)
    const bad: string[] = []
    for (const m of d.mods.filter((x) => x.posts?.length)) {
      const text = buildItemsRegex(d, lang, q({ want: { [m.id]: 1 } })).text
      const body = text.startsWith('"') ? text.slice(1, -1) : text
      const re = new RegExp(fold(body), 'im')
      const hits = [...strangers(re, [m.text], s99), ...strangers(re, [m.text], s150)]
      if (hits.length) bad.push(`${m.id} ← ${body}: ${hits.slice(0, 2).join(' / ')}`)
    }
    expect(bad).toEqual([])
  })
})

describe.each(LANGS)('метки, влияние, базы %s', (lang) => {
  const d = data(lang)
  const c = corpus(lang)

  /** Фрагмент находит свои строки во всех режимах и не задевает другие (allowed — допустимые; supersets — и строки, где своя целиком). */
  const labelOnly = (token: string, own: string[], allowed: string[] = [], supersets = false): void => {
    for (const opts of MODES) {
      const match = compileSearch(term(token), opts)
      for (const l of own) expect(match(fill(l, 84)), `${JSON.stringify(opts)} ${token} на «${l}»`).toBe(true)
    }
    const ownF = own.map((l) => fold(l.toLowerCase()))
    const ok = new Set([...ownF, ...allowed.map(fold)])
    const match = compileSearch(term(token), { foldYo: true })
    for (const line of c.lines) {
      const f = fold(line)
      if (ok.has(f) || (supersets && ownF.some((o) => f.includes(o)))) continue
      expect(match(fill(line, 84)), `${token} задевает «${line}»`).toBe(false)
    }
  }

  it.each([...ITEM_CLASS_KEYS])('класс %s: своя строка «Item Class:» и ничего больше', (cls) => {
    labelOnly(d.classes[cls], c.labels[`class.${cls}`])
  })

  it.each([...ITEM_RARITIES, 'gem' as const])('редкость %s: своя строка «Rarity:» и ничего больше', (r) => {
    labelOnly(d.rarity[r], c.labels[`rarity.${r}`])
  })

  // без ^ и $ «Shaper Item» не отделить от строк уникальных «… if # Shaper Items are equipped» — они допустимы
  it.each([...INFLUENCE_KEYS])('влияние %s: своя строка и строки, где она есть целиком', (k) => {
    labelOnly(d.influence[k], c.labels[`influence.${k}`], [], true)
  })

  it('«Осквернено»: своя строка; без ^ — ещё только строки уникальных «… if corrupted»', () => {
    labelOnly(d.flags.corrupted, c.labels.corrupted, c.labels.corruptedAlso)
    expect(c.labels.corruptedAlso.length).toBeLessThan(40)
  })

  it('уровень предмета ≥ N: только строка «Item Level:», значение не меньше N', () => {
    const [own] = c.labels.itemLevel
    labelOnly(d.itemLevel, [own])
    for (const n of [1, 9, 68, 75, 82, 84, 86, 100]) {
      const text = buildItemsRegex(d, lang, q({ itemLevel: n })).text
      for (const opts of MODES) {
        const match = compileSearch(text, opts)
        for (const v of [1, 8, 9, 10, 67, 68, 69, 74, 75, 81, 82, 83, 84, 85, 86, 99, 100]) {
          expect(match(fill(own, v)), `ilvl ≥${n} на ${v}: ${text}`).toBe(v >= n)
        }
      }
      // требования «Level: 86» и «Уровень: 86» — не уровень предмета
      expect(compileSearch(text)(lang === 'en' ? 'Requirements:\nLevel: 86' : 'Требования:\nУровень: 86')).toBe(false)
    }
  })

  it('базы: фрагмент находит своё название (во всех режимах) и только названия, где оно есть целиком', { timeout: 60_000 }, () => {
    const s = sweep(lang)
    const bad: string[] = []
    for (const b of d.bases) {
      for (const opts of MODES) {
        expect(compileSearch(term(b.token), opts)(item(lang, [], [b.name])), `${JSON.stringify(opts)} ${b.name} ← ${b.token}`).toBe(true)
      }
      const hits = strangers(new RegExp(fold(b.token), 'im'), [b.name.toLowerCase()], s)
      if (hits.length) bad.push(`${b.name} ← ${b.token}: ${hits.slice(0, 2).join(' / ')}`)
    }
    expect(bad).toEqual([])
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

function fixtures(lang: RegexLang): { file: string; text: string; lines: string[] }[] {
  const dir = resolve(__dirname, `../fixtures/poe1/${lang}`)
  // как в генераторе: без расширенной копии («{ … }», диапазоны) — так подсказку игра не показывает
  return readdirSync(dir)
    .filter((f) => f.endsWith('.txt') && !f.startsWith('adv-'))
    .map((file) => ({ file, text: readFileSync(resolve(dir, file), 'utf8') }))
    .filter((f) => !/^\{ /m.test(f.text))
    .map((f) => ({ ...f, lines: f.text.split(/\r?\n/).map(normLine).map(fold) }))
}

describe.each(LANGS)('фикстуры предметов %s', (lang) => {
  const d = data(lang)
  const files = fixtures(lang)

  it('строка мода подсвечивает предмет ⇔ у него есть эта строка (или строка, где она целиком)', () => {
    let seen = 0
    for (const m of d.mods) {
      const own = m.text.split('\n').map(fold)
      const whole = own.map((o) => ownRe(o))
      const inside = own.map((o) => ownRe(o, false))
      const match = compileSearch(term(m.token), { foldYo: true })
      for (const f of files) {
        const has = f.lines.some((l) => whole.some((re) => re.test(l)))
        const hit = match(f.text)
        if (has) {
          seen++
          expect(hit, `${f.file}: «${m.display}» не найдена (${m.token})`).toBe(true)
        }
        if (hit) expect(f.lines.some((l) => inside.some((re) => re.test(l))), `${f.file}: ложное совпадение ${m.id} ← ${m.token}`).toBe(true)
      }
    }
    expect(seen).toBeGreaterThan(20)
  })

  it('склоняемое слово: «… на 4 секунды / for 4 seconds …» (flask-01) находится своей строкой', () => {
    const m = d.mods.find((x) => x.id === 'local_flask_chill_or_freeze_immunity_if_chilled_or_frozen_s')!
    const f = files.find((x) => x.file === 'flask-01.txt')!
    if (lang === 'ru') expect(m.text).toContain('"')
    expect(compileSearch(term(m.token))(f.text), m.token).toBe(true)
  })

  it('класс, редкость и влияние из фикстуры находятся своими фильтрами', () => {
    const c = corpus(lang)
    let classes = 0
    let influences = 0
    for (const f of files) {
      const first = f.text.split(/\r?\n/)[0].trim()
      for (const cls of ITEM_CLASS_KEYS) {
        const own = c.labels[`class.${cls}`].includes(first)
        if (own) classes++
        expect(compileSearch(buildItemsRegex(d, lang, q({ itemClass: cls })).text)(f.text), `${f.file}: ${cls}`).toBe(own)
      }
      for (const k of INFLUENCE_KEYS) {
        const own = f.text.split(/\r?\n/).some((l) => l.trim() === c.labels[`influence.${k}`][0])
        if (own) influences++
        expect(compileSearch(buildItemsRegex(d, lang, q({ influence: [k] })).text)(f.text), `${f.file}: ${k}`).toBe(own)
      }
    }
    expect(classes).toBeGreaterThan(40)
    expect(influences).toBeGreaterThan(5)
  })

  it('кольцо «Coral Ring» (jewellery-01): класс, база, редкость, уровень, здоровье, влияние', () => {
    const f = files.find((x) => x.file === 'jewellery-01.txt')!
    const base = d.bases.find((b) => b.id === 'Rings/Ring2')!
    const iron = d.bases.find((b) => b.cls === 'ring' && b.id !== base.id)!
    const yes = (p: Partial<ItemsQuery>): boolean => compileSearch(buildItemsRegex(d, lang, q(p)).text)(f.text)
    expect(yes({ itemClass: 'ring', base: base.id, rarity: ['rare'], itemLevel: 83, props: { life: 20 }, influence: ['crusader'] })).toBe(true)
    expect(yes({ itemClass: 'ring', props: { life: 30 } })).toBe(false)
    expect(yes({ itemLevel: 84 })).toBe(false)
    expect(yes({ itemClass: 'ring', base: iron.id })).toBe(false)
    expect(yes({ rarity: ['magic', 'normal'] })).toBe(false)
    expect(yes({ noInfluence: true })).toBe(false)
    expect(yes({ influence: ['shaper', 'elder'] })).toBe(false)
    expect(yes({ corrupted: 'exclude' })).toBe(true)
    expect(yes({ corrupted: 'only' })).toBe(false)
    // своя строка модов «+# to maximum Life» с порогом
    expect(yes({ want: { base_maximum_life: 24 } })).toBe(true)
    expect(yes({ want: { base_maximum_life: 25 } })).toBe(false)
    expect(yes({ avoid: ['base_maximum_life'] })).toBe(false)
  })

  it('флакон жизни (flask-07): класс и «#% increased Amount Recovered» ≥ N', () => {
    const f = files.find((x) => x.file === 'flask-07.txt')!
    const yes = (p: Partial<ItemsQuery>): boolean => compileSearch(buildItemsRegex(d, lang, q(p)).text)(f.text)
    expect(yes({ itemClass: 'lifeFlask', want: { 'local_flask_amount_to_recover_+%': 40 } })).toBe(true)
    expect(yes({ itemClass: 'lifeFlask', want: { 'local_flask_amount_to_recover_+%': 60 } })).toBe(false)
    expect(yes({ itemClass: 'manaFlask' })).toBe(false)
    expect(yes({ itemClass: 'lifeFlask', avoid: ['local_flask_amount_to_recover_+%'] })).toBe(false)
  })

  it('камни: фильтры камней находят только камни; качество и уровень — по своим строкам', () => {
    for (const f of files) {
      const gem = f.lines[1] === fold(normLine(corpus(lang).labels['rarity.gem'][0]))
      expect(compileSearch(buildItemsRegex(d, lang, q({ gemLevel: 1 })).text)(f.text), `${f.file}: камень`).toBe(gem)
      if (!gem) {
        expect(compileSearch(buildItemsRegex(d, lang, q({ gemQuality: 1 })).text)(f.text), f.file).toBe(false)
        expect(compileSearch(buildItemsRegex(d, lang, q({ vaal: 'only' })).text)(f.text), f.file).toBe(false)
      }
    }
    const withQ = files.filter((f) => f.file.startsWith('gem-') && /\n(quality|качество): \+#%/.test(f.lines.join('\n')))
    expect(withQ.length).toBeGreaterThan(0)
    for (const f of withQ) expect(compileSearch(buildItemsRegex(d, lang, q({ gemQuality: 1 })).text)(f.text), f.file).toBe(true)
  })

  it('«Осквернено» в фикстурах: «только» и «без»', () => {
    const own = fold(corpus(lang).labels.corrupted[0].toLowerCase())
    let seen = 0
    for (const f of files) {
      const has = f.lines.includes(own)
      if (has) seen++
      expect(compileSearch(buildItemsRegex(d, lang, q({ corrupted: 'only' })).text)(f.text), f.file).toBe(has)
      expect(compileSearch(buildItemsRegex(d, lang, q({ corrupted: 'exclude' })).text)(f.text), f.file).toBe(!has)
    }
    expect(seen).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// Движок: наборы, ваал-камни, режимы, лимит, библиотека
// ---------------------------------------------------------------------------

describe.each(LANGS)('движок «Предметов» %s', (lang) => {
  const d = data(lang)
  const byId = new Map(d.mods.map((m) => [m.id, m]))
  const own = (m: ItemModData, v = 25): string => fill(m.display.split('\n')[0], v)
  const vendorLine = (k: VendorModKey, v: number): string => fill(VENDOR_DATA[lang].mods[k].text[0], v)

  it('готовые наборы ≤ 250 символов (в своём режиме), строки модов наборов есть в данных', () => {
    for (const p of ITEMS_PRESETS) {
      for (const id of [...Object.keys(p.query.want ?? {}), ...(p.query.avoid ?? [])]) expect(byId.has(id), `${p.id}: ${id}`).toBe(true)
      const r = buildItemsRegex(d, lang, itemsPresetQuery(p))
      expect(r.ok, `${p.id}: ${r.length} ${r.text}`).toBe(true)
      expect(r.length).toBeLessThanOrEqual(REGEX_LIMIT)
      expect(r.text).not.toBe('')
      expect(isItemsPresetQuery(p, itemsPresetQuery(p))).toBe(true)
      expect(isItemsPresetQuery(p, { ...itemsPresetQuery(p), itemLevel: 1 })).toBe(false)
    }
  })

  it('наборы: «ботинки себе», «на продажу», флаконы, ваал-камни', () => {
    const c = corpus(lang)
    const preset = (id: string): ItemsQuery => itemsPresetQuery(ITEMS_PRESETS.find((p) => p.id === id)!)
    const [boots] = c.labels['class.boots']
    const [gloves] = c.labels['class.gloves']
    const [rare] = c.labels['rarity.rare']
    const [magic] = c.labels['rarity.magic']
    const boot = (r: string, ms: number, life: number, cls = boots): string =>
      [cls, r, 'X', 'Y', '--------', vendorLine('moveSpeed', ms), vendorLine('life', life)].join('\n')
    const bootsQ = compileSearch(buildItemsRegex(d, lang, preset('rareBoots')).text)
    expect(bootsQ(boot(rare, 30, 60))).toBe(true)
    expect(bootsQ(boot(rare, 20, 60))).toBe(false)
    expect(bootsQ(boot(rare, 30, 40))).toBe(false)
    expect(bootsQ(boot(magic, 30, 60))).toBe(false)
    expect(bootsQ(boot(rare, 30, 60, gloves))).toBe(false)

    const sell = compileSearch(buildItemsRegex(d, lang, preset('rareSell')).text)
    const ring = (lines: string[], r = rare): string => [c.labels['class.ring'][0], r, 'X', 'Y', '--------', ...lines].join('\n')
    expect(sell(ring([vendorLine('life', 85)]))).toBe(true)
    expect(sell(ring([vendorLine('life', 60), vendorLine('resFire', 45)]))).toBe(true)
    expect(sell(ring([vendorLine('life', 60), vendorLine('resFire', 30)]))).toBe(false)
    expect(sell(ring([vendorLine('life', 85)], magic))).toBe(false)

    const [lifeFlask] = c.labels['class.lifeFlask']
    const bleed = byId.get(FLASK_MOD_IDS.bleedImmunity)!
    const flask = compileSearch(buildItemsRegex(d, lang, preset('flaskBleed')).text)
    expect(flask([lifeFlask, magic, 'X', '--------', ...bleed.display.split('\n').map((l) => fill(l, 4))].join('\n'))).toBe(true)
    expect(flask([lifeFlask, magic, 'X', '--------', own(byId.get('local_flask_amount_to_recover_+%')!)].join('\n'))).toBe(false)

    const utility = compileSearch(buildItemsRegex(d, lang, preset('flaskUtility')).text)
    const [util] = c.labels['class.utilityFlask']
    expect(utility([util, magic, 'X', '--------', own(byId.get(FLASK_MOD_IDS.effect)!)].join('\n'))).toBe(true)
    expect(utility([util, magic, 'X', '--------', own(byId.get(FLASK_MOD_IDS.duration)!)].join('\n'))).toBe(true)
    expect(utility([util, magic, 'X', '--------'].join('\n'))).toBe(false)

    // ваал-камни: название «Vaal Haste» / «Спешка ваал»; база «Vaal Regalia» без «Rarity: Gem» не подсветится
    const [skill] = c.labels['class.skillGem']
    const [gemR] = c.labels['rarity.gem']
    const vaal = compileSearch(buildItemsRegex(d, lang, preset('vaalGems')).text)
    const gem = (name: string): string => [skill, gemR, name, '--------', lang === 'en' ? 'Level: 20' : 'Уровень: 20'].join('\n')
    expect(vaal(gem(lang === 'en' ? 'Vaal Haste' : 'Спешка ваал'))).toBe(true)
    expect(vaal(gem(lang === 'en' ? 'Haste' : 'Спешка'))).toBe(false)
    const regalia = d.bases.find((b) => b.id === 'Armours/BodyArmours/BodyInt16')
    if (regalia) expect(vaal(ring([], rare).replace('Y', regalia.name))).toBe(false)
    const noVaal = compileSearch(buildItemsRegex(d, lang, q({ vaal: 'exclude' })).text)
    expect(noVaal(gem(lang === 'en' ? 'Vaal Haste' : 'Спешка ваал'))).toBe(false)
    expect(noVaal(gem(lang === 'en' ? 'Haste' : 'Спешка'))).toBe(true)
  })

  it('«любое» одной группой — то же, что каждое условие отдельно; «все сразу» — все', () => {
    const life = byId.get('base_maximum_life')!
    const fire = byId.get('base_fire_damage_resistance_%')!
    const query = { props: { resCold: 30, moveSpeed: 20 } as Partial<Record<VendorModKey, number>>, want: { [life.id]: 50, [fire.id]: 30 } }
    const any = compileSearch(buildItemsRegex(d, lang, q({ ...query, mode: 'any' })).text)
    const all = compileSearch(buildItemsRegex(d, lang, q({ ...query, mode: 'all' })).text)
    const parts = [
      compileSearch(buildItemsRegex(d, lang, q({ props: { resCold: 30 } })).text),
      compileSearch(buildItemsRegex(d, lang, q({ props: { moveSpeed: 20 } })).text),
      compileSearch(buildItemsRegex(d, lang, q({ want: { [life.id]: 50 } })).text),
      compileSearch(buildItemsRegex(d, lang, q({ want: { [fire.id]: 30 } })).text)
    ]
    for (const v of [10, 19, 20, 29, 30, 31, 49, 50, 60]) {
      const lines = [vendorLine('resCold', v), vendorLine('moveSpeed', v), own(life, v), own(fire, v)]
      for (const l of lines) {
        const text = item(lang, [l])
        expect(any(text), `${v}: ${l}`).toBe(parts.some((m) => m(text)))
      }
      const text = item(lang, lines)
      expect(all(text), `все ${v}`).toBe(parts.every((m) => m(text)))
    }
  })

  it('«не хочу», «без влияния» и «без осквернённых» — один терм "!a|b|c"', () => {
    const life = byId.get('base_maximum_life')!
    const r = buildItemsRegex(d, lang, q({ avoid: [life.id], noInfluence: true, corrupted: 'exclude' }))
    expect(r.text.startsWith('"!')).toBe(true)
    expect(r.text.match(/"!/g)).toHaveLength(1)
    const c = corpus(lang)
    const match = compileSearch(r.text)
    expect(match(item(lang, ['X']))).toBe(true)
    expect(match(item(lang, [own(life)]))).toBe(false)
    expect(match(item(lang, ['X', c.labels['influence.shaper'][0]]))).toBe(false)
    expect(match(item(lang, ['X', c.labels.corrupted[0]]))).toBe(false)
  })

  it('also: выбранная строка заденет строки, где она есть целиком, — только на этом классе', () => {
    const ms = d.mods.find((m) => m.id === 'base_movement_velocity_+%')!
    expect(ms.also?.length).toBeGreaterThan(0)
    const any = buildItemsRegex(d, lang, q({ want: { [ms.id]: 0 } }))
    expect(any.sideMatches.length).toBe(ms.also!.length)
    const onFlask = buildItemsRegex(d, lang, q({ itemClass: 'utilityFlask', want: { [ms.id]: 0 } }))
    expect(onFlask.sideMatches.every((id) => byId.get(id)!.cls?.includes('utilityFlask') ?? true)).toBe(true)
    expect(onFlask.sideMatches.length).toBeLessThan(any.sideMatches.length)
  })

  it('база без класса и чужая база не попадают в строку', () => {
    const b = d.bases.find((x) => x.cls === 'boots')!
    expect(buildItemsRegex(d, lang, q({ base: b.id })).text).toBe('')
    expect(buildItemsRegex(d, lang, q({ itemClass: 'gloves', base: b.id })).text).toBe(d.classes.gloves.includes(' ') ? `"${d.classes.gloves}"` : d.classes.gloves)
  })

  it('переполнение: что убрать, чтобы влезть в 250', () => {
    const want = Object.fromEntries(d.mods.filter((m) => m.cls?.includes('ring')).slice(0, 40).map((m) => [m.id, 0]))
    const r = buildItemsRegex(d, lang, q({ itemClass: 'ring', rarity: ['rare'], want }))
    expect(r.ok).toBe(false)
    expect(r.overflow!.by).toBe(r.length - REGEX_LIMIT)
    const saved = r.overflow!.suggest.reduce((n, s) => n + s.saves, 0)
    expect(saved).toBeGreaterThanOrEqual(r.overflow!.by)
  })
})

describe('библиотека: настройки «Предметов»', () => {
  it('мусор отбрасывается, база — только вместе с классом, «не хочу» не пересекается с «хочу»', () => {
    let n = 0
    const lib = normalizeLibrary(
      {
        prefs: {
          page: 'items',
          items: {
            itemClass: 'lifeFlask',
            base: 'Flasks/FlaskLife10',
            rarity: ['magic', 'epic'],
            itemLevel: 500,
            influence: ['shaper', 'nope'],
            corrupted: 'exclude',
            props: { life: 40, gemFire: 7, nope: 3 },
            want: { a: 10, b: -1, ['x'.repeat(400)]: 1 },
            avoid: ['a', 'c', 'c', 5],
            mode: 'all',
            gemLevel: 99,
            gemQuality: 7,
            vaal: 'only'
          }
        }
      },
      () => `id${++n}`
    )
    expect(lib.prefs.page).toBe('items')
    const it = lib.prefs.items
    expect(it.itemClass).toBe('lifeFlask')
    expect(it.base).toBe('Flasks/FlaskLife10')
    expect(it.rarity).toEqual(['magic'])
    expect(it.itemLevel).toBe(100)
    expect(it.influence).toEqual(['shaper'])
    expect(it.props).toEqual({ life: 40, gemFire: 1 })
    expect(it.want).toEqual({ a: 10, b: 0 })
    expect(it.avoid).toEqual(['c'])
    expect(it.mode).toBe('all')
    expect(it.gemLevel).toBe(40)
    expect(it.vaal).toBe('only')
    expect(normalizeLibrary({ prefs: { items: { base: 'x' } } }, () => 'y').prefs.items.base).toBe('')
    expect(normalizeLibrary({}, () => 'y').prefs.items).toEqual(emptyItemsQuery())
  })
})
