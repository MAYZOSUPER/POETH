import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { inflateNode } from '@shared/advisor/codecNode'
import { BUILD_GEMS_FILE, BUILD_TREE_FILE, findGem, parseGemsData, parseTreeData } from '@shared/build/data'
import {
  buildChecks,
  buildGemGameIds,
  guideBuildLines,
  stageChecklist,
  stageChips,
  stageGems,
  stageLinks,
  stageRange,
  stageTree,
  treeStageIndex,
  vendorSearch
} from '@shared/build/view'
import { mainSkill } from '@shared/build/library'
import { importPobCode } from '@shared/pob/import'
import { currentStage, resolveStages } from '@shared/pob/stages'
import { compileSearch } from '@shared/regex/emulator'
import { fixtureCode } from '../pob/fixtures'

// Вид этапа вкладки «Билд» (S39) на настоящих кодах PoB (фикстуры S35) и данных S36: этап по уровню, «камни сейчас»
// для трёх классов, связки, разница нод и «взято» по журналу, строка для продавца, светофор, строка в гиде.

const DATA = join(__dirname, '..', '..', 'resources', 'data', 'poe1')
const gems = parseGemsData(JSON.parse(readFileSync(join(DATA, BUILD_GEMS_FILE), 'utf8')))!
const tree = parseTreeData(JSON.parse(readFileSync(join(DATA, BUILD_TREE_FILE), 'utf8')))!

function load(name: string) {
  const res = importPobCode(fixtureCode(name), inflateNode)
  if (!res.ok) throw new Error(`${name}: ${res.error}`)
  return { build: res.build, plan: resolveStages(res.build) }
}

const duelist = load('pobbin-acts-all-axes') // Дуэлянт → Чемпион, «Act 1»…«Act 10» во всех осях
const witch = load('pobbin-acts-level-gems') // Ведьма → Оккультист, камни — разделы одного набора
const templar = load('pastebin-acts-lv') // Храмовник → Хранитель, старый формат

describe('этап по уровню и чипы', () => {
  it('уровень и акт персонажа → текущий этап; прошлые — «пройдены»', () => {
    const { plan } = duelist
    const cur = currentStage(plan, { level: 16, act: 2 }).index
    expect(plan.stages[cur!].title).toBe('Act 2')
    const chips = stageChips(plan, cur)
    expect(chips.filter((c) => c.past).map((c) => c.stage.title)).toEqual(['Act 1'])
    expect(chips.find((c) => c.now)?.stage.title).toBe('Act 2')
    expect(stageRange(plan, 0)).toEqual({ from: 1, to: 13 })
  })

  it('эндгейм не участвует в подборе и идёт в чипах после прокачки', () => {
    const { plan } = load('pobbin-leveling-endgame-variants')
    const chips = stageChips(plan, currentStage(plan, { level: 30 }).index)
    const firstOther = chips.findIndex((c) => !c.stage.leveling)
    expect(firstOther).toBeGreaterThan(0)
    expect(chips.slice(firstOther).every((c) => !c.stage.leveling)).toBe(true)
  })

  it('этап плана → индекс этапа с деревом для наложения S38', () => {
    expect(treeStageIndex(duelist.plan, 3)).toBe(3)
    expect(treeStageIndex({ primary: 'none', stages: [] }, 0)).toBeNull()
  })
})

