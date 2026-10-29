import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'
import type { LevelingData, LvPart } from '@shared/types/leveling'
import { DEFAULT_VARIANT, flattenRoute } from '@shared/leveling/route'
import { areaName, isPlainName, labName, nameOf, plainText, questName, renderParts } from '@shared/leveling/render'
import { parseLevelingLine } from '@shared/leveling/log'
import { baseClass } from '@shared/leveling/classes'
import { detectedFromLog, resolveGameLang } from '@shared/gameLang'

// Имена в гиде прокачки на языке клиента игры (S31): текст шага — на языке интерфейса, имена зон, квестов,
// боссов, NPC, предметов, арен и лабиринтов — как в игре (Settings.gameLang). Четыре сочетания интерфейс × клиент
// на настоящих данных (resources/data/poe1/leveling/leveling.json, имена — из таблиц клиента 3.29) и журналы игры
// EN/RU: зона по `Generating level` и уровень по строкам обоих языков работают при любом сочетании.

const data = JSON.parse(readFileSync(path.join(__dirname, '../../resources/data/poe1/leveling/leveling.json'), 'utf8')) as LevelingData
const flat = flattenRoute(data, DEFAULT_VARIANT)
const step = (id: string): LvPart[] => {
  for (const s of data.sections) for (const st of s.steps) if (st.id === id) return st.parts
  throw new Error(`нет шага ${id}`)
}
const text = (id: string, ui: 'ru' | 'en', game: 'ru' | 'en'): string => plainText(renderParts(step(id), data, ui, game))

type Lang = 'ru' | 'en'
const COMBOS: [Lang, Lang][] = [
  ['ru', 'ru'],
  ['ru', 'en'],
  ['en', 'ru'],
  ['en', 'en']
]

