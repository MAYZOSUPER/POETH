// «Слухи журнала» PoE 2 (S65): пересобрать resources/data/poe2/rumours/rumours.json из файлов игры и проверить его.
//
//   node tools/rumours/extract.mjs [--patch 0.5.5.5] [--dat <node_modules>] [--cache <папка>] [--keep-cache] [--dry]
//   node tools/rumours/extract.mjs --check [--strict] [--file <rumours.json>]     # проверка (npm test, CI)
//
// Пересборка (к патчу или к 1.0 — за минуты):
//  1. Поставить pathofexile-dat (SnosMe, MIT) во временную папку — в package.json его нет:
//       npm install --prefix "%TEMP%\poeth-rumours-dat" --no-audit --no-fund pathofexile-dat@16.0.1
//     (путь к её node_modules — по умолчанию; другой — --dat).
//  2. Запустить без --check. Номер патча спросим у патч-сервера GGG (или --patch), таблицы скачаем с CDN патчей
//     во временную папку (~120 МБ, после работы удаляется; --keep-cache — оставить для повтора).
//  3. Отчёт покажет новые, пропавшие и изменённые строки. У новых островов нет нашей оценки — дописать руками
//     (rewards, risks, difficulty, tier, note) и прогнать --check --strict.
//
// Обновляется только то, что из игры: строки слуха EN/RU, остров, категория, боссы, у наград — путь метаданных
// и RU-имя. Наши поля не трогаем. Данных пользователя нет ни в одном запросе (UA POETH).
//
// Для тестов: --from-game <файл> — выгрузка из прошлого запуска (--save-game <файл>) вместо сети; --out <файл>;
// --today YYYY-MM-DD.

import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { EE2_ITEMS, RUMOURS_DATA_FILE, loadEe2ItemKeys, loadRumoursCore } from './core.mjs'
import { SCHEMA_URL, queryPatchVersion, readGameRumours } from './game.mjs'
import { mergeGameRumours, rewardItemNames } from './merge.mjs'

const DAT_VERSION = '16.0.1'
const DEFAULT_DAT = path.join(os.tmpdir(), 'poeth-rumours-dat', 'node_modules')

function fail(msg) {
  console.error(`rumours: ${msg}`)
  process.exit(1)
}

function parseArgs(argv) {
  const out = { check: false, strict: false, dry: false, keepCache: false, file: RUMOURS_DATA_FILE, out: null, patch: null, dat: DEFAULT_DAT, cache: null, schema: SCHEMA_URL, fromGame: null, saveGame: null, today: null, ee2: EE2_ITEMS }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const val = () => {
      const v = argv[++i]
      if (v === undefined) fail(`${a}: нет значения`)
      return v
    }
    if (a === '--check') out.check = true
    else if (a === '--strict') out.strict = true
    else if (a === '--dry') out.dry = true
    else if (a === '--keep-cache') out.keepCache = true
    else if (a === '--file') out.file = path.resolve(val())
    else if (a === '--out') out.out = path.resolve(val())
    else if (a === '--patch') out.patch = val()
    else if (a === '--dat') out.dat = path.resolve(val())
    else if (a === '--cache') out.cache = path.resolve(val())
    else if (a === '--schema') out.schema = val()
    else if (a === '--from-game') out.fromGame = path.resolve(val())
    else if (a === '--save-game') out.saveGame = path.resolve(val())
    else if (a === '--today') out.today = val()
    else if (a === '--ee2') out.ee2 = path.resolve(val())
    else fail(`неизвестный аргумент ${a}`)
  }
  if (out.patch && !/^\d{1,2}(\.\d{1,3}){1,4}$/.test(out.patch)) fail('--patch: версия вида 0.5.5.5')
  if (out.today && !/^\d{4}-\d{2}-\d{2}$/.test(out.today)) fail('--today: YYYY-MM-DD')
  return out
}

async function readJsonFile(file) {
  let s
  try {
    s = await fs.readFile(file, 'utf8')
  } catch {
    return null
  }
  return JSON.parse(s.charCodeAt(0) === 0xfeff ? s.slice(1) : s)
}

/**
 * Проверка файла: валидатор приложения + ссылки наград есть в данных EE2. Ошибки — битые записи, лишние поля,
 * ссылки мимо EE2. Предупреждения — нет RU-строки, нет нашей оценки (с --strict это тоже ошибки).
 */
