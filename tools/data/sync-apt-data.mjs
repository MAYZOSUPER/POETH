// @ts-check
// Синхронизация данных PoE1 из Awakened PoE Trade (SnosMe/awakened-poe-trade, MIT) по пину коммита.
//
//   node tools/data/sync-apt-data.mjs                 # пин по умолчанию (APT_PIN ниже), языки en,ru
//   node tools/data/sync-apt-data.mjs --sha <sha>     # другой коммит APT (полный или короткий SHA)
//   node tools/data/sync-apt-data.mjs --verify        # только проверить sha256 файлов по data.meta.json
//   опции: --langs en,ru  --out resources/data/poe1  --no-cache
//
// Что делает:
//   1. скачивает renderer/public/data/<lang>/{stats.ndjson,items.ndjson,client_strings.js}
//      (кэш — tools/data/.cache/<sha>/, повторно не качает);
//   2. client_strings.js разбирает БЕЗ исполнения (свой мини-парсер литералов) → client_strings.json
//      (RegExp сериализуются как {"$re": source, "$flags": flags});
//   3. строит индексы (порт renderer/src/assets/make-index-files.mjs): stats-ref / stats-matcher /
//      items-name / items-ref .index.bin — пары uint32 [fnv1a32(ключ), смещение строки в ndjson];
//   4. пишет resources/data/poe1/data.meta.json {aptRepo, aptSha, date, langs, files:{путь: sha256}}.
// Идемпотентен: файлы перезаписываются только при изменении содержимого, дата в meta не меняется,
// если ничего не поменялось.
//
// Атрибуция: формат индексов и данные — Awakened PoE Trade © Alexander Drozdov (SnosMe), MIT.

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '../..')

export const APT_REPO = 'SnosMe/awakened-poe-trade'
/** Пин APT (v3.29.x). На 3.30 перегоняем с --sha. */
export const APT_PIN = '3188208957422b21b69b12083a03edf3d1bac187'
const SOURCE_FILES = ['stats.ndjson', 'items.ndjson', 'client_strings.js']

// ---------------------------------------------------------------- аргументы

function parseArgs(argv) {
  const args = { sha: APT_PIN, langs: ['en', 'ru'], out: path.join(ROOT, 'resources/data/poe1'), cache: true, verify: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const next = () => {
      const v = argv[++i]
      if (v == null) throw new Error(`Нет значения для ${a}`)
      return v
    }
    if (a === '--sha') args.sha = next()
    else if (a === '--langs') args.langs = next().split(',').map((s) => s.trim()).filter(Boolean)
    else if (a === '--out') args.out = path.resolve(next())
    else if (a === '--no-cache') args.cache = false
    else if (a === '--verify') args.verify = true
    else throw new Error(`Неизвестный аргумент: ${a}`)
  }
  for (const l of args.langs) if (!/^[a-z]{2,3}(-[A-Za-z]{2,4})?$/.test(l)) throw new Error(`Плохой язык: ${l}`)
  if (!/^[0-9a-f]{7,40}$/.test(args.sha)) throw new Error(`Плохой SHA: ${args.sha}`)
  return args
}

// ---------------------------------------------------------------- утилиты

export function fnv1a32(str) {
  const bytes = new TextEncoder().encode(str)
  let h = 0x811c9dc5
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i]
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex')

/** Пишет файл только если содержимое изменилось. Возвращает true, если записал. */
function writeIfChanged(file, data) {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data)
  if (fs.existsSync(file) && fs.readFileSync(file).equals(buf)) return false
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, buf)
  return true
}

async function httpGet(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'POETH-data-sync' } })
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`)
  return Buffer.from(await res.arrayBuffer())
}

async function resolveSha(sha) {
  if (sha.length === 40) return sha
  const json = JSON.parse((await httpGet(`https://api.github.com/repos/${APT_REPO}/commits/${sha}`)).toString('utf8'))
  if (typeof json.sha !== 'string' || json.sha.length !== 40) throw new Error(`Не удалось разрешить SHA ${sha}`)
  return json.sha
}

// ---------------------------------------------------------------- client_strings.js → JSON (без eval)

/**
 * Разбирает `export default { KEY: 'str' | "str" | /re/flags | ['a', "b"], ... }`.
 * Код не исполняется: поддерживаются только литералы строк, RegExp и массивы строк, комментарии.
 * Любая другая конструкция → ошибка (значит, формат APT поменялся — смотреть глазами).
 */
