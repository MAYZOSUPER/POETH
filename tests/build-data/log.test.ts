import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'
import { nodeById, nodeName, parseTreeData } from '@shared/build/data'
import type { TreeData } from '@shared/build/types'
import {
  BUILD_LOG_STRINGS,
  lastPassivesReport,
  parseBuildLog,
  parseBuildLogLine,
  parseBuildLogText,
  parseLevelingLine
} from '@shared/leveling/log'

// Строки Client.txt для вкладки «Билд» (S36). EN-строки вложения нод и очков — из настоящего журнала PoE1 3.29;
// RU — по текстам клиента (BackendErrors, ClientStrings), с живым RU-журналом не сверены.

const L = (time: string, text: string, tag = 'cffb0658') => `2026/07/26 ${time} 68950031 ${tag} [INFO Client 19012] ${text}`
const sys = (text: string) => L('03:40:05', `: ${text}`)
/** Строка как в игре: шаблон клиента с подстановками. */
const fill = (tpl: string, ...args: (string | number)[]) => tpl.replace(/\{(\d)\}/g, (_, i) => String(args[Number(i)]))

const tree = parseTreeData(JSON.parse(readFileSync(resolve(__dirname, '../../resources/data/poe1/build/tree.json'), 'utf8'))) as TreeData

describe('журнал: вложение и снятие пассивок', () => {
  it('EN-строки настоящего журнала: нода, мастерство, восхождение, id с «_» на конце', () => {
    expect(parseBuildLogLine(L('02:43:32', 'Successfully allocated passive skill id: attack_poison2349, name: Poison Chance', 'fb7ae327'))).toEqual({
      type: 'passive',
      allocated: true,
      id: 'attack_poison2349',
      name: 'Poison Chance',
      atlas: false
    })
    expect(parseBuildLogLine(L('03:15:42', "Successfully unallocated passive skill id: savant903, name: Thief's Craft", 'fb7ae2ca'))).toEqual({
      type: 'passive',
      allocated: false,
      id: 'savant903',
      name: "Thief's Craft",
      atlas: false
    })
    expect(parseBuildLogText('Successfully allocated passive skill id: AscendancyAssassin13, name: Critical Strike Chance, Elusive Effect')).toMatchObject({
      id: 'AscendancyAssassin13',
      name: 'Critical Strike Chance, Elusive Effect'
    })
    expect(parseBuildLogText('Successfully allocated passive skill id: flask_generic_notable2844_, name: Careful Conservationist')).toMatchObject({
      id: 'flask_generic_notable2844_'
    })
    expect(parseBuildLogText('Successfully unallocated passive skill id: mastery_poison199, name: Poison Mastery')).toMatchObject({
      allocated: false,
      id: 'mastery_poison199'
    })
  })

  it('ноды атласа помечены; RU-клиент: та же строка движка с русским именем (не сверено)', () => {
    expect(parseBuildLogText('Successfully allocated passive skill id: atlas_path_39, name: Item Quantity')).toMatchObject({ atlas: true })
    expect(parseBuildLogText('Successfully allocated passive skill id: life1415, name: Здоровье')).toEqual({
      type: 'passive',
      allocated: true,
      id: 'life1415',
      name: 'Здоровье',
      atlas: false
    })
  })

  it('id из журнала → нода дерева и имя на языке клиента; ноды не с дерева — null', () => {
    for (const [id, en, ru] of [
      ['attack_poison2349', 'Poison Chance', 'Шанс отравить'],
      ['savant903', "Thief's Craft", null],
      ['AscendancyAssassin7', 'Critical Strike Chance and Multiplier', null],
      ['mastery_poison199', 'Poison Mastery', 'Мастерство ядов'],
      ['damage_ailment_critical_keystone_2182', 'Perfect Agony', null]
    ] as const) {
      const n = nodeById(tree, id)!
      expect(n, id).not.toBeNull()
      expect(nodeName(n, 'en')).toBe(en)
      if (ru) expect(nodeName(n, 'ru')).toBe(ru)
    }
    expect(nodeById(tree, 'atlas_path_39')).toBeNull()
    expect(nodeById(tree, 'affliction_keystone_dragon_style')).toBeNull() // кластерный самоцвет
  })

  it('гид прокачки эти строки не разбирает (как раньше)', () => {
    expect(parseLevelingLine(L('02:43:32', 'Successfully allocated passive skill id: attack_poison2349, name: Poison Chance'))).toBeNull()
    expect(parseLevelingLine(sys('You have received a Passive Skill Point.'))).toBeNull()
  })

  it('место строки в журнале — как у гида', () => {
    expect(parseBuildLog(L('02:43:32', 'Successfully allocated passive skill id: life1415, name: Life'))).toEqual({
      event: { type: 'passive', allocated: true, id: 'life1415', name: 'Life', atlas: false },
      at: { ts: new Date(2026, 6, 26, 2, 43, 32).getTime(), up: 68950031 }
    })
    expect(parseBuildLog('мусор')).toBeNull()
  })
})

