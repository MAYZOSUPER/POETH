import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'fs'
import { join, resolve } from 'path'
import { pobItemText } from '@shared/build/pobItemEn'
import { cleanCompareReply, cleanSelftest } from '@shared/pob/engineProtocol'
import { parsePobXml } from '@shared/pob/model'
import { currentStage, resolveStages } from '@shared/pob/stages'
import { stageXml } from '@shared/pob/stageXml'
import { parseItem } from '@shared/poe1/parser'
import type { Poe1Data, Poe1Lang } from '@shared/poe1/data'
import { PobEngine } from '../../src/main/pob/engine'
// @ts-expect-error — .mjs без типов (скрипт поставки)
import { pobKeep, readPins } from '../../tools/pob/prepare.mjs'
import { readFixture, store } from '../poe1/helpers'
import { POE1_FIXTURES, fixtureXml } from './fixtures'

// S44: сервер движка resources/pob/server.lua и поставка PoB.
//  - всегда: песочница в тексте server.lua (сеть, C-модули, процессы, запись), набор файлов PoB без сетевых модулей,
//    пины по SHA;
//  - если движок собран (vendor/pob-engine — `node tools/pob/prepare.mjs`, или POETH_POB_ENGINE): настоящий LuaJIT +
//    PoB — selftest песочницы изнутри, сравнение на фикстурных билдах, RU-предмет = EN-предмет в расчёте PoB.
//    В CI без бинаря эти тесты пропускаются (процесс и протокол проверены на заглушке — engine.test.ts).

const ROOT = resolve(__dirname, '../..')
const SERVER = join(ROOT, 'resources/pob/server.lua')
const lua = readFileSync(SERVER, 'utf8')

describe('server.lua: песочница (текст)', () => {
  it('сетевые и нативные модули заглушены', () => {
    const block = /local BLOCKED = \{([\s\S]*?)\}/.exec(lua)?.[1] ?? ''
    for (const m of ['ffi', 'socket', 'socket.core', 'ssl', 'lcurl', 'lcurl.safe', 'lzip']) expect(block).toContain(`'${m}'`)
    expect(lua).toMatch(/package\.cpath = ''/)
    expect(lua).toMatch(/package\.loadlib = nil/)
    expect(lua).toMatch(/package\.loaders = \{ loaders\[1\], loaders\[2\] \}/)
  })

  it('процессы и запись файлов закрыты, чтение — только папка PoB', () => {
    expect(lua).toMatch(/io\.popen, io\.tmpfile, io\.input, io\.output = nil/)
    expect(lua).toMatch(/os\.execute, os\.remove, os\.rename, os\.tmpname = nil/)
    expect(lua).toMatch(/if mode ~= 'r' and mode ~= 'rb' then/)
    expect(lua).toMatch(/if p:find\('%\.%\.'\) then/)
    // песочница ставится до загрузки PoB
    expect(lua.indexOf("package.cpath = ''")).toBeLessThan(lua.indexOf("pcall(wrapperDofile, SRC .. '/HeadlessWrapper.lua')"))
    expect(lua.indexOf('io.popen, io.tmpfile')).toBeLessThan(lua.indexOf("pcall(wrapperDofile, SRC .. '/HeadlessWrapper.lua')"))
  })

  it('проверка обновлений PoB (сеть) и подпроцессы заглушены до запуска Launch.lua', () => {
    expect(lua).toMatch(/launch\.CheckForUpdate = function\(\) end/)
    expect(lua).toMatch(/LaunchSubScript = function\(\) return nil end/)
    expect(lua).toMatch(/OpenURL = function\(\) end/)
  })
})

describe('поставка PoB (tools/pob)', () => {
  it('пины — полные SHA коммитов и SHA-256 наборов', () => {
    const pins = readPins()
    for (const p of [pins.pob, pins.luajit]) {
      expect(p.commit).toMatch(/^[0-9a-f]{40}$/)
      expect(p.sha256).toMatch(/^[0-9a-f]{64}$/)
      expect(p.repo).toMatch(/^https:\/\/github\.com\/(PathOfBuildingCommunity\/PathOfBuilding|LuaJIT\/LuaJIT)\.git$/)
    }
  })

  it('в набор не попадают сетевые модули, exe/dll, обновление и OAuth-сервер PoB', () => {
    for (const f of [
      'runtime/lua/socket.lua',
      'runtime/lcurl.dll',
      'runtime/socket.dll',
      'runtime/lua51.dll',
      'runtime/Path{space}of{space}Building.exe',
      'src/LaunchServer.lua',
      'src/UpdateCheck.lua',
      'src/UpdateApply.lua',
      'src/LaunchInstall.lua',
      'src/Data/TimelessJewelData/GloriousVanity.zip.part0',
      'src/TreeData/3_29/skills-3.jpg',
      'src/TreeData/3_28/tree.lua'
    ])
      expect(pobKeep(f, '3_29'), f).toBe(false)
    for (const f of ['src/HeadlessWrapper.lua', 'src/Modules/Main.lua', 'src/Data/ModCache.lua', 'src/TreeData/3_29/tree.lua', 'runtime/lua/dkjson.lua', 'LICENSE.md'])
      expect(pobKeep(f, '3_29'), f).toBe(true)
  })
})

