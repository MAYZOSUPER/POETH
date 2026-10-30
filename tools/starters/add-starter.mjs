// Добавить стартер лиги в список «Стартеры» вкладки «Билд» (S59, делает лид).
//
//   node tools/starters/add-starter.mjs <ссылка на PoB автора> --author "Ник" --lang en|ru
//        --budget starter|low|medium|high --difficulty 1|2|3 [--newbie] [--modes sc,hc,ssf] [--content mapping,bossing]
//        [--leveling acts|partial|none] [--pick] [--note-ru "…"] [--note-en "…"]
//        [--guide <ссылка>] [--video <ссылка>] [--channel <ссылка>]
//        [--league 3.30] [--id rf-chieftain] [--skill "Righteous Fire"] [--checked [YYYY-MM-DD]] [--replace]
//   node tools/starters/add-starter.mjs --check          # проверить все файлы списка (CI, npm test)
//
// PoB качается ОДИН раз (User-Agent POETH, только хосты разбора ссылок S35: pobb.in, pob.codes, Maxroll-паста;
// редиректы — внутри них). Из PoB берутся класс, восхождение, главный навык и версия игры, считается отпечаток
// (sha256 канонического XML без <Import> — тот же код, что в приложении) и подсказка «ведёт по актам» по этапам
// прокачки. Запись проверяется строгим валидатором приложения и пишется в resources/data/poe1/starters/<лига>.json
// (лига — из index.json, если не задана). Чужих текстов не пишем: note — наша строка своими словами.
// Дальше: npm test → коммит → пакет данных (tools/data/publish-data.mjs) — игроки получат список без переустановки.
// Копию списка для страницы сайта site/starters (tools/starters/build-site.mjs) инструмент обновляет сам.
//
// Для тестов: --dir <папка списка>, --pob-file <файл с кодом PoB> (без сети), --today YYYY-MM-DD.

import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { DATA_DIR, ROOT, STARTERS_DATA_DIR, loadStartersCore } from './core.mjs'

const sha256 = (text) => createHash('sha256').update(text, 'utf8').digest('hex')
const DAY = /^\d{4}-\d{2}-\d{2}$/

function fail(msg) {
  console.error(`add-starter: ${msg}`)
  process.exit(1)
}

function parseArgs(argv) {
  const out = { url: '', dir: STARTERS_DATA_DIR, check: false, flags: new Set(), opts: {} }
  const VALUE = ['author', 'lang', 'budget', 'difficulty', 'modes', 'content', 'leveling', 'note-ru', 'note-en', 'guide', 'video', 'channel', 'league', 'id', 'skill', 'pob-file', 'today']
  const FLAGS = ['newbie', 'pick', 'replace']
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--check') out.check = true
    else if (a === '--dir') out.dir = path.resolve(argv[++i] ?? '')
    else if (a === '--checked') {
      // дата не обязательна: --checked — сегодня
      const next = argv[i + 1]
      out.opts.checked = next && DAY.test(next) ? argv[++i] : true
    } else if (a.startsWith('--') && FLAGS.includes(a.slice(2))) out.flags.add(a.slice(2))
    else if (a.startsWith('--') && VALUE.includes(a.slice(2))) {
      const v = argv[++i]
      if (v === undefined || v.startsWith('--')) throw new Error(`${a}: нужно значение`)
      out.opts[a.slice(2)] = v
    } else if (a.startsWith('--')) throw new Error(`неизвестный ключ ${a}`)
    else if (!out.url) out.url = a
    else throw new Error(`лишний аргумент: ${a}`)
  }
  return out
}

async function readJson(file) {
  const text = await fs.readFile(file, 'utf8')
  return JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text)
}

async function exists(file) {
  return fs
    .access(file)
    .then(() => true)
    .catch(() => false)
}

const writeJson = (file, data) => fs.writeFile(file, JSON.stringify(data, null, 2) + '\n')

