// «День 1.0» PoE 2 (S67, выход 1.0 — 11.12.2026): пересобрать данные PoE 2 и выпустить их игрокам без
// переустановки — по шагам, с остановкой на первой ошибке. То же на любой патч PoE 2. Регламент —
// docs/league-update.md, раздел «PoE 2: день 1.0». PoE 1 — tools/data/league-day.mjs.
//
//   node tools/data/poe2-day.mjs --ee2 <коммит EE2> --version 2026.12.11-1 [--patch 1.0]
//        [--publish ci|local|none] [--from <шаг>] [--only <шаг>] [--dry-run]
//
// Шаги:
//   ee2      новый пин Exiled Exchange 2: sync-ee2-data --sha <sha>; EE2_PIN в sync-ee2-data.mjs ← полный SHA
//   verify   sha256 файлов EE2 по resources/data/poe2/data.meta.json (sync-ee2-data --verify)
//   fixtures RU-фикстуры PoE 2 из новых данных EE2 совпадают (make-poe2-ru-fixtures --check)
//   repoe    генераторы на RePoE PoE 2 и выгрузке дерева GGG, какие есть в репозитории: regex путевых камней и
//            табличек (S62, --refresh [--patch]), данные «Билда»/вложения (S66, --refresh; пины REPOE2_COMMIT и
//            TREE2_COMMIT в tools/build-data/poe2/sources.mjs поднять ДО запуска). Нет скрипта — шаг пропускается
//   prices   снимок цен poe.ninja PoE 2 (ninja-snapshot-poe2) → resources/data/poe2/prices; лиги 1.0 подхватываются
//            сами из /poe2/api/economy/leagues. Локально — только если CI недоступен: CI снимет свежий при публикации
//   tests    typecheck, vitest, test:trade
//   pack     пакет данных PoE 2: publish-data --game poe2 --version <версия> --out dist-data-poe2
//   publish  ci    — изменения закоммичены и в origin/main → тег data-poe2-<версия> → .github/workflows/data.yml
//                    (CI сам снимает свежие цены poe.ninja перед сборкой пакета)
//            local — сразу в ветку data (push-data-branch.mjs; пакет PoE 1 в ветке остаётся)
//            none  — не публиковать (по умолчанию ci)
// Упал шаг — исправить и продолжить с него: --from <шаг>. Без --ee2 шаг ee2 пропускается (данные EE2 на текущем пине).
// После публикации: node tools/data/check-data-channel.mjs --game poe2 (канал = данные этой сборки).

import { spawnSync, execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const argv = process.argv.slice(2)
const arg = (name, def) => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : def
}
const DRY = argv.includes('--dry-run')
const ee2 = arg('ee2', '')
const patch = arg('patch', '')
const publish = arg('publish', 'ci')
const from = arg('from', '')
const only = arg('only', '')
const STEPS = ['ee2', 'verify', 'fixtures', 'repoe', 'prices', 'tests', 'pack', 'publish']
const META = path.join(ROOT, 'resources/data/poe2/data.meta.json')
const SYNC = path.join(ROOT, 'tools/data/sync-ee2-data.mjs')
const OUT = 'dist-data-poe2'
/** генераторы данных PoE 2 на RePoE / выгрузке GGG (этапы S62, S66): запускаются, если уже есть в репозитории */
const GENERATORS = [
  { script: 'tools/regex/poe2/build-poe2-regex-data.mjs', args: () => ['--refresh', ...(patch ? ['--patch', patch] : [])], what: 'regex путевых камней и табличек (S62)' },
  { script: 'tools/build-data/poe2/build.mjs', args: () => ['--refresh'], what: 'данные «Билда» и вложения (S66; пины — tools/build-data/poe2/sources.mjs)' }
]

function fail(msg) {
  console.error(`\n✗ ${msg}`)
  process.exit(1)
}
for (const s of [from, only]) if (s && !STEPS.includes(s)) fail(`нет шага «${s}»: ${STEPS.join(', ')}`)
if (!['ci', 'local', 'none'].includes(publish)) fail('--publish ci|local|none')
const version = arg('version', '')
if (!/^[0-9A-Za-z.+-]{1,40}$/.test(version)) fail('нужна версия пакета: --version 2026.12.11-1 (её видят игроки в тосте «Данные обновлены»)')
if (ee2 && !/^[0-9a-f]{7,40}$/i.test(ee2)) fail(`--ee2: нужен SHA коммита Exiled Exchange 2, а не «${ee2}»`)

const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim()

