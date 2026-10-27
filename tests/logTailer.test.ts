import { afterEach, describe, expect, it } from 'vitest'
import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { GAMES } from '@shared/games'
import { LogTailer, candidateLogPaths } from '../src/main/services/logTailer'

// Обобщение тейлера под GameDef.logSubdirs (S8): PoE2 по умолчанию ищет те же пути, что и раньше;
// событие 'lines' отдаёт сырые новые строки только при живом чтении.

const tailers: LogTailer[] = []
afterEach(() => {
  for (const t of tailers.splice(0)) t.stop()
})

describe('candidateLogPaths', () => {
  it('PoE2 по умолчанию — все прежние пути компаса на месте', () => {
    const up = process.env.USERPROFILE ?? ''
    const before = [
      'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Path of Exile 2\\logs\\Client.txt',
      'C:\\Program Files (x86)\\Grinding Gear Games\\Path of Exile 2\\logs\\Client.txt',
      'C:\\Program Files\\Epic Games\\PathOfExile2\\logs\\Client.txt',
      `${up}\\Documents\\My Games\\Path of Exile 2\\logs\\Client.txt`,
      'C:\\Daum Games\\Path of Exile2\\logs\\Client.txt'
    ]
    const now = candidateLogPaths(GAMES.poe2.logSubdirs, ['C:\\Daum Games\\Path of Exile2\\logs\\Client.txt'])
    for (const p of before) expect(now).toContain(p)
  })

  it('PoE1 — свои папки, без PoE2', () => {
    const p1 = candidateLogPaths(GAMES.poe1.logSubdirs)
    expect(p1).toContain('C:\\Program Files (x86)\\Steam\\steamapps\\common\\Path of Exile\\logs\\Client.txt')
    expect(p1).toContain('C:\\Program Files (x86)\\Grinding Gear Games\\Path of Exile\\logs\\Client.txt')
    expect(p1.some((p) => /Path ?Of ?Exile ?2/i.test(p))).toBe(false)
  })
})

describe("событие 'lines'", () => {
  it('только новые строки, без хвоста файла при старте', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'poeth-tail-'))
    const file = path.join(dir, 'Client.txt')
    await fs.writeFile(file, '2026/10/28 21:00:00 1 a [INFO Client 1] @From Old: старое\n', 'utf8')
    const t = new LogTailer({ logSubdirs: GAMES.poe1.logSubdirs })
    tailers.push(t)
    const got: string[] = []
    t.on('lines', (lines: string[]) => got.push(...lines))
    await t.start(file)
    await fs.appendFile(
      file,
      '2026/10/28 21:40:00 2 b [INFO Client 1] @От кого Покупатель: Здравствуйте\n2026/10/28 21:40:01 3 c [INFO Client 1] : Trade accepted.\n',
      'utf8'
    )
    await new Promise((r) => setTimeout(r, 1500))
    expect(got).toEqual([
      '2026/10/28 21:40:00 2 b [INFO Client 1] @От кого Покупатель: Здравствуйте',
      '2026/10/28 21:40:01 3 c [INFO Client 1] : Trade accepted.'
    ])
    t.stop()
    await fs.rm(dir, { recursive: true, force: true })
  })
})
