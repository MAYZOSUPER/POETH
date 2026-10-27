import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { GAMES, type GameDef } from '@shared/games'
import { ChatLogContext, resolveChatText } from '@shared/chatCommands'
import { LogTailer } from '../src/main/services/logTailer'
import {
  getGameLogStatus,
  onGameLogStatus,
  setGameLogPath,
  subscribeGameLog,
  type GameLogStatus
} from '../src/main/services/gameLog'

// Общий тейлер Client.txt (services/gameLog.ts): один на процесс для команд чата и менеджера
// сделок; свой путь для игры (файл из вкладки «Сделки»), смена игры, подписка/отписка.
// Тейлер опрашивает файл раз в секунду — ждём строки до 3 с.

// подпапки, которых нет на диске: автопоиск ничего не найдёт и не тронет настоящий лог игры
const POE1: GameDef = { ...GAMES.poe1, logSubdirs: ['POETH test nowhere/logs'] }
const POE2: GameDef = { ...GAMES.poe2, logSubdirs: ['POETH test nowhere 2/logs'] }
const P = '2026/10/28 21:40:00 1000 cffb0658 [INFO Client 1] '

let dir = ''
const offs: (() => void)[] = []

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'poeth-gamelog-'))
})
afterEach(async () => {
  for (const off of offs.splice(0)) off()
  await setGameLogPath('poe1', null)
  await setGameLogPath('poe2', null)
  vi.restoreAllMocks()
  await fs.rm(dir, { recursive: true, force: true })
})

async function logFile(name: string): Promise<string> {
  const f = path.join(dir, name)
  await fs.writeFile(f, P + ': You have entered Highgate.\n', 'utf8')
  return f
}

const append = (file: string, ...lines: string[]): Promise<void> =>
  fs.appendFile(file, lines.map((l) => P + l + '\n').join(''), 'utf8')

async function until(pred: () => boolean, ms = 3000): Promise<boolean> {
  const end = Date.now() + ms
  while (!pred()) {
    if (Date.now() > end) return false
    await new Promise((r) => setTimeout(r, 50))
  }
  return true
}

async function sub(def: GameDef, into: string[]): Promise<{ logPath: string | null }> {
  const s = await subscribeGameLog(def, (lines) => into.push(...lines))
  offs.push(s.off)
  return s
}

describe('gameLog — один тейлер на процесс', () => {
  it('два подписчика (чат и сделки) — один запуск тейлера, одни и те же строки', async () => {
    const file = await logFile('Client.txt')
    await setGameLogPath('poe1', file)
    const starts = vi.spyOn(LogTailer.prototype, 'start')
    const chat: string[] = []
    const deals: string[] = []
    const [a, b] = await Promise.all([sub(POE1, chat), sub(POE1, deals)])
    // гонка запуска: второй подписчик получает тот же путь, а не null
    expect(a.logPath).toBe(file)
    expect(b.logPath).toBe(file)
    expect(starts).toHaveBeenCalledTimes(1)
    await append(file, '@From Buyer: hi')
    expect(await until(() => chat.length > 0 && deals.length > 0)).toBe(true)
    expect(chat).toEqual(deals)
    expect(chat[0]).toContain('@From Buyer: hi')
  })

  it('отписка: последний подписчик останавливает тейлер, строки больше не приходят', async () => {
    const file = await logFile('Client.txt')
    await setGameLogPath('poe1', file)
    const statuses: GameLogStatus[] = []
    offs.push(onGameLogStatus((s) => statuses.push(s)))
    const got: string[] = []
    const first = await subscribeGameLog(POE1, (l) => got.push(...l))
    const second = await subscribeGameLog(POE1, () => undefined)
    expect(getGameLogStatus()).toEqual({ game: 'poe1', running: true, logPath: file, custom: true })
    first.off()
    first.off() // повторная отписка безопасна
    expect(getGameLogStatus().running).toBe(true)
    second.off()
    expect(getGameLogStatus()).toEqual({ game: null, running: false, logPath: null, custom: false })
    expect(statuses.at(-1)?.running).toBe(false)
    await append(file, '@From Late: hi')
    await new Promise((r) => setTimeout(r, 1300))
    expect(got).toEqual([])
  })
})

