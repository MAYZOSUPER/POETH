// Модель билда S35 + этап → XML для движка PoB (S44; чистый модуль: main, tests/pob/stageXml.test.ts).
// Исходный код PoB мы не храним (builds.json — только модель), поэтому XML собирается заново: дерево, камни и набор
// вещей этапа (как вкладка «Билд» и «По гайду»), уровень персонажа, бандиты/пантеон, все опции конфигурации автора,
// части навыков и приспешники камней, варианты уников, татуировки (у билдов, сохранённых до S44, — только штраф
// сопротивлений и «враг — босс»: до «Обновить» урон считается без бафов и условий автора).
// Дерево — всегда последней версии из движка (в урезанный PoB входит только оно): ноды прошлых версий, которых нет,
// PoB пропустит сам.
// В слоты, где известен текст надетой вещи (окно цены, только в памяти), ставится она вместо вещи гайда.

import { POB_SLOTS, type PobBuild, type PobGem, type PobSkillGroup, type PobSlot } from './model'
import type { PobStagePlan } from './stages'
import { skillSections } from './stages'

export interface StageXmlOptions {
  /** версия дерева движка (`3_29`) */
  treeVersion: string
  /** уровень персонажа по журналу; null — уровень автора билда */
  level: number | null
  /** надетые вещи (EN-текст) по слотам — вместо вещей этапа */
  worn?: Partial<Record<PobSlot, string>>
  /** надетое оружие двуручное (или лук): вещь гайда во второй руке убирается, если её тоже не заменили */
  wornTwoHand?: boolean
}

export interface StageXml {
  xml: string
  /** чья вещь в слоте: надетая (из окна цены) или из набора этапа */
  slots: Partial<Record<PobSlot, 'worn' | 'build'>>
}

/**
 * Экранирование для атрибута и текста XML: только 5 именованных сущностей. Переводы строк — как есть (так пишет сам
 * PoB): его xml.lua знает только именованные сущности, а числовые (&#10;) выбрасывает.
 */
