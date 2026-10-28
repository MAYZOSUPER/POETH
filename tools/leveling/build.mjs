// Генератор данных прокачки PoE1 (S14): маршрут актов 1–10 + зоны, квесты, награды-камни, имена RU/EN.
//
//   node tools/leveling/build.mjs [--refresh]
//
// Источники (кэш — tools/leveling/sources/, в git не кладём; в репо — только наш производный JSON):
//  - exile-leveling (HeartofPhos, MIT, © 2025 HeartofPhos) по коммиту EL_COMMIT: common/data/json/{areas,quests,
//    gems,kill-waypoints,characters}.json и common/data/routes/act-N.txt. Разбор маршрута — по образцу
//    common/src/route-processing (MIT): фрагменты {enter|…} {waypoint|…} {logout} {quest|…} …, #section, #sub,
//    #ifdef/#ifndef/#endif. Варианты (LEAGUE_START, BANDIT_*) не раскрываем — у шага остаются условия, зону
//    после шага считает приложение по выбранному варианту (src/shared/leveling/route.ts);
//  - poedb.tw/ru/Act_N — русские имена зон, квестов, боссов, предметов квестов (только факты: имя ↔ имя);
//  - данные APT в репо (resources/data/poe1/{en,ru}/items.ndjson, SnosMe/awakened-poe-trade, MIT) — камни и
//    предметы (namespace GEM / ITEM);
//  - очки пассивов за квесты — вывод /passives настоящего клиента PoE1 3.2x (см. PASSIVE_QUESTS);
//  - наш перевод текста шагов и подсказок — ./phrases.ru.mjs.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { NAMES, PIECES, SUBS } from './phrases.ru.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '../..')
const SOURCES = path.join(HERE, 'sources')
const OUT = path.join(ROOT, 'resources/data/poe1/leveling/leveling.json')
const REFRESH = process.argv.includes('--refresh')

export const EL_REPO = 'HeartofPhos/exile-leveling'
export const EL_COMMIT = 'b7b2dd0ed62ae25cf55c74085fa64a1f4d7cf4ba'
const UA = 'POETH dataset build (+https://github.com/MAYZOSUPER/POETH)'
const ACTS = 10

/**
 * Очки пассивов за квест — /passives настоящего клиента PoE1 («(N from <квест>)», 3.2x). «Through Sacred
 * Ground» в выводе 0, но маршрут exile-leveling считает 23 очка без бандитов — значит, 1. «Deal with the
 * Bandits» — 1, только если убить всех бандитов (BANDIT_KILL; в маршруте тогда «все 24»).
 */
const PASSIVE_QUESTS = {
  'The Dweller of the Deep': 1,
  'The Marooned Mariner': 1,
  'The Way Forward': 1,
  'Through Sacred Ground': 1,
  'Deal with the Bandits': 1,
  "Victario's Secrets": 1,
  "Piety's Pets": 1,
  'An Indomitable Spirit': 1,
  'In Service to Science': 1,
  "Kitava's Torments": 1,
  'The Father of War': 1,
  'The Puppet Mistress': 1,
  'The Cloven One': 1,
  'The Master of a Million Faces': 1,
  "Kishara's Star": 1,
  'Queen of Despair': 1,
  'Love is Dead': 1,
  'Reflection of Terror': 1,
  'The Gemling Legion': 1,
  'Queen of the Sands': 1,
  'The Ruler of Highgate': 1,
  "Vilenta's Vengeance": 1,
  'An End to Hunger': 2
}
const BANDIT_QUEST = 'Deal with the Bandits'

// ---------------------------------------------------------------------------
// Загрузка с кэшем
// ---------------------------------------------------------------------------

async function cached(name, url) {
  const file = path.join(SOURCES, name)
  if (!REFRESH && existsSync(file)) return readFileSync(file, 'utf8')
  const res = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
  const text = await res.text()
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, text, 'utf8')
  return text
}

