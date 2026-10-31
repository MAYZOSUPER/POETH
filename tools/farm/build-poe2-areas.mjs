#!/usr/bin/env node
// S69: виды областей PoE 2 для трекера карт → resources/data/poe2/farm/areas.json.
//
//   node tools/farm/build-poe2-areas.mjs [--src <world_areas.json>] [--dat <node_modules>] [--patch 0.5.5.5]
//        [--cache <папка>] [--keep-cache] [--schema <schema.min.json>]
//
// Источник id — RePoE PoE 2 world_areas.json (по умолчанию качается с repoe-fork.github.io; сеть Node на ПК
// разработчика — через NODE_USE_ENV_PROXY=1). Имена «карт мира» и экранов входа (`[SCENE] Set Source [Act 1]`,
// `[Atlas]`, …) — сцены, а не области: английские и **русские** имена берём из файлов игры — таблица WorldAreas
// и её перевод Data/Balance/Russian (tools/farm/game-areas.mjs, pathofexile-dat во временной папке, как у «Слухов»
// S65; путь к её node_modules — `--dat`, по умолчанию %TEMP%\poeth-rumours-dat\node_modules). Таблицы — в
// %TEMP%\poeth-farm-cache\<патч>, после работы удаляются (`--keep-cache` — оставить; папку из `--cache` не трогаем).
// Без pathofexile-dat — отказ: русских имён сцен без файлов игры нет (в RePoE их нет, выгрузка poe2-data устарела).
// Пересобрать к PoE 2 1.0 (11.12): id, уровни и имена областей поменяются (docs/farm.md, «Данные PoE 2»).
//
// Правила вида (первое подходящее) — те же, что у запасных шаблонов в src/shared/farm/zonesPoe2.ts:
//  1. hideout  — Hideout*, PersonalHideout, GuildHideout* (MapHideout*_Claimable — карта на атласе, не убежище);
//  2. town     — is_town, «карты мира», хабы без боя: Abyss_Hub (Well of Souls), MapLeaguePortal (Realmgate),
//                G3_10_Airlock (вход в Испытание хаоса), экраны входа и выбора персонажа;
//  3. sub      — подобласть забега: Abyss_Depths*, ExpeditionSubArea_* (кроме кампании), IncursionTemplePresent;
//  4. other    — испытания (Sanctum_*, G3_10) и арены боссов: тег pinnacle_boss, *LeagueBoss, *_Boss*, BossRush_*;
//  5. map      — Map* уровня ≥ 65 с тегом map или из эндгейма (act 10): карты, башни, уникальные, Цитадели;
//                ExpeditionLogBook_* — острова Экспедиции на атласе;
//  6. campaign — остальное из актов и интерлюдий (act < 10);
//  7. other    — остальной эндгейм (Симулякр, Delirium_*, ChayulaLeague*, PrecursorVault…).

import { promises as fs } from 'fs'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'
import { readGameAreaNames } from './game-areas.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const OUT = path.join(ROOT, 'resources/data/poe2/farm/areas.json')
const SRC_URL = 'https://repoe-fork.github.io/poe2/world_areas.json'
const UA = 'POETH-data-sync (+https://github.com/MAYZOSUPER/POETH)'

const KINDS = ['hideout', 'town', 'campaign', 'map', 'sub', 'other']
const TOWN_IDS = new Set(['Abyss_Hub', 'MapLeaguePortal', 'G3_10_Airlock', 'G_login', 'CharacterSelect', 'CurrentTown'])
const TRIAL_IDS = new Set(['G3_10'])

function arg(name) {
  const i = process.argv.indexOf(name)
  return i > 0 ? process.argv[i + 1] : undefined
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'))
}

async function getJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } })
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
  return res.json()
}

const isWorldMap = (id) => /_WorldMap$/.test(id)

function kindOf(a) {
  const id = a.id
  const tags = a.tags ?? []
  const level = a.area_level ?? 0
  const act = a.act ?? 0
  if (/^(?:Hideout|PersonalHideout|GuildHideout)/.test(id)) return 'hideout'
  if (a.is_town || TOWN_IDS.has(id) || isWorldMap(id)) return 'town'
  if (/^Abyss_Depths/.test(id) || id === 'IncursionTemplePresent') return 'sub'
  if (/^ExpeditionSubArea_/.test(id)) return act >= 10 ? 'sub' : 'campaign'
  if (/^Sanctum_/.test(id) || TRIAL_IDS.has(id)) return 'other'
  if (tags.includes('pinnacle_boss') || /LeagueBoss$|_Boss\d*$|^BossRush_|HungerBoss$/.test(id)) return 'other'
  if (/^Map/.test(id)) return level >= 65 && (tags.includes('map') || act >= 10) ? 'map' : 'campaign'
  if (/^ExpeditionLogBook_/.test(id)) return 'map'
  if (act < 10) return 'campaign'
  return 'other'
}

const src = arg('--src')
const worldAreas = src ? await readJson(src) : await getJson(SRC_URL)

// имена сцен EN/RU — из файлов игры
const datModules = arg('--dat') ?? path.join(os.tmpdir(), 'poeth-rumours-dat', 'node_modules')
const ownCache = !arg('--cache')
const cacheBase = arg('--cache') ?? path.join(os.tmpdir(), 'poeth-farm-cache')
let game
try {
  game = await readGameAreaNames({
    datModules,
    patch: arg('--patch'),
    cacheDir: ownCache ? path.join(cacheBase, arg('--patch') ?? 'current') : cacheBase,
    schema: arg('--schema') ?? null,
    log: (m) => console.log(m)
  })
} finally {
  if (ownCache && !process.argv.includes('--keep-cache')) await fs.rm(cacheBase, { recursive: true, force: true })
}
const isScene = (id) => isWorldMap(id) || id === 'G_login' || id === 'CharacterSelect'

const kinds = Object.fromEntries(KINDS.map((k) => [k, []]))
const scene = new Set()
for (const a of Object.values(worldAreas)) {
  if (!a?.id || a.id === 'NULL') continue
  kinds[kindOf(a)].push(a.id)
}
// «карта мира», экраны входа и выбора персонажа — сцены, а не области (EN из RePoE и игры, RU из игры)
for (const [id, name] of [...Object.values(worldAreas).map((a) => [a.id, a.name]), ...game.en, ...game.ru]) {
  if (id && isScene(id) && name && !name.startsWith('[DNT')) scene.add(name)
}
for (const k of KINDS) kinds[k].sort()

const out = {
  version: 1,
  source: `RePoE PoE 2 world_areas (${SRC_URL}), ${new Date().toISOString().slice(0, 10)}; имена сцен EN/RU — WorldAreas патча ${game.patch}; S69`,
  tier: { base: 64, max: 16 },
  kinds,
  sceneIgnore: [...scene].sort()
}
await fs.mkdir(path.dirname(OUT), { recursive: true })
await fs.writeFile(OUT, JSON.stringify(out, null, 1) + '\n')
console.log(`${path.relative(ROOT, OUT)}: ${KINDS.map((k) => `${k} ${kinds[k].length}`).join(', ')}; сцены ${scene.size}`)
