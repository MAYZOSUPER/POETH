// Камни PoE1 для вкладки «Билд» (S36) → resources/data/poe1/build/gems.json.
//
//   node tools/build-data/gems.mjs [--refresh]
//
// Ключ — gemId как в коде Path of Building (`<Gem gemId=…>`): «Metadata/Items/Gems/SkillGem» + variantId, где
// variantId — Id таблицы клиента GemEffects (так PoB строит ключи в Data/Gems.lua: проверено на всех 821 камне).
// Он не всегда равен id предмета игры (gameId): Blade Flurry — SkillGemBladeFlurry, а предмет — SkillGemChargedAttack;
// у трансфигурированных — SkillGemIceNovaAltX при предмете SkillGemIceNova. gameId храним, если отличается: по нему
// камень связан с наградами маршрута (leveling.json) и с данными предметов APT. Источники:
//   - RePoE fork gems.json (EN, уровни требований по уровням камня, трансфигурированные варианты) и
//     Russian/gems_minimal.json (RU-имена) — снимок по REPOE_COMMIT;
//   - таблицы клиента GemEffects + GrantedEffects (repoe-fork/dat-export): variantId по granted effect;
//   - наш resources/data/poe1/leveling/leveling.json (маршрут exile-leveling, MIT): награды за квесты и продавцы
//     по классам, имена квестов и NPC на EN/RU (как в клиенте, S31), уровень квеста — по маршруту.
// Только нужные поля, предсобрано; формат — кортежи, схема и загрузчик — src/shared/build/{types,data}.ts.

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DAT_COMMIT, DAT_REPO, OUT_DIR, REPOE_COMMIT, REPOE_REPO, REPOE_VERSION, ROOT, readCsv, readJson, writeData } from './sources.mjs'

export const GEMS_FORMAT = 1
const OUT = path.join(OUT_DIR, 'gems.json')
const LEVELING = path.join(ROOT, 'resources/data/poe1/leveling/leveling.json')

/** Классы в порядке classId Path of Building — биты маски «для каких классов» (0 — для всех). */
export const CLASSES = ['Scion', 'Marauder', 'Ranger', 'Witch', 'Duelist', 'Templar', 'Shadow']
/** Флаги камня (биты). */
export const GEM_FLAG = { support: 1, vaal: 2, transfigured: 4 }

/** Начало ключа камня в PoB: дальше — variantId (GemEffects.Id), и у поддержек тоже. */
export const POB_GEM_PREFIX = 'Metadata/Items/Gems/SkillGem'

const COLORS = new Set(['r', 'g', 'b', 'w'])
const ALT = /Alt[XYZ]$/

function classMask(classes) {
  let m = 0
  for (const c of classes ?? []) {
    const i = CLASSES.indexOf(c)
    if (i < 0) throw new Error(`неизвестный класс ${c}`)
    m |= 1 << i
  }
  return m === (1 << CLASSES.length) - 1 ? 0 : m
}

/**
 * Уровень персонажа к моменту сдачи квеста ≈ наибольший уровень зоны маршрута до первого шага с этим квестом
 * (города не считаем). Нужен, чтобы ответить «доступно ли на уровне Y».
 */
export function questLevels(lv) {
  const out = {}
  let max = 1
  for (const sec of lv.sections)
    for (const st of sec.steps)
      for (const p of st.parts) {
        if (!p || typeof p !== 'object') continue
        if ((p.k === 'enter' || p.k === 'wp') && p.a) {
          const a = lv.areas[p.a]
          if (a && !a.town && a.level > max) max = a.level
        }
        if (p.k === 'quest' && out[p.q] === undefined) out[p.q] = max
      }
  return out
}

