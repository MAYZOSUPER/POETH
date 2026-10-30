// @ts-check
// Синхронизация данных PoE2 из Exiled Exchange 2 (Kvan7/Exiled-Exchange-2, MIT; форк Awakened PoE Trade) по пину.
//
//   node tools/data/sync-ee2-data.mjs                 # пин по умолчанию (EE2_PIN ниже), языки en,ru
//   node tools/data/sync-ee2-data.mjs --sha <sha>     # другой коммит EE2 (полный или короткий SHA)
//   node tools/data/sync-ee2-data.mjs --verify        # только проверить sha256 файлов по data.meta.json
//   опции: --langs en,ru  --out resources/data/poe2  --no-cache
//
// Что делает (как sync-apt-data.mjs для PoE1, общие функции берёт оттуда):
//   1. скачивает renderer/public/data/<lang>/{stats.ndjson,items.ndjson,client_strings.js}
//      (кэш — tools/data/.cache/ee2/<sha>/, повторно не качает);
//   2. client_strings.js разбирает БЕЗ исполнения (мини-парсер литералов) → client_strings.json;
//   3. строит индексы stats-ref / stats-matcher / items-name / items-ref .index.bin (формат APT);
//   4. пишет resources/data/poe2/data.meta.json {ee2Repo, ee2Sha, date, langs, license, files:{путь: sha256}}.
// У EE2 есть и русские данные (renderer/public/data/ru) — RU-клиент PoE2 работает так же, как EN.
// Идемпотентен: файлы перезаписываются только при изменении содержимого, дата в meta не меняется,
// если ничего не поменялось.
//
// Атрибуция: данные и формат — Exiled Exchange 2 © Kvan7 и Awakened PoE Trade © Alexander Drozdov (SnosMe), MIT.

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildItemsIndexes, buildStatsIndexes, parseClientStrings } from './sync-apt-data.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '../..')

export const EE2_REPO = 'Kvan7/Exiled-Exchange-2'
/** Пин EE2: master, v0.16.3 (06.09.2026). На новую лигу перегоняем с --sha. */
export const EE2_PIN = 'cca30662bf31eaf38bd711e2ec1a6b899a06c40e'
const SOURCE_FILES = ['stats.ndjson', 'items.ndjson', 'client_strings.js']

function parseArgs(argv) {
  const args = { sha: EE2_PIN, langs: ['en', 'ru'], out: path.join(ROOT, 'resources/data/poe2'), cache: true, verify: false }
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

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex')

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
  const json = JSON.parse((await httpGet(`https://api.github.com/repos/${EE2_REPO}/commits/${sha}`)).toString('utf8'))
  if (typeof json.sha !== 'string' || json.sha.length !== 40) throw new Error(`Не удалось разрешить SHA ${sha}`)
  return json.sha
}

async function fetchSource(sha, lang, file, useCache) {
  const cacheFile = path.join(__dirname, '.cache', 'ee2', sha, lang, file)
  if (useCache && fs.existsSync(cacheFile) && fs.statSync(cacheFile).size > 0) return fs.readFileSync(cacheFile)
  const url = `https://raw.githubusercontent.com/${EE2_REPO}/${sha}/renderer/public/data/${lang}/${file}`
  const buf = await httpGet(url)
  fs.mkdirSync(path.dirname(cacheFile), { recursive: true })
  fs.writeFileSync(cacheFile, buf)
  return buf
}

function normalizeNdjson(buf) {
  let s = buf.toString('utf8').replace(/^﻿/, '').replace(/\r\n/g, '\n')
  if (!s.endsWith('\n')) s += '\n'
  return s
}

function verify(out) {
  const meta = JSON.parse(fs.readFileSync(path.join(out, 'data.meta.json'), 'utf8'))
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
  console.log(bad ? `ОШИБКИ: ${bad}` : `OK: ${Object.keys(meta.files).length} файлов, EE2 ${meta.ee2Sha}`)
  return bad === 0
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.verify) {
    process.exitCode = verify(args.out) ? 0 : 1
    return
  }

  const sha = await resolveSha(args.sha)
  console.log(`EE2 ${EE2_REPO}@${sha} → ${path.relative(ROOT, args.out) || args.out}`)

  /** @type {Record<string,string>} */
  const files = {}
  let changed = 0
  const put = (rel, data) => {
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data)
    if (writeIfChanged(path.join(args.out, rel), buf)) changed++
    files[rel] = sha256(buf)
  }

  for (const lang of args.langs) {
    const [statsRaw, itemsRaw, clientRaw] = await Promise.all(SOURCE_FILES.map((f) => fetchSource(sha, lang, f, args.cache)))
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
  const same = prev && prev.ee2Sha === sha && JSON.stringify(prev.files) === JSON.stringify(sortedFiles)
  const meta = {
    ee2Repo: EE2_REPO,
    ee2Sha: sha,
    date: same ? prev.date : new Date().toISOString().slice(0, 10),
    langs: args.langs,
    license: 'MIT — Exiled Exchange 2 © Kvan7; Awakened PoE Trade © Alexander Drozdov (SnosMe)',
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
