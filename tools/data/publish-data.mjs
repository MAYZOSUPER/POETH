// Пакет данных для обновления без переустановки (S10a): манифест + файлы для ветки `data`
// публичного репозитория (приложение читает links.DATA_MANIFEST_URL =
// https://raw.githubusercontent.com/MAYZOSUPER/POETH/data/manifest.json).
//
//   node tools/data/publish-data.mjs --version 3.30.0-1 [--game poe1] [--min-app 0.1.0] [--out dist-data]
//   node tools/data/publish-data.mjs --game poe2 [--version 2026.12.11-1] --out dist-data-poe2      (S67)
//
// Собирает из resources/data/<game> (без скрытых файлов):
//   <out>/manifest.json            {version, game, minApp, files: {"en/stats.ndjson": {sha256, size}}}
//                                  (PoE 2 — <out>/manifest-poe2.json, раскладка — data-channel.mjs)
//   <out>/<game>/<путь>            сами файлы
// Публикация (лид): содержимое <out> — в корень ветки `data` (git worktree add ../poeth-data data,
// скопировать, commit, push). Приложение скачает только файлы, отличающиеся от встроенных.
// Версия по умолчанию — дата данных из data.meta.json (PoE 1 — APT, PoE 2 — EE2); у PoE 2 к ней
// добавляется дата снимка цен poe.ninja (prices/index.json): «2026.10.30-p20261031».

import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { manifestName } from './data-channel.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const argv = process.argv.slice(2)
const arg = (name, def) => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : def
}

const game = arg('game', 'poe1')
const src = path.resolve(ROOT, arg('src', 'resources/data'), game)
const out = path.resolve(ROOT, arg('out', 'dist-data'))
const pkg = JSON.parse(await fs.readFile(path.join(ROOT, 'package.json'), 'utf8'))
const minApp = arg('min-app', pkg.version)

let version = arg('version', '')
if (!version) {
  // по умолчанию — дата синхронизации данных APT (data.meta.json)
  try {
    const meta = JSON.parse(await fs.readFile(path.join(src, 'data.meta.json'), 'utf8'))
    version = String(meta.date ?? '').replace(/-/g, '.')
  } catch {
    /* нет meta */
  }
  // PoE 2 (S67): снимок цен меняется чаще данных EE2 — его дата в версии, чтобы выпуски различались
  if (version && game === 'poe2') {
    try {
      const at = JSON.parse(await fs.readFile(path.join(src, 'prices/index.json'), 'utf8')).at
      if (Number.isFinite(at)) version += `-p${new Date(at).toISOString().slice(0, 10).replace(/-/g, '')}`
    } catch {
      /* снимка нет */
    }
  }
}

const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/
function fail(msg) {
  console.error(`publish-data: ${msg}`)
  process.exit(1)
}

if (game !== 'poe1' && game !== 'poe2') fail(`неизвестная игра ${game}`)
if (!/^[0-9A-Za-z.+-]{1,40}$/.test(version)) fail(`нужна версия пакета: --version 3.30.0-1 (сейчас «${version}»)`)

async function walk(dir, prefix = '') {
  const out = []
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue // .gitattributes и т. п.
    const rel = prefix ? `${prefix}/${e.name}` : e.name
    if (e.isDirectory()) out.push(...(await walk(path.join(dir, e.name), rel)))
    else if (e.isFile()) out.push(rel)
  }
  return out
}

const files = (await walk(src)).sort()
if (files.length === 0) fail(`нет файлов в ${src}`)

const manifest = { version, game, minApp, files: {} }
await fs.rm(out, { recursive: true, force: true })
for (const rel of files) {
  const parts = rel.split('/')
  if (parts.length > 4 || !parts.every((s) => SEGMENT.test(s))) fail(`недопустимый путь ${rel}`)
  const buf = await fs.readFile(path.join(src, rel))
  manifest.files[rel] = { sha256: createHash('sha256').update(buf).digest('hex'), size: buf.length }
  const dest = path.join(out, game, rel)
  await fs.mkdir(path.dirname(dest), { recursive: true })
  await fs.writeFile(dest, buf)
}
await fs.writeFile(path.join(out, manifestName(game)), JSON.stringify(manifest, null, 2) + '\n')

const total = Object.values(manifest.files).reduce((s, f) => s + f.size, 0)
console.log(`пакет данных ${game} ${version} (minApp ${minApp}): ${files.length} файлов, ${(total / 1048576).toFixed(1)} МБ → ${path.relative(ROOT, out)}`)