describe('«Камни сейчас»', () => {
  it('Дуэлянт, акт 1: за квест — Таркли, остальное покупать; одна награда на квест', () => {
    const { build, plan } = duelist
    const g = stageGems(build, plan, 0, gems, 'ru', 1)
    const quest = g.rows.filter((r) => r.status === 'quest')
    expect(quest.map((r) => r.name)).toContain('Наскок')
    const ids = quest.map((r) => r.source!.questId)
    expect(new Set(ids).size).toBe(ids.length)
    expect(g.rows.filter((r) => r.status === 'buy').length).toBe(g.buy)
    expect(g.rows.every((r) => r.status !== 'have')).toBe(true)
    // сначала то, что сделать
    const order = g.rows.map((r) => r.status)
    expect(order.indexOf('quest')).toBeGreaterThan(order.lastIndexOf('buy'))
  })

  it('Дуэлянт, акт 2: награда квеста, взятая в акте 1, уже не награда — купить у продавца; камни акта 1 — «есть»', () => {
    const { build, plan } = duelist
    const g = stageGems(build, plan, 1, gems, 'ru', 16)
    const precision = g.rows.find((r) => r.gem?.en === 'Precision')!
    expect(precision.status).toBe('buy')
    expect(precision.source?.questId).toBe('a1q2')
    expect(precision.available).toBe(true)
    // подсвечено одно действие — доступное к этому уровню
    const next = g.rows.filter((r) => r.next)
    expect(next).toHaveLength(1)
    expect(next[0].available).toBe(true)
    expect(g.rows.find((r) => r.gem?.en === 'Leap Slam')?.status).toBe('have')
    // уже есть — в конце и бледнее
    expect(g.rows[g.rows.length - 1].status).toBe('have')
  })

  it('Ведьма (разделы одного набора камней): источники для класса Witch, имена на языке клиента', () => {
    const { build, plan } = witch
    const ru = stageGems(build, plan, 0, gems, 'ru', 5)
    const en = stageGems(build, plan, 0, gems, 'en', 5)
    expect(ru.rows.length).toBeGreaterThan(2)
    expect(ru.rows.map((r) => r.key)).toEqual(en.rows.map((r) => r.key))
    for (const r of ru.rows) if (r.source) expect(r.source.classes.length === 0 || r.source.classes.includes('Witch')).toBe(true)
    expect(ru.rows.some((r) => /[а-я]/i.test(r.name))).toBe(true)
    expect(en.rows.every((r) => !/[а-я]/i.test(r.name))).toBe(true)
  })

  it('Храмовник (старый формат): у каждого камня из данных — источник или «нет в кампании»', () => {
    const { build, plan } = templar
    for (let i = 0; i < 3; i++) {
      const g = stageGems(build, plan, i, gems, 'en', plan.stages[i].from ?? 1)
      for (const r of g.rows) {
        if (r.status === 'quest' || r.status === 'buy') expect(r.source).not.toBeNull()
        if (r.status === 'none') expect(r.source).toBeNull()
      }
    }
  })

  it('ключ камня — код PoB (findGem), не id предмета: у поддержек они разные', () => {
    const g = stageGems(duelist.build, duelist.plan, 0, gems, 'en', 1)
    const sup = g.rows.find((r) => r.support && r.gem)!
    expect(sup.key.startsWith('Metadata/Items/Gems/SkillGemSupport')).toBe(true)
    expect(sup.gem!.gameId).not.toBe(sup.key)
    expect(findGem(gems, sup.key)).toBe(sup.gem)
  })

  it('без данных камней — имена из PoB, без источников', () => {
    const g = stageGems(duelist.build, duelist.plan, 0, null, 'ru', 1)
    expect(g.rows.length).toBeGreaterThan(0)
    expect(g.rows.every((r) => r.gem === null && r.status === 'none')).toBe(true)
  })
})

describe('трансфигурированный камень', () => {
  it('источник — базовый камень (в кампании продают только его), в строке — пометка viaBase', () => {
    const g = stageGems(duelist.build, duelist.plan, 2, gems, 'en', 30)
    const carnage = g.rows.find((r) => r.gem?.en === 'Boneshatter of Carnage')!
    expect(carnage.gem!.transfigured).toBe(true)
    expect(carnage.viaBase?.en).toBe('Boneshatter')
    expect(carnage.source).not.toBeNull()
  })
})

describe('строка для продавца', () => {
  // в окне продавца — камни кампании; строка подсвечивает нужные и не задевает другие
  const shop = (lang: 'en' | 'ru') => [...gems.gems.values()].filter((g) => g.sources.length).map((g) => (lang === 'ru' ? g.ru : g.en))

  it.each(['en', 'ru'] as const)('%s: каждый нужный камень подсвечен, чужие — нет', (lang) => {
    const want = stageGems(duelist.build, duelist.plan, 0, gems, lang, 1)
      .rows.filter((r) => r.status === 'buy')
      .map((r) => r.name)
    const s = vendorSearch(want, gems, lang)
    expect(s.text.length).toBeLessThanOrEqual(250)
    expect(s.dropped).toEqual([])
    const hit = compileSearch(s.text, { foldYo: true })
    for (const name of want) expect(hit(name), name).toBe(true)
    const extra = shop(lang).filter((n) => !want.includes(n) && hit(n))
    expect(extra).toEqual([])
  })

  it('имя внутри другого (Arc — Arctic Armour) — целиком с концом строки', () => {
    const s = vendorSearch(['Arc'], gems, 'en')
    const hit = compileSearch(s.text)
    expect(hit('Arc')).toBe(true)
    expect(hit('Arctic Armour')).toBe(false)
    expect(hit('Arcanist Brand')).toBe(false)
  })

  it('не влезло в 250 символов — список не вошедших', () => {
    const many = shop('en').slice(0, 80)
    const s = vendorSearch(many, gems, 'en')
    expect(s.text.length).toBeLessThanOrEqual(250)
    expect(s.dropped.length).toBeGreaterThan(0)
  })
})

describe('связки', () => {
  it('по слотам, цвета гнёзд по камням, главная — с главным камнем билда', () => {
    const { build, plan } = duelist
    const links = stageLinks(build, plan, 2, gems, 'en', mainSkill(build).gemId)
    expect(links.length).toBeGreaterThan(2)
    expect(links.filter((l) => l.main).length).toBe(1)
    // главный камень билда — трансфигурированный «Boneshatter of Carnage»
    expect(links.find((l) => l.main)!.gems.some((g) => g.name.startsWith('Boneshatter'))).toBe(true)
    expect(links.every((l) => l.gems.every((g) => g.color !== null))).toBe(true)
  })
})