describe.each([
  ['EN', 'en'],
  ['RU', 'ru']
] as const)('журнал %s: очки, /passives, смерть', (_name, lang) => {
  const S = (id: keyof typeof BUILD_LOG_STRINGS, ...args: (string | number)[]) => sys(fill(BUILD_LOG_STRINGS[id][lang], ...args))

  it('очки пассивок и сброса', () => {
    expect(parseBuildLogLine(S('ReceivedPassivePoint1'))).toEqual({ type: 'passivePoints', delta: 1 })
    expect(parseBuildLogLine(S('ReceivedPassivePointN', 2))).toEqual({ type: 'passivePoints', delta: 2 })
    expect(parseBuildLogLine(S('LostPassivePoint1'))).toEqual({ type: 'passivePoints', delta: -1 })
    expect(parseBuildLogLine(S('LostPassivePointN', 3))).toEqual({ type: 'passivePoints', delta: -3 })
    expect(parseBuildLogLine(S('ReceivedRespecPoint1'))).toEqual({ type: 'respecPoints', delta: 1 })
    expect(parseBuildLogLine(S('ReceivedRespecPointN', 2))).toEqual({ type: 'respecPoints', delta: 2 })
  })

  it('вывод /passives и последний отчёт', () => {
    expect(parseBuildLogLine(S('PassiveInfoTotal', 31, 30))).toEqual({ type: 'passivesTotal', total: 31, allocated: 30 })
    expect(parseBuildLogLine(S('PassiveInfoQuest', 'Quest X', 0))).toEqual({ type: 'passivesQuest', quest: 'Quest X', points: 0 })
    const quest = lang === 'ru' ? 'Обитатель глубин' : 'The Dweller of the Deep'
    const lines = [
      S('PassiveInfoQuestTotal', 1), // старый вывод
      S('PassiveInfoQuest', quest, 1),
      L('03:41:00', 'Generating level 13 area "1_2_1" with seed 1'),
      S('PassiveInfoTotal', 31, 30),
      S('PassiveInfoAscendancy', 2, 2),
      S('PassiveInfoLevel', 27),
      S('PassiveInfoQuestTotal', 4),
      S('PassiveInfoQuest', quest, 1),
      S('PassiveInfoQuest', 'The Marooned Mariner', 1),
      S('PassiveInfoQuest', 'An End to Hunger', 2),
      S('PassiveInfoQuest', 'The Way Forward', 0),
      S('PassiveInfoAscendancySkills', 0)
    ]
    expect(lastPassivesReport(lines)).toEqual({
      total: 31,
      allocated: 30,
      fromLevel: 27,
      fromQuests: 4,
      quests: [
        { quest, points: 1 },
        { quest: 'The Marooned Mariner', points: 1 },
        { quest: 'An End to Hunger', points: 2 },
        { quest: 'The Way Forward', points: 0 }
      ],
      ascendancyTotal: 2,
      ascendancyAllocated: 2,
      fromAscendancy: 0
    })
    expect(lastPassivesReport([S('ReceivedPassivePoint1')])).toBeNull()
  })

  it('смерть: своя и в группе — по имени', () => {
    const [slain, who] = lang === 'ru' ? ['Героиня была повержена.', 'Героиня'] : ['Heroine has been slain.', 'Heroine']
    expect(parseBuildLogLine(sys(slain))).toEqual({ type: 'death', player: who })
    expect(parseBuildLogLine(S('PlayerSlain', 'Hero'))).toEqual({ type: 'death', player: 'Hero' })
  })
})

describe('журнал: что не разбираем', () => {
  it('очки атласа, PoE2 (наборы оружия), whisper и обрывки — не события билда', () => {
    expect(parseBuildLogLine(sys('You have received 2 Atlas Passive Respec Points.'))).toBeNull()
    expect(parseBuildLogLine(sys('Вы получили очков сброса пассивных умений Атласа: 2.'))).toBeNull()
    expect(parseBuildLogLine(sys('You have received a Weapon Set Passive Skill Point.'))).toBeNull()
    expect(parseBuildLogLine(sys('2/3 points from quests:'))).toBeNull()
    expect(parseBuildLogLine(L('03:40:05', '@From Buyer: You have received a Passive Skill Point.'))).toBeNull()
    expect(parseBuildLogLine(sys('abc total Passive Skill Points (1 allocated)'))).toBeNull()
    expect(parseBuildLogText('Successfully allocated passive skill id: , name: x')).toBeNull()
  })
})
