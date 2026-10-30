import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { existsSync } from 'fs'
import { join, resolve } from 'path'
import { itemEnCopy } from '@shared/build/itemEnCopy'
import { cleanCompareReply } from '@shared/pob/engineProtocol'
import { parsePobXml } from '@shared/pob/model'
import { stageXml } from '@shared/pob/stageXml'
import { parseItem } from '@shared/poe1/parser'
import { ItemCategory, WEAPON } from '@shared/poe1/parser/meta'
import type { Poe1Data, Poe1Lang } from '@shared/poe1/data'
import { PobEngine } from '../../src/main/pob/engine'
import { fixtureNames, readFixture, store } from '../poe1/helpers'
import { fixtureXml } from './fixtures'

// S51: «вставка в PoB даёт правильный предмет» — английский текст из RU-предмета (то, что хоткей кладёт в буфер)
// и настоящий EN-текст того же предмета PoB открывает одинаково: та же база, редкость, требования, те же
// непонятые строки и те же цифры билда с этой вещью. Только с собранным движком (vendor/pob-engine или
// POETH_POB_ENGINE), как tests/pob/serverLua.test.ts; без него — пропуск.

const ROOT = resolve(__dirname, '../..')
const SERVER = join(ROOT, 'resources/pob/server.lua')
const ENGINE_DIR = process.env.POETH_POB_ENGINE ?? join(ROOT, 'vendor/pob-engine')
const HAS_ENGINE = process.platform === 'win32' && existsSync(join(ENGINE_DIR, 'bin/luajit.exe')) && existsSync(join(ENGINE_DIR, 'pob/src/HeadlessWrapper.lua'))

const SLOT: Partial<Record<ItemCategory, string>> = {
  [ItemCategory.Ring]: 'Ring 1',
  [ItemCategory.Amulet]: 'Amulet',
  [ItemCategory.Belt]: 'Belt',
  [ItemCategory.Helmet]: 'Helmet',
  [ItemCategory.BodyArmour]: 'Body Armour',
  [ItemCategory.Gloves]: 'Gloves',
  [ItemCategory.Boots]: 'Boots',
  [ItemCategory.Shield]: 'Weapon 2',
  [ItemCategory.Quiver]: 'Weapon 2'
}

describe.skipIf(!HAS_ENGINE)('S51: EN-текст из RU-предмета в настоящем PoB', () => {
  let engine: PobEngine
  let data: Record<Poe1Lang, Poe1Data>
  let xml = ''
  beforeAll(async () => {
    data = await store.ensureAll()
    engine = new PobEngine(() => ({ command: join(ENGINE_DIR, 'bin/luajit.exe'), args: [SERVER, join(ENGINE_DIR, 'pob')], cwd: join(ENGINE_DIR, 'pob/src') }), {
      startTimeoutMs: 120_000,
      requestTimeoutMs: 60_000
    })
    const m = parsePobXml(fixtureXml('pobbin-guardian'))
    if (!m.ok) throw new Error('fixture')
    const ready = (await engine.request('ping')).ready
    xml = stageXml(m.build, null, null, { treeVersion: ready.tree, level: 90 }).xml
  }, 180_000)
  afterAll(() => engine?.stop())

  // опознанная экипировка обеих фикстур (флаконы, самоцветы и карты compare не считает)
  const GEAR = fixtureNames('ru').filter((n) => /^(armour|weapon|jewellery|unique|rare|adv)-/.test(n) && fixtureNames('en').includes(n))

  it.each(GEAR)('%s: PoB открывает так же, цифры те же', async (name) => {
    const en = parseItem(readFixture('en', name), data)
    if (!en.ok || en.value.isUnidentified || !en.value.category) return
    const slot = SLOT[en.value.category] ?? (WEAPON.has(en.value.category) ? 'Weapon 1' : null)
    if (!slot) return
    const copy = itemEnCopy(readFixture('ru', name), 'ru', data.ru, data.en)
    expect(copy.ok).toBe(true)
    if (!copy.ok) return
    const run = async (item: string) => cleanCompareReply((await engine.request('compare', { xml, item, options: [[slot]] })).reply, 1)
    const enText = readFixture('en', name).replace(/\r\n?/g, '\n').trim()
    const fromEn = await run(enText)
    const fromRu = await run(copy.text)
    if (!fromEn?.ok || !fromRu?.ok) throw new Error(`${name}: ${JSON.stringify(fromRu)} / ${JSON.stringify(fromEn)}`)
    // цифры билда, база, редкость, требования — те же
    const { unsupported: ruUnsupported, ...ruItem } = fromRu.item
    const { unsupported: _enUnsupported, ...enItem } = fromEn.item
    expect({ ...fromRu, item: ruItem }).toEqual({ ...fromEn, item: enItem })
    // «не поддерживается» в PoB — только дословные строки EN-предмета (мод, который PoB не считает и в игровом
    // Ctrl+C: с пометкой «(implicit)», как в расширенном формате 3.29, PoB отмечает их и в EN-тексте), а не ошибка перевода
    const enLines = enText.split('\n').map((l) => l.trim())
    for (const line of ruUnsupported) expect(enLines, line).toContain(line)
  }, 180_000)
})
