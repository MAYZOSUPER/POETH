import { describe, expect, it } from 'vitest'
import {
  ENGINE_MAX_REQUEST,
  ENGINE_STATS,
  cleanCompareReply,
  cleanReady,
  cleanSelftest,
  cleanStats,
  encodeRequest,
  parseEngineLine
} from '@shared/pob/engineProtocol'
import { readFileSync } from 'fs'
import { join } from 'path'

// S44: протокол движка — ответ движка тоже недоверенный (собирается заново); запрос — только ASCII и с пределом.

describe('протокол движка', () => {
  it('строка ответа: только с префиксом и JSON-объект', () => {
    expect(parseEngineLine('@poeth {"id":1,"ok":true}\r')).toEqual({ id: 1, ok: true })
    expect(parseEngineLine('{"id":1,"ok":true}')).toBeNull()
    expect(parseEngineLine('@poeth [1,2]')).toBeNull()
    expect(parseEngineLine('@poeth not json')).toBeNull()
    expect(parseEngineLine('@poeth ' + JSON.stringify({ s: 'x'.repeat(300 * 1024) }))).toBeNull()
  })

  it('готовность: версия дерева вида 3_29', () => {
    expect(cleanReady({ ready: true, tree: '3_29', ms: 3200.4, mem: -1 })).toEqual({ ready: true, tree: '3_29', ms: 3200, mem: 0 })
    expect(cleanReady({ ready: true, tree: '../x' })).toBeNull()
    expect(cleanReady({ ready: false, tree: '3_29' })).toBeNull()
  })

  it('статы: только известные имена и конечные числа; пустой объект Lua ([]) — пусто', () => {
    expect(cleanStats({ Life: 1500, FullDPS: 1e20, Str: 'x', __proto__: 1, Evil: 5, TotalEHP: Number.NaN })).toEqual({ Life: 1500 })
    expect(cleanStats([])).toEqual({})
  })

  it('ответ compare: число вариантов как в запросе, тексты без управляющих символов, коды ошибок из списка', () => {
    const v = {
      ok: true,
      base: { Life: 1 },
      results: [{ ok: true, new: { Life: 2 } }, { ok: false, error: 'slot' }],
      item: { base: 'Unset\u0007 Ring', rarity: 'RARE', reqLevel: 48, level: 300, unsupported: ['a\nb', 5, ''] }
    }
    expect(cleanCompareReply(v, 2)).toEqual({
      ok: true,
      base: { Life: 1 },
      results: [{ ok: true, new: { Life: 2 } }, { ok: false, error: 'slot' }],
      item: { base: 'Unset Ring', rarity: 'RARE', reqLevel: 48, level: 0, unsupported: ['a b'] }
    })
    expect(cleanCompareReply(v, 3)).toBeNull()
    expect(cleanCompareReply({ ok: false, error: 'rm -rf', detail: 'x' }, 1)).toEqual({ ok: false, error: 'internal', detail: 'x' })
  })

  it('selftest: только true считается «заблокировано»', () => {
    expect(cleanSelftest({ ok: true, socket: true, lcurl: 1 })).toMatchObject({ socket: true, lcurl: false, ffi: false })
  })

  it('запрос: только ASCII, перевод строки в конце, предел длины', () => {
    const s = encodeRequest({ id: 1, item: 'Ёлка\nMjölner' })!
    expect(s.endsWith('\n')).toBe(true)
    expect(s.slice(0, -1)).not.toMatch(/[^\x20-\x7e]/)
    expect(JSON.parse(s)).toEqual({ id: 1, item: 'Ёлка\nMjölner' })
    expect(encodeRequest({ xml: 'x'.repeat(ENGINE_MAX_REQUEST) })).toBeNull()
  })

  it('список статов совпадает с server.lua (STATS + статы приспешников)', () => {
    const lua = readFileSync(join(__dirname, '../../resources/pob/server.lua'), 'utf8')
    const block = /local STATS = \{([\s\S]*?)\n\}/.exec(lua)?.[1] ?? ''
    const names = [...block.matchAll(/'(\w+)'/g)].map((m) => m[1])
    expect([...names, 'MinionCombinedDPS', 'MinionTotalDPS'].sort()).toEqual([...ENGINE_STATS].sort())
  })
})
