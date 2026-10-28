// «День лиги» (S12): обновить данные PoE1 и выпустить их игрокам без переустановки — по шагам,
// с остановкой на первой ошибке. Регламент — docs/league-update.md.
//
//   node tools/data/league-day.mjs --sha <коммит APT> --version 3.30.0-1 [--patch 3.30]
//        [--publish ci|local|none] [--from <шаг>] [--only <шаг>] [--dry-run]
//
// Шаги:
//   apt      новый пин APT: sync-apt-data --sha <sha>; APT_PIN в sync-apt-data.mjs ← полный SHA
//   verify   sha256 файлов по data.meta.json (sync-apt-data --verify)
//   regex    regex-данные карт из свежего RePoE fork (build-regex-data --refresh [--patch])
//   tests    typecheck, vitest, test:trade
//   pack     пакет данных: publish-data --version <версия> --out dist-data
//   publish  ci    — изменения закоммичены и в origin/main → тег data-<версия> → .github/workflows/data.yml
//            local — сразу в ветку data (push-data-branch.mjs, тот же скрипт, что в CI)
//            none  — не публиковать (по умолчанию ci)
// Упал шаг — исправить и продолжить с него: --from <шаг>. Без --sha шаг apt пропускается.
// После публикации: node tools/data/check-data-channel.mjs (канал = данные этой сборки).

import { spawnSync, execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const argv = process.argv.slice(2)
const arg = (name, def) => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : def
}
const DRY = argv.includes('--dry-run')
const sha = arg('sha', '')
const patch = arg('patch', '')
const publish = arg('publish', 'ci')
const from = arg('from', '')
const only = arg('only', '')
const STEPS = ['apt', 'verify', 'regex', 'tests', 'pack', 'publish']
const META = path.join(ROOT, 'resources/data/poe1/data.meta.json')
const SYNC = path.join(ROOT, 'tools/data/sync-apt-data.mjs')

function fail(msg) {
  console.error(`\n✗ ${msg}`)
  process.exit(1)
}
for (const s of [from, only]) if (s && !STEPS.includes(s)) fail(`нет шага «${s}»: ${STEPS.join(', ')}`)
if (!['ci', 'local', 'none'].includes(publish)) fail('--publish ci|local|none')
const version = arg('version', '')
if (!/^[0-9A-Za-z.+-]{1,40}$/.test(version)) fail('нужна версия пакета: --version 3.30.0-1 (её видят игроки в тосте «Данные обновлены»)')
if (sha && !/^[0-9a-f]{7,40}$/i.test(sha)) fail(`--sha: нужен SHA коммита APT, а не «${sha}»`)

const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim()

/** Запустить команду; ненулевой код — остановка с подсказкой, откуда продолжить. */
function sh(step, cmd, args) {
  const shown = [cmd === process.execPath ? 'node' : cmd, ...args.map((a) => path.relative(ROOT, a) || a)].join(' ')
  console.log(`  $ ${shown}`)
  if (DRY) return
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit', shell: cmd === 'npm' && process.platform === 'win32' })
  if (r.status !== 0) fail(`шаг «${step}» не прошёл (${shown}). Исправьте и продолжите: --from ${step}`)
}
const node = (step, script, ...args) => sh(step, process.execPath, [path.join(ROOT, script), ...args])

const run = {
  apt() {
    if (!sha) {
      console.log('  --sha не задан — данные APT остаются на текущем пине')
      return
    }
    node('apt', 'tools/data/sync-apt-data.mjs', '--sha', sha)
    if (DRY) return
    // новый пин по умолчанию — полный SHA из data.meta.json
    const full = JSON.parse(readFileSync(META, 'utf8')).aptSha
    const src = readFileSync(SYNC, 'utf8')
    const next = src.replace(/export const APT_PIN = '[0-9a-f]{40}'/, `export const APT_PIN = '${full}'`)
    if (next === src && !src.includes(full)) fail('не нашёл APT_PIN в sync-apt-data.mjs')
    writeFileSync(SYNC, next)
    console.log(`  пин APT → ${full}`)
  },
  verify() {
    node('verify', 'tools/data/sync-apt-data.mjs', '--verify')
  },
  regex() {
    node('regex', 'tools/regex/build-regex-data.mjs', '--refresh', ...(patch ? ['--patch', patch] : []))
  },
  tests() {
    sh('tests', 'npm', ['run', 'typecheck'])
    sh('tests', 'npm', ['test'])
    sh('tests', 'npm', ['run', 'test:trade'])
  },
  pack() {
    node('pack', 'tools/data/publish-data.mjs', '--version', version, '--out', 'dist-data')
  },
  publish() {
    if (publish === 'none') {
      console.log('  --publish none — пакет собран в dist-data, не опубликован')
      return
    }
    if (publish === 'local') {
      node('publish', 'tools/data/push-data-branch.mjs', '--dir', 'dist-data')
      return
    }
    // ci: workflow собирает пакет из закоммиченного resources/data — проверяем, что он в main
    const dirty = git('status', '--porcelain', '--', 'resources/data', 'tools/data/sync-apt-data.mjs')
    if (dirty && !DRY) {
      console.log(dirty)
      fail('данные не закоммичены. Закоммитьте, влейте в main и запустите снова: --from publish')
    }
    if (!DRY) {
      git('fetch', '--quiet', 'origin', 'main')
      const inMain = spawnSync('git', ['merge-base', '--is-ancestor', 'HEAD', 'origin/main'], { cwd: ROOT }).status === 0
      if (!inMain) fail('текущий коммит ещё не в origin/main — workflow публикует только оттуда. Влейте и запустите: --from publish')
    }
    sh('publish', 'git', ['tag', `data-${version}`])
    sh('publish', 'git', ['push', 'origin', `data-${version}`])
    console.log('  workflow «Data»: https://github.com/MAYZOSUPER/POETH/actions/workflows/data.yml')
  }
}

const start = from ? STEPS.indexOf(from) : 0
const steps = only ? [only] : STEPS.slice(start)
console.log(`День лиги: пакет ${version}${sha ? `, APT ${sha}` : ''}${patch ? `, патч ${patch}` : ''}, публикация ${publish}${DRY ? ' (--dry-run)' : ''}`)
for (const s of steps) {
  console.log(`\n▶ ${s}`)
  const t = Date.now()
  run[s]()
  console.log(`✓ ${s} (${((Date.now() - t) / 1000).toFixed(1)} с)`)
}
console.log(`\nГотово. Проверка канала: node tools/data/check-data-channel.mjs (после сборки)`)
