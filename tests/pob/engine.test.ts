import { afterEach, describe, expect, it } from 'vitest'
import { join } from 'path'
import { EngineError, PobEngine, type EngineOptions } from '../../src/main/pob/engine'

// S44: процесс движка PoB на заглушке (tests/pob/fake-engine.cjs — тот же протокол, что у server.lua): ленивый старт,
// таймауты, падение и перезапуск, пауза после серии падений, остановка после простоя, мусор в stdout.

const FAKE = join(__dirname, 'fake-engine.cjs')
const engines: PobEngine[] = []

function make(mode = 'ok', opts: Partial<EngineOptions> = {}): PobEngine {
  const e = new PobEngine(() => ({ command: process.execPath, args: [FAKE, mode], cwd: __dirname }), {
    startTimeoutMs: 5000,
    requestTimeoutMs: 3000,
    idleMs: 60_000,
    ...opts
  })
  engines.push(e)
  return e
}

const code = async (p: Promise<unknown>): Promise<string> => {
  try {
    await p
    return 'ok'
  } catch (e) {
    return e instanceof EngineError ? e.code : String(e)
  }
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

afterEach(() => {
  for (const e of engines.splice(0)) e.stop()
})

describe('движок PoB: процесс', () => {
  it('ленивый старт по первому запросу, строка готовности, один процесс', async () => {
    const e = make()
    expect(e.pid()).toBeNull()
    const a = await e.request('ping')
    expect(a.ready.tree).toBe('3_29')
    expect(a.started).not.toBeNull()
    const pid = e.pid()
    expect(pid).toBeGreaterThan(0)
    expect(a.reply.pid).toBe(pid)
    const b = await e.request('ping')
    expect(b.started).toBeNull()
    expect(e.pid()).toBe(pid)
  })

  it('compare: ответ по id; мусор в stdout (печать PoB, чужие JSON) отбрасывается', async () => {
    const e = make()
    const r = await e.request('compare', { xml: '<PathOfBuilding/>', item: 'noise', options: [['Ring 1']] })
    expect(r.reply.ok).toBe(true)
    expect((r.reply.results as unknown[]).length).toBe(1)
  })

  it('в канал идёт только ASCII (кириллица и прочее — \\uXXXX)', async () => {
    const e = make()
    const r = await e.request('compare', { xml: '<PathOfBuilding/>', item: 'Ёлка — Mjölner', options: [['Ring 1']] })
    expect((r.reply.echo as { nonAscii: boolean }).nonAscii).toBe(false)
  })

  it('запросы по одному: параллельные вызовы не путаются', async () => {
    const e = make()
    const all = await Promise.all([1, 2, 3, 4].map((n) => e.request('compare', { xml: 'x'.repeat(n), item: 'a', options: [['Ring 1']] })))
    expect(all.map((r) => (r.reply.echo as { xmlLength: number }).xmlLength)).toEqual([1, 2, 3, 4])
  })

  it('завис — таймаут, процесс снят; следующий запрос — новый процесс', async () => {
    const e = make('ok', { requestTimeoutMs: 300 })
    await e.request('ping')
    const pid = e.pid()
    expect(await code(e.request('compare', { xml: '<x/>', item: 'hang', options: [['Ring 1']] }))).toBe('timeout')
    expect(e.pid()).toBeNull()
    const r = await e.request('ping')
    expect(r.started).not.toBeNull()
    expect(e.pid()).not.toBe(pid)
  })

  it('ответ с чужим id не принимается (таймаут)', async () => {
    const e = make('ok', { requestTimeoutMs: 300 })
    expect(await code(e.request('compare', { xml: '<x/>', item: 'wrongid', options: [['Ring 1']] }))).toBe('timeout')
  })

  it('упал — «crashed», приложение живо, следующий запрос перезапускает движок', async () => {
    const e = make()
    await e.request('ping')
    const pid = e.pid()
    expect(await code(e.request('compare', { xml: '<x/>', item: 'crash', options: [['Ring 1']] }))).toBe('crashed')
    const r = await e.request('ping')
    expect(r.started).not.toBeNull()
    expect(e.pid()).not.toBe(pid)
  })

  it('серия падений — пауза: движок не запускается («unavailable»)', async () => {
    const e = make('ok', { maxCrashes: 2 })
    for (let i = 0; i < 2; i++) expect(await code(e.request('compare', { xml: '<x/>', item: 'crash', options: [['Ring 1']] }))).toBe('crashed')
    expect(await code(e.request('ping'))).toBe('unavailable')
    expect(e.pid()).toBeNull()
  })

  it('строка stdout без конца больше предела — сбой протокола, процесс снят', async () => {
    const e = make()
    expect(await code(e.request('compare', { xml: '<x/>', item: 'huge', options: [['Ring 1']] }))).toBe('crashed')
    expect(e.pid()).toBeNull()
  })

  it('нет строки готовности — таймаут старта; кривая строка — «crashed»', async () => {
    expect(await code(make('noready', { startTimeoutMs: 300 }).request('ping'))).toBe('timeout')
    expect(await code(make('badready').request('ping'))).toBe('crashed')
  })

  it('нет файлов движка — «no-engine», процесс не запускается', async () => {
    const e = new PobEngine(() => null)
    engines.push(e)
    expect(await code(e.request('ping'))).toBe('no-engine')
    expect(e.pid()).toBeNull()
  })

  it('слишком большой запрос не уходит в движок («bad-input»)', async () => {
    const e = make()
    expect(await code(e.request('compare', { xml: 'x'.repeat(4 * 1024 * 1024), item: 'a', options: [['Ring 1']] }))).toBe('bad-input')
    expect(e.pid()).toBeNull()
  })

  it('простой — остановка (процесс выходит сам по quit)', async () => {
    const e = make('ok', { idleMs: 100 })
    await e.request('ping')
    expect(e.pid()).not.toBeNull()
    await sleep(400)
    expect(e.pid()).toBeNull()
  })

  it('stop() во время расчёта — запрос сразу получает ошибку (не ждёт таймаута)', async () => {
    const e = make('ok', { requestTimeoutMs: 20_000 })
    await e.request('ping')
    const t0 = Date.now()
    const job = code(e.request('compare', { xml: '<x/>', item: 'hang', options: [['Ring 1']] }))
    await sleep(100)
    e.stop()
    expect(await job).toBe('crashed')
    expect(Date.now() - t0).toBeLessThan(5000)
  })

  it('stop() — только свой процесс; после stop новый запрос стартует заново', async () => {
    const e = make()
    await e.request('ping')
    e.stop()
    expect(e.pid()).toBeNull()
    const r = await e.request('ping')
    expect(r.started).not.toBeNull()
  })
})
