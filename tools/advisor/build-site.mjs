// Страницы «Стратегии» сайта (S17): собрать то, что сайт берёт из приложения.
//
//   node tools/advisor/build-site.mjs           — записать файлы
//   node tools/advisor/build-site.mjs --check   — только проверить, что файлы в site/strategies свежие
//
// Пишет в site/strategies/:
//   strategy-core.js — бандл src/shared/advisor/site.ts (код POETH1, строгий валидатор, расчёт — тот же код,
//                      что в приложении; DecompressionStream браузера), глобальный объект POETHStrategy;
//   catalog.json     — каталог: наши стратегии (advisor/strategies.json) и сообщества (advisor/community/*.json)
//                      с готовыми кодами POETH1 (кнопка «Скопировать код» и ссылка на просмотр);
//   names-ru.json    — русские имена предметов обмена по английскому (данные APT), для RU-страницы.
// Снимок цен site/strategies/prices.json ({ label: {ru, en}, items: PriceEntry[] }) — необязательный: если он
// лежит рядом, каталог отмечает его, и сайт считает доход в час тем же расчётом, что приложение; нет — «в приложении».
// Сборки на GitHub Pages нет: файлы лежат в репозитории, `npm test` проверяет, что они не устарели
// (tests/advisor/site.test.ts). Запускать после правки src/shared/advisor/**, стратегий или каталога —
// add-strategy.mjs делает это сам.

import esbuild from 'esbuild'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { DATA_DIR, ROOT, SITE_DIR, loadAdvisorCore, readCommunityFiles } from './core.mjs'

const HEADER = '// Сгенерировано tools/advisor/build-site.mjs из src/shared/advisor (тот же код, что в приложении). Не править руками.\n'

/** Бандл для сайта (текст). */
export async function buildBundle() {
  const res = await esbuild.build({
    entryPoints: [path.join(ROOT, 'src/shared/advisor/site.ts')],
    bundle: true,
    platform: 'browser',
    format: 'iife',
    globalName: 'POETHStrategy',
    target: 'es2020',
    charset: 'utf8',
    legalComments: 'none',
    write: false,
    logLevel: 'silent'
  })
  return HEADER + res.outputFiles[0].text
}

/** Каталог для сайта: [{ kind, checked, draft, code, strategy }]. */
export async function buildCatalog(core, communityDir) {
  const data = core.parseAdvisorData(JSON.parse(await fs.readFile(path.join(DATA_DIR, core.ADVISOR_DATA_FILE), 'utf8')))
  if (!data.data) throw new Error('advisor/strategies.json не прочитан')
  const items = []
  for (const s of data.data.strategies) {
    items.push({ kind: 'official', checked: s.source.date, code: await core.encodeStrategyNode(s), strategy: s })
  }
  for (const f of await readCommunityFiles(communityDir)) {
    const r = core.parseCommunityFile(f.raw, f.id)
    if (!r.ok) throw new Error(`${path.relative(ROOT, f.file)}: ${r.error}`)
    items.push({ kind: 'community', checked: r.entry.checked, code: await core.encodeStrategyNode(r.entry.strategy), strategy: r.entry.strategy })
  }
  const out = { schema: 1, patch: data.data.patch, updatedAt: data.data.updatedAt, strategies: items }
  // необязательный снимок цен (prices.json рядом): сайт запрашивает его, только если он есть
  const hasPrices = await fs
    .access(path.join(SITE_DIR, 'prices.json'))
    .then(() => true)
    .catch(() => false)
  if (hasPrices) out.prices = 'prices.json'
  return out
}

/** Русские имена предметов обмена (и всех ref каталога), отсортированы по ключу. */
export async function buildNamesRu(catalog) {
  const ex = JSON.parse(await fs.readFile(path.join(DATA_DIR, 'wealth/exchange-ids.json'), 'utf8'))
  const want = new Set(Object.values(ex.names))
  for (const it of catalog.strategies) {
    for (const l of [...it.strategy.inputs, ...it.strategy.outputs]) if (l.item.ref) want.add(l.item.ref)
  }
  const ru = new Map()
  for (const line of (await fs.readFile(path.join(DATA_DIR, 'ru/items.ndjson'), 'utf8')).split('\n')) {
    if (!line) continue
    const r = JSON.parse(line)
    if (r.namespace === 'AREA' || !want.has(r.refName) || ru.has(r.refName)) continue
    if (r.name && r.name !== r.refName) ru.set(r.refName, r.name)
  }
  return Object.fromEntries([...ru.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
}

const json = (v) => JSON.stringify(v, null, 1) + '\n'

/** Всё, что пишется в site/strategies (имя файла → текст). */
export async function buildSiteFiles({ communityDir } = {}) {
  const core = await loadAdvisorCore()
  const catalog = await buildCatalog(core, communityDir)
  return {
    'strategy-core.js': await buildBundle(),
    'catalog.json': json(catalog),
    'names-ru.json': json(await buildNamesRu(catalog))
  }
}

export async function writeSiteFiles(opts = {}) {
  const files = await buildSiteFiles(opts)
  const dir = opts.siteDir ?? SITE_DIR
  await fs.mkdir(dir, { recursive: true })
  for (const [name, text] of Object.entries(files)) await fs.writeFile(path.join(dir, name), text)
  return Object.keys(files)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const check = process.argv.includes('--check')
  if (check) {
    const files = await buildSiteFiles()
    const core = await loadAdvisorCore()
    let stale = []
    for (const [name, text] of Object.entries(files)) {
      // в рабочей копии Windows файлы могут быть с CRLF (core.autocrlf) — сравниваем без него
      const cur = (await fs.readFile(path.join(SITE_DIR, name), 'utf8').catch(() => '')).replace(/\r\n/g, '\n')
      if (name === 'catalog.json') {
        // коды зависят от версии zlib — сравниваем раскрытые стратегии, а не байты
        const a = JSON.parse(text)
        let b = null
        try {
          b = JSON.parse(cur)
        } catch {
          b = null
        }
        const same =
          b &&
          b.patch === a.patch &&
          b.prices === a.prices &&
          b.strategies.length === a.strategies.length &&
          (await Promise.all(
            a.strategies.map(async (x, i) => {
              const y = b.strategies[i]
              const d = y && (await core.decodeStrategyNode(y.code))
              return (
                y &&
                y.kind === x.kind &&
                y.checked === x.checked &&
                JSON.stringify(y.strategy) === JSON.stringify(x.strategy) &&
                d.ok &&
                core.strategyFingerprint(d.strategy) === core.strategyFingerprint(x.strategy)
              )
            })
          )).every(Boolean)
        if (!same) stale.push(name)
      } else if (cur !== text) stale.push(name)
    }
    if (stale.length) {
      console.error(`build-site: устарели ${stale.join(', ')} — запустите node tools/advisor/build-site.mjs`)
      process.exit(1)
    }
    console.log('build-site: site/strategies свежие')
  } else {
    const written = await writeSiteFiles()
    console.log(`build-site: записаны site/strategies/${written.join(', site/strategies/')}`)
  }
}
