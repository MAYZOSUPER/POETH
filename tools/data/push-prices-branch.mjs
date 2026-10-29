// Публикация снимка цен (S33) в ветку `prices` публичного репозитория. Приложение читает
// https://raw.githubusercontent.com/MAYZOSUPER/POETH/prices/index.json и poe1/<лига>.json
// (src/main/games/poe1/flip/items/snapshotSource.ts).
//
//   node tools/data/ninja-snapshot.mjs --out dist-prices --prev prev-prices
//   node tools/data/push-prices-branch.mjs --dir dist-prices [--remote origin] [--branch prices] [--dry-run]
//
// В отличие от ветки `data` (push-data-branch.mjs, история = откат пакета), здесь история не нужна: снимок
// меняется каждый час, поэтому каждый выпуск — ОДИН orphan-коммит, который заменяет ветку (force-push).
// Репозиторий не растёт на ~1 МБ в час. Работа — во временном git worktree, рабочая копия кода не трогается.

import { execFileSync } from 'node:child_process'
import { promises as fs, mkdtempSync } from 'node:fs'
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
const dir = path.resolve(ROOT, arg('dir', 'dist-prices'))
const remote = arg('remote', 'origin')
const branch = arg('branch', 'prices')

function fail(msg) {
  console.error(`push-prices-branch: ${msg}`)
  process.exit(1)
}

const git = (args, cwd = ROOT) =>
  execFileSync('git', ['-c', 'core.autocrlf=false', ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()

const index = JSON.parse(await fs.readFile(path.join(dir, 'index.json'), 'utf8').catch(() => fail(`нет ${dir}/index.json — сначала ninja-snapshot.mjs`)))
if (index.v !== 1 || !Array.isArray(index.leagues) || !index.leagues.length) fail('index.json без лиг')
for (const l of index.leagues) {
  const st = await fs.stat(path.join(dir, l.file)).catch(() => null)
  if (!st || !st.size) fail(`нет файла ${l.file}`)
}

const README = `# POETH — снимок цен уников (ветка \`prices\`)

Только данные для вкладки «Обмен → Предметы» POETH: цены уников PoE 1 из poe.ninja, раз в час.
К poe.ninja обращается GitHub Actions этого репозитория, а не приложение у каждого игрока
(poe.ninja просит десктоп-приложения ходить через свой бэкенд: https://poe.ninja/docs/api).

Цены — оценка poe.ninja (https://poe.ninja), не финансовый совет. poe.ninja не связан с Grinding Gear Games.
Ветка перезаписывается каждый час одним коммитом (история не хранится). Не редактировать вручную:
собирает \`.github/workflows/data.yml\` (\`tools/data/ninja-snapshot.mjs\` + \`tools/data/push-prices-branch.mjs\`).

Снимок: ${new Date(index.at).toISOString()} · лиги: ${index.leagues.map((l) => l.league).join(', ')}.
`

const work = mkdtempSync(path.join(tmpdir(), 'poeth-prices-'))
const orphan = `publish-${branch}-${Date.now()}`
try {
  git(['worktree', 'add', '--detach', work, 'HEAD'])
  git(['checkout', '--quiet', '--orphan', orphan], work)
  git(['rm', '-r', '--quiet', '--force', '--ignore-unmatch', '.'], work)
  for (const e of await fs.readdir(work)) if (e !== '.git') await fs.rm(path.join(work, e), { recursive: true, force: true })
  await fs.cp(dir, work, { recursive: true })
  await fs.writeFile(path.join(work, 'README.md'), README)
  await fs.writeFile(path.join(work, '.gitattributes'), '* -text\n')
  git(['add', '--all'], work)
  git(['commit', '--quiet', '-m', `prices: poe.ninja ${new Date(index.at).toISOString()}`], work)
  const sha = git(['rev-parse', 'HEAD'], work)
  if (dryRun) {
    console.log(`--dry-run: коммит ${sha.slice(0, 7)} собран, не отправлен`)
  } else {
    // ветку целиком заменяет новый коммит: прошлые снимки не нужны
    git(['push', '--quiet', '--force', remote, `HEAD:refs/heads/${branch}`], work)
    console.log(`опубликовано: ${remote}/${branch} ${sha.slice(0, 7)} — лиг ${index.leagues.length}`)
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
  try {
    git(['branch', '-D', orphan])
  } catch {
    /* не создавалась */
  }
}
