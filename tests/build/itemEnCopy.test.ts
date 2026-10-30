import { beforeAll, describe, expect, it } from 'vitest'
import type { Poe1Data, Poe1Lang } from '@shared/poe1/data'
import { parseItem, type ParsedItem } from '@shared/poe1/parser'
import { itemEnCopy, itemEnNotice, type ItemEnCopy } from '@shared/build/itemEnCopy'
import { itemClassEn } from '@shared/build/itemClassEn'
import { UNTRANSLATED_MARK } from '@shared/build/pobItemEn'
import { ItemCategory } from '@shared/poe1/parser/meta'
import { fixtureNames, readFixture, store } from '../poe1/helpers'

// S51: «Скопировать предмет по-английски» — RU-текст Ctrl+C → английский текст для буфера (PoB, Discord). Golden на
// всех парах RU/EN фикстур S2 (один и тот же предмет с ru.pathofexile.com и www.pathofexile.com плюс ручные расширенные
// Ctrl+C): EN-текст из RU парсер EN разбирает в те же stat-ref, что и настоящий EN-текст.

let data: Record<Poe1Lang, Poe1Data>
beforeAll(async () => {
  data = await store.ensureAll()
})

const NAMES = fixtureNames('ru').filter((n) => fixtureNames('en').includes(n))

function parse(text: string): ParsedItem {
  const res = parseItem(text, data)
  if (!res.ok) throw new Error(`${res.error}: ${text.slice(0, 80)}`)
  return res.value
}

function copyRu(name: string): Extract<ItemEnCopy, { ok: true }> {
  const r = itemEnCopy(readFixture('ru', name), 'ru', data.ru, data.en)
  if (!r.ok) throw new Error(`${name}: ${r.reason}`)
  return r
}

/** Статы разбора как множество «вид:ref» (порядок и повторы не важны: важно, что узнано то же). */
function statRefs(item: ParsedItem): string[] {
  return [...new Set(item.statsByType.map((s) => `${s.type}:${s.stat.ref}`))].sort()
}

