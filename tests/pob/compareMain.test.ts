import { describe, expect, it } from 'vitest'
import { parsePobXml } from '@shared/pob/model'
import type { StoredBuild } from '@shared/types/build'
import type { EquipEntry, EquipState } from '@shared/types/equip'
import { EngineError } from '../../src/main/pob/engine'
import { pobCompare, type PobCompareDeps } from '../../src/main/pob/compare'
import { fixtureXml } from './fixtures'

// S44: обработчик «Точного расчёта (PoB)» в main — бета выключена, нет билда, проверка запроса, ответ движка
// (собирается заново), против чего считали, ошибки движка → коды окна.

const parsed = parsePobXml(fixtureXml('pobbin-guardian'))
if (!parsed.ok) throw new Error('fixture')
const stored: StoredBuild = { id: 'b1', build: parsed.build, source: { kind: 'code' }, edits: {}, addedAt: 1, openedAt: 1 }

const ring1: EquipEntry = {
  slot: 'Ring 1',
  kind: 'ring',
  rarity: 'rare',
  name: null,
  base: 'Two-Stone Ring',
  n: { life: 0, lifePct: 0, es: 0, mana: 0, res: { fire: 0, cold: 0, lightning: 0, chaos: 0 }, attr: { str: 0, dex: 0, int: 0 }, speed: 0, block: 0, pdps: 0, edps: 0, dmg: 0, caster: false },
  req: { level: 0, str: 0, dex: 0, int: 0 },
  flask: null,
  at: 1
}

function state(over: Partial<EquipState & { pob: boolean }> = {}): EquipState & { pob: boolean } {
  return { on: true, character: 'Hero', level: 60, items: [ring1], mine: null, pob: true, ...over }
}

type Call = { cmd: string; payload: Record<string, unknown> }

function deps(reply: (c: Call) => Record<string, unknown> | Error, over: Partial<PobCompareDeps> = {}) {
  const calls: Call[] = []
  const d: PobCompareDeps = {
    engine: {
      stop: () => void calls.push({ cmd: 'stop', payload: {} }),
      request: async (cmd: string, payload: Record<string, unknown> = {}) => {
        calls.push({ cmd, payload })
        const r = cmd === 'ping' ? { ok: true } : reply({ cmd, payload })
        if (r instanceof Error) throw r
        return { reply: r, started: cmd === 'ping' ? 3400 : null, ready: { ready: true as const, tree: '3_29', ms: 3000, mem: 100 } }
      }
    },
    build: async () => stored,
    equip: async () => state(),
    version: () => 'v2.67.2',
    ...over
  }
  return { d, calls }
}

const okReply = (n: number): Record<string, unknown> => ({
  ok: true,
  base: { CombinedDPS: 1000, TotalEHP: 5000, Life: 1500, FireResist: 75, MissingFireResist: 0 },
  results: Array.from({ length: n }, (_, i) => ({ ok: true, new: { CombinedDPS: 1100 + i, TotalEHP: 4800, Life: 1500, FireResist: 70, MissingFireResist: 5, Bogus: 1 } })),
  item: { base: 'Two-Stone Ring', rarity: 'RARE', reqLevel: 64, level: 60, unsupported: ['Some weird mod'] }
})

const REQ = { item: 'Rarity: Rare\nPOETH Item\nTwo-Stone Ring', options: [['Ring 1'], ['Ring 2']], worn: [{ slot: 'Ring 1', item: 'Rarity: Rare\nPOETH Item\nUnset Ring' }] }

describe('main: точный расчёт PoB', () => {
  it('бета выключена или блок скрыт — «off», движок не трогаем', async () => {
    for (const s of [state({ pob: false }), state({ on: false })]) {
      const { d, calls } = deps(() => okReply(2), { equip: async () => s })
      expect(await pobCompare(REQ, d)).toEqual({ ok: false, error: 'off' })
      expect(calls).toEqual([])
    }
  })

  it('кривой запрос — «bad-input»; нет билда — «no-build»', async () => {
    expect(await pobCompare({ item: 1 }, deps(() => okReply(1)).d)).toEqual({ ok: false, error: 'bad-input' })
    expect(await pobCompare(REQ, deps(() => okReply(2), { build: async () => null }).d)).toEqual({ ok: false, error: 'no-build' })
  })

  it('расчёт: XML этапа с надетой вещью, варианты слотов, против надетой / вещи билда, нельзя надеть по уровню', async () => {
    const { d, calls } = deps(() => okReply(2))
    const r = await pobCompare(REQ, d)
    expect(calls.map((c) => c.cmd)).toEqual(['ping', 'compare'])
    const p = calls[1].payload
    expect(p.options).toEqual([['Ring 1'], ['Ring 2']])
    expect(p.item).toBe(REQ.item)
    expect(p.xml).toContain('Unset Ring')
    expect(p.xml).toContain('treeVersion="3_29"')
    if (!r.ok) throw new Error(r.error)
    expect(r.options.map((o) => o.against)).toEqual(['worn', 'build'])
    expect(r.options[0].dps).toEqual({ before: 1000, after: 1100, pct: 10 })
    expect(r.options[0].ehp?.pct).toBe(-4)
    expect(r.options[0].res[0]).toMatchObject({ el: 'fire', lost: true })
    expect(r.reqLevel).toBe(64)
    expect(r.level).toBe(60)
    expect(r.unsupported).toEqual(['Some weird mod'])
    expect(r.pob).toBe('v2.67.2')
    expect(r.ms.start).toBe(3400)
  })

  it('ответ движка с другим числом вариантов — «internal»; ошибка PoB — её код', async () => {
    expect(await pobCompare(REQ, deps(() => okReply(1)).d)).toEqual({ ok: false, error: 'internal' })
    expect(await pobCompare(REQ, deps(() => ({ ok: false, error: 'item' })).d)).toEqual({ ok: false, error: 'item' })
    // билд не открылся — ещё раз в новом процессе; снова нет — ошибка, и следующий запрос тоже в новом процессе
    const b = deps(() => ({ ok: false, error: 'build' }))
    expect(await pobCompare(REQ, b.d)).toEqual({ ok: false, error: 'build' })
    expect(b.calls.map((c) => c.cmd)).toEqual(['ping', 'compare', 'stop', 'compare', 'stop'])
    expect(await pobCompare(REQ, deps(() => ({ ok: false, error: 'something-else' })).d)).toEqual({ ok: false, error: 'internal' })
  })

  it('билд не открылся из-за прошлого билда — со второй попытки в новом процессе получилось', async () => {
    let n = 0
    const { d, calls } = deps(() => (n++ === 0 ? { ok: false, error: 'build' } : okReply(2)))
    const r = await pobCompare(REQ, d)
    expect(r.ok).toBe(true)
    expect(calls.map((c) => c.cmd)).toEqual(['ping', 'compare', 'stop', 'compare'])
  })

  it.each(['timeout', 'crashed', 'unavailable', 'no-engine'] as const)('движок: %s — тот же код окну, без исключения', async (code) => {
    expect(await pobCompare(REQ, deps(() => new EngineError(code)).d)).toEqual({ ok: false, error: code })
  })
})
