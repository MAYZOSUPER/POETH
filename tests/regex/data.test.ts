import { describe, expect, it } from 'vitest'
import { compileSearch, MAP_LABEL_KEYS, thresholdTerm, type EmulatorOptions } from '@shared/regex'
import { hasAllLines, LANGS, loadMapData, modLines, PROPS } from './helpers'

// Данные генератора: каждый токен совпадает только со своим модом (и «надмножествами» — модами,
// где есть все его строки), не задевает строки подсказки карты; метки порогов и флаги однозначны.
// Проверяем в двух режимах игры, которые не подтверждены: ё=е и регистр кириллицы.

const MODES: EmulatorOptions[] = [{}, { foldYo: true }]

describe.each(LANGS)('данные карт %s', (lang) => {
  const data = loadMapData(lang)

  it('собраны: моды, мета, метки, флаги', () => {
    expect(data.meta.lang).toBe(lang)
    expect(data.meta.patch).toMatch(/^\d+\.\d+/)
    expect(data.mods.length).toBeGreaterThan(100)
    expect(new Set(data.mods.map((m) => m.id)).size).toBe(data.mods.length)
    for (const key of MAP_LABEL_KEYS) expect(data.labels[key]).toBeTruthy()
    expect(data.flags.corrupted).toBeTruthy()
    expect(data.extra.length).toBeGreaterThan(100)
  })

  it('id модов одинаковые в EN и RU', () => {
    const other = loadMapData(lang === 'en' ? 'ru' : 'en')
    expect(data.mods.map((m) => m.id)).toEqual(other.mods.map((m) => m.id))
  })

  it('токены: 2–24 символа, без кавычек и !, большинство ≤ 12', () => {
    for (const m of data.mods) {
      expect(m.token.length, m.id).toBeGreaterThanOrEqual(2)
      expect(m.token.length, m.id).toBeLessThanOrEqual(24)
      expect(m.token, m.id).not.toMatch(/["!]/)
      expect(m.token, m.id).not.toMatch(/^ | $/)
    }
    const short = data.mods.filter((m) => m.token.length <= 12).length
    expect(short / data.mods.length).toBeGreaterThan(0.95)
  })

  it.each(MODES)('каждый токен совпадает со своим модом и только с ним (%o)', (mode) => {
    for (const m of data.mods) {
      const match = compileSearch(`"${m.token}"`, mode)
      expect(match(modLines(m).join('\n')), `${m.id} не находит сам себя`).toBe(true)
      for (const o of data.mods) {
        if (o === m || !match(modLines(o).join('\n'))) continue
        const ok = hasAllLines(o, m) || (m.alsoMatches ?? []).includes(o.id)
        expect(ok, `${lang}: токен «${m.token}» мода ${m.id} задевает ${o.id}`).toBe(true)
      }
    }
  })

  it.each(MODES)('токены не задевают ни одну строку подсказки карты (%o)', (mode) => {
    for (const m of data.mods) {
      const match = compileSearch(`"${m.token}"`, mode)
      for (const line of data.extra) {
        const text = line.replace(/#/g, '83')
        expect(match(text), `${lang}: «${m.token}» (${m.id}) задевает «${line}»`).toBe(false)
      }
    }
  })

  it('alsoMatches — только у модов, все строки которых есть в других модах', () => {
    const lines = new Set(data.mods.flatMap((m) => m.text.split('\n').map((l) => `${m.id}\n${l}`)))
    for (const m of data.mods.filter((x) => x.alsoMatches)) {
      for (const l of m.text.split('\n')) {
        const elsewhere = data.mods.some((o) => o !== m && lines.has(`${o.id}\n${l}`))
        expect(elsewhere, `${m.id}: строка «${l}» уникальна, а токен неуникален`).toBe(true)
      }
    }
    expect(data.mods.filter((x) => x.alsoMatches).length).toBeLessThan(10)
  })

  it('RU: токен совпадает с подсказкой, даже если игра различает регистр кириллицы', () => {
    if (lang !== 'ru') return
    const bad = data.mods.filter((m) => !compileSearch(`"${m.token}"`, { asciiCaseOnly: true })(modLines(m).join('\n')))
    expect(bad.map((m) => `${m.id}: ${m.token}`)).toEqual([])
  })

  it('пороги: метка совпадает только со своей строкой свойства', () => {
    const modText = data.mods.map((m) => modLines(m, 999).join('\n'))
    for (const key of MAP_LABEL_KEYS) {
      const match = compileSearch(`"${thresholdTerm(data, key, 1)}"`)
      expect(match(PROPS[lang][key].replace('{v}', '50')), key).toBe(true)
      for (const [other, line] of Object.entries(PROPS[lang])) {
        if (other !== key) expect(match(line.replace('{v}', '999')), `${key} задевает ${other}`).toBe(false)
      }
      for (const t of modText) expect(match(t), `${key} задевает мод «${t}»`).toBe(false)
      for (const l of data.extra) {
        if (l.startsWith(PROPS[lang][key].toLowerCase().slice(0, 8))) continue
        expect(match(l.replace(/#/g, '999')), `${key} задевает «${l}»`).toBe(false)
      }
    }
  })

  it('флаги: «осквернено»/«неопознано» находят только свою строку', () => {
    const corrupted = lang === 'en' ? 'Corrupted' : 'Осквернено'
    const unid = lang === 'en' ? 'Unidentified' : 'Неопознано'
    for (const [flag, line] of [
      [data.flags.corrupted, corrupted],
      [data.flags.unidentified, unid]
    ]) {
      for (const mode of [...MODES, { asciiCaseOnly: true }]) {
        const match = compileSearch(`"${flag}"`, mode)
        expect(match(`Rarity: Rare\n${line}`), flag).toBe(true)
        for (const m of data.mods) expect(match(modLines(m).join('\n')), `${flag} задевает ${m.id}`).toBe(false)
        for (const l of data.extra) {
          if (l === line.toLowerCase()) continue
          expect(match(l), `${flag} задевает «${l}»`).toBe(false)
        }
      }
    }
  })
})
