import { describe, expect, it } from 'vitest'
import { detectItemLang, isItemText } from '../../src/main/input/itemText'
import { captureFileName } from '../../src/main/input/captureName'

const EN = ['Item Class: Gloves', 'Rarity: Rare', 'Grim Grasp', 'Sorcerer Gloves', '--------', 'Item Level: 84'].join(
  '\r\n'
)
const RU = ['Класс предмета: Перчатки', 'Редкость: Редкий', 'Мрачная хватка', 'Перчатки чародея'].join('\r\n')

describe('детектор текста предмета', () => {
  it('EN и RU по первой строке (CRLF, как копирует игра)', () => {
    expect(detectItemLang(EN)).toBe('en')
    expect(detectItemLang(RU)).toBe('ru')
    expect(isItemText(EN)).toBe(true)
    expect(isItemText(RU)).toBe(true)
  })

  it('старый формат «Rarity:» / «Редкость:»', () => {
    expect(detectItemLang('Rarity: Currency\nChaos Orb')).toBe('en')
    expect(detectItemLang('Редкость: Валюта\nСфера хаоса')).toBe('ru')
  })

  it('BOM в начале не мешает', () => {
    expect(detectItemLang('﻿Item Class: Rings\nRarity: Unique')).toBe('en')
  })

  it('чужой язык клиента — это предмет, но не поддерживаемый', () => {
    const de = 'Gegenstandsklasse: Handschuhe\nSeltenheit: Selten'
    expect(isItemText(de)).toBe(true)
    expect(detectItemLang(de)).toBeNull()
  })

  it('обычный текст — не предмет', () => {
    for (const s of ['', 'hello', 'item class: gloves', ' Item Class: Gloves', 'Rarity:Rare', 'POETH-S1-CHECK']) {
      expect(isItemText(s), JSON.stringify(s)).toBe(false)
      expect(detectItemLang(s)).toBeNull()
    }
    expect(isItemText(undefined as unknown as string)).toBe(false)
  })
})

describe('имя файла захвата (POETH_SAVE_CAPTURES)', () => {
  const at = new Date(2026, 9, 28, 13, 5, 9, 42)

  it('время + имя предмета', () => {
    expect(captureFileName(EN, at)).toBe('20261028-130509-042-Grim_Grasp.txt')
    expect(captureFileName(RU, at)).toBe('20261028-130509-042-Мрачная_хватка.txt')
  })

  it('без строки имени — значение редкости; запрещённые символы убраны', () => {
    expect(captureFileName('Item Class: Stackable Currency\r\nRarity: Currency', at)).toBe(
      '20261028-130509-042-Currency.txt'
    )
    expect(captureFileName('Item Class: X\nRarity: Rare\nA<b>:c/d?\nBase', at)).toBe('20261028-130509-042-Abcd.txt')
  })
})
