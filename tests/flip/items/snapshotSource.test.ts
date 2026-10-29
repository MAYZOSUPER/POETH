import { describe, expect, it } from 'vitest'
import { SNAPSHOT_TTL_MS, SnapshotSource, type GetResult } from '../../../src/main/games/poe1/flip/items/snapshotSource'
import { buildSnapshot } from '../../../tools/data/ninja-snapshot.mjs'

const AT = Date.parse('2026-10-29T19:17:00Z')
const index = { v: 1, source: 'poe.ninja', at: AT, leagues: [{ league: 'Allflame', file: 'poe1/Allflame.json', at: AT, lines: 1 }] }
const snap = buildSnapshot({
  league: 'Allflame',
  at: AT,
  lines: [{ id: 'kaoms-heart-glorious-plate', name: "Kaom's Heart", base: 'Glorious Plate', type: 'UniqueArmour', cls: 3, chaos: 250, count: 137, listings: 317 }]
})

function setup(opts: { fail?: boolean } = {}) {
  let now = AT + 60_000
  const calls: Array<{ rel: string; etag?: string }> = []
  const disk = new Map<string, unknown>()
  let fail = opts.fail ?? false
  const src = new SnapshotSource({
    get: async (rel, etag): Promise<GetResult> => {
      calls.push({ rel, etag })
      if (fail) throw new Error('net::ERR_INTERNET_DISCONNECTED')
      if (rel === 'index.json') return etag === 'i1' ? { status: 304, body: '' } : { status: 200, body: JSON.stringify(index), etag: 'i1' }
      if (rel === 'poe1/Allflame.json') return etag === 'f1' ? { status: 304, body: '' } : { status: 200, body: JSON.stringify(snap), etag: 'f1' }
      return { status: 404, body: '' }
    },
    readCache: async (rel) => disk.get(rel) ?? null,
    writeCache: async (rel, data) => void disk.set(rel, JSON.parse(JSON.stringify(data))),
    now: () => now
  })
  return {
    src,
    calls,
    disk,
    tick: (ms: number) => (now += ms),
    setFail: (v: boolean) => (fail = v)
  }
}

describe('снимок цен из ветки prices', () => {
  it('index → файл лиги; повтор в течение часа — из памяти; потом — условный запрос (304)', async () => {
    const t = setup()
    const a = await t.src.load('Allflame')
    expect(a.problem).toBeNull()
    expect(a.snap?.lines[0].name).toBe("Kaom's Heart")
    expect(t.calls.map((c) => c.rel)).toEqual(['index.json', 'poe1/Allflame.json'])
    await t.src.load('Allflame')
    expect(t.calls.length).toBe(2)
    t.tick(SNAPSHOT_TTL_MS + 1)
    const b = await t.src.load('Allflame')
    expect(b.snap?.lines.length).toBe(1)
    expect(t.calls.slice(2)).toEqual([
      { rel: 'index.json', etag: 'i1' },
      { rel: 'poe1/Allflame.json', etag: 'f1' }
    ])
    expect(t.disk.has('items-Allflame.json')).toBe(true)
  })

  it('лиги нет в снимке — «missing»', async () => {
    const t = setup()
    const r = await t.src.load('Hardcore Allflame')
    expect(r).toEqual({ snap: null, problem: 'missing' })
  })

  it('нет сети — данные из кэша на диске и «net», повтор не раньше чем через 10 минут', async () => {
    const t = setup()
    await t.src.load('Allflame')
    // новый запуск приложения: память пуста, сеть пропала
    const fresh = new SnapshotSource({
      get: async () => {
        throw new Error('offline')
      },
      readCache: async (rel) => t.disk.get(rel) ?? null,
      writeCache: async () => undefined,
      now: () => AT + 3 * SNAPSHOT_TTL_MS
    })
    const r = await fresh.load('Allflame')
    expect(r.problem).toBe('net')
    expect(r.snap?.lines[0].id).toBe('kaoms-heart-glorious-plate')
    expect(fresh.nextAt('Allflame')).toBe(AT + 3 * SNAPSHOT_TTL_MS + 10 * 60_000)
  })

  it('битый ответ не затирает рабочий снимок', async () => {
    const t = setup()
    await t.src.load('Allflame')
    t.setFail(true)
    t.tick(SNAPSHOT_TTL_MS + 1)
    const r = await t.src.load('Allflame')
    expect(r.problem).toBe('net')
    expect(r.snap?.lines.length).toBe(1)
  })
})