export function parseClientStrings(src) {
  const start = src.indexOf('export default {')
  if (start === -1) throw new Error('client_strings.js: нет "export default {"')
  let i = start + 'export default {'.length
  const out = {}

  const skipWs = () => {
    for (;;) {
      while (i < src.length && /\s/.test(src[i])) i++
      if (src.startsWith('//', i)) {
        while (i < src.length && src[i] !== '\n') i++
      } else if (src.startsWith('/*', i)) {
        const end = src.indexOf('*/', i + 2)
        if (end === -1) throw new Error('client_strings.js: незакрытый комментарий')
        i = end + 2
      } else return
    }
  }
  const fail = (msg) => {
    const line = src.slice(0, i).split('\n').length
    throw new Error(`client_strings.js:${line}: ${msg}`)
  }
  const readString = () => {
    const q = src[i++]
    let s = ''
    for (;;) {
      if (i >= src.length) fail('незакрытая строка')
      const c = src[i++]
      if (c === q) return s
      if (c === '\n') fail('перевод строки внутри строки')
      if (c !== '\\') {
        s += c
        continue
      }
      const e = src[i++]
      if (e === 'n') s += '\n'
      else if (e === 't') s += '\t'
      else if (e === 'r') s += '\r'
      else if (e === '0') s += '\0'
      else if (e === 'u') {
        if (src[i] === '{') {
          const end = src.indexOf('}', i)
          s += String.fromCodePoint(parseInt(src.slice(i + 1, end), 16))
          i = end + 1
        } else {
          s += String.fromCharCode(parseInt(src.slice(i, i + 4), 16))
          i += 4
        }
      } else if (e === 'x') {
        s += String.fromCharCode(parseInt(src.slice(i, i + 2), 16))
        i += 2
      } else s += e // \\ \' \" и прочие — как есть
    }
  }
  const readRegex = () => {
    i++ // '/'
    let body = ''
    let inClass = false
    for (;;) {
      if (i >= src.length || src[i] === '\n') fail('незакрытый RegExp')
      const c = src[i++]
      if (c === '\\') {
        body += c + src[i++]
        continue
      }
      if (c === '[') inClass = true
      else if (c === ']') inClass = false
      else if (c === '/' && !inClass) break
      body += c
    }
    let flags = ''
    while (/[a-z]/.test(src[i] ?? '')) flags += src[i++]
    new RegExp(body, flags) // проверка синтаксиса
    return { $re: body, $flags: flags }
  }
  const readValue = () => {
    skipWs()
    const c = src[i]
    if (c === "'" || c === '"') return readString()
    if (c === '/') return readRegex()
    if (c === '[') {
      i++
      const arr = []
      for (;;) {
        skipWs()
        if (src[i] === ']') {
          i++
          return arr
        }
        const v = readValue()
        if (typeof v !== 'string') fail('в массивах поддерживаются только строки')
        arr.push(v)
        skipWs()
        if (src[i] === ',') i++
        else if (src[i] !== ']') fail('ожидалась "," или "]"')
      }
    }
    return fail(`неподдерживаемое значение "${src.slice(i, i + 20)}"`)
  }

  for (;;) {
    skipWs()
    if (src[i] === '}') break
    const m = /^[A-Za-z_$][\w$]*/.exec(src.slice(i, i + 100))
    if (!m) fail('ожидался ключ')
    const key = m[0]
    i += key.length
    skipWs()
    if (src[i] !== ':') fail('ожидалось ":"')
    i++
    if (Object.prototype.hasOwnProperty.call(out, key)) fail(`дубль ключа ${key}`)
    out[key] = readValue()
    skipWs()
    if (src[i] === ',') i++
    else if (src[i] !== '}') fail('ожидалась "," или "}"')
  }
  return out
}

// ---------------------------------------------------------------- индексы (порт make-index-files.mjs)

/** @param {Array<{hash:number,start:number}>} rows */
function packIndex(rows) {
  rows.sort((a, b) => a.hash - b.hash || a.start - b.start)
  const data = new Uint32Array(rows.length * 2)
  rows.forEach((r, k) => {
    data[k * 2] = r.hash
    data[k * 2 + 1] = r.start
  })
  return Buffer.from(data.buffer)
}

/** Смещения — индексы в JS-строке (UTF-16), как у APT: загрузчик режет `ndjson.slice(start, end)`. */
export function buildStatsIndexes(ndjson) {
  const statsByRef = []
  const matchers = []
  let start = 0
  while (start !== ndjson.length) {
    const end = ndjson.indexOf('\n', start)
    if (end === -1) throw new Error('stats.ndjson: последняя строка без \\n')
    const statOrGroup = JSON.parse(ndjson.slice(start, end))
    const stats = 'stats' in statOrGroup ? statOrGroup.stats : [statOrGroup]
    for (const stat of stats) {
      statsByRef.push({ start, hash: fnv1a32(stat.ref) })
      // POETH: индексируем и string, и advanced (APT — только advanced): обычный формат Ctrl+C и текст
      // с трейда содержат string-вариант, расширенный — advanced
      for (const m of stat.matchers) {
        matchers.push({ start, hash: fnv1a32(m.string) })
        if (m.advanced && m.advanced !== m.string) matchers.push({ start, hash: fnv1a32(m.advanced) })
      }
    }
    start = end + 1
  }
  return { 'stats-ref.index.bin': packIndex(statsByRef), 'stats-matcher.index.bin': packIndex(matchers) }
}