/** Собрать gems.json из разобранных источников (чистая функция). */
export function buildGems(src) {
  const { gemsEn, gemsMinRu, gemsMinEn, lv } = src
  const report = { noRu: [], noVariant: [], notInRepoe: [], duplicates: [] }

  // variantId по granted effect: первая строка GemEffects (у Vaal-камней дальше идут неигровые «[DNT] …AltX»)
  const geId = new Map(src.grantedEffects.map((r) => [r.rownum, r.Id]))
  const variantOf = new Map()
  for (const r of src.gemEffects) {
    const g = geId.get(r.GrantedEffect)
    if (g && !variantOf.has(g)) variantOf.set(g, r.Id)
  }

  // RU-имя: минимальные выгрузки EN и RU идут в одном порядке; связь с полной EN — по предмету и имени
  const ruByKey = new Map()
  gemsMinEn.forEach((g, i) => {
    const r = gemsMinRu[i]
    if (r && r.base_item?.id === g.base_item?.id) ruByKey.set(`${g.base_item.id}|${g.display_name}`, r.display_name)
  })

  const reqTables = []
  const reqIndex = new Map()
  const reqIdx = (arr) => {
    const k = arr.join(',')
    if (!reqIndex.has(k)) {
      reqIndex.set(k, reqTables.length)
      reqTables.push(arr)
    }
    return reqIndex.get(k)
  }

  // невыпущенные — только если они есть в маршруте (Blade Trap в RePoE 3.29.3.3 «unreleased», а PoB и
  // exile-leveling его знают); камни PoE Royale (…Royale) — не нужны
  const inRoute = new Set(Object.keys(lv.gems ?? {}))
  const entries = []
  for (const skill of Object.keys(gemsEn).sort()) {
    const g = gemsEn[skill]
    if (!g.base_item || /Royale$/.test(g.base_item.id)) continue
    if (g.base_item.release_state === 'unreleased' && !inRoute.has(g.base_item.id)) continue
    const variant = variantOf.get(skill)
    if (!variant) report.noVariant.push(skill)
    const v = variant ?? skill
    const gameId = g.base_item.id
    const req = []
    for (let l = 1; l <= g.base_item.max_level + 1; l++) {
      const p = g.per_level?.[String(l)]
      if (!p) break
      req.push(p.required_level ?? 0)
    }
    const ru = ruByKey.get(`${gameId}|${g.display_name}`)
    if (!ru) report.noRu.push(skill)
    let flags = 0
    if (g.is_support) flags |= GEM_FLAG.support
    if (g.tags?.includes('vaal')) flags |= GEM_FLAG.vaal
    if (ALT.test(v)) flags |= GEM_FLAG.transfigured
    entries.push({
      gemId: POB_GEM_PREFIX + v,
      gameId,
      skill,
      variant: v,
      en: g.display_name,
      ru: ru || g.display_name,
      color: COLORS.has(g.color) ? g.color : 'w',
      flags,
      req: reqIdx(req)
    })
  }

  // где взять: награды квестов и продавцы по классам — из маршрута exile-leveling (leveling.json, по gameId)
  const qLevel = questLevels(lv)
  const sources = new Map()
  const quests = {}
  const npcs = {}
  const addNpc = (n) => {
    if (n && !npcs[n]) npcs[n] = lv.names?.[n] || n
  }
  for (const [qid, q] of Object.entries(lv.quests)) {
    for (const r of Object.values(q.rewards ?? {})) {
      const list = [...r.quest.map((x) => ({ ...x, kind: 0, npc: r.npc })), ...r.vendor.map((x) => ({ ...x, kind: 1 }))]
      for (const x of list) {
        if (!x.gem.startsWith('Metadata/Items/Gems/')) continue // флаконы и прочее
        if (!sources.has(x.gem)) sources.set(x.gem, [])
        sources.get(x.gem).push([qid, x.kind, x.npc ?? '', classMask(x.classes)])
        quests[qid] = { act: q.act, lvl: qLevel[qid] ?? null, en: q.en, ru: q.ru }
        addNpc(x.npc)
      }
    }
  }

  const gems = {}
  const used = new Set()
  for (const e of entries.sort((a, b) => (a.gemId < b.gemId ? -1 : a.gemId > b.gemId ? 1 : 0))) {
    if (gems[e.gemId]) {
      report.duplicates.push(`${e.gemId} (${e.skill})`)
      continue
    }
    // трансфигурированные в маршруте не продаются — источники у базового камня (загрузчик найдёт его по gameId)
    // id маршрута — id предмета; если предмет в RePoE сменил id (Lightning Tendrils 3.29), совпадает ключ PoB
    const own = sources.get(e.gameId) ?? sources.get(e.gemId)
    const from = e.flags & GEM_FLAG.transfigured ? [] : sortSources(own ?? [], quests)
    if (own) used.add(sources.get(e.gameId) ? e.gameId : e.gemId)
    const t = [e.en, e.ru, e.color, e.flags, e.req, from, e.gameId !== e.gemId ? e.gameId : 0, e.skill !== e.variant ? e.skill : 0]
    while (t.length > 5 && (t[t.length - 1] === 0 || (Array.isArray(t[t.length - 1]) && t[t.length - 1].length === 0))) t.pop()
    gems[e.gemId] = t
  }
  for (const id of sources.keys()) if (!used.has(id)) report.notInRepoe.push(id)

  const sortedQuests = Object.fromEntries(Object.keys(quests).sort(questOrder(quests)).map((k) => [k, quests[k]]))
  const data = {
    v: GEMS_FORMAT,
    meta: { ...src.meta, gems: Object.keys(gems).length },
    classes: CLASSES,
    req: reqTables,
    quests: sortedQuests,
    npcs: Object.fromEntries(Object.keys(npcs).sort().map((k) => [k, npcs[k]])),
    gems
  }
  return { data, report }
}

