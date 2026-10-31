import { execFile } from 'child_process'
import { createServer, type Server } from 'http'
import type { AddressInfo } from 'net'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { promisify } from 'util'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { EXCHANGE_KINDS, UNIQUE_KINDS, leagueFile, parsePoe2PriceIndex, parsePoe2PriceSnapshot } from '@shared/poe2/prices'
import {
  EXCHANGE_TYPES,
  ITEM_TYPES,
  USER_AGENT,
  buildSnapshot,
  isHardcore,
  leagueFile as ciLeagueFile,
  reduceCore,
  reduceExchange,
  reduceItems
} from '../../../tools/data/ninja-snapshot-poe2.mjs'
import { CURRENCY, DELIRIUM, LEAGUES, RESPONSES, UNIQUE_ACCESSORIES, UNIQUE_WEAPONS } from './fixtures'

const SCRIPT = resolve(__dirname, '../../../tools/data/ninja-snapshot-poe2.mjs')
const run = promisify(execFile)

describe('снимок poe.ninja PoE 2: разбор в CI (tools/data/ninja-snapshot-poe2.mjs)', () => {
  it('типы CI = типы читателя', () => {
    expect(EXCHANGE_TYPES).toEqual([...EXCHANGE_KINDS])
    expect(ITEM_TYPES).toEqual([...UNIQUE_KINDS])
  })

  it('имя файла лиги одинаково в CI и в приложении и годится для пакета данных', () => {
    for (const l of ['Runes of Aldur', 'HC Forbidden Rites', 'Standard', 'Лига (PL123)', '#1 league', "Dawn's Rite: HC"]) {
      expect(ciLeagueFile(l), l).toBe(leagueFile(l))
      expect(leagueFile(l), l).toMatch(/^[A-Za-z0-9][A-Za-z0-9._-]*\.json$/)
    }
    expect(leagueFile('Runes of Aldur')).toBe('Runes_20of_20Aldur.json')
  })

  it('User-Agent называет проект и не содержит личных данных', () => {
    expect(USER_AGENT).toMatch(/^POETH-data\/\d+ \(\+https:\/\/github\.com\/MAYZOSUPER\/POETH/)
    expect(USER_AGENT).not.toMatch(/@/)
  })

  it('хардкор-лиги', () => {
    expect(LEAGUES.map((l) => l.id).filter((l) => !isHardcore(l))).toEqual(['Forbidden Rites', 'Runes of Aldur', 'Standard'])
  })

  it('обмен: имя из items[], цена 4 значащие цифры, оборот, изменение; без имени и цены — мимо', () => {
    const lines = reduceExchange('Currency', CURRENCY)
    expect(lines.map((l) => l.id)).toEqual(['divine', 'exalted', 'chaos', 'mirror'])
    expect(lines[1]).toEqual({ id: 'exalted', name: 'Exalted Orb', kind: 'Currency', value: 0.001786, volume: 52.8, change: -3.1 })
    expect(lines[3].value).toBe(5813)
    expect(reduceExchange('Delirium', { lines: 'нет', items: null })).toEqual([])
    expect(reduceExchange('Delirium', null)).toEqual([])
  })

  it('уники: только имя, база, цена, лоты, порча, изменение — без иконок, модов и flavour', () => {
    const lines = reduceItems('UniqueAccessories', UNIQUE_ACCESSORIES)
    expect(lines).toHaveLength(4)
    expect(lines[0]).toEqual({ id: 'mageblood-utility-belt', name: 'Mageblood', base: 'Utility Belt', kind: 'UniqueAccessories', value: 200, listings: 4219, change: -2.2 })
    expect(lines[3].corrupted).toBe(true)
    const json = JSON.stringify(lines)
    for (const banned of ['icon', 'flavour', 'Modifiers', 'poecdn', 'maximum Life']) expect(json).not.toContain(banned)
    expect(reduceItems('UniqueWeapons', UNIQUE_WEAPONS).find((l) => l.name === 'Mjölner')?.variant).toBe('2 sockets')
  })

  it('курсы из core', () => {
    expect(reduceCore(CURRENCY)).toEqual({ primary: 'divine', rates: { exalted: 560, chaos: 9.5 } })
    expect(reduceCore({ lines: [] })).toBeNull()
  })

  it('снимок CI читается приложением без потерь', () => {
    const lines = [...reduceExchange('Currency', CURRENCY), ...reduceExchange('Delirium', DELIRIUM), ...reduceItems('UniqueAccessories', UNIQUE_ACCESSORIES)]
    const snap = buildSnapshot({ league: 'Runes of Aldur', at: 1793477912247, core: reduceCore(CURRENCY)!, lines, etags: { Currency: 'W/"1"' } })
    const parsed = parsePoe2PriceSnapshot(JSON.parse(JSON.stringify(snap)))
    expect(parsed?.lines).toEqual(lines)
    expect(parsed?.rates).toEqual({ exalted: 560, chaos: 9.5 })
  })
})

// ------------------------------------------------------------------------- CLI против фейкового poe.ninja

interface Hit {
  path: string
  type: string | null
  league: string | null
  ifNoneMatch?: string
  ua?: string
}

describe('снимок poe.ninja PoE 2: прогон скрипта (локальный сервер вместо poe.ninja)', () => {
  let server: Server
  let base = ''
  const hits: Hit[] = []
  let failType: string | null = null
  const work = mkdtempSync(join(tmpdir(), 'poeth-s67-ninja-'))
  const out = join(work, 'prices')

  beforeAll(async () => {
    server = createServer((req, res) => {
      const u = new URL(req.url ?? '/', 'http://x')
      const type = u.searchParams.get('type')
      const league = u.searchParams.get('league')
      hits.push({ path: u.pathname, type, league, ifNoneMatch: req.headers['if-none-match'], ua: req.headers['user-agent'] })
      if (u.pathname.endsWith('/leagues')) return void res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(LEAGUES))
      if (type && (failType === '*' || type === failType)) return void res.writeHead(500).end('fail')
      const etag = `W/"${league}-${type}"`
      if (req.headers['if-none-match'] === etag) return void res.writeHead(304, { etag }).end()
      const body = (type && RESPONSES[type]) ?? { core: CURRENCY.core, lines: [], items: [] }
      res.writeHead(200, { 'content-type': 'application/json', etag }).end(JSON.stringify(body))
    })
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/poe2/api/economy`
  })
  afterAll(() => {
    server.close()
    rmSync(work, { recursive: true, force: true })
  })

  const snapshot = (args: string[] = []) =>
    run(process.execPath, [SCRIPT, '--base', base, '--pause', '0', '--out', out, ...args], { env: { ...process.env, NODE_USE_ENV_PROXY: '' } })

  it('первый прогон: софткор-лиги, 23 типа на лигу, файлы и index.json', async () => {
    writeFileSync(join(work, 'stale.json'), '{}')
    const { stdout } = await snapshot()
    expect(stdout).toMatch(/готово: 3 лиг/)
    const types = hits.filter((h) => h.type)
    expect(types).toHaveLength(3 * 23)
    expect(new Set(types.map((h) => h.league))).toEqual(new Set(['Forbidden Rites', 'Runes of Aldur', 'Standard']))
    expect(hits.every((h) => h.ua?.startsWith('POETH-data/'))).toBe(true)
    expect(types.some((h) => h.ifNoneMatch)).toBe(false)
    const index = parsePoe2PriceIndex(JSON.parse(readFileSync(join(out, 'index.json'), 'utf8')))
    expect(index?.leagues.map((l) => l.file)).toEqual(['Forbidden_20Rites.json', 'Runes_20of_20Aldur.json', 'Standard.json'])
    expect(readdirSync(out).sort()).toEqual(['Forbidden_20Rites.json', 'Runes_20of_20Aldur.json', 'Standard.json', 'index.json'])
    const snap = parsePoe2PriceSnapshot(JSON.parse(readFileSync(join(out, 'Runes_20of_20Aldur.json'), 'utf8')))
    expect(snap?.rates).toEqual({ exalted: 560, chaos: 9.5 })
    expect(snap?.lines.length).toBe(4 + 4 + 1 + 4 + 3)
  })

  it('повторный прогон: условные запросы (304) — строки и курсы из прошлого снимка; сбой типа — тоже из прошлого', async () => {
    hits.length = 0
    failType = 'Delirium'
    const before = JSON.parse(readFileSync(join(out, 'Runes_20of_20Aldur.json'), 'utf8'))
    const { stdout, stderr } = await snapshot(['--leagues', 'Runes of Aldur'])
    expect(stderr).toMatch(/Runes of Aldur Delirium: HTTP 500 .* строки из прошлого снимка/)
    expect(stdout).toMatch(/без изменений \(304\) 22/)
    expect(hits.filter((h) => h.type).every((h) => h.ifNoneMatch === `W/"Runes of Aldur-${h.type}"`)).toBe(true)
    const after = JSON.parse(readFileSync(join(out, 'Runes_20of_20Aldur.json'), 'utf8'))
    expect(after.lines).toEqual(before.lines)
    expect(after.rates).toEqual(before.rates)
    expect(after.etags.Delirium).toBe('W/"Runes of Aldur-Delirium"')
    // лиги, которых нет в новом прогоне, убраны из папки снимка
    expect(readdirSync(out).sort()).toEqual(['Runes_20of_20Aldur.json', 'index.json'])
    failType = null
  })

  it('ни одной лиги (всё упало, прошлого снимка нет) — ошибка, папка не тронута', async () => {
    failType = '*'
    const lonely = join(work, 'lonely')
    await expect(
      run(process.execPath, [SCRIPT, '--base', base, '--pause', '0', '--out', lonely, '--leagues', 'Standard'], { env: { ...process.env, NODE_USE_ENV_PROXY: '' } })
    ).rejects.toThrow(/ни одной лиги/)
    expect(existsSync(lonely)).toBe(false)
    failType = null
  })
})
