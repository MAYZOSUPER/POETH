// Добавить одобренную стратегию игрока в каталог сообщества (S17, делает лид).
//
//   node tools/advisor/add-strategy.mjs <код POETH1:… или ссылка на страницу стратегии> [--issue 42]
//        [--checked 2026-11-20] [--id новый-id] [--replace]
//
// Код раскрывается и проверяется тем же строгим валидатором, что в приложении (src/shared/advisor через
// esbuild), и пишется в resources/data/poe1/advisor/community/<id>.json с source.kind = community
// (автор, ссылка и дата из кода сохраняются). Затем пересобираются site/strategies/* (build-site.mjs).
// Дальше: npm test, коммит, пакет данных (tools/data/publish-data.mjs) — игроки получат стратегию без
// переустановки, на сайте она появится после push в main.
//
// Для тестов: --dir <папка каталога> и --no-site (не трогать site/).

import { promises as fs } from 'node:fs'
import path from 'node:path'
import { COMMUNITY_DIR, DATA_DIR, ROOT, loadAdvisorCore } from './core.mjs'

const ERRORS = {
  empty: 'пусто — передайте код POETH1:… или ссылку на страницу стратегии',
  notcode: 'это не код POETH (код начинается с POETH1:)',
  newer: 'код или схема новее этой версии POETH — обновите репозиторий',
  broken: 'код обрезан или повреждён — попросите автора прислать его целиком',
  toolarge: 'код слишком большой',
  invalid: 'данные не прошли проверку'
}

function parseArgs(argv) {
  const out = { code: '', issue: undefined, checked: undefined, id: undefined, replace: false, dir: COMMUNITY_DIR, site: true }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const next = () => argv[++i]
    if (a === '--issue') out.issue = Number(next())
    else if (a === '--checked') out.checked = next()
    else if (a === '--id') out.id = next()
    else if (a === '--replace') out.replace = true
    else if (a === '--dir') out.dir = path.resolve(next())
    else if (a === '--no-site') out.site = false
    else if (!out.code) out.code = a
    else throw new Error(`лишний аргумент: ${a}`)
  }
  return out
}

function fail(msg) {
  console.error(`add-strategy: ${msg}`)
  process.exit(1)
}

const args = (() => {
  try {
    return parseArgs(process.argv.slice(2))
  } catch (e) {
    return fail(e.message)
  }
})()
if (args.issue !== undefined && !(Number.isInteger(args.issue) && args.issue > 0)) fail('--issue: номер заявки')
if (args.checked !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(args.checked)) fail('--checked: дата YYYY-MM-DD')

const core = await loadAdvisorCore()
const res = await core.decodeStrategyNode(args.code)
if (!res.ok) fail(`${ERRORS[res.error] ?? res.error}${res.detail ? `: ${res.detail}` : ''}`)

let s = res.strategy
if (args.id) {
  if (!core.STRATEGY_ID.test(args.id)) fail('--id: латиница, цифры и дефис, до 48 символов')
  s = { ...s, id: args.id }
}

// id не должен совпадать с нашими стратегиями (по id считается «Мой результат» сессий фарма)
const official = core.parseAdvisorData(JSON.parse(await fs.readFile(path.join(DATA_DIR, core.ADVISOR_DATA_FILE), 'utf8')))
if (official.data?.strategies.some((o) => o.id === s.id)) fail(`id «${s.id}» занят нашей стратегией — задайте другой: --id ${s.id}-community`)

const file = path.join(args.dir, `${s.id}.json`)
const exists = await fs
  .access(file)
  .then(() => true)
  .catch(() => false)
if (exists && !args.replace) fail(`${path.relative(ROOT, file)} уже есть — заменить: --replace, другой id: --id …`)

// предупреждения как в tests/advisor/data.test.ts: предмет должен быть на обмене, иначе у игроков не будет цены
const ex = JSON.parse(await fs.readFile(path.join(DATA_DIR, 'wealth/exchange-ids.json'), 'utf8'))
const exchange = new Set(Object.values(ex.names))
const warnings = []
for (const l of [...s.inputs, ...s.outputs]) {
  if (l.item.ref && (l.item.kind === 'stackable' || l.item.kind === 'card') && !exchange.has(l.item.ref)) {
    warnings.push(`«${l.item.ref}» нет на обмене (wealth/exchange-ids.json) — цены у игроков не будет`)
  }
}

const checked = args.checked ?? core.today()
const out = core.communityFile(s, checked, args.issue)
const check = core.parseCommunityFile(JSON.parse(JSON.stringify(out)), s.id)
if (!check.ok) fail(`файл каталога не прошёл проверку: ${check.error}`)

await fs.mkdir(args.dir, { recursive: true })
await fs.writeFile(file, JSON.stringify(out, null, 2) + '\n')
console.log(`add-strategy: ${exists ? 'заменён' : 'записан'} ${path.relative(ROOT, file)}`)
const name = s.name.ru ?? s.name.en
console.log(`  «${name}»${s.source.author ? `, автор ${s.source.author}` : ''}, для ${s.patch}${s.measured ? `, замер: ${s.measured.maps} карт / ${s.measured.hours} ч` : ', оценка автора'}`)
for (const w of warnings) console.log(`  ! ${w}`)

if (args.site) {
  const { writeSiteFiles } = await import('./build-site.mjs')
  const written = await writeSiteFiles()
  console.log(`  сайт: обновлены site/strategies/${written.join(', ')}`)
}
console.log('Дальше: npm test → коммит → пакет данных (tools/data/publish-data.mjs) и push в main (сайт).')
