// Запуск TS-инструментов распознавания окон (S68) в обычном Node: собираем esbuild (как tools/advisor/core.mjs),
// псевдоним @shared → src/shared, и запускаем с теми же аргументами.
//   node tools/screen/run.mjs tools/screen/<инструмент>.ts [аргументы…]
import esbuild from 'esbuild'
import { spawnSync } from 'child_process'
import os from 'os'
import path from 'path'
import { fileURLToPath } from 'url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const [entry, ...args] = process.argv.slice(2)
if (!entry) throw new Error('usage: run.mjs <tool.ts> [args…]')
const out = path.join(os.tmpdir(), 'poeth-screen-tools', path.basename(entry).replace(/\.ts$/, '.cjs'))
await esbuild.build({
  entryPoints: [path.resolve(entry)],
  outfile: out,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  alias: { '@shared': path.join(root, 'src/shared') },
  external: ['electron'],
  logLevel: 'warning'
})
const r = spawnSync(process.execPath, [out, ...args], { stdio: 'inherit', cwd: process.cwd() })
process.exit(r.status ?? 1)