/** Запустить команду; ненулевой код — остановка с подсказкой, откуда продолжить. */
function sh(step, cmd, args) {
  const shown = [cmd === process.execPath ? 'node' : cmd, ...args.map((a) => (path.isAbsolute(a) ? path.relative(ROOT, a) : a))].join(' ')
  console.log(`  $ ${shown}`)
  if (DRY) return
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit', shell: (cmd === 'npm' || cmd === 'npx') && process.platform === 'win32' })
  if (r.status !== 0) fail(`шаг «${step}» не прошёл (${shown}). Исправьте и продолжите: --from ${step}`)
}
const node = (step, script, ...args) => sh(step, process.execPath, [path.join(ROOT, script), ...args])

const run = {
  ee2() {
    if (!ee2) {
      console.log('  --ee2 не задан — данные EE2 остаются на текущем пине')
      return
    }
    node('ee2', 'tools/data/sync-ee2-data.mjs', '--sha', ee2)
    if (DRY) return
    // новый пин по умолчанию — полный SHA из data.meta.json (правка без String.replace: indexOf/slice)
    const full = JSON.parse(readFileSync(META, 'utf8')).ee2Sha
    const src = readFileSync(SYNC, 'utf8')
    const m = /export const EE2_PIN = '([0-9a-f]{40})'/.exec(src)
    if (!m) fail('не нашёл EE2_PIN в sync-ee2-data.mjs')
    if (m[1] !== full) {
      const at = m.index + m[0].indexOf(m[1])
      writeFileSync(SYNC, src.slice(0, at) + full + src.slice(at + m[1].length))
    }
    console.log(`  пин EE2 → ${full}`)
  },
  verify() {
    node('verify', 'tools/data/sync-ee2-data.mjs', '--verify')
  },
  fixtures() {
    node('fixtures', 'tools/data/make-poe2-ru-fixtures.mjs', '--check')
  },
  repoe() {
    for (const g of GENERATORS) {
      if (!existsSync(path.join(ROOT, g.script))) {
        console.log(`  · ${g.what}: ${g.script} нет в репозитории — пропуск`)
        continue
      }
      console.log(`  · ${g.what}`)
      node('repoe', g.script, ...g.args())
    }
  },
  prices() {
    node('prices', 'tools/data/ninja-snapshot-poe2.mjs', '--out', 'resources/data/poe2/prices')
  },
  tests() {
    sh('tests', 'npm', ['run', 'typecheck'])
    sh('tests', 'npm', ['test'])
    sh('tests', 'npm', ['run', 'test:trade'])
  },
  pack() {
    node('pack', 'tools/data/publish-data.mjs', '--game', 'poe2', '--version', version, '--out', OUT)
  },
  publish() {
    if (publish === 'none') {
      console.log(`  --publish none — пакет собран в ${OUT}, не опубликован`)
      return
    }
    if (publish === 'local') {
      node('publish', 'tools/data/push-data-branch.mjs', '--dir', OUT)
      return
    }
    // ci: workflow собирает пакет из закоммиченного resources/data/poe2 — проверяем, что он в main
    const dirty = git('status', '--porcelain', '--', 'resources/data/poe2', 'tools/data/sync-ee2-data.mjs')
    if (dirty && !DRY) {
      console.log(dirty)
      fail('данные не закоммичены. Закоммитьте, влейте в main и запустите снова: --from publish')
    }
    if (!DRY) {
      git('fetch', '--quiet', 'origin', 'main')
      const inMain = spawnSync('git', ['merge-base', '--is-ancestor', 'HEAD', 'origin/main'], { cwd: ROOT }).status === 0
      if (!inMain) fail('текущий коммит ещё не в origin/main — workflow публикует только оттуда. Влейте и запустите: --from publish')
    }
    sh('publish', 'git', ['tag', `data-poe2-${version}`])
    sh('publish', 'git', ['push', 'origin', `data-poe2-${version}`])
    console.log('  workflow «Data»: https://github.com/MAYZOSUPER/POETH/actions/workflows/data.yml')
  }
}

const start = from ? STEPS.indexOf(from) : 0
const steps = only ? [only] : STEPS.slice(start)
console.log(`PoE 2, день 1.0: пакет ${version}${ee2 ? `, EE2 ${ee2}` : ''}${patch ? `, патч ${patch}` : ''}, публикация ${publish}${DRY ? ' (--dry-run)' : ''}`)
for (const s of steps) {
  console.log(`\n▶ ${s}`)
  const t = Date.now()
  run[s]()
  console.log(`✓ ${s} (${((Date.now() - t) / 1000).toFixed(1)} с)`)
}
console.log('\nГотово. Проверка канала: node tools/data/check-data-channel.mjs --game poe2 (после сборки)')