function esc(s: string, attr: boolean): string {
  // управляющие символы (кроме \t \n) в XML 1.0 недопустимы; \r — в \n
  let out = s
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  if (attr) out = out.replace(/"/g, '&quot;')
  return out
}

function tag(name: string, attrs: Record<string, string | number | boolean | null | undefined>, inner?: string): string {
  const a = Object.entries(attrs)
    .filter(([, v]) => v !== null && v !== undefined)
    .map(([k, v]) => ` ${k}="${esc(String(v), true)}"`)
    .join('')
  return inner === undefined ? `<${name}${a}/>` : `<${name}${a}>${inner}</${name}>`
}

function gemXml(g: PobGem): string {
  return tag('Gem', {
    nameSpec: g.nameSpec,
    gemId: g.gemId,
    skillId: g.skillId,
    variantId: g.variantId,
    level: g.level,
    quality: g.quality,
    enabled: g.enabled,
    count: g.count,
    ...(g.extra ?? {})
  })
}

function groupXml(g: PobSkillGroup): string {
  return tag(
    'Skill',
    {
      slot: g.slot,
      label: g.label,
      enabled: g.enabled,
      includeInFullDPS: g.includeInFullDPS,
      mainActiveSkill: g.mainActiveSkill ?? 1,
      source: g.source,
      groupCount: g.groupCount
    },
    g.gems.map(gemXml).join('')
  )
}

/** Группы камней этапа (набор + раздел) и номер главной группы (с 1) в них. */
function stageGroups(build: PobBuild, plan: PobStagePlan | null, index: number | null): { groups: PobSkillGroup[]; main: number } {
  const stage = plan && index !== null ? plan.stages[index] : undefined
  const skills = stage?.skills ?? { set: build.activeSkillSet, section: null }
  const set = build.skillSets[skills.set] ?? build.skillSets[build.activeSkillSet]
  if (!set) return { groups: [], main: 1 }
  let groups = set.groups
  let from = 0
  if (skills.section !== null) {
    const sec = skillSections(set)[skills.section]
    if (sec) {
      groups = set.groups.slice(sec.groupFrom, sec.groupTo)
      from = sec.groupFrom
    }
  }
  // главная группа: та, что у автора (mainSocketGroup), если попала в раздел; иначе первая включённая с камнями
  const authorMain = skills.set === build.activeSkillSet && build.mainSocketGroup ? build.mainSocketGroup - 1 - from : -1
  let main = authorMain >= 0 && authorMain < groups.length && groups[authorMain].gems.length ? authorMain : -1
  if (main < 0) main = groups.findIndex((g) => g.enabled && g.gems.some((x) => x.enabled))
  return { groups, main: main < 0 ? 1 : main + 1 }
}

const TIMELESS = /^(?:Timeless Jewel|Glorious Vanity|Lethal Pride|Brutal Restraint|Militant Faith|Elegant Hubris|Heroic Tragedy)$/m

/** Timeless-самоцвет (по базе или имени уника в тексте PoB). */
export function isTimeless(text: string | undefined): boolean {
  return !!text && TIMELESS.test(text)
}

/** XML этапа `index` (null — активные дерево, камни и вещи автора). */
export function stageXml(build: PobBuild, plan: PobStagePlan | null, index: number | null, o: StageXmlOptions): StageXml {
  const stage = plan && index !== null ? plan.stages[index] : undefined
  const spec = build.specs[stage?.spec ?? build.activeSpec] ?? build.specs[build.activeSpec]
  const itemSet = build.itemSets[stage?.items ?? build.activeItemSet] ?? build.itemSets[build.activeItemSet]
  const { groups, main } = stageGroups(build, plan, index)

  // предметы: набор этапа + самоцветы дерева этапа; надетые — новыми id после всех id билда
  const used = new Map<number, string>()
  const byId = new Map(build.items.map((i) => [i.id, i.text]))
  const extraById = new Map(build.items.map((i) => [i.id, i.extra]))
  const slots: Partial<Record<PobSlot, number>> = { ...(itemSet?.slots ?? {}) }
  const who: StageXml['slots'] = {}
  for (const s of POB_SLOTS) if (slots[s]) who[s] = 'build'
  let nextId = build.items.reduce((m, i) => Math.max(m, i.id), 0) + 1
  for (const s of POB_SLOTS) {
    const text = o.worn?.[s]
    if (!text) continue
    slots[s] = nextId
    used.set(nextId, text)
    who[s] = 'worn'
    nextId++
  }
  if (o.wornTwoHand && who['Weapon 1'] === 'worn' && who['Weapon 2'] !== 'worn') {
    delete slots['Weapon 2']
    delete who['Weapon 2']
  }
  const take = (id: number | undefined): void => {
    if (!id || used.has(id)) return
    const text = byId.get(id)
    if (text !== undefined) used.set(id, text)
  }
  for (const s of POB_SLOTS) take(slots[s])
  for (const x of itemSet?.otherSlots ?? []) take(x.itemId)
  // timeless-самоцветы в дереве не ставим: их данные (178 МБ) в урезанный PoB не входят — PoB не загрузил бы билд
  for (const x of spec?.sockets ?? []) if (!isTimeless(byId.get(x.itemId))) take(x.itemId)

  const level = o.level !== null && Number.isInteger(o.level) && o.level >= 1 && o.level <= 100 ? o.level : build.level

  const buildEl = tag('Build', {
    level,
    targetVersion: build.targetVersion || '3_0',
    className: build.className,
    ascendClassName: build.ascendClassName ?? 'None',
    bandit: build.bandit ?? 'None',
    pantheonMajorGod: build.pantheonMajor ?? 'None',
    pantheonMinorGod: build.pantheonMinor ?? 'None',
    mainSocketGroup: main,
    viewMode: 'ITEMS'
  })

  const specEl = spec
    ? tag(
        'Spec',
        {
          title: spec.title || 'POETH',
          treeVersion: o.treeVersion,
          classId: spec.classId,
          ascendClassId: spec.ascendClassId,
          secondaryAscendClassId: spec.secondaryAscendClassId,
          // формат хэшей кластерных нод — как у автора; нет — старый билд, PoB переведёт его сам
          clusterHashFormatVersion: spec.clusterHashFormat,
          nodes: spec.nodes.join(','),
          masteryEffects: spec.masteryEffects.map((m) => `{${m.node},${m.effect}}`).join(',')
        },
        tag('Sockets', {}, spec.sockets.filter((x) => used.has(x.itemId)).map((x) => tag('Socket', { nodeId: x.nodeId, itemId: x.itemId })).join('')) +
          (spec.overrides?.length ? tag('Overrides', {}, spec.overrides.map((x) => tag('Override', { nodeId: x.nodeId, dn: x.dn })).join('')) : '')
      )
    : ''

  const itemsXml = [...used.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([id, text]) => tag('Item', { id, ...(extraById.get(id) ?? {}) }, esc(text, false)))
    .join('')
  const slotXml = [
    // active — флакон включён в расчёт, как у автора
    ...POB_SLOTS.filter((s) => slots[s]).map((s) =>
      tag('Slot', { name: s, itemId: slots[s], active: who[s] === 'build' && itemSet?.active?.includes(s) ? true : undefined })
    ),
    ...(itemSet?.otherSlots ?? []).filter((x) => used.has(x.itemId)).map((x) => tag('Slot', { name: x.name, itemId: x.itemId }))
  ].join('')
  const setEl = tag('ItemSet', { id: 1, title: itemSet?.title || 'POETH', useSecondWeaponSet: false }, slotXml)

  const config = tag(
    'Config',
    {},
    // все опции автора (S44: бафы, заряды, условия — как у автора в PoB); у билдов до S44 — только штраф и «босс»
    build.config.options?.length
      ? build.config.options.map((x) => tag('Input', { name: x.name, number: x.number, string: x.string, boolean: x.boolean })).join('')
      : [
          tag('Input', { name: 'resistancePenalty', number: build.config.resistancePenalty }),
          build.config.enemyIsBoss ? tag('Input', { name: 'enemyIsBoss', string: build.config.enemyIsBoss }) : ''
        ].join('')
  )

  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    tag(
      'PathOfBuilding',
      {},
      buildEl +
        tag('Tree', { activeSpec: 1 }, specEl) +
        tag('Skills', { activeSkillSet: 1 }, tag('SkillSet', { id: 1, title: 'POETH' }, groups.map(groupXml).join(''))) +
        tag('Items', { activeItemSet: 1 }, itemsXml + setEl) +
        config
    )
  return { xml, slots: who }
}
