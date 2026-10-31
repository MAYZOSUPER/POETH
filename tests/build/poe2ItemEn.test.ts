import { beforeAll, describe, expect, it } from 'vitest'
import type { Poe2Data } from '@shared/poe2/data'
import { parseClipboard, type ParsedItem } from '@shared/poe2/parser'
import { ItemCategory } from '@shared/poe2/parser/meta'
import { poe2ItemEnCopy } from '@shared/build/poe2ItemEn'
import { poe2ItemClassEn } from '@shared/build/poe2ItemClassEn'
import { itemEnNotice, type ItemEnCopy } from '@shared/build/itemEnCopy'
import { UNTRANSLATED_MARK } from '@shared/build/pobItemEn'
import { fixtureNames, readFixture, store } from '../poe2/helpers'

// S61: «Скопировать предмет по-английски» для PoE 2 — RU-текст Ctrl+C → английский текст для буфера (PoB 2, Discord).
// Golden на всех парах RU/EN фикстур S47 (EN — EE2/Sidekick, RU — машинные близнецы по данным EE2): EN-текст из RU
// парсер PoE 2 (EN) разбирает в те же моды (вид:ref), то же имя, базу, редкость и категорию, что настоящий EN-текст.

let ru: Poe2Data
let en: Poe2Data
beforeAll(async () => {
  ;[ru, en] = await Promise.all([store.ensureLanguage('ru'), store.ensureLanguage('en')])
})

const NAMES = fixtureNames('ru').filter((n) => fixtureNames('en').includes(n))

function parse(text: string): ParsedItem {
  const res = parseClipboard(text, en)
  if (!res.ok) throw new Error(`${res.error}: ${text.slice(0, 80)}`)
  return res.value
}

function copyRu(name: string): Extract<ItemEnCopy, { ok: true }> {
  const r = poe2ItemEnCopy(readFixture('ru', name), 'ru', ru, en)
  if (!r.ok) throw new Error(`${name}: ${r.reason}`)
  return r
}

/** Моды разбора как множество «вид:ref» (порядок и повторы не важны: важно, что узнано то же). */
function modRefs(item: ParsedItem): string[] {
  return [...new Set(item.newMods.flatMap((m) => m.stats.map((s) => `${m.info.type}:${s.stat.ref}`)))].sort()
}