describe('«Дерево: следующие ноды»', () => {
  it('разница с прошлым этапом: нотаблы по одному, малые — одной строкой; стартовых нет', () => {
    const { build, plan } = duelist
    const t = stageTree(build, plan, 1, tree, 'ru', null)
    expect(t.prev).toBe(0)
    expect(t.add).toBeGreaterThan(0)
    expect(t.rows.filter((r) => r.kind === 'small').length).toBeLessThanOrEqual(2)
    expect(t.rows.find((r) => r.state === 'next')?.kind).toMatch(/notable|keystone/)
    expect(t.log).toBe(false)
    expect(t.search.text).toBe(t.search.parts[0] ?? '')
  })

  it('«взято» по журналу: взятые — done, поиск — по ещё не взятым', () => {
    const { build, plan } = duelist
    const before = stageTree(build, plan, 0, tree, 'en', null)
    const first = before.rows.find((r) => r.kind === 'notable')!
    const id = tree.nodes.get(first.hash!)!.id
    const after = stageTree(build, plan, 0, tree, 'en', { taken: new Set([id]), removed: new Set() })
    expect(after.log).toBe(true)
    expect(after.taken).toBe(1)
    expect(after.rows.find((r) => r.hash === first.hash)?.state).toBe('done')
    expect(after.search.parts).not.toContain(first.name)
    // снятая позже — уже не взята
    const undone = stageTree(build, plan, 0, tree, 'en', { taken: new Set([id]), removed: new Set([id]) })
    expect(undone.taken).toBe(0)
  })

  it('восхождение — только нотаблы; снимаемые ноды — «снять» и очки сброса', () => {
    const { build, plan } = duelist
    for (let i = 1; i < plan.stages.length; i++) {
      const t = stageTree(build, plan, i, tree, 'ru', null)
      for (const r of t.rows.filter((x) => x.kind === 'asc')) expect(tree.nodes.get(r.hash!)!.kind).toBe('notable')
      expect(t.rows.filter((r) => r.state === 'drop').length > 0).toBe(t.remove > 0)
      expect(t.respec).toBeLessThanOrEqual(t.remove + 10)
    }
  })
})

describe('«Проверка»', () => {
  it('светофор по статам автора: кап — зелёный, рядом — жёлтый, хаос минус — серый', () => {
    const c = buildChecks(duelist.build)!
    expect(c.specTitle).toBe('Act 10')
    expect(c.penalty).toBe(-60)
    const by = Object.fromEntries(c.rows.map((r) => [r.id, r]))
    expect(by.fire.level).toBe('good')
    expect(by.cold).toMatchObject({ level: 'warn', gap: 1 })
    expect(by.chaos.level).toBe('off')
    expect(by.life).toMatchObject({ level: 'off', value: 2717, value2: 26 })
  })

  it('нет <PlayerStat> — «статы не посчитаны автором»', () => {
    expect(buildChecks(load('nostats-pobbin-crit').build)).toBeNull()
  })

  it('чек-лист: бандиты во 2 акте, лабиринт в 3-м, у эндгейма — пусто', () => {
    const { build, plan } = duelist
    expect(stageChecklist(build, plan, 1)).toEqual([{ id: 'bandit', bandit: 'None' }])
    expect(stageChecklist(build, plan, 2)).toContainEqual({ id: 'lab', lab: 'normal', level: 33 })
    const eg = load('pobbin-leveling-endgame-variants')
    const other = eg.plan.stages.findIndex((s) => !s.leveling)
    expect(stageChecklist(eg.build, eg.plan, other)).toEqual([])
  })
})

describe('строка билда в гиде прокачки', () => {
  it('камни квестов шага: награда — первой, вторая строка — только у того же NPC', () => {
    const { build, plan } = duelist
    const g = stageGems(build, plan, 0, gems, 'ru', 8)
    const quest = g.rows.find((r) => r.status === 'quest')!
    const lines = guideBuildLines(g, [quest.source!.questId], 'ru')
    expect(lines[0]).toMatchObject({ kind: 'quest', name: quest.name, npc: quest.source!.npcRu })
    expect(lines.length).toBeLessThanOrEqual(2)
    expect(lines.every((l) => l.npc === lines[0].npc)).toBe(true)
    expect(guideBuildLines(g, [], 'ru')).toEqual([])
    expect(guideBuildLines(g, ['a10q99'], 'ru')).toEqual([])
  })

  it('камни билда для «Кампании» — id предметов игры (ключи leveling.json), не ключи PoB', () => {
    const ids = buildGemGameIds(duelist.build, duelist.plan, gems)
    expect(ids.has('Metadata/Items/Gems/SkillGemLeapSlam')).toBe(true)
    expect([...ids].some((id) => id.includes('SupportGem'))).toBe(true)
    expect([...ids].some((id) => id.startsWith('Metadata/Items/Gems/SkillGemSupport'))).toBe(false)
  })
})
