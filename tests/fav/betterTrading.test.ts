import { describe, expect, it } from 'vitest'
import {
  decodeBtFolder,
  encodeBtFolder,
  exportBtFolder,
  importBtFolder,
  parseBtLocation,
  splitBtStrings
} from '@shared/favorites'

// Формат Better Trading "3:" + base64(JSON{icn,tit,ver,trs:[{tit,loc}]}): туда-обратно, кириллица,
// битые строки, несколько строк в одном тексте.

/** Строка, собранная как в расширении (без нашего кодировщика). */
function btString(obj: unknown): string {
  return '3:' + Buffer.from(JSON.stringify(obj), 'utf8').toString('base64')
}

describe('Better Trading', () => {
  it('разбирает строку расширения', () => {
    const s = btString({
      icn: 'ascendancy.assassin',
      tit: 'Boots',
      ver: '1',
      trs: [
        { tit: 'Boots 30% + life', loc: '1:search:Lk9a2bQ' },
        { tit: 'Divine → Chaos', loc: '1:exchange:8YkX3Pz' },
        { tit: 'битый', loc: 'nonsense' }
      ]
    })
    expect(importBtFolder(s)).toEqual({
      title: 'Boots',
      game: 'poe1',
      icon: 'ascendancy.assassin',
      searches: [
        { title: 'Boots 30% + life', game: 'poe1', type: 'search', slug: 'Lk9a2bQ' },
        { title: 'Divine → Chaos', game: 'poe1', type: 'exchange', slug: '8YkX3Pz' }
      ]
    })
  })

  it('туда-обратно с кириллицей и PoE2', () => {
    const str = exportBtFolder({ title: 'Сапоги на продажу', game: 'poe1', icon: 'x' }, [
      { title: 'Сапоги 30% + здоровье', type: 'search', slug: 'Lk9a2bQ', game: 'poe1' },
      { title: 'Карты T16 оптом', type: 'exchange', slug: 'Ab12', game: 'poe1' }
    ])
    expect(str.startsWith('3:')).toBe(true)
    const back = importBtFolder(str)!
    expect(back.title).toBe('Сапоги на продажу')
    expect(back.icon).toBe('x')
    expect(back.searches.map((s) => [s.title, s.type, s.slug])).toEqual([
      ['Сапоги 30% + здоровье', 'search', 'Lk9a2bQ'],
      ['Карты T16 оптом', 'exchange', 'Ab12']
    ])
    // декодируется и обычным base64 → UTF-8 (как в расширении)
    const json = JSON.parse(Buffer.from(str.slice(2), 'base64').toString('utf8'))
    expect(json).toMatchObject({ tit: 'Сапоги на продажу', ver: '1', trs: [{ loc: '1:search:Lk9a2bQ' }, {}] })

    const p2 = importBtFolder(exportBtFolder({ title: 'P2', game: 'poe2' }, [{ title: 'a', type: 'search', slug: 'Q1', game: 'poe2' }]))!
    expect(p2.game).toBe('poe2')
    expect(p2.searches[0]).toMatchObject({ game: 'poe2', slug: 'Q1' })
  })

  it('encode/decode сохраняют все поля', () => {
    const folder = { icn: 'i', tit: 'Тест ✓', ver: '1', trs: [{ tit: 'a', loc: '1:search:Z' }] }
    expect(decodeBtFolder(encodeBtFolder(folder))).toEqual(folder)
  })

  it('битые строки — null', () => {
    for (const s of ['', '2:abc', '3:', '3:!!!!', btString([1, 2]), btString({ tit: 'x' }), '3:' + Buffer.from('{oops').toString('base64'), 42]) {
      expect(decodeBtFolder(s), String(s)).toBeNull()
    }
  })

  it('loc: версия трейда, тип, slug', () => {
    expect(parseBtLocation('2:search:abc')).toEqual({ game: 'poe2', type: 'search', slug: 'abc' })
    expect(parseBtLocation('1:bulk:abc')).toBeNull()
    // новый id поиска — base64url с - и _
    expect(parseBtLocation('1:search:a-b_c')).toEqual({ game: 'poe1', type: 'search', slug: 'a-b_c' })
    expect(parseBtLocation('1:search:a/b')).toBeNull()
    expect(parseBtLocation('1:search:a:b')).toBeNull()
    expect(parseBtLocation('1:search:a b')).toBeNull()
    expect(parseBtLocation('1:search:')).toBeNull()
  })

  it('туда-обратно с длинным id поиска (как его сейчас отдаёт сайт)', () => {
    const long = 'H4sIAAAAAAAAA3WOsQ7CMAxEfwUda4dKDFTdYOYfkFWMsEidKHFQqyr_TsLUhVv8zvLJtyEZWU4YN_hg4hUjSFeUDrYGru7GZC-Ohys7Q4enOOP4C1ikB993ix3SNPms1lA05Aq4KL1Fj_1w7lFKfTBLmv7ExX1cm7PUQsOp3tLSoDR9ATKElH-1AAAA'
    const str = exportBtFolder({ title: 'Ремни', game: 'poe1' }, [
      { title: 'Ремень на здоровье', type: 'search', slug: long, game: 'poe1' },
      { title: 'Старый поиск', type: 'search', slug: 'Lk9a2bQ', game: 'poe1' }
    ])
    // в тексте рядом с другими строками — находится целиком
    expect(splitBtStrings(`вот: ${str} и ещё`)).toEqual([str])
    expect(importBtFolder(str)!.searches.map((s) => s.slug)).toEqual([long, 'Lk9a2bQ'])
    // и строку расширения с таким loc мы тоже читаем
    const ext = btString({ icn: '', tit: 'BT', ver: '1', trs: [{ tit: 'x', loc: `1:search:${long}` }] })
    expect(importBtFolder(ext)!.searches[0].slug).toBe(long)
  })

  it('несколько строк в одном тексте', () => {
    const a = btString({ icn: '', tit: 'A', ver: '1', trs: [] })
    const b = btString({ icn: '', tit: 'Б', ver: '1', trs: [] })
    expect(splitBtStrings(`мусор ${a}\n\n${b}  `)).toEqual([a, b])
    expect(splitBtStrings(null)).toEqual([])
  })
})
