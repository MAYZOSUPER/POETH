import { readdirSync, readFileSync } from 'fs'
import { join, resolve } from 'path'
import { describe, expect, it } from 'vitest'
import {
  detectedFromItem,
  detectedFromLog,
  logLineLang,
  newerDetected,
  nextDetected,
  resolveGameLang
} from '@shared/gameLang'
import type { GameLang, GameLangDetected } from '@shared/types'

// Язык клиента игры (S26): по тексту предмета (фикстуры парсера EN/RU), по строкам Client.txt (фикстуры сделок
// EN/RU и строки BackendErrors), выбор языка названий и что записывать в настройки.

const LANGS: GameLang[] = ['en', 'ru']

function items(lang: GameLang): [string, string][] {
  const dir = resolve(__dirname, '../fixtures/poe1', lang)
  return readdirSync(dir)
    .filter((f) => f.endsWith('.txt'))
    .map((f) => [f, readFileSync(join(dir, f), 'utf8')])
}

function log(lang: GameLang): string[] {
  return readFileSync(resolve(__dirname, '../deals/fixtures', `client-${lang}.txt`), 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
}

const line = (text: string, time = '21:40:00'): string => `2026/10/28 ${time} 74519921 cffb0658 [INFO Client 19012] ${text}`

describe.each(LANGS)('по предмету (Ctrl+D), клиент %s', (lang) => {
  const all = items(lang)
  it('фикстур много (проверка сама себя)', () => expect(all.length).toBeGreaterThanOrEqual(30))
  it.each(all)('%s', (_file, text) => {
    expect(detectedFromItem(text, 5)).toEqual({ lang, by: 'item', at: 5 })
  })
})

describe('по предмету: не предмет или чужой язык', () => {
  it.each([
    ['пусто', ''],
    ['обычный текст', 'hello world'],
    ['французский клиент', "Classe d'objet: Anneaux\nRareté: Rare"],
    ['«Item Class» не в начале', 'note\nItem Class: Rings']
  ])('%s → null', (_name, text) => expect(detectedFromItem(text, 1)).toBeNull())

  it('BOM и CRLF не мешают', () => {
    expect(detectedFromItem('﻿Класс предмета: Кольца\r\nРедкость: Редкий', 1)?.lang).toBe('ru')
    expect(detectedFromItem('Item Class: Rings\r\nRarity: Rare', 1)?.lang).toBe('en')
  })
})

describe('по журналу игры (Client.txt)', () => {
  it.each(LANGS)('фикстура %s: язык по последней строке с языком, время — из строки', (lang) => {
    const d = detectedFromLog(log(lang), 0)
    expect(d).toEqual({ lang, by: 'log', at: new Date(2026, 9, 28, 21, 41, 0).getTime() })
  })

  it.each([
    [': You have entered Lioneye’s Watch.', 'en'],
    [': Вы вошли в область Застава Львиного глаза.', 'ru'],
    ['@From <GG> MarshWitch: Hi, I would like to buy your …', 'en'],
    ['@To MoonWarden: Hi', 'en'],
    ['@От кого <РУС> Ведьма_Ладоги: Здравствуйте', 'ru'],
    ['@Кому ЛунныйСтраж: спасибо', 'ru'],
    [': MarshWitch has joined the area.', 'en'],
    [': MarshWitch has left the area.', 'en'],
    [': Ведьма_Ладоги присоединилась.', 'ru'],
    [': Ведьма_Ладоги покинула область.', 'ru'],
    [': Trade accepted.', 'en'],
    [': Сделка отклонена.', 'ru'],
    [': AFK mode is now ON. Autoreply "brb"', 'en'],
    [': Режим "отошёл" включён. Авто-ответ "скоро"', 'ru'],
    [': DND mode is now OFF.', 'en']
  ] as const)('%s → %s', (text, lang) => {
    expect(logLineLang(line(text))).toEqual({ lang, ts: new Date(2026, 9, 28, 21, 40, 0).getTime() })
  })

  it.each([
    ['чат игроков', '#Player: @From someone: hi'],
    ['торговый чат по-русски', '$Торговец: Вы вошли в область Лес.'],
    ['служебная строка', 'Generating level 68 area "HeistHub" with seed 1'],
    ['шёпот без префикса канала', 'From MarshWitch: hi']
  ])('%s — не о языке клиента', (_name, text) => expect(logLineLang(line(text))).toBeNull())

  it('решает последняя строка с языком: игру перезапустили на другом языке', () => {
    const lines = [line(': You have entered Lioneye’s Watch.', '20:00:00'), line(': Вы вошли в область Лес.', '21:00:00'), line('#Bob: hi', '21:05:00')]
    expect(detectedFromLog(lines, 0)).toMatchObject({ lang: 'ru', by: 'log' })
    expect(detectedFromLog(lines.slice(0, 1), 0)).toMatchObject({ lang: 'en' })
  })

  it('строка без даты — время fallbackAt; без строк о языке — null', () => {
    expect(detectedFromLog(['[INFO Client 1] : You have entered Town.'], 42)).toEqual({ lang: 'en', by: 'log', at: 42 })
    expect(detectedFromLog([line('#Bob: hi'), ''], 42)).toBeNull()
    expect(detectedFromLog([], 42)).toBeNull()
  })
})

describe('что записывать в настройки', () => {
  const en = (at: number, by: 'item' | 'log' = 'item'): GameLangDetected => ({ lang: 'en', by, at })
  const ru = (at: number, by: 'item' | 'log' = 'item'): GameLangDetected => ({ lang: 'ru', by, at })

  it('первое определение — пишем', () => expect(nextDetected(null, en(1))).toEqual(en(1)))
  it('тот же язык — не пишем (settings.json не трогаем на каждый Ctrl+D)', () => expect(nextDetected(en(1), en(5, 'log'))).toBeNull())
  it('язык сменился — пишем', () => expect(nextDetected(en(1), ru(5, 'log'))).toEqual(ru(5, 'log')))
  it('старый хвост лога не перебивает свежий предмет', () => expect(nextDetected(en(100), ru(50, 'log'))).toBeNull())

  it('newerDetected — более свежее', () => {
    expect(newerDetected(en(1), ru(2))).toEqual(ru(2))
    expect(newerDetected(ru(3), en(2))).toEqual(ru(3))
    expect(newerDetected(null, en(1))).toEqual(en(1))
    expect(newerDetected(en(1), undefined)).toEqual(en(1))
    expect(newerDetected(null, null)).toBeNull()
  })
})

describe('язык названий: выбор → определено → интерфейс', () => {
  const det: GameLangDetected = { lang: 'en', by: 'item', at: 1 }
  it.each([
    [{ choice: 'auto', detected: null }, 'ru', { lang: 'ru', by: 'ui' }],
    [{ choice: 'auto', detected: null }, 'en', { lang: 'en', by: 'ui' }],
    [{ choice: 'auto', detected: det }, 'ru', { lang: 'en', by: 'item' }],
    [{ choice: 'auto', detected: { ...det, lang: 'ru', by: 'log' } }, 'en', { lang: 'ru', by: 'log' }],
    [{ choice: 'ru', detected: det }, 'en', { lang: 'ru', by: 'choice' }],
    [{ choice: 'en', detected: null }, 'ru', { lang: 'en', by: 'choice' }]
  ] as const)('%j, интерфейс %s → %j', (gl, ui, want) => expect(resolveGameLang(gl, ui)).toEqual(want))

  it('настроек ещё нет — язык интерфейса', () => expect(resolveGameLang(null, 'ru')).toEqual({ lang: 'ru', by: 'ui' }))
})
