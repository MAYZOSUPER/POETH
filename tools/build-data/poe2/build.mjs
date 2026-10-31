// Данные «Билда» PoE 2 (S66) одной командой: дерево (id нод для `.build`, уровни актов), камни, вложение.
//
//   node tools/build-data/poe2/build.mjs [--refresh]
//
// Под новую версию игры (1.0 — 11.12.2026): поднять TREE2_COMMIT/TREE2_VERSION и REPOE2_COMMIT/REPOE2_VERSION в
// sources.mjs, обновить данные EE2 (tools/data/sync-ee2-data.mjs), запустить с --refresh, прогнать
// `npx vitest run tests/build2`. Подробно — tools/build-data/poe2/README.md.

import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const pass = process.argv.slice(2)

for (const step of ['tree.mjs', 'gems.mjs', 'instill.mjs']) {
  console.log(`\n== poe2/${step}`)
  const r = spawnSync(process.execPath, [path.join(HERE, step), ...pass], { stdio: 'inherit' })
  if (r.status !== 0) {
    console.error(`\n${step}: выход ${r.status} — остановлено`)
    process.exit(r.status ?? 1)
  }
}
