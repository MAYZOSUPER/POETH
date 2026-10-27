import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import type { Deal } from '@shared/types'
import { DealsStore, demoLines } from '../../src/main/services/dealsStore'
import { BlacklistService, type TextFetcher } from '../../src/main/services/dealsBlacklist'
import { parseLogLine } from '@shared/deals/whisperParse'

let dir = ''
beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'poeth-deals-'))
})
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true })
})

const T0 = new Date(2026, 9, 28, 21, 40, 0).getTime()
const P = '2026/10/28 21:40:00 1000 abcdef12 [INFO Client 1] '
const IN =
  P + '@From Buyer: Hi, I would like to buy your Doom Loop Ruby Ring listed for 1 divine in Settlers (stash tab "Sale"; position: left 2, top 3)'

describe('DealsStore', () => {
  it('строки лога → сделка в файле, события changed и deal', async () => {
    const file = path.join(dir, 'deals.json')
    const s = new DealsStore(file, () => T0)
    const events: string[] = []
    s.on('changed', () => events.push('changed'))
    s.on('deal', (d: Deal) => events.push(`deal:${d.player}`))
    const added = await s.ingestLines([IN, P + '@From Buyer: ty', P + ': Trade accepted.', 'мусор'])
    expect(added).toHaveLength(1)
    expect(events).toEqual(['changed', 'deal:Buyer'])
    const disk = JSON.parse(await fs.readFile(file, 'utf8'))
    expect(disk.deals[0]).toMatchObject({ player: 'Buyer', item: 'Doom Loop Ruby Ring', status: 'new' })
    // перезапуск читает тот же файл
    const again = new DealsStore(file, () => T0)
    await again.load()
    expect(again.getState().deals).toHaveLength(1)
  })

  it('чёрный список помечает входящую', async () => {
    const s = new DealsStore(path.join(dir, 'd.json'), () => T0)
    s.setBlacklistChecker(({ character }) =>
      character === 'Buyer' ? { account: 'Buyer', reason: 'Swap scam(s)', since: '01/01/2025', matchedBy: 'character' } : null
    )
    const [d] = await s.ingestLines([IN])
    expect(d.blacklist?.reason).toBe('Swap scam(s)')
    // повтор того же сообщения — не новая сделка
    expect(await s.ingestLines([IN])).toHaveLength(0)
    // проверка выключена — без пометки
    await s.setConfig({ checkBlacklist: false })
    const [d2] = await s.ingestLines([IN.replace('Doom Loop', 'Other')])
    expect(d2.blacklist).toBeUndefined()
  })

  it('продано → игнор, лимит, настройки, очистка', async () => {
    const s = new DealsStore(path.join(dir, 'd.json'), () => T0)
    const [d] = await s.ingestLines([IN])
    const st = await s.setStatus(d.id, 'sold')
    expect(st.ignoredCount).toBe(1)
    const [d2] = await s.ingestLines([IN.replace('Buyer', 'Other')])
    expect(d2.status).toBe('ignored')
    const cfg = await s.setConfig({ templates: { ru: { thanks: 'спс' } }, sound: false })
    expect(cfg.config.templates.ru.thanks).toBe('спс')
    expect(cfg.config.sound).toBe(false)
    expect((await s.remove(d2.id)).deals).toHaveLength(1)
    expect((await s.clear()).deals).toHaveLength(0)
  })

  it('примеры RU и EN проходят через разбор; «убрать примеры» не трогает настоящие', async () => {
    const s = new DealsStore(path.join(dir, 'd.json'), () => T0)
    await s.ingestLines([IN])
    for (const lang of ['ru', 'en'] as const) {
      for (const l of demoLines(lang, T0)) expect(parseLogLine(l.line)).toMatchObject({ type: 'whisper' })
    }
    const st = await s.addDemo('ru')
    const demo = st.deals.filter((x) => x.demo)
    expect(demo).toHaveLength(5)
    expect(demo.filter((x) => x.dir === 'out')).toHaveLength(2)
    expect(demo.some((x) => x.status === 'sold')).toBe(true)
    expect(demo.some((x) => x.blacklist)).toBe(true)
    expect(st.quadTabs).toContain('продажа')
    expect((await s.clear(true)).deals.map((x) => x.player)).toEqual(['Buyer'])
  })

  it('экспорт CSV и JSON', async () => {
    const s = new DealsStore(path.join(dir, 'd.json'), () => T0)
    await s.ingestLines([IN])
    expect(s.exportCsv()).toContain('Buyer,Doom Loop Ruby Ring')
    expect(JSON.parse(s.exportJson()).deals).toHaveLength(1)
  })
})

