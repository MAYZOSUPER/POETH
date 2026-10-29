import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'
import { MAX_GAME_TEXT, toGameLine } from '../../src/main/input/chatLine'

// Ввод в игру — одна строка (S29): чужой текст (whisper из API трейда, находки live, импортированная
// regex-библиотека) не должен дать игре вторую команду через перевод строки в буфере обмена.

const ch = (code: number): string => String.fromCharCode(code)
const WHISPER =
  '@Seller Hi, I would like to buy your Tabula Rasa listed for 10 chaos in Mercenaries (stash tab "~price 10 chaos"; position: left 1, top 2)'

describe('toGameLine', () => {
  it('обычные команды и whisper — без изменений', () => {
    expect(toGameLine(WHISPER)).toBe(WHISPER)
    expect(toGameLine('/invite Игрок_один')).toBe('/invite Игрок_один')
    expect(toGameLine('@last ty')).toBe('@last ty')
    expect(toGameLine('"!res|ga ty"')).toBe('"!res|ga ty"')
  })

  it.each([
    ['\\n', '\n'],
    ['\\r\\n', '\r\n'],
    ['\\r', '\r'],
    ['\\t', '\t'],
    ['NUL', ch(0)],
    ['DEL', ch(0x7f)],
    ['NEL U+0085', ch(0x85)],
    ['U+2028', ch(0x2028)],
    ['U+2029', ch(0x2029)]
  ])('перевод строки %s не даёт второй команды', (_name, br) => {
    const line = toGameLine(`@Seller hi (stash tab "x${br}/kick Seller")`)
    expect(line).toBe('@Seller hi (stash tab "x /kick Seller")')
    expect(line).not.toMatch(/[\r\n\u0085\u2028\u2029]/)
  })

  it('серия переводов строк — один пробел', () => {
    expect(toGameLine(`a\r\n\r\n\tb`)).toBe('a b')
  })

  it.each([
    ['не строка', 42],
    ['null', null],
    ['пусто', ''],
    ['одни пробелы', '   '],
    ['одни переводы строк', '\r\n\n'],
    ['длиннее лимита', 'x'.repeat(MAX_GAME_TEXT + 1)]
  ])('%s — не вводится (null)', (_name, input) => {
    expect(toGameLine(input)).toBeNull()
  })

  it('ровно лимит — вводится', () => {
    expect(toGameLine('x'.repeat(MAX_GAME_TEXT))).toHaveLength(MAX_GAME_TEXT)
  })
})

describe('gameInput: каждый ввод в игру идёт через toGameLine', () => {
  const src = readFileSync(resolve(__dirname, '../../src/main/input/gameInput.ts'), 'utf8')

  it.each(['typeInChat', 'stashSearch'])('%s сначала проверяет текст, потом трогает буфер и клавиши', (fn) => {
    const body = src.slice(src.indexOf(`export function ${fn}(`))
    const end = body.indexOf('\nexport ', 10)
    const own = end > 0 ? body.slice(0, end) : body
    const guard = own.indexOf('toGameLine(input)')
    expect(guard, fn).toBeGreaterThan(0)
    expect(guard).toBeLessThan(own.indexOf('prepareInput()'))
    expect(own.indexOf("return 'no-input'")).toBeGreaterThan(guard)
    // в буфер обмена уходит только проверенная строка
    expect(own).not.toMatch(/writeText\(input\)/)
  })
})