describe('PoE 2: RU → EN для буфера, пары фикстур (golden)', () => {
  it('пар достаточно: экипировка, руны, путевые камни, плитки, камни, валюта, уники', () => {
    expect(NAMES.length).toBeGreaterThanOrEqual(39)
  })

  it.each(NAMES)('%s: EN-текст из RU разбирается парсером EN в те же моды', (name) => {
    const r = copyRu(name)
    expect(r.mode).toBe('translated')
    expect(modRefs(parse(r.text))).toEqual(modRefs(parse(readFixture('en', name))))
  })

  it.each(NAMES)('%s: то же имя, база, редкость, категория; нет строк { … } и роллов (10-20), кириллица — только с пометкой', (name) => {
    const r = copyRu(name)
    const fromRu = parse(r.text)
    const orig = parse(readFixture('en', name))
    expect(fromRu.info.refName).toBe(orig.info.refName)
    expect(fromRu.rarity).toBe(orig.rarity)
    expect(fromRu.category).toBe(orig.category)
    expect(r.text).not.toMatch(/^\{/m)
    expect(r.text).not.toMatch(/\d\([+-]?\d+(?:\.\d+)?-[+-]?\d+(?:\.\d+)?\)/)
    for (const line of r.text.split('\n')) if (/[А-Яа-яЁё]/.test(line)) expect(line).toContain(UNTRANSLATED_MARK)
    // заметку цены в текст для PoB не переносим
    expect(r.text).not.toMatch(/^Note:/m)
  })

  it('на фикстурах непереведённых строк нет (строки без кириллицы, которых нет в данных, — как есть)', () => {
    for (const n of NAMES) expect(copyRu(n).untranslated, n).toEqual([])
  })
})

describe('PoE 2: RU → EN, текст', () => {
  it('доспех с рунами: класс, редкость, свойства, требования одной строкой, гнёзда, моды с пометками', () => {
    const r = copyRu('ee2-body-armour-runes')
    expect(r.text).toBe(
      [
        'Item Class: Body Armours',
        'Rarity: Rare',
        'POETH Item',
        'Soldier Cuirass',
        '--------',
        'Quality: +20% (augmented)',
        'Armour: 3075 (augmented)',
        '--------',
        'Requires: Level 65, 121 Str',
        '--------',
        'Sockets: S S S',
        '--------',
        'Item Level: 80',
        '--------',
        '54% increased Armour, Evasion and Energy Shield (rune)',
        '--------',
        '103% increased Armour',
        '+70 to Armour',
        '41% increased Armour',
        '+256 to Armour (desecrated)',
        '+32 to Strength',
        '48% reduced Duration of Bleeding on You',
        'Hits against you have 44% reduced Critical Damage Bonus'
      ].join('\n')
    )
  })

  it('собственные, расколотые, очернённые, ремесленные моды из строк { … } — с пометками обычного Ctrl+C', () => {
    const amulet = copyRu('ee2-amulet-desecrated').text
    expect(amulet).toMatch(/% increased Rarity of Items found \(implicit\)$/m)
    expect(amulet).toMatch(/% to Cold Resistance \(fractured\)$/m)
    expect(amulet).toMatch(/% to Fire and Chaos Resistances \(desecrated\)$/m)
    expect(copyRu('ee2-bow-three-runes').text).toMatch(/% to Critical Hit Chance \(crafted\)$/m)
  })

  it('уник: имя и база уника по-английски, описание (флавор) не переносится', () => {
    const r = copyRu('ee2-focus-unique')
    const lines = r.text.split('\n')
    expect(lines.slice(0, 4)).toEqual(['Item Class: Foci', 'Rarity: Unique', parse(readFixture('en', 'ee2-focus-unique')).info.refName, 'Crystal Focus'])
    expect(r.text).not.toMatch(/flash of blue/)
  })

  it('путевой камень: свойства карты по строкам клиента, тир в базе', () => {
    const r = copyRu('ee2-waystone')
    expect(r.text).toContain('Item Class: Waystones')
    expect(r.text).toContain('Pack Size: +34% (augmented)')
    expect(r.text).toContain('Waystone Drop Chance: +75% (augmented)')
  })

  it('валюта: класс, редкость, имя, стопка; описание не переносится', () => {
    expect(copyRu('sk-currency-essence').text).toBe(
      ['Item Class: Stackable Currency', 'Rarity: Currency', 'Essence of Enhancement', '--------', 'Stack Size: 1/10'].join('\n')
    )
  })

  it('камень: имя, уровень, без описания умения', () => {
    const r = copyRu('sk-gem-skill')
    expect(r.text).toMatch(/^Rarity: Gem$/m)
    expect(r.text).not.toMatch(/[А-Яа-яЁё]/)
  })

  it('непереведённая RU-строка мода — на месте с пометкой, в списке', () => {
    const raw = readFixture('ru', 'ee2-ring-implicit').trimEnd() + '\nэтого свойства нет в данных 12%\n'
    const r = poe2ItemEnCopy(raw, 'ru', ru, en)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.untranslated).toEqual(['этого свойства нет в данных 12%'])
    expect(r.text).toContain(`этого свойства нет в данных 12%${UNTRANSLATED_MARK}`)
    expect(itemEnNotice(r, true)).toEqual({ key: 'overlay.itemEn.partial', params: { n: 1 }, kind: 'warn' })
  })
})

describe('PoE 2: EN-клиент, ошибки, классы', () => {
  it.each(NAMES)('%s: EN-текст — как есть', (name) => {
    const raw = readFixture('en', name)
    const r = poe2ItemEnCopy(raw, 'en', null, null)
    expect(r).toEqual({ ok: true, mode: 'as-is', text: raw, untranslated: [] })
  })

  it('нет данных, не предмет — честная ошибка', () => {
    expect(poe2ItemEnCopy(readFixture('ru', 'ee2-ring-implicit'), 'ru', null, en)).toEqual({ ok: false, reason: 'data' })
    expect(poe2ItemEnCopy('просто текст', 'ru', ru, en)).toEqual({ ok: false, reason: 'parse' })
    expect(itemEnNotice({ ok: false, reason: 'parse' }, false).key).toBe('overlay.itemEn.failed')
  })

  it('класс предмета: по таблице RU, латиница — как есть, иначе — по категории', () => {
    expect(poe2ItemClassEn('Путевые камни')).toBe('Waystones')
    expect(poe2ItemClassEn('Неогранённые камни умений')).toBe('Uncut Skill Gems')
    expect(poe2ItemClassEn('Talismans')).toBe('Talismans')
    expect(poe2ItemClassEn('Новый класс', ItemCategory.Spear)).toBe('Spears')
  })
})
