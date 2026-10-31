// Публикация пакета данных в ветку `data` публичного репозитория (S12). Приложение читает
// https://raw.githubusercontent.com/MAYZOSUPER/POETH/data/manifest.json (links.DATA_MANIFEST_URL).
// Один и тот же скрипт — в CI (.github/workflows/data.yml) и вручную (tools/data/league-day.mjs).
//
//   node tools/data/publish-data.mjs --version 3.30.0-1 --out dist-data     # собрать пакет
//   node tools/data/push-data-branch.mjs --dir dist-data [--remote origin] [--branch data] [--dry-run]
//
// Ветка `data` — orphan (общей истории с кодом нет): в корне manifest.json, <game>/<путь>,
// README.md и .gitattributes (* -text — байты как есть, sha256 из манифеста совпадают). Каждый
// выпуск — новый коммит поверх прежнего (история = откат: перевыпустить старый коммит). Ничего
// кроме содержимого --dir в ветку не попадает. Работа идёт во временном git worktree — рабочая
// копия кода не трогается. Автор коммита — из git config (в CI — github-actions[bot] через env).
// S67: у каждой игры свой манифест (manifest.json — PoE 1, manifest-poe2.json — PoE 2, data-channel.mjs);
// выпуск заменяет пакет игры из --dir, пакет другой игры в ветке остаётся как был.

import { execFileSync } from 'node:child_process'
import { promises as fs } from 'node:fs'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { entriesToReplace, manifestName, ownerOf } from './data-channel.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const argv = process.argv.slice(2)
const arg = (name, def) => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 && argv[i + 1] ? argv[i + 1] : def
}
const dryRun = argv.includes('--dry-run')
const dir = path.resolve(ROOT, arg('dir', 'dist-data'))
const remote = arg('remote', 'origin')
const branch = arg('branch', 'data')

function fail(msg) {
  console.error(`push-data-branch: ${msg}`)
  process.exit(1)
}

// core.autocrlf=false: на Windows git не должен трогать переводы строк в данных
const git = (args, cwd = ROOT, opts = {}) =>
  execFileSync('git', ['-c', 'core.autocrlf=false', ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts }).trim()

// пакеты в --dir: манифест каждой игры (manifest.json — PoE 1, manifest-poe2.json — PoE 2) и её папка
const manifests = []
for (const name of (await fs.readdir(dir).catch(() => [])).filter((n) => n.endsWith('.json') && ownerOf(n))) {
  const m = JSON.parse(await fs.readFile(path.join(dir, name), 'utf8'))
  if (!m.version || !m.game || !m.files) fail(`${name} без version/game/files`)
  if (manifestName(m.game) !== name) fail(`${name}: игра ${m.game} — её манифест называется ${manifestName(m.game)}`)
  for (const [rel, f] of Object.entries(m.files)) {
    const st = await fs.stat(path.join(dir, m.game, rel)).catch(() => null)
    if (!st || st.size !== f.size) fail(`файл пакета ${m.game}/${rel} отсутствует или другого размера`)
  }
  manifests.push(m)
}
if (!manifests.length) fail(`нет ${dir}/manifest.json (PoE 2 — manifest-poe2.json) — сначала publish-data.mjs`)
const games = manifests.map((m) => m.game)
const label = manifests.map((m) => `${m.game} ${m.version}`).join(', ')

/** README ветки: какие пакеты в ней сейчас (после выпуска — этот и пакеты других игр). */
async function readme(root) {
  const lines = []
  for (const name of (await fs.readdir(root)).filter((n) => ownerOf(n) && n.endsWith('.json')).sort()) {
    const m = JSON.parse(await fs.readFile(path.join(root, name), 'utf8'))
    lines.push(`- **${m.game} ${m.version}** — \`${name}\`, файлы в \`${m.game}/\``)
  }
  return `# POETH — пакет данных (ветка \`data\`)

Эта ветка — **только данные** для обновления POETH без переустановки: приложение читает
манифест своей игры (версия, игра, sha256 и размер каждого файла), скачивает изменившиеся файлы
из \`<game>/…\`, проверяет sha256 и атомарно подменяет свои данные.

Не редактировать вручную: ветку собирает \`.github/workflows/data.yml\`
(\`tools/data/publish-data.mjs\` + \`tools/data/push-data-branch.mjs\`) из \`resources/data\` ветки main.
Источники и лицензии данных — \`NOTICE.md\` в ветке main (Awakened PoE Trade и Exiled Exchange 2 — MIT,
RePoE fork; цены PoE 2 — снимок poe.ninja).

Текущие пакеты:
${lines.join('\n')}
`
}

let remoteHas = false
try {
  git(['fetch', '--quiet', remote, `+refs/heads/${branch}:refs/remotes/${remote}/${branch}`])
  remoteHas = true
} catch {
  console.log(`ветки ${remote}/${branch} ещё нет — будет создана (orphan)`)
}

const work = mkdtempSync(path.join(tmpdir(), 'poeth-data-'))
const orphan = `publish-${branch}-${Date.now()}`
let pushed = false
try {
  if (remoteHas) {
    git(['worktree', 'add', '--detach', work, `refs/remotes/${remote}/${branch}`])
  } else {
    git(['worktree', 'add', '--detach', work, 'HEAD'])
    git(['checkout', '--quiet', '--orphan', orphan], work)
  }
  // прежнее содержимое пакета — целиком долой (удалённые из пакета файлы не должны остаться);
  // пакеты других игр остаются (S67)
  for (const e of entriesToReplace(await fs.readdir(work), games)) {
    git(['rm', '-r', '--quiet', '--force', '--ignore-unmatch', '--', e], work)
    await fs.rm(path.join(work, e), { recursive: true, force: true })
  }

  await fs.cp(dir, work, { recursive: true })
  await fs.writeFile(path.join(work, 'README.md'), await readme(work))
  await fs.writeFile(path.join(work, '.gitattributes'), '* -text\n')
  git(['add', '--all'], work)

  const changed = git(['status', '--porcelain'], work)
  if (!changed) {
    console.log(`ветка ${branch} уже содержит ${label} — публиковать нечего`)
  } else {
    git(['commit', '--quiet', '-m', `data: ${label}`], work)
    const sha = git(['rev-parse', 'HEAD'], work)
    const kept = (await fs.readdir(work)).filter((e) => ownerOf(e) && !games.includes(ownerOf(e)) && e.endsWith('.json'))
    if (kept.length) console.log(`в ветке остаются: ${kept.join(', ')}`)
    if (dryRun) {
      console.log(`--dry-run: коммит ${sha.slice(0, 7)} собран, не отправлен`)
    } else {
      git(['push', '--quiet', remote, `HEAD:refs/heads/${branch}`], work)
      pushed = true
      const n = manifests.reduce((s, m) => s + Object.keys(m.files).length, 0)
      console.log(`опубликовано: ${remote}/${branch} ${sha.slice(0, 7)} — ${label}, ${n} файлов`)
    }
  }
} catch (e) {
  fail(e.stderr ? String(e.stderr).trim() : e.message)
} finally {
  try {
    git(['worktree', 'remove', '--force', work])
  } catch {
    await fs.rm(work, { recursive: true, force: true })
    git(['worktree', 'prune'])
  }
  // временная orphan-ветка первого выпуска — только локальная, убрать
  try {
    git(['branch', '-D', orphan])
  } catch {
    /* не создавалась */
  }
}
if (pushed) {
  for (const g of games) console.log(`манифест: https://raw.githubusercontent.com/MAYZOSUPER/POETH/${branch}/${manifestName(g)} (CDN raw — до ~5 мин)`)
}