async function check(core, raw, ee2File, strict) {
  const errors = []
  const warnings = []
  if (core.isNewerSchema(raw)) return { errors: ['схема новее инструмента'], warnings, count: 0 }
  const v = core.validateRumoursFile(raw)
  if (!v.ok) return { errors: [v.error], warnings, count: 0 }
  for (const f of v.value.failed) errors.push(`запись ${f.index}${f.id ? ` (${f.id})` : ''}: ${f.error}`)
  for (const d of v.value.dropped) errors.push(`лишнее поле ${d}`)
  const keys = await loadEe2ItemKeys(ee2File)
  for (const r of v.value.file.rumours) {
    for (const rw of r.rewards) {
      if ('item' in rw && !keys.has(`${rw.item.ns}:${rw.item.ref}`)) errors.push(`${r.id}: награды ${rw.item.ns}:${rw.item.ref} нет в данных EE2`)
      if ('item' in rw && !rw.item.meta) warnings.push(`${r.id}: у награды ${rw.item.ref} нет пути метаданных — фид обмена её не найдёт`)
    }
    if (!r.text.ru) warnings.push(`${r.id}: нет RU-строки — записать с RU-клиента: «${r.text.en}»`)
    if (!r.island.ru) warnings.push(`${r.id}: нет RU-имени острова «${r.island.en}»`)
    if (r.tier === null) warnings.push(`${r.id}: нет нашего тира`)
    if (r.difficulty === null) warnings.push(`${r.id}: нет сложности`)
    // тир ●○○ «без особой награды» — пустой список честнее выдуманной награды
    if (!r.rewards.length && r.tier !== 1) warnings.push(`${r.id}: нет наград`)
    if (!r.note?.ru || !r.note?.en) warnings.push(`${r.id}: строка note нужна на RU и EN`)
  }
  if (strict) {
    errors.push(...warnings)
    warnings.length = 0
  }
  return { errors, warnings, count: v.value.file.rumours.length, file: v.value.file }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const core = await loadRumoursCore()

  if (args.check) {
    const raw = await readJsonFile(args.file)
    if (raw === null) fail(`нет файла ${args.file}`)
    const res = await check(core, raw, args.ee2, args.strict)
    for (const w of res.warnings) console.log(`  предупреждение: ${w}`)
    if (res.errors.length) {
      for (const e of res.errors) console.error(`  ошибка: ${e}`)
      fail(`${path.basename(args.file)}: ошибок — ${res.errors.length}`)
    }
    const c = { expedition: 0, unique: 0, boss: 0 }
    for (const r of res.file.rumours) c[r.category]++
    console.log(`ок — слухов ${res.count} (экспедиций ${c.expedition}, уникальных карт ${c.unique}, боссов ${c.boss}), патч ${res.file.patch}`)
    return
  }

  const today = args.today ?? new Date().toISOString().slice(0, 10)
  const current = await readJsonFile(args.file)
  const itemNames = rewardItemNames(current)

  let game
  let cacheDir = null
  if (args.fromGame) {
    const g = await readJsonFile(args.fromGame)
    if (!g) fail(`нет файла ${args.fromGame}`)
    game = { ...g, items: new Map(Object.entries(g.items ?? {})) }
  } else {
    const patch = args.patch ?? (await queryPatchVersion())
    console.log(`патч PoE 2: ${patch}`)
    cacheDir = args.cache ?? path.join(os.tmpdir(), 'poeth-rumours-cache', patch)
    try {
      game = await readGameRumours({ datModules: args.dat, patch, cacheDir, schema: args.schema, itemNames, log: (m) => console.log(`  ${m}`) })
    } catch (e) {
      if (/нет pathofexile-dat/.test(e.message)) {
        fail(`${e.message}\n  Поставьте во временную папку (не в репо):\n    npm install --prefix "${path.dirname(DEFAULT_DAT)}" --no-audit --no-fund pathofexile-dat@${DAT_VERSION}`)
      }
      throw e
    } finally {
      if (!args.keepCache && cacheDir) await fs.rm(cacheDir, { recursive: true, force: true })
    }
    console.log(`скачано ${(game.downloaded / 1024 / 1024).toFixed(1)} МБ, строк слухов: ${game.rows.length}${game.russian ? '' : ' (RU-таблиц нет)'}`)
  }
  if (args.saveGame) {
    const { downloaded: _d, ...rest } = game
    await fs.writeFile(args.saveGame, JSON.stringify({ ...rest, items: Object.fromEntries(game.items) }, null, 2) + '\n')
  }

  const { file, report, changed } = mergeGameRumours(current, game, today, core.rumourIdOf)
  for (const [title, list] of [
    ['новые слухи (нужна наша оценка)', report.added],
    ['пропали из игры', report.removed],
    ['изменились', report.changed],
    ['нет RU-строки — записать с RU-клиента', report.noRu],
    ['наград нет в BaseItemTypes', report.itemsMissing]
  ]) {
    if (!list.length) continue
    console.log(`${title}:`)
    for (const x of list) console.log(`  ${x}`)
  }
  const res = await check(core, file, args.ee2, false)
  if (res.errors.length) {
    for (const e of res.errors) console.error(`  ошибка: ${e}`)
    fail('после слияния файл не проходит проверку — не записан')
  }
  const out = args.out ?? args.file
  if (args.dry) console.log(changed ? 'есть изменения (--dry: не записан)' : 'изменений нет')
  else if (!changed) console.log('изменений нет')
  else {
    await fs.mkdir(path.dirname(out), { recursive: true })
    await fs.writeFile(out, JSON.stringify(file, null, 2) + '\n')
    console.log(`записан ${path.relative(process.cwd(), out) || out}: слухов ${file.rumours.length}, патч ${file.patch}`)
  }
}

main().catch((e) => fail(e?.stack ?? String(e)))
