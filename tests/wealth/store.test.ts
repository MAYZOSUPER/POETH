import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { WealthStore, newSnapshotId, parseHistory, sanitizeConfig } from '../../src/main/games/poe1/wealth/store'
import type { WealthSnapshot, WealthSummary } from '../../src/shared/types/wealth'

const dirs: string[] = []
function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), 'poeth-wealth-'))
  dirs.push(d)
  return d
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

const summary = (id: string, at: number, chaos = 100): WealthSummary => ({
  id,
  at,
  league: 'Allflame',
  chaos,
  divineRate: 300,
  tabs: [],
  priced: 1,
  unpriced: 0
})
const snap = (id: string, at: number): WealthSnapshot => ({ summary: summary(id, at), lines: [] })

describe('хранилище учёта богатства', () => {
  it('история NDJSON: дописывается строкой, битая строка не мешает', async () => {
    const root = tmp()
    const store = new WealthStore(root)
    await store.appendHistory(summary(newSnapshotId(2000), 2000, 200))
    await store.appendHistory(summary(newSnapshotId(1000), 1000, 100))
    writeFileSync(join(root, 'history.ndjson'), '{"id":"oops', { flag: 'a' })
    const h = await store.loadHistory()
    expect(h.map((s) => s.chaos)).toEqual([100, 200])
    expect(parseHistory('\n\n{"x":1}\n')).toEqual([])
  })

  it('детали — только последние N снимков, начало идущей сессии закреплено', async () => {
    const store = new WealthStore(tmp())
    const ids = Array.from({ length: 13 }, (_, i) => newSnapshotId(1_800_000_000_000 + i * 60_000, () => 0.5))
    for (const [i, id] of ids.entries()) await store.saveDetail(snap(id, i))
    const kept = await store.pruneDetails(10, [ids[1]])
    expect(kept).toEqual([ids[1], ...ids.slice(3)])
    expect(await store.loadDetail(ids[0])).toBeNull()
    expect((await store.loadDetail(ids[1]))?.summary.id).toBe(ids[1])
    expect(await store.loadDetail('../config')).toBeNull()
  })

  it('id снимка сортируется как время', () => {
    const a = newSnapshotId(1_800_000_000_000)
    const b = newSnapshotId(1_800_000_000_001)
    const c = newSnapshotId(2_000_000_000_000)
    expect([c, b, a].sort()).toEqual([a, b, c])
    expect(a).toMatch(/^[0-9a-z]{9}-[0-9a-z]{4}$/)
  })

  it('настройки: мусор → значения по умолчанию, интервал в пределах 15–60', async () => {
    const cfg = sanitizeConfig({ options: { autoEnabled: 'yes', autoIntervalMin: 3 }, selected: { L: ['a', 5] }, session: { league: 1 } })
    expect(cfg.options).toEqual({ autoEnabled: false, autoIntervalMin: 15, poeWatch: true })
    expect(cfg.selected).toEqual({ L: ['a'] })
    expect(cfg.session).toBeNull()
    const store = new WealthStore(tmp())
    expect((await store.loadConfig()).options.autoIntervalMin).toBe(20)
    await store.saveConfig({ ...cfg, accountName: 'Exile_Example#1234' })
    expect((await store.loadConfig()).accountName).toBe('Exile_Example#1234')
  })

  it('кэш цен: только свои подпапки, без выхода наружу', async () => {
    const store = new WealthStore(tmp())
    await store.writeCache('feed/1793142000.json', { hour: 1793142000, trades: [] })
    expect(await store.readCache('feed/1793142000.json')).toEqual({ hour: 1793142000, trades: [] })
    expect(await store.listCache('feed')).toEqual(['1793142000.json'])
    await expect(store.writeCache('../x.json', {})).rejects.toThrow()
    await store.removeCache('feed/1793142000.json')
    expect(await store.listCache('feed')).toEqual([])
  })
})
