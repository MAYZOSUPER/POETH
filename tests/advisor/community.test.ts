import { execFile } from 'child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { promisify } from 'util'
import { afterAll, describe, expect, it } from 'vitest'
import { ADVISOR_DATA_FILE, parseAdvisorData } from '@shared/advisor/data'
import { decodeStrategyNode, encodeStrategyNode } from '@shared/advisor/codecNode'
import { strategyFingerprint } from '@shared/advisor/codec'
import { COMMUNITY_DIR, parseCommunityFile } from '@shared/advisor/library'
import { strategy, T } from './fixtures'

// Каталог сообщества (S17): каждый файл resources/data/poe1/advisor/community/*.json проходит строгую
// проверку, id не пересекаются с нашими; инструмент лида add-strategy.mjs пишет файл тем же валидатором.

const ROOT = resolve(__dirname, '../..')
const DATA = resolve(ROOT, 'resources/data/poe1')
const DIR = resolve(DATA, COMMUNITY_DIR)
const read = (rel: string): string => readFileSync(resolve(DATA, rel), 'utf8')
const run = promisify(execFile)

describe('советник: файлы каталога сообщества в репозитории', () => {
  const files = readdirSync(DIR).filter((n) => n.endsWith('.json'))
  const official = parseAdvisorData(JSON.parse(read(ADVISOR_DATA_FILE))).data!.strategies
  const exchange = new Set(Object.values(JSON.parse(read('wealth/exchange-ids.json')).names as Record<string, string>))

  it('каждый файл — схема 1, community, имя файла = id, строгий валидатор без ошибок', () => {
    for (const name of files) {
      const r = parseCommunityFile(JSON.parse(readFileSync(join(DIR, name), 'utf8')), name.slice(0, -5))
      expect(r.ok ? 'ok' : r.error, name).toBe('ok')
    }
  })

  it('id не совпадают с нашими стратегиями (по id считается «Мой результат»)', () => {
    const ids = new Set(official.map((s) => s.id))
    for (const name of files) expect(ids.has(name.slice(0, -5)), name).toBe(false)
  })

  it('предметы на обмене GGG — иначе у игроков не будет цены', () => {
    for (const name of files) {
      const r = parseCommunityFile(JSON.parse(readFileSync(join(DIR, name), 'utf8')))
      if (!r.ok) continue
      for (const l of [...r.entry.strategy.inputs, ...r.entry.strategy.outputs]) {
        if (l.item.ref && (l.item.kind === 'stackable' || l.item.kind === 'card')) expect(exchange.has(l.item.ref), `${name}: ${l.item.ref}`).toBe(true)
      }
    }
  })
})

describe('советник: tools/advisor/add-strategy.mjs', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'poeth-community-'))
  afterAll(() => rmSync(tmp, { recursive: true, force: true }))
  const tool = (...args: string[]) => run(process.execPath, [join(ROOT, 'tools/advisor/add-strategy.mjs'), ...args, '--dir', tmp, '--no-site'], { cwd: ROOT })
  const fail = async (...args: string[]): Promise<string> => {
    try {
      await tool(...args)
      return 'ok'
    } catch (e) {
      return String((e as { stderr?: string }).stderr)
    }
  }
  const friend = strategy({
    id: 'strongbox-free',
    name: T('Сундуки без скарабея', 'Strongboxes, no scarab'),
    source: { kind: 'mine', author: 'Kotik', date: '2026-11-15' },
    outputs: [{ item: { kind: 'stackable', ref: 'Chaos Orb' }, qty: 1 }],
    patch: '3.30'
  })

  it('код из ссылки → файл каталога: community, автор сохранён, тот же валидатор', async () => {
    const code = await encodeStrategyNode(friend)
    const { stdout } = await tool(`https://mayzosuper.github.io/POETH/strategies/view#${code}`, '--issue', '42', '--checked', '2026-11-20')
    expect(stdout).toContain('strongbox-free.json')
    const raw = JSON.parse(readFileSync(join(tmp, 'strongbox-free.json'), 'utf8'))
    const r = parseCommunityFile(raw, 'strongbox-free')
    expect(r.ok && r.entry).toMatchObject({ checked: '2026-11-20', issue: 42, strategy: { source: { kind: 'community', author: 'Kotik' } } })
    const decoded = await decodeStrategyNode(code)
    expect(r.ok && decoded.ok && strategyFingerprint(r.entry.strategy) === strategyFingerprint(decoded.strategy)).toBe(true)
  }, 60_000)

  it('повтор — только с --replace; другой id — --id; id нашей стратегии — нельзя', async () => {
    const code = await encodeStrategyNode(friend)
    expect(await fail(code)).toContain('уже есть')
    expect(await fail(code, '--replace')).toBe('ok')
    expect(await fail(code, '--id', 'strongbox-zero')).toBe('ok')
    expect(readdirSync(tmp).sort()).toEqual(['strongbox-free.json', 'strongbox-zero.json'])
    const official = parseAdvisorData(JSON.parse(read(ADVISOR_DATA_FILE))).data!.strategies[0]
    expect(await fail(await encodeStrategyNode({ ...official, source: { kind: 'mine', date: '2026-11-15' } }))).toContain('занят нашей стратегией')
  }, 60_000)

  it('мусор, обрезанный код, HTML внутри — понятная ошибка, файл не пишется', async () => {
    const before = readdirSync(tmp).length
    expect(await fail('привет')).toContain('не код POETH')
    const code = await encodeStrategyNode({ ...friend, id: 'other' })
    expect(await fail(code.slice(0, 50))).toContain('обрезан')
    const evil = { ...friend, id: 'evil', name: { ru: '<script>alert(1)</script>' } }
    const { deflateSync } = await import('zlib')
    const evilCode = 'POETH1:' + deflateSync(Buffer.from(JSON.stringify({ schema: 1, strategy: evil }))).toString('base64url')
    expect(await fail(evilCode)).toContain('HTML')
    expect(readdirSync(tmp).length).toBe(before)
    // код из файла каталога раскрывается обратно
    writeFileSync(join(tmp, 'x.txt'), '') // посторонний файл не мешает
    expect((await decodeStrategyNode(code)).ok).toBe(true)
  }, 60_000)
})