function questOrder(quests) {
  return (a, b) => quests[a].act - quests[b].act || (quests[a].lvl ?? 0) - (quests[b].lvl ?? 0) || (a < b ? -1 : a > b ? 1 : 0)
}

/** Источники камня: сначала по ходу кампании (акт, уровень квеста), награда раньше продавца. */
function sortSources(list, quests) {
  const ord = questOrder(quests)
  return [...list].sort((a, b) => ord(a[0], b[0]) || a[1] - b[1] || (a[2] < b[2] ? -1 : a[2] > b[2] ? 1 : 0) || a[3] - b[3])
}

export async function loadGemSources() {
  const [gemsEn, gemsMinRu, gemsMinEn] = await Promise.all(['repoe-gems-en.json', 'repoe-gems-min-ru.json', 'repoe-gems-min-en.json'].map((f) => readJson(f)))
  const [gemEffects, grantedEffects] = await Promise.all(['dat-GemEffects.csv', 'dat-GrantedEffects.csv'].map((f) => readCsv(f)))
  const lv = JSON.parse(readFileSync(LEVELING, 'utf8'))
  return {
    gemsEn,
    gemEffects: gemEffects.map((r) => ({ Id: r.Id, GrantedEffect: r.GrantedEffect })),
    grantedEffects: grantedEffects.map((r) => ({ rownum: r.rownum, Id: r.Id })),
    gemsMinRu: Object.values(gemsMinRu),
    gemsMinEn: Object.values(gemsMinEn),
    lv,
    meta: {
      sources: [
        `${REPOE_REPO}@${REPOE_COMMIT.slice(0, 7)} (RePoE fork ${REPOE_VERSION}, MIT): gems.json, Russian/gems_minimal.json`,
        `${DAT_REPO}@${DAT_COMMIT.slice(0, 7)} (таблицы клиента PoE1: GemEffects, GrantedEffects)`,
        `resources/data/poe1/leveling/leveling.json (${lv.meta.source.repo}@${lv.meta.source.commit.slice(0, 7)}, MIT)`
      ]
    }
  }
}

async function main() {
  const { data, report } = buildGems(await loadGemSources())
  const bytes = writeData(OUT, data)
  const out = (label, list) => list.length && console.log(`\n${label} (${list.length}):\n  ${list.slice(0, 30).join('\n  ')}`)
  out('нет RU-имени (оставлено EN)', report.noRu)
  out('нет variantId в GemEffects (ключ — id эффекта)', report.noVariant)
  out('камень маршрута не найден в данных — источники не привязаны', report.notInRepoe)
  out('повтор gemId (взят первый)', report.duplicates)
  const sha = createHash('sha256').update(JSON.stringify(data)).digest('hex')
  const withSrc = Object.values(data.gems).filter((g) => g[5]?.length).length
  console.log(
    `\nкамней ${data.meta.gems} (с источниками в кампании ${withSrc}), таблиц уровней ${data.req.length}, квестов ${Object.keys(data.quests).length} → ` +
      `${path.relative(ROOT, OUT)} (${(bytes / 1024).toFixed(0)} КБ, sha256 ${sha.slice(0, 12)})`
  )
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
