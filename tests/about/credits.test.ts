import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { CREDITS, MIT_LICENSE_TEXT, parseSupporters } from '@shared/credits'
import { DOMAIN_DICTS } from '../../src/renderer/src/i18n/dicts'

// «О программе» (S9): копия лицензии совпадает с LICENSE, файл «Благодарностей» валиден,
// у каждой атрибуции есть описание на RU и EN.

const ROOT = resolve(__dirname, '../..')

describe('О программе', () => {
  it('текст MIT в приложении совпадает с LICENSE', () => {
    const file = readFileSync(resolve(ROOT, 'LICENSE'), 'utf8').replace(/\r\n/g, '\n')
    expect(MIT_LICENSE_TEXT.trim()).toBe(file.trim())
  })

  it('resources/supporters.json — валидный массив', () => {
    const raw = JSON.parse(readFileSync(resolve(ROOT, 'resources/supporters.json'), 'utf8'))
    expect(Array.isArray(raw)).toBe(true)
    expect(parseSupporters(raw).length).toBe(raw.length)
  })

  it('parseSupporters: имена, since, дубли, мусор', () => {
    expect(parseSupporters(null)).toEqual([])
    expect(parseSupporters({ name: 'x' })).toEqual([])
    expect(
      parseSupporters([
        { name: '  Ведьма_Ладоги ', since: '10.2026' },
        { name: 'ведьма_ладоги' },
        { name: '' },
        { name: 'Очень_длинный_ник_подписчика_который_не_влезет_никуда_2026' },
        { name: 'Ash & Ember', since: 'вчера' },
        'строка',
        null
      ])
    ).toEqual([
      { name: 'Ведьма_Ладоги', since: '10.2026' },
      { name: 'Очень_длинный_ник_подписчика_который_не_' },
      { name: 'Ash & Ember' }
    ])
  })

  it('у каждой атрибуции есть описание RU/EN', () => {
    const all = Object.values(DOMAIN_DICTS)
    for (const c of CREDITS) {
      for (const lang of ['ru', 'en'] as const) {
        expect(all.some((d) => d[lang][`about.credit.${c.id}`]), `${lang}: about.credit.${c.id}`).toBe(true)
      }
    }
  })
})
