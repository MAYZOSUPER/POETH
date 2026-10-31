import { describe, expect, it } from 'vitest'
import { coreText, normText, readRumoursFromText, searchRumours } from '@shared/rumours/match'
import { bundled } from './fixtures'

// Поиск по началу строки на языке клиента и разбор текста журнала (S65), RU и EN.

const list = bundled().rumours
const ids = (rs: { id: string }[]): string[] => rs.map((r) => r.id)

describe('normText / coreText', () => {
  it('регистр, ё, многоточие, апостроф', () => {
    expect(normText('Упавшие Звёзды…')).toBe('упавшие звезды...')
    expect(normText('Somethin’ fishy...')).toBe("somethin' fishy...")
    expect(coreText('Fallen stars...')).toBe('fallen stars')
    expect(coreText('Сульфит!')).toBe('сульфит')
  })
})

describe('searchRumours', () => {
  it('EN: начало строки', () => {
    expect(ids(searchRumours(list, 'fal', 'en'))[0]).toBe('fallen-stars')
    expect(ids(searchRumours(list, 'cold', 'en'))).toEqual(['cold-as-ice'])
  })

  it('RU: начало строки, «е» вместо «ё»', () => {
    expect(ids(searchRumours(list, 'упавш', 'ru'))).toEqual(['fallen-stars'])
    expect(ids(searchRumours(list, 'Все что', 'ru'))).toEqual(['all-that-glitters'])
    expect(ids(searchRumours(list, 'пьющ', 'ru'))).toEqual(['stardrinker'])
  })

  it('сначала начало строки, потом слово внутри, потом остров', () => {
    // «звёзды»: слово внутри «Упавшие звёзды...» и «Пьющий звёзды...»
    expect(ids(searchRumours(list, 'звёзд', 'ru')).sort()).toEqual(['fallen-stars', 'stardrinker'])
    // остров «Холодные скалы» → слух «Холодна как лёд...»
    const r = searchRumours(list, 'холодн', 'ru')
    expect(ids(r)).toEqual(['cold-as-ice'])
    // остров по-английски
    expect(ids(searchRumours(list, 'Jade', 'en'))).toEqual(['crazed-chieftain'])
  })

  it('клиент на другом языке, чем настройка: находит по второй строке в конце', () => {
    expect(ids(searchRumours(list, 'fallen', 'ru'))).toContain('fallen-stars')
    expect(ids(searchRumours(list, 'сульф', 'en'))).toEqual(['sulphite'])
  })

  it('пустой запрос — все 20 по алфавиту языка клиента', () => {
    const ru = searchRumours(list, '', 'ru')
    expect(ru).toHaveLength(20)
    expect(ru[0].text.ru).toBe('Бескрайние скалы...')
    const en = searchRumours(list, '  ', 'en')
    expect(en[0].text.en).toBe('A good fellow...')
  })

  it('ничего не подошло — пусто', () => {
    expect(searchRumours(list, 'qqqq', 'en')).toEqual([])
  })
})

describe('readRumoursFromText (текст журнала из буфера)', () => {
  it('EN: три строки слухов среди текста предмета', () => {
    const text = [
      'Item Class: Expedition Logbooks',
      'Rarity: Magic',
      'Expedition Logbook',
      '--------',
      'Area Level: 79',
      '--------',
      'Fallen stars...',
      'Cold as ice...',
      "Somethin' fishy...",
      '--------',
      'Take this item to the Atlas.'
    ].join('\r\n')
    expect(readRumoursFromText(list, text)).toEqual({ ids: ['fallen-stars', 'cold-as-ice', 'somethin-fishy'], lang: 'en' })
  })

  it('RU: строки с «ё» и многоточием-символом, «Слух: …»', () => {
    const text = ['Класс предмета: Журналы экспедиции', 'Упавшие звезды…', 'Слух: Сульфит!', 'Хотя бы сухо...'].join('\n')
    expect(readRumoursFromText(list, text)).toEqual({ ids: ['fallen-stars', 'sulphite', 'its-dry-at-least'], lang: 'ru' })
  })

  it('повтор строки — один раз; больше 6 — обрезаем', () => {
    const many = list.slice(0, 8).map((r) => r.text.en)
    const r = readRumoursFromText(list, ['Fallen stars...', 'Fallen stars...', ...many].join('\n'))
    expect(r.ids).toHaveLength(6)
    expect(r.ids[0]).toBe('fallen-stars')
  })

  it('слух внутри длинной фразы не цепляем', () => {
    expect(readRumoursFromText(list, 'Hulls crash and splinter, all that glitters is not gold, they say').ids).toEqual([])
    expect(readRumoursFromText(list, 'Item Class: Rings\nRarity: Rare\nCold Ring').ids).toEqual([])
  })
})
