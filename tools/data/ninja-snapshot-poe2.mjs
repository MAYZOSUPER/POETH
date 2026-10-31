// Снимок цен poe.ninja PoE 2 для пакета данных (S67) → resources/data/poe2/prices/. Его делает CI
// (.github/workflows/data.yml, публикация пакета PoE 2) — к poe.ninja ходит GitHub Actions, а не каждый игрок:
// poe.ninja просит десктоп-приложения не звать их API с машин пользователей, а ходить через свой бэкенд
// (https://poe.ninja/docs/api). Приложение берёт снимок из пакета данных (встроенный + обновление без
// переустановки, S12). Формат и чтение — src/shared/poe2/prices (parsePoe2PriceSnapshot, loadPoe2Prices).
//
// Что берём (всё, что у poe.ninja есть для PoE 2):
//   обмен валюты (exchange overview, 14 типов): валюта, фрагменты, кости, неогранённые камни и камни линии,
//     эссенции, ядра душ, идолы, руны, знамения, Экспедиция, эмоции (Delirium), катализаторы, Verisium;
//   уники (stash item overview, 9 типов): оружие, броня, бижутерия, флаконы, амулеты-обереги, самоцветы,
//     реликвии Санктума, уникальные и Precursor-таблички.
// Цены у poe.ninja PoE 2 — в divine (core.primary), курсы exalted и chaos за divine — core.rates.
//
// Вежливость к poe.ninja: запросы по очереди с паузой, User-Agent с адресом проекта, условные запросы
// (If-None-Match по ETag прошлого снимка; 304 — строки берутся из прошлого снимка). Сайт не копируем: в снимок
// идут только имя, id, цена, лоты/объём и изменение — без иконок, текстов модов, flavour.
//
//   node tools/data/ninja-snapshot-poe2.mjs [--out resources/data/poe2/prices] [--prev <папка прошлого снимка>]
//        [--leagues "Runes of Aldur,Standard"] [--all-leagues] [--save-raw <папка>]
//        [--base <адрес API>] [--pause <мс>]          # для тестов: свой сервер вместо poe.ninja, пауза
//   node tools/data/ninja-snapshot-poe2.mjs --from-dir <папка>        # без сети: <папка>/leagues.json, <лига>/<тип>.json
//
// По умолчанию лиги — из /poe2/api/economy/leagues без хардкора (HC-игроку читатель отдаёт цены софткор-лиги;
// --all-leagues — и хардкор). --prev по умолчанию — сама --out (встроенный снимок). Файлы пишутся только
// после всех запросов; старые файлы лиг в --out удаляются. Ни одной лиги — выход с ошибкой, --out не тронут.

import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const SNAPSHOT_VERSION = 1
export const NINJA2_BASE = 'https://poe.ninja/poe2/api/economy'
export const USER_AGENT = 'POETH-data/1 (+https://github.com/MAYZOSUPER/POETH; snapshot via GitHub Actions)'
/** exchange overview poe.ninja PoE 2 (https://poe.ninja/docs/api, 31.10.2026) */
export const EXCHANGE_TYPES = [
  'Currency',
  'Fragments',
  'Abyss',
  'UncutGems',
  'LineageSupportGems',
  'Essences',
  'SoulCores',
  'Idols',
  'Runes',
  'Ritual',
  'Expedition',
  'Delirium',
  'Breach',
  'Verisium'
]
/** stash item overview poe.ninja PoE 2 */
export const ITEM_TYPES = [
  'UniqueWeapons',
  'UniqueArmours',
  'UniqueAccessories',
  'UniqueFlasks',
  'UniqueCharms',
  'UniqueJewels',
  'UniqueSanctumRelics',
  'UniqueTablets',
  'PrecursorTablets'
]
const PAUSE_MS = 1500 // между запросами к poe.ninja (--pause — только для тестов)
const TIMEOUT_MS = 30_000
const MAX_LEAGUES = 6
const MAX_LINES = 20_000
/** дороже — лот «для вида» (у poe.ninja бывает 4·10⁷ divine при одном лоте); тот же предел — snapshot.ts */
export const MAX_VALUE = 1e6
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

const str = (v, max = 200) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined)
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
/** 4 значащие цифры: цены PoE 2 — от 0,0001 до тысяч divine */
const sig = (v) => Number(v.toPrecision(4))

/**
 * Имя файла лиги: латиница и цифры, остальное — «_код»; первая буква — латинская или цифра (путь пакета
 * данных, shared/updates isSafeDataPath). Тот же алгоритм — leagueFile() в src/shared/poe2/prices/snapshot.ts.
 */