const el = (p) => cached(`exile-leveling/${p.split('/').pop()}`, `https://raw.githubusercontent.com/${EL_REPO}/${EL_COMMIT}/${p}`)
const json = async (p) => JSON.parse((await el(p)).replace(/^﻿/, ''))

// ---------------------------------------------------------------------------
// Имена RU: poedb (слаг ↔ русский текст ссылки), данные APT, ручной словарь
// ---------------------------------------------------------------------------

const ENTITIES = { '&#39;': "'", '&quot;': '"', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&nbsp;': ' ' }
const decode = (s) => s.replace(/&#39;|&quot;|&amp;|&lt;|&gt;|&nbsp;/g, (m) => ENTITIES[m])

/** Слаги poedb: EN-имя без апострофов, пробелы → «_» (Lioneye's Watch → Lioneyes_Watch). */
function slugs(en) {
  const base = en.replace(/['’]/g, '').trim()
  const a = base.replace(/\s+/g, '_')
  const withApos = en.trim().replace(/’/g, "'").replace(/\s+/g, '_')
  return [...new Set([a, a.replace(/,/g, ''), a.replace(/[,:]/g, ''), withApos])]
}

function poedbNames(html, into) {
  const re = /<a\b[^>]*\bhref="(?:\/ru\/)?([^"#?/]+)"[^>]*>([\s\S]*?)<\/a>/g
  for (const m of html.matchAll(re)) {
    const slug = decodeURIComponent(m[1])
    const raw = m[2]
    const gen = /<else>\{([^}]*)\}/.exec(raw)
    const text = decode((gen ? gen[1] : raw.replace(/<[^>]+>/g, '')).trim())
    if (!text || !/[А-Яа-яЁё]/.test(text)) continue
    if (!into.has(slug)) into.set(slug, text)
  }
}

function aptNames() {
  const read = (lang) =>
    readFileSync(path.join(ROOT, `resources/data/poe1/${lang}/items.ndjson`), 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l))
  const ru = new Map()
  for (const it of read('ru')) if (it.refName && (it.namespace === 'GEM' || it.namespace === 'ITEM')) ru.set(it.refName, it.name)
  return ru
}

// ---------------------------------------------------------------------------
// Разбор маршрута (по образцу exile-leveling common/src/route-processing, MIT)
// ---------------------------------------------------------------------------

const FRAG = /\{(.+?)\}/g

/** Строка шага → части: текст {t, r} и фрагменты {k, …}. Непереведённое — в missing. */
function parseParts(text, { translate, missing }) {
  const out = []
  let last = 0
  const pushText = (s) => {
    const t = s.trim()
    if (!t) return
    if (!translate) {
      out.push(s)
      return
    }
    const r = PIECES[t]
    if (r === undefined) missing.pieces.add(t)
    out.push({ t, r: r ?? t })
  }
  for (const m of text.matchAll(FRAG)) {
    pushText(text.slice(last, m.index))
    last = m.index + m[0].length
    const [k, ...a] = m[1].split('|')
    switch (k) {
      case 'enter':
        out.push({ k: 'enter', a: a[0] })
        break
      case 'area':
        out.push({ k: 'area', a: a[0] })
        break
      case 'waypoint':
        out.push(a[0] ? { k: 'wp', a: a[0] } : { k: 'wpicon' })
        break
      case 'waypoint_get':
        out.push({ k: 'wpget' })
        break
      case 'logout':
        out.push({ k: 'logout' })
        break
      case 'portal':
        out.push({ k: 'portal', v: a[0] })
        break
      case 'quest':
        out.push(a.length > 1 ? { k: 'quest', q: a[0], o: a.slice(1) } : { k: 'quest', q: a[0] })
        break
      case 'kill':
      case 'arena':
      case 'generic':
        out.push({ k, v: a[0] })
        break
      case 'quest_text':
        out.push({ k: 'qtext', v: a[0] })
        break
      case 'trial':
        out.push({ k: 'trial' })
        break
      case 'ascend':
        out.push({ k: 'ascend', v: a[0] })
        break
      case 'crafting':
        out.push(a[0] ? { k: 'craft', a: a[0] } : { k: 'craft' })
        break
      case 'dir':
        out.push({ k: 'dir', d: Math.round((((Number(a[0]) % 360) + 360) % 360) / 45) % 8 })
        break
      case 'copy':
        out.push({ k: 'copy', v: a.join('') })
        break
      default:
        throw new Error(`неизвестный фрагмент {${m[1]}}`)
    }
  }
  pushText(text.slice(last))
  return out
}

function parseRoute(act, source, ctx) {
  const steps = []
  const cond = []
  let n = 0
  let name = `Act ${act}`
  for (const rawLine of source.split(/\r\n|\r|\n/)) {
    const line = rawLine.trim()
    if (!line) continue
    let m
    if ((m = /^#section\s*(.*)$/.exec(line))) {
      name = m[1] || name
      continue
    }
    if ((m = /^#ifdef\s+(\S+)/.exec(line))) {
      cond.push(m[1])
      continue
    }
    if ((m = /^#ifndef\s+(\S+)/.exec(line))) {
      cond.push(`!${m[1]}`)
      continue
    }
    if (/^#endif/.test(line)) {
      cond.pop()
      continue
    }
    if ((m = /^#sub\s*(.*)$/.exec(line))) {
      const step = steps[steps.length - 1]
      if (!step) throw new Error(`акт ${act}: #sub без шага`)
      const en = m[1].trim()
      const lvl = /^(?:Recommended|Farm) Level: (.+)$/.exec(en)
      if (lvl) {
        step.lvl = lvl[1].replace('-', '–')
        if (/^Farm/.test(en)) step.farm = true
        continue
      }
      const ru = SUBS[en]
      if (ru === undefined) ctx.missing.subs.add(en)
      step.sub = step.sub ?? []
      step.sub.push({ en: parseParts(en, { translate: false, missing: ctx.missing }), ru: parseParts(ru ?? en, { translate: false, missing: ctx.missing }) })
      continue
    }
    if (line.startsWith('#')) continue // комментарий
    const body = line.replace(/\s+#[^{}]*$/, '') // «… #Имя зоны» в конце — комментарий
    n += 1
    const step = { id: `a${act}-${String(n).padStart(3, '0')}`, parts: parseParts(body, { translate: true, missing: ctx.missing }) }
    if (cond.length) step.cond = [...cond]
    steps.push(step)
  }
  if (cond.length) throw new Error(`акт ${act}: не закрыт #ifdef`)
  return { act, en: name, ru: name.replace(/^Act (\d+)$/, 'Акт $1'), steps }
}

// ---------------------------------------------------------------------------

async function main() {
  const [areasRaw, questsRaw, gemsRaw, killWp, characters] = await Promise.all(
    ['areas', 'quests', 'gems', 'kill-waypoints', 'characters'].map((f) => json(`common/data/json/${f}.json`))
  )
  const routes = []
  for (let a = 1; a <= ACTS; a++) routes.push(await el(`common/data/routes/act-${a}.txt`))

  const poedb = new Map()
  for (let a = 1; a <= ACTS; a++) {
    poedbNames(await cached(`poedb/act-${a}.html`, `https://poedb.tw/ru/Act_${a}`), poedb)
  }
  const apt = aptNames()
  const ruOfKnown = (en) => {
    if (NAMES[en] !== undefined) return NAMES[en]
    for (const s of slugs(en)) if (poedb.has(s)) return poedb.get(s)
    if (apt.has(en)) return apt.get(en)
    return null
  }
  // нет на страницах актов — страница сущности poedb (og:title), с паузой между запросами
  const entityCache = new Map()
  const ruOfPage = async (en) => {
    for (const s of slugs(en)) {
      if (entityCache.has(s)) return entityCache.get(s)
      const name = `poedb/entity/${s.replace(/[^\w.-]/g, '_')}.html`
      const fresh = REFRESH || !existsSync(path.join(SOURCES, name))
      let html = ''
      try {
        html = await cached(name, `https://poedb.tw/ru/${encodeURIComponent(s)}`)
      } catch {
        html = ''
      }
      if (fresh) await new Promise((r) => setTimeout(r, 300))
      const m = /og:title" content="([^"]*)"/.exec(html)
      const ru = m && /[А-Яа-яЁё]/.test(m[1]) ? decode(m[1]) : null
      entityCache.set(s, ru)
      if (ru) return ru
    }
    return null
  }
  const ruOfAsync = async (en) => ruOfKnown(en) ?? (await ruOfPage(en))
  const ruOf = ruOfKnown

  const missing = { pieces: new Set(), subs: new Set(), names: new Set(), areas: new Set(), quests: new Set() }
  const ctx = { missing }

  // маршрут — первым: по нему видно, какие квесты и имена нужны
  const sections = routes.map((src, i) => parseRoute(i + 1, src, ctx))
  const usedQuests = new Set()
  for (const s of sections) for (const st of s.steps) for (const p of st.parts) if (p && p.k === 'quest') usedQuests.add(p.q)

  // зоны актов 1–11 (11 — эпилог: Karui Shores и лобби лабиринта)
  const areas = {}
  for (const x of Object.values(areasRaw)) {
    const ru = await ruOfAsync(x.name)
    if (!ru) missing.areas.add(`${x.id} ${x.name}`)
    areas[x.id] = {
      act: x.act,
      level: x.level,
      ...(x.is_town_area ? { town: true } : {}),
      ...(x.has_waypoint ? { wp: true } : {}),
      ...(x.parent_town_area_id ? { townId: x.parent_town_area_id } : {}),
      en: x.name,
      ru: ru ?? x.name
    }
  }

  // квесты: имена, очки пассивов, награды-камни по классам
  const gemIds = new Set(Object.values(characters).flatMap((c) => [c.start_gem_id, c.chest_gem_id]))
  const npcs = new Set()
  const quests = {}
  for (const q of Object.values(questsRaw)) {
    // квесты вне маршрута кампании (атлас, Мэйвен…) не берём
    if (!usedQuests.has(q.id) && !PASSIVE_QUESTS[q.name]) continue
    const ru = await ruOfAsync(q.name)
    if (!ru) missing.quests.add(`${q.id} ${q.name}`)
    const rewards = {}
    for (const [oid, offer] of Object.entries(q.reward_offers)) {
      if (!offer) continue
      const quest = Object.entries(offer.quest ?? {}).map(([gem, r]) => (gemIds.add(gem), { gem, classes: r.classes }))
      const vendor = Object.entries(offer.vendor ?? {}).map(([gem, r]) => (gemIds.add(gem), npcs.add(r.npc), { gem, classes: r.classes, npc: r.npc }))
      if (offer.quest_npc) npcs.add(offer.quest_npc)
      if (quest.length || vendor.length) rewards[oid] = { npc: offer.quest_npc ?? null, quest, vendor }
    }
    quests[q.id] = {
      act: Number(q.act),
      en: q.name,
      ru: ru ?? q.name,
      ...(PASSIVE_QUESTS[q.name] ? { passives: PASSIVE_QUESTS[q.name] } : {}),
      ...(q.name === BANDIT_QUEST ? { passivesIf: 'BANDIT_KILL' } : {}),
      ...(Object.keys(rewards).length ? { rewards } : {})
    }
  }
  for (const name of Object.keys(PASSIVE_QUESTS)) {
    if (!Object.values(quests).some((q) => q.en === name)) throw new Error(`квест с пассивом не найден: ${name}`)
  }

  const gems = {}
  for (const id of [...gemIds].sort()) {
    const g = gemsRaw[id]
    if (!g) continue
    const ru = ruOf(g.name)
    if (!ru) missing.names.add(`камень ${g.name}`)
    gems[id] = { en: g.name, ru: ru ?? g.name, attr: g.primary_attribute, lvl: g.required_level, ...(g.is_support ? { support: true } : {}) }
  }

  // имена фрагментов (боссы, арены, предметы квестов, прочее) и NPC
  const names = {}
  const want = new Set(npcs)
  for (const s of sections)
    for (const st of s.steps)
      for (const p of [...st.parts, ...(st.sub ?? []).flatMap((x) => [...x.en, ...x.ru])])
        if (p && typeof p === 'object' && 'v' in p && ['kill', 'arena', 'generic', 'qtext'].includes(p.k)) want.add(p.v)
  for (const en of [...want].sort()) {
    const ru = await ruOfAsync(en)
    if (ru === null) missing.names.add(en)
    names[en] = ru ?? en
  }

  // теги шага: очко пассивов, испытание, флакон, камень; зона после шага считает приложение
  for (const s of sections) {
    for (const st of s.steps) {
      const tags = new Set()
      for (const p of st.parts) {
        if (typeof p !== 'object') continue
        if (p.k === 'quest') {
          const q = quests[p.q]
          if (!q) throw new Error(`${st.id}: нет квеста ${p.q}`)
          if (q.passives && (!q.passivesIf || (st.cond ?? []).includes(q.passivesIf))) tags.add('passive')
          if (q.rewards) tags.add('gem')
        }
        if (p.k === 'trial') tags.add('trial')
        if ((p.k === 'generic' || p.k === 'qtext') && /Flask/.test(p.v)) tags.add('flask')
        if (p.k === 'enter' || p.k === 'wp' || p.k === 'area' || p.k === 'craft') {
          if (p.a && !areas[p.a]) throw new Error(`${st.id}: нет зоны ${p.a}`)
        }
      }
      for (const sub of st.sub ?? []) for (const p of sub.en) if (typeof p === 'object' && p.k === 'generic' && /Flask/.test(p.v)) tags.add('flask')
      if (tags.size) st.tags = [...tags]
    }
  }

  const data = {
    meta: {
      source: { repo: EL_REPO, commit: EL_COMMIT, license: 'MIT', copyright: '© 2025 HeartofPhos' },
      names: ['poedb.tw/ru', 'Awakened PoE Trade data (MIT)'],
      acts: ACTS,
      steps: sections.reduce((a, s) => a + s.steps.length, 0)
    },
    areas,
    quests,
    gems,
    characters: Object.fromEntries(Object.entries(characters).map(([c, v]) => [c, { start: v.start_gem_id, chest: v.chest_gem_id }])),
    killWaypoints: killWp,
    names,
    sections
  }
  mkdirSync(path.dirname(OUT), { recursive: true })
  writeFileSync(OUT, JSON.stringify(data) + '\n', 'utf8')

  console.log(`шагов ${data.meta.steps}, зон ${Object.keys(areas).length}, квестов ${Object.keys(quests).length}, камней ${Object.keys(gems).length}, имён ${Object.keys(names).length}`)
  const report = (label, set) => set.size && console.log(`\n${label} (${set.size}):\n  ${[...set].join('\n  ')}`)
  report('нет перевода куска шага → phrases.ru.mjs PIECES', missing.pieces)
  report('нет перевода подсказки → phrases.ru.mjs SUBS', missing.subs)
  report('зоны без RU (poedb)', missing.areas)
  report('квесты без RU (poedb)', missing.quests)
  report('имена без RU (poedb/APT → phrases.ru.mjs NAMES)', missing.names)
  console.log(`\n→ ${path.relative(ROOT, OUT)}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
