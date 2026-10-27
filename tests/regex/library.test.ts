import { describe, expect, it } from 'vitest'
import {
  REGEX_PRESETS,
  assignSlot,
  compileSearch,
  emptyLibrary,
  exportPayload,
  importEntries,
  normalizeLibrary,
  pasteText,
  patchPrefs,
  presetText,
  removeEntry,
  upsertEntry
} from '@shared/regex'
import { LANGS, loadMapData } from './helpers'

// Библиотека строк: нормализация файла, слоты хоткеев, экспорт/импорт; пресеты для новичков.

function ids(): () => string {
  let n = 0
  return () => `id${++n}`
}

describe('библиотека', () => {
  it('битый файл → пустая библиотека с настройками по умолчанию', () => {
    for (const raw of [null, 42, 'x', [], { entries: 'nope' }]) {
      const lib = normalizeLibrary(raw, ids())
      expect(lib.entries).toEqual([])
      expect(lib.prefs.gameLang).toBe('auto')
      expect(lib.prefs.page).toBe('maps')
    }
  })

  it('отбрасывает пустые и слишком длинные строки, чинит дубли id и слотов', () => {
    const lib = normalizeLibrary(
      {
        entries: [
          { id: 'a', name: 'A', text: 'abc', game: 'poe1', slot: 1 },
          { id: 'a', name: 'B', text: 'def', game: 'poe1', slot: 1 },
          { id: 'c', name: '', text: 'x', game: 'poe1' },
          { id: 'd', name: 'D', text: 'x'.repeat(251), game: 'poe1' },
          { id: 'e', name: 'E', text: 'ghi', game: 'poe2', slot: 1 },
          { id: 'f', name: 'F', text: 'jkl', game: 'poe9', slot: 7 }
        ],
        prefs: { gameLang: 'ru', page: 'vendor', maps: { thresholds: { quantity: 80.4, rarity: -5 } } }
      },
      ids()
    )
    expect(lib.entries.map((e) => [e.id, e.slot ?? null])).toEqual([
      ['a', 1],
      ['id1', null],
      ['e', 1],
      ['f', null]
    ])
    expect(lib.entries[3].game).toBe('poe1')
    expect(lib.prefs.gameLang).toBe('ru')
    expect(lib.prefs.page).toBe('vendor')
    expect(lib.prefs.maps.thresholds).toEqual({ quantity: 80 })
  })

  it('добавить, изменить, удалить; слот один на игру', () => {
    const id = ids()
    let lib = emptyLibrary()
    lib = upsertEntry(lib, { name: 'Карты', text: '"!efl"', game: 'poe1' }, id)
    lib = upsertEntry(lib, { name: 'Торговец', text: '-.-.-', game: 'poe1' }, id)
    expect(lib.entries.map((e) => e.id)).toEqual(['id1', 'id2'])
    lib = assignSlot(lib, 'id1', 1)
    lib = assignSlot(lib, 'id2', 1)
    expect(lib.entries.map((e) => e.slot ?? null)).toEqual([null, 1])
    expect(pasteText(lib, 'poe1', 1)).toBe('-.-.-')
    expect(pasteText(lib, 'poe2', 1)).toBeNull()
    lib = upsertEntry(lib, { id: 'id2', name: 'Торговец 4L', text: '-.-.-', game: 'poe1' }, id)
    expect(lib.entries[1]).toMatchObject({ name: 'Торговец 4L', slot: 1 })
    lib = assignSlot(lib, 'id2', null)
    expect(pasteText(lib, 'poe1', 1)).toBeNull()
    lib = removeEntry(lib, 'id1')
    expect(lib.entries.map((e) => e.id)).toEqual(['id2'])
    expect(upsertEntry(lib, { name: 'x', text: 'y'.repeat(300), game: 'poe1' }, id)).toBe(lib)
  })

  it('экспорт → импорт: без дублей, новые id при совпадении', () => {
    const id = ids()
    let lib = emptyLibrary()
    lib = upsertEntry(lib, { name: 'A', text: 'abc', game: 'poe1' }, id)
    const file = JSON.parse(JSON.stringify(exportPayload(lib)))
    expect(file.format).toBe('poeth-regex')
    const again = importEntries(lib, file, id)!
    expect(again.added).toBe(0)
    const other = importEntries(lib, [{ id: 'id1', name: 'B', text: 'def', game: 'poe1' }], id)!
    expect(other.added).toBe(1)
    expect(other.library.entries.map((e) => e.id)).toEqual(['id1', 'id2'])
    expect(importEntries(lib, { foo: 1 }, id)).toBeNull()
  })

  it('patchPrefs нормализует', () => {
    const lib = patchPrefs(emptyLibrary(), { gameLang: 'en', page: 'library' })
    expect(lib.prefs).toMatchObject({ gameLang: 'en', page: 'library' })
  })
})

describe.each(LANGS)('пресеты %s', (lang) => {
  const data = loadMapData(lang)
  it('у каждого пресета есть строка ≤ 250 символов и она разбирается', () => {
    for (const p of REGEX_PRESETS) {
      const text = presetText(p, lang, data)
      expect(text, p.id).toBeTruthy()
      expect(text!.length, p.id).toBeLessThanOrEqual(250)
      expect(() => compileSearch(text!)).not.toThrow()
    }
  })
  it('пресеты карт без данных — null', () => {
    const p = REGEX_PRESETS.find((x) => x.page === 'maps')!
    expect(presetText(p, lang, null)).toBeNull()
  })
})