/** Восхождения класса из данных дерева S36 (могут отставать от лиги — тогда только предупреждение). */
async function knownAscendancies(core) {
  try {
    const tree = core.parseTreeData(await readJson(path.join(DATA_DIR, 'build/tree.json')))
    if (!tree) return null
    return { version: tree.meta.tree, byClass: new Map(tree.classes.map((c) => [c.en, c.asc.map((a) => a.en)])) }
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------- --check

async function check(dir) {
  const core = await loadStartersCore()
  const errors = []
  const warnings = []
  const indexFile = path.join(dir, core.STARTERS_INDEX)
  if (!(await exists(indexFile))) fail(`нет ${path.relative(ROOT, indexFile)}`)
  let index
  try {
    index = core.validateIndex(await readJson(indexFile))
  } catch {
    fail(`${core.STARTERS_INDEX}: не JSON`)
  }
  if (!index.ok) fail(`${core.STARTERS_INDEX}: ${index.error}`)
  for (const d of index.dropped) errors.push(`${core.STARTERS_INDEX}: неизвестное поле ${d}`)

  const trees = await knownAscendancies(core)
  const listed = new Set([core.STARTERS_INDEX])
  const ids = new Map()
  let total = 0
  for (const league of index.value.leagues) {
    const name = core.startersFileName(league)
    listed.add(name)
    const file = path.join(dir, name)
    if (!(await exists(file))) {
      errors.push(`${name}: нет файла (лига есть в index.json)`)
      continue
    }
    const text = await fs.readFile(file, 'utf8')
    if (Buffer.byteLength(text) > core.STARTER_LIMITS.bytes) errors.push(`${name}: больше ${core.STARTER_LIMITS.bytes} байт`)
    let raw
    try {
      raw = JSON.parse(text)
    } catch {
      errors.push(`${name}: не JSON`)
      continue
    }
    const v = core.validateStartersFile(raw, league)
    if (!v.ok) {
      errors.push(`${name}: ${v.error}`)
      continue
    }
    for (const f of v.value.failed) errors.push(`${name}: запись ${f.index + 1}${f.id ? ` (${f.id})` : ''}: ${f.error}`)
    for (const d of v.value.dropped) errors.push(`${name}: неизвестное поле ${d}`)
    for (const s of v.value.file.starters) {
      if (s.note && (!s.note.ru || !s.note.en)) errors.push(`${name}: ${s.id}: note — нужны обе строки, RU и EN`)
      if (ids.has(s.id) && ids.get(s.id) !== league) warnings.push(`${name}: ${s.id} — тот же id в списке ${ids.get(s.id)}`)
      ids.set(s.id, league)
      const asc = trees?.byClass.get(s.class)
      if (s.ascendancy && asc && !asc.includes(s.ascendancy)) {
        warnings.push(`${name}: ${s.id}: восхождения «${s.ascendancy}» у ${s.class} нет в данных дерева ${trees.version}`)
      }
    }
    total += v.value.file.starters.length
    console.log(`  ${name}: стартеров — ${v.value.file.starters.length}, обновлён ${v.value.file.updatedAt}`)
  }
  for (const n of (await fs.readdir(dir)).filter((n) => n.endsWith('.json') && !listed.has(n))) {
    errors.push(`${n}: файл не указан в index.json (leagues)`)
  }
  for (const w of warnings) console.log(`  ! ${w}`)
  if (errors.length) {
    for (const e of errors) console.error(`  ✗ ${e}`)
    fail(`список стартеров не прошёл проверку (${errors.length})`)
  }
  console.log(`add-starter --check: ок — текущая лига ${index.value.current}, стартеров всего — ${total}`)
}

// ---------------------------------------------------------------------------- загрузка PoB

const UA = async () => {
  const pkg = await readJson(path.join(ROOT, 'package.json'))
  return `POETH/${pkg.version} (+https://github.com/MAYZOSUPER/POETH)`
}

const isPlainText = (v) =>
  String(v ?? '')
    .trim()
    .toLowerCase()
    .replace(/^content-type\s*:\s*/, '')
    .split(';')[0]
    .trim() === 'text/plain'

/** Один запрос (и до трёх редиректов внутри allowlist S35), 10 с, ≤ 1 МБ, только 200 и text/plain. */
async function fetchCode(core, rawUrl) {
  const headers = { 'User-Agent': await UA(), Accept: 'text/plain' }
  let url = rawUrl
  for (let hop = 0; hop <= 3; hop++) {
    if (!core.isPobFetchUrl(url)) fail(`адрес вне списка хостов PoB: ${new URL(url).hostname}`)
    const res = await fetch(url, { headers, redirect: 'manual', credentials: 'omit', signal: AbortSignal.timeout(10_000) })
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      url = new URL(res.headers.get('location'), url).href
      continue
    }
    if (res.status === 404 || res.status === 410) fail('паста не найдена (404) — автор убрал PoB или ссылка с ошибкой')
    if (res.status !== 200) fail(`сайт ответил ${res.status}`)
    if (!isPlainText(res.headers.get('content-type'))) fail('ответ не text/plain — это страница, а не код PoB')
    const declared = Number(res.headers.get('content-length'))
    if (Number.isFinite(declared) && declared > core.POB_CODE_MAX_CHARS) fail('код больше 1 МБ')
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length > core.POB_CODE_MAX_CHARS) fail('код больше 1 МБ')
    return buf.toString('utf8').trim()
  }
  return fail('слишком много редиректов')
}