export function leagueFile(league) {
  const s = league.replace(/[^A-Za-z0-9]/g, (c) => `_${c.charCodeAt(0).toString(16)}`).slice(0, 120)
  return `${/^[A-Za-z0-9]/.test(s) ? '' : 'L'}${s}.json`
}

/** Хардкор-лига (по умолчанию не снимаем: читатель отдаёт HC-игроку цены софткор-лиги). */
export function isHardcore(league) {
  return /^(HC|SSF HC)\b/i.test(league) || /\bHardcore\b/i.test(league)
}

function sparkChange(spark) {
  const c = num(spark?.totalChange)
  return c === undefined ? undefined : Math.round(c * 10) / 10
}

/** Ответ exchange overview → строки снимка (имя — из items[] того же ответа). */
export function reduceExchange(kind, json) {
  const names = new Map()
  for (const it of Array.isArray(json?.items) ? json.items : []) {
    const id = str(it?.id, 120)
    const name = str(it?.name)
    if (id && name) names.set(id, name)
  }
  const out = []
  for (const l of Array.isArray(json?.lines) ? json.lines : []) {
    const id = str(l?.id, 120)
    const value = num(l?.primaryValue)
    const name = id ? names.get(id) : undefined
    if (!id || !name || value === undefined || value <= 0 || value > MAX_VALUE) continue
    const line = { id, name, kind, value: sig(value) }
    const volume = num(l.volumePrimaryValue)
    if (volume !== undefined && volume >= 0) line.volume = sig(volume)
    const change = sparkChange(l.sparkline ?? l.sparkLine)
    if (change !== undefined) line.change = change
    out.push(line)
  }
  return out
}

/** Ответ stash item overview (уники) → строки снимка. */
export function reduceItems(kind, json) {
  const out = []
  for (const l of Array.isArray(json?.lines) ? json.lines : []) {
    const id = str(l?.detailsId, 160)
    const name = str(l?.name)
    const value = num(l?.primaryValue)
    if (!id || !name || value === undefined || value <= 0 || value > MAX_VALUE) continue
    const line = { id, name, kind, value: sig(value) }
    const base = str(l.baseType)
    if (base) line.base = base
    const variant = str(l.variant, 80)
    if (variant) line.variant = variant
    if (l.corrupted === true) line.corrupted = true
    line.listings = Math.max(0, Math.round(num(l.listingCount) ?? 0))
    const change = sparkChange(l.sparkLine ?? l.sparkline)
    if (change !== undefined) line.change = change
    out.push(line)
  }
  return out
}

/** core ответа → {primary, rates}: сколько единиц валюты за одну primary (divine). */
export function reduceCore(json) {
  const core = json?.core
  const primary = str(core?.primary, 40)
  if (!primary) return null
  const rates = {}
  for (const [k, v] of Object.entries(core.rates ?? {})) {
    const r = num(v)
    if (/^[a-z0-9-]{1,40}$/.test(k) && r !== undefined && r > 0) rates[k] = sig(r)
  }
  return { primary, rates }
}

export function buildSnapshot({ league, at, core, lines, etags }) {
  const snap = { v: SNAPSHOT_VERSION, source: 'poe.ninja', league, at, primary: core.primary, rates: core.rates, lines: lines.slice(0, MAX_LINES) }
  if (etags && Object.keys(etags).length) snap.etags = etags
  return snap
}

// ---------------------------------------------------------------- CLI

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function getJson(url, etag) {
  const headers = { 'User-Agent': USER_AGENT, Accept: 'application/json' }
  if (etag) headers['If-None-Match'] = etag
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (res.status === 304) return { status: 304, etag }
  if (res.status !== 200) throw new Error(`HTTP ${res.status} ${url}`)
  return { status: 200, json: await res.json(), etag: res.headers.get('etag') ?? undefined }
}

async function readJson(file) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'))
  } catch {
    return null
  }
}

async function writeRaw(dir, rel, json) {
  if (!dir) return
  await fs.mkdir(path.dirname(path.join(dir, rel)), { recursive: true })
  await fs.writeFile(path.join(dir, rel), JSON.stringify(json))
}