export function buildItemsIndexes(ndjson) {
  const startsByName = new Map()
  let start = 0
  while (start !== ndjson.length) {
    const end = ndjson.indexOf('\n', start)
    if (end === -1) throw new Error('items.ndjson: последняя строка без \\n')
    const item = JSON.parse(ndjson.slice(start, end))
    const key = `${item.namespace}::${item.refName}`
    if (!startsByName.has(key)) {
      startsByName.set(key, {
        hashName: fnv1a32(`${item.namespace}::${item.name}`),
        hashRefName: fnv1a32(key),
        start
      })
    }
    start = end + 1
  }
  const rows = Array.from(startsByName.values())
  return {
    'items-name.index.bin': packIndex(rows.map((r) => ({ hash: r.hashName, start: r.start }))),
    'items-ref.index.bin': packIndex(rows.map((r) => ({ hash: r.hashRefName, start: r.start })))
  }
}

// ---------------------------------------------------------------- main

async function fetchSource(sha, lang, file, useCache) {
  const cacheFile = path.join(__dirname, '.cache', sha, lang, file)
  if (useCache && fs.existsSync(cacheFile) && fs.statSync(cacheFile).size > 0) return fs.readFileSync(cacheFile)
  const url = `https://raw.githubusercontent.com/${APT_REPO}/${sha}/renderer/public/data/${lang}/${file}`
  const buf = await httpGet(url)
  fs.mkdirSync(path.dirname(cacheFile), { recursive: true })
  fs.writeFileSync(cacheFile, buf)
  return buf
}

/** ndjson с LF и \n в конце (на случай CRLF/без финального перевода строки в источнике). */
function normalizeNdjson(buf) {
  let s = buf.toString('utf8').replace(/^﻿/, '').replace(/\r\n/g, '\n')
  if (!s.endsWith('\n')) s += '\n'
  return s
}

function verify(out) {
  const metaFile = path.join(out, 'data.meta.json')
  const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'))
  let bad = 0
  for (const [rel, hash] of Object.entries(meta.files)) {
    const abs = path.join(out, rel)
    if (!fs.existsSync(abs)) {
      console.error(`нет файла: ${rel}`)
      bad++
    } else if (sha256(fs.readFileSync(abs)) !== hash) {
      console.error(`sha256 не совпадает: ${rel}`)
      bad++
    }
  }
  console.log(bad ? `ОШИБКИ: ${bad}` : `OK: ${Object.keys(meta.files).length} файлов, APT ${meta.aptSha}`)
  return bad === 0
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.verify) {
    process.exitCode = verify(args.out) ? 0 : 1
    return
  }

  const sha = await resolveSha(args.sha)
  console.log(`APT ${APT_REPO}@${sha} → ${path.relative(ROOT, args.out) || args.out}`)

  /** @type {Record<string,string>} */
  const files = {}
  let changed = 0
  const put = (rel, data) => {
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data)
    if (writeIfChanged(path.join(args.out, rel), buf)) changed++
    files[rel] = sha256(buf)
  }

  for (const lang of args.langs) {
    const [statsRaw, itemsRaw, clientRaw] = await Promise.all(
      SOURCE_FILES.map((f) => fetchSource(sha, lang, f, args.cache))
    )
    const stats = normalizeNdjson(statsRaw)
    const items = normalizeNdjson(itemsRaw)
    const clientJs = clientRaw.toString('utf8').replace(/\r\n/g, '\n')
    const clientJson = JSON.stringify(parseClientStrings(clientJs), null, 1) + '\n'

    put(`${lang}/stats.ndjson`, stats)
    put(`${lang}/items.ndjson`, items)
    put(`${lang}/client_strings.js`, clientJs)
    put(`${lang}/client_strings.json`, clientJson)
    for (const [name, buf] of Object.entries(buildStatsIndexes(stats))) put(`${lang}/${name}`, buf)
    for (const [name, buf] of Object.entries(buildItemsIndexes(items))) put(`${lang}/${name}`, buf)
    console.log(`  ${lang}: stats ${(stats.length / 1e6).toFixed(2)}M симв., items ${(items.length / 1e6).toFixed(2)}M симв.`)
  }

  const metaFile = path.join(args.out, 'data.meta.json')
  const prev = fs.existsSync(metaFile) ? JSON.parse(fs.readFileSync(metaFile, 'utf8')) : null
  const sortedFiles = Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b)))
  const same = prev && prev.aptSha === sha && JSON.stringify(prev.files) === JSON.stringify(sortedFiles)
  const meta = {
    aptRepo: APT_REPO,
    aptSha: sha,
    date: same ? prev.date : new Date().toISOString().slice(0, 10),
    langs: args.langs,
    license: 'MIT — Awakened PoE Trade © Alexander Drozdov (SnosMe)',
    files: sortedFiles
  }
  if (writeIfChanged(metaFile, JSON.stringify(meta, null, 2) + '\n')) changed++
  console.log(changed ? `Готово: обновлено файлов — ${changed}.` : 'Готово: всё уже актуально.')
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? '')) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e)
    process.exitCode = 1
  })
}