// ---------------------------------------------------------------------------- добавить

const slug = (s) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

const list = (v) =>
  v === undefined
    ? []
    : String(v)
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean)

async function add(args) {
  const core = await loadStartersCore()
  const o = args.opts
  const today = o.today ?? new Date().toISOString().slice(0, 10)
  if (!DAY.test(today)) fail('--today: дата YYYY-MM-DD')
  if (!args.url) fail('нужна ссылка на PoB автора (pobb.in, pob.codes, maxroll.gg/poe/pob/…)')
  if (!core.isAuthorLinkUrl(args.url)) fail('ссылка на PoB: только https и сайты авторов (links.ts, AUTHOR_LINK_HOSTS)')
  const input = core.parsePobInput(args.url)
  if (input.kind !== 'link') fail('это не ссылка на пасту PoB — нужна pobb.in/…, pob.codes/b/… или maxroll.gg/poe/pob/…')
  for (const k of ['author', 'lang', 'budget', 'difficulty']) if (o[k] === undefined) fail(`нужно --${k}`)

  // лига и файл списка
  const indexFile = path.join(args.dir, core.STARTERS_INDEX)
  let index = null
  if (await exists(indexFile)) {
    const v = core.validateIndex(await readJson(indexFile))
    if (!v.ok) fail(`${core.STARTERS_INDEX}: ${v.error}`)
    index = v.value
  }
  const league = o.league ?? index?.current
  if (!league || !/^\d{1,2}\.\d{1,2}$/.test(league)) fail('--league: лига вида 3.30 (или index.json с current)')

  // PoB — один раз
  const code = o['pob-file'] ? (await fs.readFile(path.resolve(o['pob-file']), 'utf8')).trim() : await fetchCode(core, input.rawUrl)
  const imp = core.importStarterCode(code, core.inflateNode, sha256)
  if (!imp.ok) fail(`PoB не разобрался: ${imp.error}${imp.detail ? ` (${imp.detail})` : ''}`)
  const facts = core.starterFacts(imp.build)
  if (!facts.class) fail(`класс PoB «${imp.build.className}» не узнан`)
  const skillEn = o.skill ?? facts.skill.en
  if (!skillEn) fail('главный навык в PoB не найден — задайте --skill "Имя навыка как в PoB"')
  const patch = facts.patch ?? league
  const leveling = o.leveling ?? facts.leveling

  const file = path.join(args.dir, core.startersFileName(league))
  let data = { schema: core.STARTERS_SCHEMA, league, updatedAt: today, starters: [] }
  if (await exists(file)) {
    const v = core.validateStartersFile(await readJson(file), league)
    if (!v.ok) fail(`${path.relative(ROOT, file)}: ${v.error}`)
    if (v.value.failed.length) fail(`${path.relative(ROOT, file)}: битые записи — сначала --check`)
    data = v.value.file
  }

  const id = o.id ?? slug(`${facts.ascendancy ?? facts.class}-${skillEn}`).slice(0, 48)
  const old = data.starters.find((s) => s.id === id)
  if (old && !args.flags.has('replace')) fail(`${id} уже есть в ${path.basename(file)} — заменить: --replace, другой id: --id …`)
  const dup = data.starters.find((s) => s.id !== id && s.links.pob === args.url)
  if (dup) fail(`этот PoB уже в списке под id ${dup.id}`)

  const note = {}
  if (o['note-ru']) note.ru = o['note-ru']
  if (o['note-en']) note.en = o['note-en']
  const links = { pob: args.url }
  for (const k of ['guide', 'video', 'channel']) if (o[k]) links[k] = o[k]
  const checked = o.checked === undefined ? null : { league, date: o.checked === true ? today : o.checked }

  const record = {
    id,
    patch,
    class: facts.class,
    ascendancy: facts.ascendancy,
    skill: { en: skillEn, gem: o.skill && o.skill !== facts.skill.en ? null : facts.skill.gem },
    author: o.author,
    lang: o.lang,
    links,
    tags: {
      budget: o.budget,
      difficulty: Number(o.difficulty),
      newbie: args.flags.has('newbie'),
      leveling,
      modes: list(o.modes),
      content: list(o.content)
    },
    pick: args.flags.has('pick'),
    note: Object.keys(note).length ? note : null,
    pob: { sha256: imp.fingerprint, checkedAt: today },
    checked,
    added: old?.added ?? today
  }
  const v = core.validateStarter(record)
  if (!v.ok) fail(`запись не прошла проверку: ${v.error}`)
  if (record.note && (!record.note.ru || !record.note.en)) fail('note: нужны обе строки — --note-ru и --note-en')

  data = {
    ...data,
    updatedAt: today,
    starters: old ? data.starters.map((s) => (s.id === id ? v.value : s)) : [...data.starters, v.value]
  }
  const fileCheck = core.validateStartersFile(JSON.parse(JSON.stringify(data)), league)
  if (!fileCheck.ok || fileCheck.value.failed.length) fail('файл списка не прошёл проверку после записи')

  await fs.mkdir(args.dir, { recursive: true })
  await writeJson(file, data)
  if (!index || !index.leagues.includes(league)) {
    const leagues = [...(index?.leagues ?? []), league].sort((a, b) => core.comparePatch(b, a))
    await writeJson(indexFile, { schema: core.STARTERS_SCHEMA, current: index?.current ?? league, leagues })
  }

  // что записали и что проверить глазами
  const who = facts.ascendancy ? `${facts.ascendancy} (${facts.class})` : facts.class
  console.log(`add-starter: ${old ? 'заменён' : 'записан'} ${id} в ${path.relative(ROOT, file)}`)
  console.log(`  ${skillEn} · ${who}, автор ${record.author} (${record.lang}), PoB под ${patch}`)
  console.log(`  этапов прокачки в PoB: ${facts.stages} → подсказка «ведёт по актам»: ${facts.leveling}${o.leveling && o.leveling !== facts.leveling ? `, записано: ${o.leveling}` : ''}`)
  console.log(`  отпечаток PoB: ${imp.fingerprint.slice(0, 16)}… (${today})${checked ? `, «Проверено POETH в ${league}»` : ''}`)
  const warns = []
  if (core.comparePatch(patch, league) < 0) warns.push(`PoB сделан под ${patch} — карточка покажет «Устарел»`)
  if (!links.guide && !links.video) warns.push('нет ссылки на гайд или видео автора — у карточки будет только PoB')
  if (record.pick && !record.tags.newbie) warns.push('«Рекомендуем новичкам» без метки «для новичка» (--newbie)')
  if (facts.leveling === 'none') warns.push('в PoB нет этапов прокачки — по актам вести не сможем (карточка это скажет)')
  const trees = await knownAscendancies(core)
  const asc = trees?.byClass.get(facts.class)
  if (facts.ascendancy && asc && !asc.includes(facts.ascendancy)) warns.push(`восхождения «${facts.ascendancy}» нет в данных дерева ${trees.version}`)
  if (index && index.current !== league) warns.push(`текущая лига в index.json — ${index.current}; список ${league} игроки увидят, когда её сделают текущей`)
  for (const w of warns) console.log(`  ! ${w}`)
  // страница сайта «Стартеры» (ST3) показывает копию этого же списка — обновляем её сразу, как add-strategy
  if (args.dir === STARTERS_DATA_DIR) {
    const { writeSiteFiles } = await import('./build-site.mjs')
    await writeSiteFiles()
    console.log('  сайт: site/starters обновлён (tools/starters/build-site.mjs)')
  }
  console.log('Дальше: add-starter --check → npm test → коммит → пакет данных (tools/data/publish-data.mjs).')
}

const args = (() => {
  try {
    return parseArgs(process.argv.slice(2))
  } catch (e) {
    return fail(e.message)
  }
})()

if (args.check) await check(args.dir)
else await add(args)