describe('шаг гида: интерфейс × клиент', () => {
  const expected: Record<string, Record<`${Lang}/${Lang}`, string>> = {
    // босс
    'a1-001': {
      'ru/ru': 'Найдите и убейте Хиллок',
      'ru/en': 'Найдите и убейте Hillock',
      'en/ru': 'Find and kill Хиллок',
      'en/en': 'Find and kill Hillock'
    },
    // город
    'a1-002': {
      'ru/ru': '➞ Застава Львиного глаза',
      'ru/en': "➞ Lioneye's Watch",
      'en/ru': '➞ Застава Львиного глаза',
      'en/en': "➞ Lioneye's Watch"
    },
    // квест
    'a1-003': {
      'ru/ru': 'Сдайте Враг у ворот',
      'ru/en': 'Сдайте Enemy at the Gate',
      'en/ru': 'Hand in Враг у ворот',
      'en/en': 'Hand in Enemy at the Gate'
    },
    // описание («лодку» — нет в клиенте) — на языке интерфейса, зона — на языке клиента
    'a1-020': {
      'ru/ru': 'Возьмите лодку ➞ Сырой проход',
      'ru/en': 'Возьмите лодку ➞ The Submerged Passage',
      'en/ru': 'Take the Boat ➞ Сырой проход',
      'en/en': 'Take the Boat ➞ The Submerged Passage'
    },
    // предмет квеста и объект с надписью: имена клиента («Волшебная печать», не наш «тауметическая»)
    'a2-046': {
      'ru/ru': 'Заберите Волшебный символ, активируйте Волшебная печать',
      'ru/en': 'Заберите Thaumetic Emblem, активируйте Thaumetic Seal',
      'en/ru': 'Take Волшебный символ, activate Волшебная печать',
      'en/en': 'Take Thaumetic Emblem, activate Thaumetic Seal'
    }
  }
  for (const [id, byCombo] of Object.entries(expected)) {
    it.each(COMBOS)(`${id}: интерфейс %s, клиент %s`, (ui, game) => {
      expect(text(id, ui, game)).toBe(byCombo[`${ui}/${game}`])
    })
  }

  it('без языка клиента — как интерфейс (старые вызовы)', () => {
    expect(plainText(renderParts(step('a1-001'), data, 'ru'))).toBe('Найдите и убейте Хиллок')
    expect(plainText(renderParts(step('a1-001'), data, 'en'))).toBe('Find and kill Hillock')
  })

  it('NPC: «Lilly Roth» внутри русского текста — EN-клиент, «Лилия Рот» в английском — RU-клиент', () => {
    const talk = flat.find((f) => f.step.parts.some((p) => typeof p === 'object' && 'k' in p && p.k === 'generic' && p.v === 'Lilly Roth'))
    expect(talk).toBeTruthy()
    const ruEn = plainText(renderParts(talk!.step.parts, data, 'ru', 'en'))
    expect(ruEn).toContain('Lilly Roth')
    expect(ruEn).not.toContain('Лилия')
    expect(plainText(renderParts(talk!.step.parts, data, 'en', 'ru'))).toContain('Лилия Рот')
    expect(nameOf(data, 'Tarkleigh', 'ru')).toBe('Таркли')
    expect(nameOf(data, 'Tarkleigh', 'en')).toBe('Tarkleigh')
  })

  it('лабиринт: имя как в клиенте, «восхождение» — на языке интерфейса', () => {
    const asc = flat.find((f) => f.step.parts.some((p) => typeof p === 'object' && 'k' in p && p.k === 'ascend' && p.v === 'normal'))
    expect(asc).toBeTruthy()
    const segs = (ui: Lang, game: Lang) => renderParts(asc!.step.parts, data, ui, game).find((s) => s.kind === 'lab')?.text
    expect(segs('ru', 'en')).toBe('The Labyrinth — восхождение')
    expect(segs('en', 'ru')).toBe('Лабиринт — ascend')
    expect(labName(data, 'merciless', 'ru')).toBe('Безжалостный Лабиринт')
  })

  it('подсказка под шагом: наш текст, имя предмета — как в клиенте', () => {
    const f = flat.find((x) => x.step.sub?.some((s) => s.en.some((p) => typeof p === 'object' && 'v' in p && p.v === 'Quicksilver Flask')))
    expect(f).toBeTruthy()
    const sub = f!.step.sub!.find((s) => s.en.some((p) => typeof p === 'object' && 'v' in p && p.v === 'Quicksilver Flask'))!
    expect(plainText(renderParts(sub.ru, data, 'ru', 'en'))).toBe('Часто выпадает Quicksilver Flask')
    expect(plainText(renderParts(sub.en, data, 'en', 'ru'))).toBe('High chance for Ртутный флакон')
  })
})

describe('данные: имена из клиента игры', () => {
  const frags = new Set<string>()
  for (const s of data.sections)
    for (const st of s.steps)
      for (const p of [...st.parts, ...(st.sub ?? []).flatMap((x) => [...x.en, ...x.ru])])
        if (typeof p === 'object' && 'k' in p && (p.k === 'kill' || p.k === 'arena' || p.k === 'generic' || p.k === 'qtext')) frags.add(p.v)

  it('у каждого имени маршрута есть RU, у имён из игры — без разметки падежей клиента', () => {
    for (const en of frags) expect(data.names[en], en).toBeTruthy()
    for (const [en, ru] of Object.entries(data.names)) {
      expect(ru, en).not.toMatch(/[<>{}]/)
      if (!isPlainName(data, en) && en !== '/passives') expect(ru, en).toMatch(/[А-Яа-яЁё]/)
    }
    for (const a of Object.values(data.areas)) expect(a.ru, a.en).toMatch(/^[^<>{}]*[А-Яа-яЁё][^<>{}]*$/)
    for (const q of Object.values(data.quests)) expect(q.ru, q.en).toMatch(/[А-Яа-яЁё]/)
  })

  it('описаний не из игры немного, и это не имена с надписью в игре', () => {
    expect(data.plain).toEqual(expect.arrayContaining(['Boat', 'Everything', 'Glyph']))
    expect(data.plain!.length).toBeLessThanOrEqual(20)
    for (const en of ['Hillock', 'Thaumetic Seal', 'Map Device', 'Den of Despair', 'Tarkleigh', 'Nessa']) expect(isPlainName(data, en), en).toBe(false)
  })

  it('имена как в русском клиенте, а не наш перевод', () => {
    expect(data.names['Den of Despair']).toBe('Берлога отчаяния')
    expect(data.names['Map Device']).toBe('Машина картоходца')
    expect(data.names['Thaumetic Seal']).toBe('Волшебная печать')
    expect(data.names["The Brine King's Throne"]).toBe('Трон Морского царя')
    expect(data.areas['2_8_14'].ru).toBe('Скрытое подполье')
    expect(areaName(data, '1_1_2', 'ru')).toBe('Побережье')
    expect(areaName(data, '1_1_2', 'en')).toBe('The Coast')
    expect(questName(data, 'a1q1', 'en')).toBe('Enemy at the Gate')
  })
})

