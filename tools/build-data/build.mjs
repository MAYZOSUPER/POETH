// Данные вкладки «Билд» (S36) одной командой: дерево, камни, сверка текстов журнала.
//
//   node tools/build-data/build.mjs [--refresh]
//
// Под новую лигу: поднять TREE_TAG/TREE_COMMIT, REPOE_COMMIT (и DAT_COMMIT в tools/leveling/game-names.mjs),
// запустить с --refresh, прогнать тесты (tests/build-data). Подробно — tools/build-data/README.md.

import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const pass = process.argv.slice(2)

for (const step of ['tree.mjs', 'anoints.mjs', 'gems.mjs', 'log-strings.mjs']) {
  console.log(`\n== ${step}`)
  const r = spawnSync(process.execPath, [path.join(HERE, step), ...pass], { stdio: 'inherit' })
  if (r.status !== 0) {
    console.error(`\n${step}: выход ${r.status} — остановлено`)
    process.exit(r.status ?? 1)
  }
}
