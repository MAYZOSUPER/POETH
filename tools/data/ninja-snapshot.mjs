// Снимок цен уников poe.ninja для «Обмен → Предметы» (S33). Запускает только CI раз в час
// (.github/workflows/data.yml, job prices) — к poe.ninja ходит GitHub Actions, а не каждый игрок:
// poe.ninja просит десктоп-приложения не звать их API с машин пользователей, а ходить через свой бэкенд
// (https://poe.ninja/docs/api). Приложение читает готовый снимок из ветки `prices` этого репозитория.
//
// Вежливость к poe.ninja: запросы по очереди с паузой, User-Agent с адресом проекта, условные запросы
// (If-None-Match по ETag прошлого снимка, 304 — строки берутся из прошлого снимка). Сайт не копируем:
// в снимок идут только уники и только поля для расчёта (без иконок, текстов модов и т.п.).
//
//   node tools/data/ninja-snapshot.mjs --out dist-prices [--prev prev-prices] [--leagues "Allflame,Standard"]
//   node tools/data/ninja-snapshot.mjs --out dist-prices --from-dir <папка с <лига>/<тип>.json>   # без сети
//
// Формат — src/shared/flip/items/snapshot.ts (parseSnapshot / parseIndex), версия 1.

import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const SNAPSHOT_VERSION = 1
export const NINJA_BASE = 'https://poe.ninja/poe1/api/economy'
export const USER_AGENT = 'POETH-data/1 (+https://github.com/MAYZOSUPER/POETH; hourly snapshot via GitHub Actions)'
/** типы уников item overview poe.ninja (PoE 1) */
export const UNIQUE_TYPES = [
  'UniqueWeapon',
  'UniqueArmour',
  'UniqueAccessory',
  'UniqueFlask',
  'UniqueJewel',
  'UniqueMap',
  'UniqueRelic',
  'UniqueTincture'
]
const PAUSE_MS = 1500
const TIMEOUT_MS = 30_000
const MAX_TRADE_STATS = 8
const MAX_LINES = 20_000

const str = (v, max = 200) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined)
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
const round = (v, d = 2) => Math.round(v * 10 ** d) / 10 ** d

/** Имя файла лиги: латиница и цифры, остальное — «_код». Тот же алгоритм — leagueFile() в snapshot.ts. */
export function leagueFile(league) {
  return `${league.replace(/[^A-Za-z0-9]/g, (c) => `_${c.charCodeAt(0).toString(16)}`).slice(0, 120)}.json`
}

/** Строка item overview → строка снимка; не уник или без цены — null. */
export function reduceLine(type, l) {
  if (!l || typeof l !== 'object') return null
  const id = str(l.detailsId)
  const name = str(l.name)
  const base = str(l.baseType)
  const chaos = num(l.chaosValue)
  const cls = num(l.itemClass)
  if (!id || !name || !base || chaos === undefined || chaos <= 0) return null
  const out = { id, name, base, type, cls: cls ?? 3, chaos: round(chaos), count: Math.max(0, Math.round(num(l.count) ?? 0)), listings: Math.max(0, Math.round(num(l.listingCount) ?? 0)) }
  const variant = str(l.variant)
  if (variant) out.variant = variant
  const links = num(l.links)
  if (links === 5 || links === 6) out.links = links
  const itemType = str(l.itemType, 60)
  if (itemType) out.itemType = itemType
  if (l.corrupted === true) out.corrupted = true
  if (Array.isArray(l.implicitModifiers)) out.implicits = l.implicitModifiers.length
  if (Array.isArray(l.tradeInfo)) {
    const trade = []
    for (const t of l.tradeInfo.slice(0, MAX_TRADE_STATS)) {
      const mod = str(t?.mod, 80)
      if (!mod || !/^[a-z]+\.[a-z0-9_]+$/.test(mod)) continue
      const s = { id: mod }
      const min = num(t.min)
      const max = num(t.max)
      // poe.ninja пишет 0/0, когда диапазона нет — это «свойство есть», без чисел
      if (!(min === 0 && max === 0)) {
        if (min !== undefined) s.min = min
        if (max !== undefined) s.max = max
      }
      trade.push(s)
    }
    if (trade.length) out.trade = trade
  }
  const spark = l.sparkLine ?? l.sparkline
  if (spark && typeof spark === 'object') {
    const change = num(spark.totalChange)
    if (change !== undefined) out.change = round(change, 1)
    if (Array.isArray(spark.data) && spark.data.length) out.spark = spark.data.slice(0, 14).map((x) => (num(x) === undefined ? null : round(x, 1)))
  }
  return out
}