describe.each([['en'], ['ru']] as const)('журнал игры %s', (client) => {
  const ts = '2026/10/29 20:00:01 123456 1186a8a3'
  const lines =
    client === 'en'
      ? [
          `${ts} [DEBUG Client 4242] Generating level 2 area "1_1_2" with seed 7`,
          `${ts} [INFO Client 4242] : You have entered The Coast.`,
          `${ts} [INFO Client 4242] : Hero (Juggernaut) is now level 34`
        ]
      : [
          `${ts} [DEBUG Client 4242] Generating level 2 area "1_1_2" with seed 7`,
          `${ts} [INFO Client 4242] : Вы вошли в область Побережье.`,
          `${ts} [INFO Client 4242] : Hero (Покоритель) достигает 34 уровня`
        ]

  it('зона — по id, без языка; уровень и класс восхождения — по строке своего языка', () => {
    expect(parseLevelingLine(lines[0])).toEqual({ type: 'zone', areaId: '1_1_2', level: 2 })
    // «You have entered» / «Вы вошли в область» гиду не нужна: зона уже пришла строкой Generating level
    expect(parseLevelingLine(lines[1])).toBeNull()
    const up = parseLevelingLine(lines[2])
    expect(up).toMatchObject({ type: 'level', character: 'Hero', level: 34 })
    expect(baseClass(up && up.type === 'level' ? up.className : null, data.classes)).toBe('Marauder')
  })

  it.each([['ru'], ['en']] as const)('интерфейс %s: язык клиента узнан по журналу — зона на нём', (ui) => {
    const detected = detectedFromLog(lines, 0)
    expect(detected?.lang).toBe(client)
    const game = resolveGameLang({ choice: 'auto', detected }, ui).lang
    expect(game).toBe(client)
    const ev = parseLevelingLine(lines[0])
    expect(areaName(data, ev && ev.type === 'zone' ? ev.areaId : '', game)).toBe(client === 'en' ? 'The Coast' : 'Побережье')
  })
})

describe('классы из журнала: базовые и восхождения EN/RU — как в клиенте', () => {
  it.each([
    ['Witch', 'Witch'],
    ['Ведьма', 'Witch'],
    ['Necromancer', 'Witch'],
    ['Некромант', 'Witch'],
    ['Маг стихий', 'Witch'],
    ['Снайпер', 'Ranger'],
    ['Следопыт', 'Ranger'],
    ['Хранитель', 'Ranger'],
    ['Плут', 'Shadow'],
    ['Вознесшаяся', 'Scion'],
    ['Иерофант', 'Templar']
  ])('%s → %s', (name, base) => {
    expect(baseClass(name, data.classes)).toBe(base)
  })
  it('без таблицы — запасные EN-классы восхождения и RU базовые', () => {
    expect(baseClass('Juggernaut')).toBe('Marauder')
    expect(baseClass('Дикарь')).toBe('Marauder')
    expect(baseClass('Покоритель')).toBeNull()
  })
})
