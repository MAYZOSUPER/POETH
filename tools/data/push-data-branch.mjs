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

import { execFileSync } from 'node:child_process'
import { promises as fs } from 'node:fs'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

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

const manifest = JSON.parse(await fs.readFile(path.join(dir, 'manifest.json'), 'utf8').catch(() => fail(`нет ${dir}/manifest.json — сначала publish-data.mjs`)))
if (!manifest.version || !manifest.game || !manifest.files) fail('manifest.json без version/game/files')
for (const [rel, f] of Object.entries(manifest.files)) {
  const st = await fs.stat(path.join(dir, manifest.game, rel)).catch(() => null)
  if (!st || st.size !== f.size) fail(`файл пакета ${manifest.game}/${rel} отсутствует или другого размера`)
}

const README = `# POETH — пакет данных (ветка \`data\`)

Эта ветка — **только данные** для обновления POETH без переустановки: приложение читает
\`manifest.json\` (версия, игра, sha256 и размер каждого файла), скачивает изменившиеся файлы
из \`<game>/…\`, проверяет sha256 и атомарно подменяет свои данные.

Не редактировать вручную: ветку собирает \`.github/workflows/data.yml\`
(\`tools/data/publish-data.mjs\` + \`tools/data/push-data-branch.mjs\`) из \`resources/data\` ветки main.
Источники и лицензии данных — \`NOTICE.md\` в ветке main (Awakened PoE Trade — MIT, RePoE fork).

Текущий пакет: **${manifest.game} ${manifest.version}**.
`

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
  // прежнее содержимое — целиком долой (удалённые из пакета файлы не должны остаться)
  git(['rm', '-r', '--quiet', '--force', '--ignore-unmatch', '.'], work)
  for (const e of await fs.readdir(work)) if (e !== '.git') await fs.rm(path.join(work, e), { recursive: true, force: true })

  await fs.cp(dir, work, { recursive: true })
  await fs.writeFile(path.join(work, 'README.md'), README)
  await fs.writeFile(path.join(work, '.gitattributes'), '* -text\n')
  git(['add', '--all'], work)

  const changed = git(['status', '--porcelain'], work)
  if (!changed) {
    console.log(`ветка ${branch} уже содержит ${manifest.game} ${manifest.version} — публиковать нечего`)
  } else {
    git(['commit', '--quiet', '-m', `data: ${manifest.game} ${manifest.version}`], work)
    const sha = git(['rev-parse', 'HEAD'], work)
    if (dryRun) {
      console.log(`--dry-run: коммит ${sha.slice(0, 7)} собран, не отправлен`)
    } else {
      git(['push', '--quiet', remote, `HEAD:refs/heads/${branch}`], work)
      pushed = true
      console.log(`опубликовано: ${remote}/${branch} ${sha.slice(0, 7)} — ${manifest.game} ${manifest.version}, ${Object.keys(manifest.files).length} файлов`)
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
if (pushed) console.log(`манифест: https://raw.githubusercontent.com/MAYZOSUPER/POETH/${branch}/manifest.json (CDN raw — до ~5 мин)`)