/** Ответ item overview (`{lines}`) → строки снимка. */
export function reduceOverview(type, json) {
  const lines = Array.isArray(json?.lines) ? json.lines : []
  const out = []
  for (const l of lines) {
    const r = reduceLine(type, l)
    if (r) out.push(r)
  }
  return out
}

/** chaos за divine по строкам poe.ninja (медиана chaosValue / divineValue). */
export function divineRateOf(rawLines) {
  const r = []
  for (const l of rawLines) {
    const c = num(l?.chaosValue)
    const d = num(l?.divineValue)
    if (c && d && d >= 0.5) r.push(c / d)
  }
  if (!r.length) return undefined
  r.sort((a, b) => a - b)
  return round(r[Math.floor(r.length / 2)], 1)
}

export function buildSnapshot({ league, at, lines, divine, etags }) {
  const snap = { v: SNAPSHOT_VERSION, source: 'poe.ninja', league, at, lines: lines.slice(0, MAX_LINES) }
  if (divine) snap.divine = divine
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

async function main() {
  const argv = process.argv.slice(2)
  const arg = (name, def) => {
    const i = argv.indexOf(`--${name}`)
    return i >= 0 && argv[i + 1] ? argv[i + 1] : def
  }
  const out = path.resolve(arg('out', 'dist-prices'))
  const prevDir = arg('prev') ? path.resolve(arg('prev')) : null
  const fromDir = arg('from-dir') ? path.resolve(arg('from-dir')) : null
  const at = Date.now()

  let leagues = arg('leagues')?.split(',').map((s) => s.trim()).filter(Boolean)
  if (!leagues?.length) {
    if (fromDir) {
      leagues = (await fs.readdir(fromDir, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name)
    } else {
      const r = await getJson(`${NINJA_BASE}/leagues`)
      leagues = (Array.isArray(r.json) ? r.json : []).map((l) => str(l?.id ?? l?.name, 100)).filter(Boolean)
      await sleep(PAUSE_MS)
    }
  }
  if (!leagues.length) throw new Error('нет лиг')

  await fs.mkdir(path.join(out, 'poe1'), { recursive: true })
  const index = { v: SNAPSHOT_VERSION, source: 'poe.ninja', at, leagues: [] }
  let requests = 0
  let notModified = 0
  for (const league of leagues) {
    const file = leagueFile(league)
    const prev = prevDir ? await readJson(path.join(prevDir, 'poe1', file)) : null
    const lines = []
    const raw = []
    const etags = {}
    let failed = 0
    for (const type of UNIQUE_TYPES) {
      try {
        let res
        if (fromDir) {
          const json = await readJson(path.join(fromDir, league, `${type}.json`))
          res = json ? { status: 200, json } : null
        } else {
          const url = `${NINJA_BASE}/stash/current/item/overview?league=${encodeURIComponent(league)}&type=${type}`
          res = await getJson(url, prev?.etags?.[type])
          requests++
          await sleep(PAUSE_MS)
        }
        if (!res) continue
        if (res.status === 304) {
          notModified++
          lines.push(...(prev?.lines ?? []).filter((l) => l.type === type))
        } else {
          raw.push(...(Array.isArray(res.json?.lines) ? res.json.lines : []))
          lines.push(...reduceOverview(type, res.json))
        }
        if (res.etag) etags[type] = res.etag
      } catch (e) {
        failed++
        console.warn(`${league} ${type}: ${e.message} — строки из прошлого снимка`)
        lines.push(...(prev?.lines ?? []).filter((l) => l.type === type))
        if (prev?.etags?.[type]) etags[type] = prev.etags[type]
      }
    }
    if (!lines.length) {
      console.warn(`${league}: строк нет — лига пропущена`)
      continue
    }
    const divine = divineRateOf(raw) ?? prev?.divine
    const snap = buildSnapshot({ league, at: failed === UNIQUE_TYPES.length ? (prev?.at ?? at) : at, lines, divine, etags })
    await fs.writeFile(path.join(out, 'poe1', file), JSON.stringify(snap))
    index.leagues.push({ league, file: `poe1/${file}`, at: snap.at, lines: snap.lines.length })
    console.log(`${league}: ${snap.lines.length} строк, divine ${divine ?? '?'} c${failed ? `, ошибок ${failed}` : ''}`)
  }
  if (!index.leagues.length) throw new Error('ни одной лиги — публиковать нечего')
  await fs.writeFile(path.join(out, 'index.json'), JSON.stringify(index, null, 1))
  console.log(`готово: ${index.leagues.length} лиг, запросов к poe.ninja ${requests}, без изменений (304) ${notModified}`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(`ninja-snapshot: ${e.message}`)
    process.exit(1)
  })
}