// ---------------------------------------------------------------------------- настоящий движок

const ENGINE_DIR = process.env.POETH_POB_ENGINE ?? join(ROOT, 'vendor/pob-engine')
const HAS_ENGINE = process.platform === 'win32' && existsSync(join(ENGINE_DIR, 'bin/luajit.exe')) && existsSync(join(ENGINE_DIR, 'pob/src/HeadlessWrapper.lua'))

describe.skipIf(!HAS_ENGINE)('настоящий движок PoB (vendor/pob-engine)', () => {
  let engine: PobEngine
  let data: Record<Poe1Lang, Poe1Data>
  beforeAll(async () => {
    data = await store.ensureAll()
    engine = new PobEngine(() => ({ command: join(ENGINE_DIR, 'bin/luajit.exe'), args: [SERVER, join(ENGINE_DIR, 'pob')], cwd: join(ENGINE_DIR, 'pob/src') }), {
      startTimeoutMs: 120_000,
      requestTimeoutMs: 60_000
    })
  }, 30_000)
  afterAll(() => engine?.stop())

  it('selftest изнутри: сеть, FFI, C-модули, процессы, запись и чужие файлы закрыты', async () => {
    const r = await engine.request('selftest')
    console.log(`[pob] старт ${r.started} мс, дерево ${r.ready.tree}, куча Lua ${Math.round(r.ready.mem / 1024)} МБ`)
    expect(cleanSelftest(r.reply)).toEqual({
      socket: true,
      lcurl: true,
      ssl: true,
      ffi: true,
      cmodule: true,
      popen: true,
      execute: true,
      write: true,
      remove: true,
      outside: true,
      inside: true
    })
  }, 180_000)

  const item = (lang: Poe1Lang, name: string): string => {
    const res = parseItem(readFixture(lang, name), data)
    if (!res.ok) throw new Error(name)
    const t = pobItemText(res.value, data[lang], data.en)
    if (!t) throw new Error(`${lang}/${name}: no text`)
    return t.text
  }

  it.each(POE1_FIXTURES)('%s: сравнение кольца в обоих слотах', async (name) => {
    const m = parsePobXml(fixtureXml(name))
    if (!m.ok) throw new Error(name)
    const plan = resolveStages(m.build)
    const index = currentStage(plan, { level: 70, act: null, campaignDone: false }).index
    const ready = (await engine.request('ping')).ready
    const { xml } = stageXml(m.build, plan, index, { treeVersion: ready.tree, level: 70 })
    const t0 = Date.now()
    const r = await engine.request('compare', { xml, item: item('en', 'rare-ring'), options: [['Ring 1'], ['Ring 2']] })
    const ms = Date.now() - t0
    const res = cleanCompareReply(r.reply, 2)
    expect(res, JSON.stringify(r.reply).slice(0, 300)).not.toBeNull()
    if (!res || !res.ok) throw new Error(JSON.stringify(r.reply).slice(0, 300))
    expect(res.base.Life ?? 0).toBeGreaterThan(0)
    expect(res.results.every((x) => x.ok)).toBe(true)
    // то же ещё раз — билд уже загружен: только пересчёт
    const t1 = Date.now()
    await engine.request('compare', { xml, item: item('en', 'rare-boots'), options: [['Boots']] })
    console.log(`[pob] ${name}: загрузка + 2 пересчёта ${ms} мс, пересчёт ${Date.now() - t1} мс`)
  }, 180_000)

  it.each(['rare-ring', 'rare-boots', 'rare-helmet', 'rare-sword', 'adv-weapon', 'unique-01'])('%s: RU-предмет даёт в PoB те же цифры, что EN', async (name) => {
    const m = parsePobXml(fixtureXml('pobbin-guardian'))
    if (!m.ok) throw new Error('fixture')
    const ready = (await engine.request('ping')).ready
    const { xml } = stageXml(m.build, null, null, { treeVersion: ready.tree, level: 90 })
    const slot = /ring/.test(name) ? 'Ring 1' : /boots/.test(name) ? 'Boots' : /helmet/.test(name) ? 'Helmet' : /sword|weapon/.test(name) ? 'Weapon 1' : 'Amulet'
    const run = async (lang: Poe1Lang) => cleanCompareReply((await engine.request('compare', { xml, item: item(lang, name), options: [[slot]] })).reply, 1)
    const en = await run('en')
    const ru = await run('ru')
    expect(ru).toEqual(en)
  }, 180_000)

  it('сломанный предмет и билд — ошибка ответом, движок жив', async () => {
    const bad = await engine.request('compare', { xml: '<PathOfBuilding><Build/></PathOfBuilding>', item: 'Rarity: Rare\nNothing\nNo Such Base', options: [['Ring 1']] })
    expect(bad.reply.ok).toBe(false)
    expect((await engine.request('ping')).reply.ok).toBe(true)
  }, 180_000)
})