const CSV = 'account_name, discord_id, blacklisted_on, reason, active\r\n"bad#1", "1", "01/01/2020", "Swap scam(s)", "Y"\r\n'

describe('BlacklistService', () => {
  function fetcher(responses: { status: number; body?: string; etag?: string }[], calls: string[] = []): TextFetcher {
    return async (_url, opts) => {
      calls.push(opts.etag ?? '-')
      const r = responses.shift()
      if (!r) throw new Error('offline')
      return { status: r.status, body: r.body ?? '', etag: r.etag }
    }
  }

  it('скачивает, кэширует на диск, проверяет игрока', async () => {
    let now = T0
    const cacheFile = path.join(dir, 'cache', 'bl.json')
    const bl = new BlacklistService({ cacheFile, fetcher: fetcher([{ status: 200, body: CSV, etag: 'e1' }]), now: () => now })
    await bl.refreshIfStale()
    expect(bl.status()).toMatchObject({ count: 1, fetchedAt: T0, loading: false, error: null })
    expect(bl.check({ account: 'BAD#1' })?.reason).toBe('Swap scam(s)')
    expect(bl.check({ character: 'bad' })?.matchedBy).toBe('character')
    // свежий кэш — сеть не трогаем
    now += 60_000
    await bl.refreshIfStale()
    expect(bl.status().fetchedAt).toBe(T0)

    // новый экземпляр поднимает кэш без сети
    const offline = new BlacklistService({ cacheFile, fetcher: fetcher([]), now: () => now })
    await offline.loadCache()
    expect(offline.status().count).toBe(1)
  })

  it('раз в сутки: 304 по ETag обновляет только время', async () => {
    let now = T0
    const calls: string[] = []
    const cacheFile = path.join(dir, 'bl.json')
    const bl = new BlacklistService({
      cacheFile,
      fetcher: fetcher([{ status: 200, body: CSV, etag: 'e1' }, { status: 304 }], calls),
      now: () => now
    })
    await bl.refresh()
    now += 25 * 60 * 60_000
    expect(bl.isStale()).toBe(true)
    await bl.refreshIfStale()
    expect(calls).toEqual(['-', 'e1'])
    expect(bl.status()).toMatchObject({ count: 1, fetchedAt: now })
    expect(JSON.parse(await fs.readFile(cacheFile, 'utf8')).fetchedAt).toBe(now)
  })

  it('ошибка сети или пустой ответ не портят рабочий кэш', async () => {
    let now = T0
    const bl = new BlacklistService({
      cacheFile: path.join(dir, 'bl.json'),
      fetcher: fetcher([{ status: 200, body: CSV }, { status: 200, body: 'account_name\r\n' }, { status: 500 }]),
      now: () => now
    })
    await bl.refresh()
    await bl.refresh()
    expect(bl.status()).toMatchObject({ count: 1, error: 'пустой список' })
    now += 25 * 60 * 60_000
    await bl.refresh()
    expect(bl.status()).toMatchObject({ count: 1, error: 'HTTP 500' })
    // сразу после ошибки не повторяем
    await bl.refreshIfStale()
    expect(bl.status().error).toBe('HTTP 500')
  })
})