async function main() {
  const argv = process.argv.slice(2)
  const arg = (name, def) => {
    const i = argv.indexOf(`--${name}`)
    return i >= 0 && argv[i + 1] ? argv[i + 1] : def
  }
  const out = path.resolve(ROOT, arg('out', 'resources/data/poe2/prices'))
  const prevDir = path.resolve(ROOT, arg('prev', out))
  const fromDir = arg('from-dir') ? path.resolve(arg('from-dir')) : null
  const rawDir = arg('save-raw') ? path.resolve(arg('save-raw')) : null
  const allLeagues = argv.includes('--all-leagues')
  const base = arg('base', NINJA2_BASE).replace(/\/+$/, '')
  const pause = Math.max(0, Number(arg('pause', PAUSE_MS)) || 0)
  const at = Date.now()

  let leagues = arg('leagues')?.split(',').map((s) => s.trim()).filter(Boolean)
  if (!leagues?.length) {
    const json = fromDir ? await readJson(path.join(fromDir, 'leagues.json')) : (await getJson(`${base}/leagues`)).json
    await writeRaw(rawDir, 'leagues.json', json)
    leagues = (Array.isArray(json) ? json : []).map((l) => str(l?.id ?? l?.name, 100)).filter(Boolean)
    if (!allLeagues) leagues = leagues.filter((l) => !isHardcore(l))
    leagues = leagues.slice(0, MAX_LEAGUES)
    if (!fromDir) await sleep(pause)
  }
  if (!leagues.length) throw new Error('нет лиг')

  const prevIndex = await readJson(path.join(prevDir, 'index.json'))
  const index = { v: SNAPSHOT_VERSION, source: 'poe.ninja', at, leagues: [] }
  const files = new Map()
  let requests = 0
  let notModified = 0
  for (const league of leagues) {
    const file = leagueFile(league)
    const prev = prevIndex?.leagues?.some((l) => l.file === file) ? await readJson(path.join(prevDir, file)) : null
    const lines = []
    const etags = {}
    let core = null
    let failed = 0
    const types = [...EXCHANGE_TYPES.map((t) => ['exchange', t]), ...ITEM_TYPES.map((t) => ['item', t])]
    for (const [group, type] of types) {
      const fromPrev = () => lines.push(...(prev?.lines ?? []).filter((l) => l.kind === type))
      try {
        let res
        if (fromDir) {
          const json = await readJson(path.join(fromDir, league, `${type}.json`))
          res = json ? { status: 200, json } : null
        } else {
          const url = `${base}/${group === 'exchange' ? 'exchange/current/overview' : 'stash/current/item/overview'}?league=${encodeURIComponent(league)}&type=${type}`
          res = await getJson(url, prev?.etags?.[type])
          requests++
          await sleep(pause)
        }
        if (!res) continue
        if (res.status === 304) {
          notModified++
          fromPrev()
        } else {
          await writeRaw(rawDir, `${league}/${type}.json`, res.json)
          lines.push(...(group === 'exchange' ? reduceExchange(type, res.json) : reduceItems(type, res.json)))
          // курсы — из обмена валюты (у разных ответов они расходятся на проценты); нет его — из первого ответа
          const c = reduceCore(res.json)
          if (c && (type === 'Currency' || !core)) core = c
        }
        if (res.etag) etags[type] = res.etag
      } catch (e) {
        failed++
        console.warn(`${league} ${type}: ${e.message} — строки из прошлого снимка`)
        fromPrev()
        if (prev?.etags?.[type]) etags[type] = prev.etags[type]
      }
    }
    // все ответы 304 — курсы прошлого снимка (core в 304 не приходит)
    if (!core && prev?.primary) core = { primary: prev.primary, rates: prev.rates ?? {} }
    if (!lines.length || !core) {
      console.warn(`${league}: строк нет — лига пропущена`)
      continue
    }
    const snap = buildSnapshot({ league, at: failed === types.length ? (prev?.at ?? at) : at, core, lines, etags })
    files.set(file, JSON.stringify(snap))
    index.leagues.push({ league, file, at: snap.at, lines: snap.lines.length })
    const kb = (Buffer.byteLength(files.get(file)) / 1024).toFixed(0)
    console.log(`${league}: ${snap.lines.length} строк, ${kb} КБ, 1 ${core.primary} = ${core.rates.exalted ?? '?'} ex = ${core.rates.chaos ?? '?'} c${failed ? `, ошибок ${failed}` : ''}`)
  }
  if (!index.leagues.length) throw new Error('ни одной лиги — снимок не записан')

  // пишем только теперь: старые файлы лиг (и прошлый index.json) в --out — долой
  await fs.mkdir(out, { recursive: true })
  for (const e of await fs.readdir(out)) if (e.endsWith('.json')) await fs.rm(path.join(out, e))
  for (const [file, body] of files) await fs.writeFile(path.join(out, file), body)
  await fs.writeFile(path.join(out, 'index.json'), JSON.stringify(index, null, 1) + '\n')
  console.log(`готово: ${index.leagues.length} лиг → ${path.relative(ROOT, out) || out}; запросов к poe.ninja ${requests}, без изменений (304) ${notModified}`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(`ninja-snapshot-poe2: ${e.message}`)
    process.exit(1)
  })
}