describe('gameLog — свой путь и смена игры', () => {
  it('свой путь на ходу: тейлер переезжает на новый файл, подписчики остаются', async () => {
    const a = await logFile('a.txt')
    const b = await logFile('b.txt')
    await setGameLogPath('poe1', a)
    const got: string[] = []
    await sub(POE1, got)
    const st = await setGameLogPath('poe1', b)
    expect(st).toMatchObject({ game: 'poe1', running: true, logPath: b, custom: true })
    await append(a, '@From FromA: x')
    await append(b, '@From FromB: y')
    expect(await until(() => got.some((l) => l.includes('FromB')))).toBe(true)
    expect(got.some((l) => l.includes('FromA'))).toBe(false)
  })

  it('свой путь удалён с диска или сброшен — автопоиск (custom: false)', async () => {
    const st0 = await setGameLogPath('poe1', path.join(dir, 'нет-такого.txt'))
    expect(st0.running).toBe(false)
    await sub(POE1, [])
    expect(getGameLogStatus()).toMatchObject({ running: true, logPath: null, custom: false })
    const file = await logFile('Client.txt')
    expect(await setGameLogPath('poe1', file)).toMatchObject({ logPath: file, custom: true })
    expect(await setGameLogPath('poe1', null)).toMatchObject({ logPath: null, custom: false })
  })

  it('смена игры: тейлер открывает лог новой игры (её свой путь)', async () => {
    const p1 = await logFile('poe1.txt')
    const p2 = await logFile('poe2.txt')
    await setGameLogPath('poe1', p1)
    await setGameLogPath('poe2', p2)
    const got1: string[] = []
    const s1 = await subscribeGameLog(POE1, (l) => got1.push(...l))
    expect(getGameLogStatus()).toMatchObject({ game: 'poe1', logPath: p1 })
    // мягкий перезапуск под PoE2: домены отписываются и подписываются заново
    s1.off()
    const got2: string[] = []
    await sub(POE2, got2)
    expect(getGameLogStatus()).toMatchObject({ game: 'poe2', logPath: p2, custom: true })
    // свой путь другой игры не трогает текущий тейлер
    await setGameLogPath('poe1', null)
    expect(getGameLogStatus()).toMatchObject({ game: 'poe2', logPath: p2 })
    await append(p1, '@From One: a')
    await append(p2, '@From Two: b')
    expect(await until(() => got2.some((l) => l.includes('Two')))).toBe(true)
    expect(got1).toEqual([])
    expect(got2.some((l) => l.includes('One'))).toBe(false)
  })

  it('POETH_GAME_LOG важнее своего пути', async () => {
    const env = await logFile('env.txt')
    const own = await logFile('own.txt')
    vi.stubEnv('POETH_GAME_LOG', env)
    try {
      await setGameLogPath('poe1', own)
      await sub(POE1, [])
      expect(getGameLogStatus()).toMatchObject({ logPath: env, custom: false })
    } finally {
      vi.unstubAllEnvs()
    }
  })
})

describe('команды чата на общем тейлере (@last)', () => {
  it('whisper из лога → @last подставляется; выбранный во «Сделках» файл работает и для чата', async () => {
    const file = await logFile('Client.txt')
    await setGameLogPath('poe1', file) // как pickLog во вкладке «Сделки»
    const context = new ChatLogContext()
    const s = await subscribeGameLog(POE1, (lines) => context.feed(lines))
    offs.push(s.off)
    expect(resolveChatText('@last ty', context)).toEqual({ ok: false, missing: 'last' })
    await append(file, '@От кого Покупатель: Здравствуйте', ': Покупатель присоединился.')
    expect(await until(() => context.lastWhisperFrom !== null)).toBe(true)
    expect(resolveChatText('@last ty', context)).toEqual({ ok: true, text: '@Покупатель ty' })
    expect(resolveChatText('/invite @last', context)).toEqual({ ok: true, text: '/invite Покупатель' })
  })
})