describe('RU → EN для буфера: пары фикстур (golden)', () => {
  it('пар достаточно: экипировка, флаконы, самоцветы, карты, камни, карты судьбы, валюта', () => {
    expect(NAMES.length).toBeGreaterThanOrEqual(100)
  })

  it.each(NAMES)('%s: EN-текст из RU разбирается парсером EN в те же stat-ref', (name) => {
    const r = copyRu(name)
    expect(r.mode).toBe('translated')
    expect(statRefs(parse(r.text))).toEqual(statRefs(parse(readFixture('en', name))))
  })

  it.each(NAMES)('%s: то же имя, база, редкость; нет строк { … } и роллов (36-60)', (name) => {
    const r = copyRu(name)
    const fromRu = parse(r.text)
    const en = parse(readFixture('en', name))
    expect(fromRu.info.refName).toBe(en.info.refName)
    expect(fromRu.rarity).toBe(en.rarity)
    expect(fromRu.category).toBe(en.category)
    expect(r.text).not.toMatch(/^\{/m)
    expect(r.text).not.toMatch(/\d\([+-]?\d+(?:\.\d+)?-[+-]?\d+(?:\.\d+)?\)/)
    // кириллица — только в строках с пометкой
    for (const line of r.text.split('\n')) if (/[А-Яа-яЁё]/.test(line)) expect(line).toContain(UNTRANSLATED_MARK)
  })

  it('непереведённое — только то, чего нет в данных APT: legacy-моды флаконов, «обитатели исчезли» у карт, легаси timeless', () => {
    const left = NAMES.filter((n) => copyRu(n).untranslated.length > 0)
    for (const n of left) expect(n).toMatch(/^(flask-07|flask-10|map-\d+|timeless-02)$/)
    expect(left.length).toBeLessThanOrEqual(12)
  })
})

describe('RU → EN для буфера: текст', () => {
  it('расширенный Ctrl+C (редкое кольцо): как Ctrl+C игры — класс, редкость, требования, уровень, моды с видом', () => {
    const r = copyRu('adv-ring')
    expect(r.untranslated).toEqual([])
    expect(r.text).toBe(
      [
        'Item Class: Rings',
        'Rarity: Rare',
        'POETH Item',
        'Coral Ring',
        '--------',
        'Requirements:',
        'Level: 60',
        '--------',
        'Item Level: 83',
        '--------',
        '+24 to maximum Life (implicit)',
        '--------',
        '+64 to maximum Life',
        '21% increased Lightning Damage',
        '+33% to Fire Resistance',
        '+120 to Accuracy Rating',
        '+25% to Cold Resistance (crafted)',
        '--------',
        'Crusader Item'
      ].join('\n')
    )
  })

  it('обычный формат (текст с трейда): собственные моды — по месту секции, с пометкой (implicit)', () => {
    const r = copyRu('weapon-10')
    expect(r.text).toContain('36% increased Spell Damage (implicit)')
    expect(r.text).toContain('\n4% increased Cold Damage\n')
    expect(r.text.endsWith('Fractured Item')).toBe(true)
  })

  it('стат на нескольких строках (флакон): обе строки переведены, каждая своей строкой', () => {
    const r = copyRu('flask-01')
    expect(r.untranslated).toEqual([])
    expect(r.text).toContain('Grants Immunity to Chill for 4 seconds if used while Chilled\nGrants Immunity to Freeze for 4 seconds if used while Frozen')
    expect(r.text).toContain('Effect is not removed when Unreserved Mana is Filled\nEffect does not Queue')
    // свойства флакона («Длится…», «Восстанавливает…») — не моды
    expect(r.text).not.toContain('Recovers')
  })

  it('непереведённая строка остаётся на месте как есть, с пометкой', () => {
    const r = copyRu('map-01')
    expect(r.untranslated).toEqual(['Изначальные обитатели этой области исчезли'])
    expect(r.text).toContain(`Изначальные обитатели этой области исчезли${UNTRANSLATED_MARK} (implicit)`)
    expect(r.text).toContain('Area is infested with Fungal Growths (implicit)')
    expect(r.text).toContain('Map Tier: 13')
    for (const line of r.untranslated) expect(r.text).toContain(line + UNTRANSLATED_MARK)
  })

  it('неопознанная вещь: только база, «Unidentified» отдельной секцией', () => {
    const r = copyRu('armour-01')
    expect(r.text.split('\n').slice(0, 3)).toEqual(['Item Class: Body Armours', 'Rarity: Rare', 'Golden Plate'])
    expect(r.text).not.toContain('POETH Item')
    expect(r.text).toMatch(/\n--------\nUnidentified$/)
  })

  it('уник, осквернён: имя, база, «Corrupted» отдельно', () => {
    const r = copyRu('adv-unique-corrupted')
    expect(r.text.split('\n').slice(0, 4)).toEqual(['Item Class: Amulets', 'Rarity: Unique', 'Sidhebreath', 'Paua Amulet'])
    expect(r.text).toContain('+12 to all Attributes (implicit)')
    expect(r.text).toMatch(/\n--------\nCorrupted$/)
  })

  it('камень: имя, уровень, требования — без описания умения', () => {
    const r = copyRu('gem-01')
    expect(r.untranslated).toEqual([])
    expect(r.text).toBe(['Item Class: Skill Gems', 'Rarity: Gem', 'Shockwave Totem', '--------', 'Level: 1', '--------', 'Requirements:', 'Level: 28', 'Str: 67'].join('\n'))
  })

  it('валюта и карта судьбы: имя и стопка', () => {
    expect(copyRu('manual-currency-01').text).toBe('Item Class: Stackable Currency\nRarity: Currency\nChaos Orb\n--------\nStack Size: 7/20')
    expect(copyRu('card-01').text).toBe('Item Class: Divination Cards\nRarity: Divination Card\nThe Incantation\n--------\nStack Size: 4/4')
  })

  it('текст на диск и в сеть не нужен: только строка, в пределах 16 КБ', () => {
    for (const n of NAMES) expect(copyRu(n).text.length).toBeLessThanOrEqual(16 * 1024)
  })
})

describe('EN-клиент: как есть', () => {
  it.each(NAMES)('%s: текст не меняется', (name) => {
    const raw = readFixture('en', name)
    expect(itemEnCopy(raw, 'en', null, null)).toEqual({ ok: true, mode: 'as-is', text: raw, untranslated: [] })
  })

  it('пустой или слишком длинный — не кладём', () => {
    expect(itemEnCopy('  ', 'en', null, null)).toEqual({ ok: false, reason: 'build' })
    expect(itemEnCopy(`Item Class: Rings\n${'x'.repeat(17 * 1024)}`, 'en', null, null)).toEqual({ ok: false, reason: 'build' })
  })
})

describe('ошибки', () => {
  it('нет данных языка — data', () => {
    expect(itemEnCopy(readFixture('ru', 'adv-ring'), 'ru', null, data.en)).toEqual({ ok: false, reason: 'data' })
    expect(itemEnCopy(readFixture('ru', 'adv-ring'), 'ru', data.ru, null)).toEqual({ ok: false, reason: 'data' })
    // данные не того языка
    expect(itemEnCopy(readFixture('ru', 'adv-ring'), 'ru', data.en, data.en)).toEqual({ ok: false, reason: 'data' })
  })

  it('не предмет — parse', () => {
    expect(itemEnCopy('Класс предмета: Кольца\n', 'ru', data.ru, data.en)).toEqual({ ok: false, reason: 'parse' })
    expect(itemEnCopy('просто текст', 'ru', data.ru, data.en)).toEqual({ ok: false, reason: 'parse' })
  })
})

describe('уведомление поверх игры', () => {
  it('переведено целиком / частично / EN как есть / ошибка', () => {
    expect(itemEnNotice(copyRu('adv-ring'), true)).toEqual({ key: 'overlay.itemEn.copied', kind: 'info' })
    expect(itemEnNotice(copyRu('timeless-02'), true)).toEqual({ key: 'overlay.itemEn.partial', params: { n: 2 }, kind: 'warn' })
    expect(itemEnNotice(itemEnCopy(readFixture('en', 'adv-ring'), 'en', null, null), true)).toEqual({ key: 'overlay.itemEn.asIs', kind: 'info' })
    expect(itemEnNotice({ ok: false, reason: 'parse' }, false)).toEqual({ key: 'overlay.itemEn.failed', kind: 'warn' })
    // текст собран, но main не положил его в буфер
    expect(itemEnNotice(copyRu('adv-ring'), false)).toEqual({ key: 'overlay.itemEn.failed', kind: 'warn' })
  })
})

describe('класс предмета на английском', () => {
  it('по строке RU-клиента, по категории, флаконы — по базе', () => {
    expect(itemClassEn('Шпаги', ItemCategory.OneHandedSword, 'Rapier')).toBe('Thrusting One Hand Swords')
    expect(itemClassEn('Неизвестно', ItemCategory.TwoHandedAxe, 'Vaal Axe')).toBe('Two Hand Axes')
    expect(itemClassEn('', ItemCategory.Flask, 'Divine Life Flask')).toBe('Life Flasks')
    expect(itemClassEn('', ItemCategory.Flask, 'Eternal Hybrid Flask')).toBe('Hybrid Flasks')
    expect(itemClassEn('', ItemCategory.Flask, 'Quicksilver Flask')).toBe('Utility Flasks')
    expect(itemClassEn('', ItemCategory.HeistTool, 'x')).toBe('Heist Tool')
    expect(itemClassEn('', undefined, 'x')).toBe('Items')
  })
})
