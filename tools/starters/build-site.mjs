// Страница «Стартеры» сайта (ST3): собрать то, что сайт берёт из приложения.
//
//   node tools/starters/build-site.mjs           — записать файлы
//   node tools/starters/build-site.mjs --check   — только проверить, что файлы в site/starters свежие
//
// Пишет в site/starters/:
//   starters-core.js     — бандл src/shared/starters/site.ts: строгий валидатор, загрузка списка (текущая лига, до
//                          анонса — прошлая), знаки, фильтры и сортировки — тот же код, что во вкладке «Билд»;
//                          глобальный объект POETHStarters;
//   data/index.json,
//   data/<лига>.json     — копии resources/data/poe1/starters (их же приложение получает пакетом данных);
//   names.json           — имена на языке клиента: классы и восхождения (данные дерева S36), главные навыки
//                          стартеров (данные камней) — как карточка в приложении.
// Сборки на GitHub Pages нет: файлы лежат в репозитории, `npm test` проверяет, что они не устарели
// (tests/starters/site.test.ts). add-starter.mjs запускает сборку сам после записи стартера.

import esbuild from 'esbuild'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { DATA_DIR, ROOT, STARTERS_DATA_DIR, loadStartersCore } from './core.mjs'

export const SITE_DIR = path.join(ROOT, 'site/starters')
const HEADER = '// Сгенерировано tools/starters/build-site.mjs из src/shared/starters (тот же код, что в приложении). Не править руками.\n'

/** Бандл для сайта (текст). */
export async function buildBundle() {
  const res = await esbuild.build({
    entryPoints: [path.join(ROOT, 'src/shared/starters/site.ts')],
    bundle: true,
    platform: 'browser',
    format: 'iife',
    globalName: 'POETHStarters',
    target: 'es2020',
    charset: 'utf8',
    legalComments: 'none',
    write: false,
    logLevel: 'silent'
  })
  return HEADER + res.outputFiles[0].text
}

// в рабочей копии Windows файлы могут быть с CRLF (core.autocrlf) — на сайт и в сравнение идут без него
const lf = (text) => (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text).replace(/\r\n/g, '\n')
const readText = async (file) => lf(await fs.readFile(file, 'utf8'))
const json = (v) => JSON.stringify(v, null, 1) + '\n'

/** Копии файлов списка: index.json и все лиги из него. Индекс или файл лиги битый — сборка не идёт. */
export async function buildData(core, dir = STARTERS_DATA_DIR) {
  const out = {}
  const indexText = await readText(path.join(dir, core.STARTERS_INDEX))
  const index = core.validateIndex(JSON.parse(indexText))
  if (!index.ok) throw new Error(`${core.STARTERS_INDEX}: ${index.error}`)
  out[`data/${core.STARTERS_INDEX}`] = indexText
  const records = []
  for (const league of index.value.leagues) {
    const name = core.startersFileName(league)
    const text = await readText(path.join(dir, name))
    const v = core.validateStartersFile(JSON.parse(text), league)
    if (!v.ok) throw new Error(`${name}: ${v.error}`)
    out[`data/${name}`] = text
    records.push(...v.value.file.starters)
  }
  return { files: out, records }
}

/** Имена на языке клиента: все классы и восхождения из данных дерева, навыки — только тех, что в списке. */
export async function buildNames(core, records) {
  const classes = {}
  const tree = core.parseTreeData(JSON.parse(await readText(path.join(DATA_DIR, 'build/tree.json'))))
  for (const en of core.STARTER_CLASSES) {
    const c = tree?.classes.find((x) => x.en === en)
    const asc = {}
    for (const a of c?.asc ?? []) asc[a.en] = a.ru
    classes[en] = { ru: c?.ru ?? en, asc }
  }
  const gems = core.parseGemsData(JSON.parse(await readText(path.join(DATA_DIR, 'build/gems.json'))))
  const skills = {}
  for (const id of [...new Set(records.map((r) => r.skill.gem).filter(Boolean))].sort()) {
    const g = gems && core.findGem(gems, id)
    if (g) skills[id] = { en: core.gemName(g, 'en'), ru: core.gemName(g, 'ru') }
  }
  return { tree: tree?.meta.tree ?? null, classes, skills }
}

/** Всё, что пишется в site/starters (путь от папки страницы → текст). */
export async function buildSiteFiles({ dataDir } = {}) {
  const core = await loadStartersCore()
  const data = await buildData(core, dataDir)
  return {
    'starters-core.js': await buildBundle(),
    ...data.files,
    'names.json': json(await buildNames(core, data.records))
  }
}

export async function writeSiteFiles(opts = {}) {
  const files = await buildSiteFiles(opts)
  const dir = opts.siteDir ?? SITE_DIR
  // старые копии лиг, которых больше нет в индексе, убираем — сайт видит ровно то, что приложение
  const dataDir = path.join(dir, 'data')
  await fs.mkdir(dataDir, { recursive: true })
  for (const name of await fs.readdir(dataDir)) {
    if (name.endsWith('.json') && !files[`data/${name}`]) await fs.rm(path.join(dataDir, name))
  }
  for (const [name, text] of Object.entries(files)) await fs.writeFile(path.join(dir, name), text)
  return Object.keys(files)
}

/** Что устарело в site/starters: имена файлов (пусто — всё свежее). */
export async function staleSiteFiles(opts = {}) {
  const files = await buildSiteFiles(opts)
  const dir = opts.siteDir ?? SITE_DIR
  const stale = []
  for (const [name, text] of Object.entries(files)) {
    const cur = await fs.readFile(path.join(dir, name), 'utf8').then(lf, () => null)
    if (cur !== text) stale.push(name)
  }
  const extra = await fs.readdir(path.join(dir, 'data')).catch(() => [])
  for (const name of extra) if (name.endsWith('.json') && !files[`data/${name}`]) stale.push(`data/${name} (лишний)`)
  return stale
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  if (process.argv.includes('--check')) {
    const stale = await staleSiteFiles()
    if (stale.length) {
      console.error(`build-site: устарели ${stale.join(', ')} — запустите node tools/starters/build-site.mjs`)
      process.exit(1)
    }
    console.log('build-site: site/starters свежие')
  } else {
    const written = await writeSiteFiles()
    console.log(`build-site: записаны site/starters/${written.join(', site/starters/')}`)
  }
}
