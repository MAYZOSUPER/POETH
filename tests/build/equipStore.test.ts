import { describe, expect, it } from 'vitest'
import { emptyNumbers } from '@shared/build/equipCompare'
import {
  EQUIP_SETS_MAX,
  EQUIPPED_FORMAT,
  cleanEntry,
  cleanItem,
  emptyEquipFile,
  equipStateOf,
  forgetEquip,
  parseEquipFile,
  putEquip,
  setMine,
  type EquipFile
} from '@shared/build/equipCompareStore'
import type { EquipItem, EquipKind } from '@shared/types/equip'

// S41: userData/equipped.json — только числа и короткие поля, проверка при чтении (как cleanStored/cleanEdits S39).

function item(kind: EquipKind, life = 10, extra: Partial<EquipItem> = {}): EquipItem {
  return {
    kind,
    rarity: 'rare',
    name: null,
    base: 'Coral Ring',
    n: { ...emptyNumbers(), life },
    req: { level: 1, str: 0, dex: 0, int: 0 },
    flask: null,
    ...extra
  }
}

const flask = { type: 'life', life: 2000, mana: 0, duration: 3, use: 15, charges: 45, quality: 20 } as const

describe('equipped.json: чистка при чтении', () => {
  it('мусор, чужой формат, не объект — пустой файл', () => {
    for (const raw of [null, 5, 'x', [], { v: 2, sets: [] }, { sets: [] }]) expect(parseEquipFile(raw)).toEqual(emptyEquipFile())
  })

  it('запись: слот под вид вещи, известные поля, пределы чисел', () => {
    const ok = cleanEntry({ ...item('ring'), slot: 'Ring 2', at: 123 })
    expect(ok).toMatchObject({ slot: 'Ring 2', kind: 'ring', base: 'Coral Ring', at: 123 })
    // кольцо в слот шлема, неизвестный слот, Swap, без времени — нет
    expect(cleanEntry({ ...item('ring'), slot: 'Helmet', at: 1 })).toBeNull()
    expect(cleanEntry({ ...item('ring'), slot: 'Ring 3', at: 1 })).toBeNull()
    expect(cleanEntry({ ...item('weapon1h'), slot: 'Weapon 1 Swap', at: 1 })).toBeNull()
    expect(cleanEntry({ ...item('ring'), slot: 'Ring 1' })).toBeNull()
    expect(cleanEntry({ ...item('jewel'), slot: 'Jewel 13', at: 1 })).toBeNull()
    expect(cleanEntry({ ...item('jewel'), slot: 'Jewel 12', at: 1 })).not.toBeNull()
    // сложный предмет не запоминается
    expect(cleanItem(item('complex'))).toBeNull()
    // флакон — только с числами флакона
    expect(cleanItem(item('flask'))).toBeNull()
    expect(cleanItem(item('flask', 0, { flask: { ...flask } }))?.flask).toEqual(flask)
    // числа вне пределов и не числа — 0
    const n = cleanItem({ ...item('ring'), n: { life: 1e9, es: 'x', res: { fire: 45, cold: Infinity }, attr: { str: -5 }, pdps: -1, caster: 'yes' } })!.n
    expect(n).toMatchObject({ life: 0, es: 0, res: { fire: 45, cold: 0 }, attr: { str: -5 }, pdps: 0, caster: false })
  })

  it('только короткие поля: текста предмета, имени редкой вещи и лишних полей нет', () => {
    const raw = {
      ...item('ring'),
      slot: 'Ring 1',
      at: 5,
      name: 'Драконьи узы',
      rawText: 'Item Class: Rings\nRarity: Rare\n…',
      text: 'x'.repeat(10000),
      base: 'Coral Ring'
    }
    const e = cleanEntry(raw)!
    expect(Object.keys(e).sort()).toEqual(['at', 'base', 'flask', 'kind', 'n', 'name', 'rarity', 'req', 'slot'])
    expect(e.name).toBeNull()
    // имя уника — EN-ключ, без управляющих символов и не длиннее 100
    expect(cleanItem({ ...item('amulet'), rarity: 'unique', name: "Atziri's Acuity" })!.name).toBe("Atziri's Acuity")
    expect(cleanItem({ ...item('amulet'), rarity: 'unique', name: 'Mjölner' })!.name).toBe('Mjölner')
    expect(cleanItem({ ...item('amulet'), rarity: 'unique', name: 'Bad\u0007' })!.name).toBeNull()
    expect(cleanItem({ ...item('ring'), base: 'x'.repeat(101) })).toBeNull()
    expect(cleanItem({ ...item('ring'), base: '' })).toBeNull()
  })

  it('__proto__ из JSON ничего не портит', () => {
    const raw = JSON.parse(
      `{"v":${EQUIPPED_FORMAT},"__proto__":{"polluted":1},"sets":[{"char":"Hero","usedAt":1,"__proto__":{"polluted":2},` +
        `"items":[{"slot":"Ring 1","kind":"ring","rarity":"rare","name":null,"base":"Coral Ring","at":1,` +
        `"n":{"life":10,"__proto__":{"polluted":3},"res":{"__proto__":{"polluted":4},"fire":30},"attr":{}},"req":{"__proto__":{"level":99}}}],` +
        `"mine":{"res":{"__proto__":{"polluted":5},"fire":75},"at":1}},{"char":"__proto__","items":[],"usedAt":1}]}`
    )
    const file = parseEquipFile(raw)
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    const set = file.sets.find((s) => s.char === 'Hero')!
    expect(set.items[0].n.res).toEqual({ fire: 30, cold: 0, lightning: 0, chaos: 0 })
    expect(set.items[0].req).toEqual({ level: 0, str: 0, dex: 0, int: 0 })
    expect(Object.getPrototypeOf(set.items[0].n.res)).toBe(Object.prototype)
    expect(set.mine).toEqual({ res: { fire: 75 }, at: 1 })
    // имя персонажа «__proto__» — просто строка в списке, не ключ объекта
    for (const s of file.sets) expect(Object.getPrototypeOf(s)).toBe(Object.prototype)
  })

  it('лимиты: наборов не больше EQUIP_SETS_MAX (уходят давно не входившие), записей — по слоту одна', () => {
    const sets = Array.from({ length: EQUIP_SETS_MAX + 5 }, (_, i) => ({ char: `Char${i}`, usedAt: i + 1, items: [], mine: null }))
    const file = parseEquipFile({ v: EQUIPPED_FORMAT, sets })
    expect(file.sets).toHaveLength(EQUIP_SETS_MAX)
    expect(file.sets.some((s) => s.char === 'Char0')).toBe(false)
    const dup = parseEquipFile({
      v: EQUIPPED_FORMAT,
      sets: [{ char: null, usedAt: 1, items: [{ ...item('ring', 1), slot: 'Ring 1', at: 1 }, { ...item('ring', 2), slot: 'Ring 1', at: 2 }] }]
    })
    expect(dup.sets[0].items).toHaveLength(1)
    // имя персонажа: буквы, цифры, «_», до 32
    expect(parseEquipFile({ v: EQUIPPED_FORMAT, sets: [{ char: 'a b', items: [] }, { char: 'x'.repeat(33), items: [] }] }).sets).toEqual([])
  })

  it('в файле двуручное и щит одновременно — остаётся запомненное позже', () => {
    const file = parseEquipFile({
      v: EQUIPPED_FORMAT,
      sets: [{ char: null, usedAt: 1, items: [{ ...item('weapon2h'), slot: 'Weapon 1', at: 5 }, { ...item('shield'), slot: 'Weapon 2', at: 3 }] }]
    })
    expect(file.sets[0].items.map((e) => e.slot)).toEqual(['Weapon 1'])
  })
})

describe('equipped.json: изменения', () => {
  const put = (f: EquipFile, slot: string, it: EquipItem, now = 10, char: string | null = 'Hero'): EquipFile => putEquip(f, char, slot, it, now)

  it('запомнить и забыть; наборы по персонажам и «без персонажа»', () => {
    let f = put(emptyEquipFile(), 'Ring 1', item('ring', 30))
    f = put(f, 'Ring 2', item('ring', 40), 11, null)
    expect(equipStateOf(f, 'Hero', 70)).toMatchObject({ on: true, character: 'Hero', level: 70 })
    expect(equipStateOf(f, 'Hero', 70).items.map((e) => e.slot)).toEqual(['Ring 1'])
    expect(equipStateOf(f, null, null).items.map((e) => e.slot)).toEqual(['Ring 2'])
    expect(equipStateOf(f, 'Other', 1).items).toEqual([])
    f = forgetEquip(f, 'Hero', 'Ring 1', 12)
    expect(equipStateOf(f, 'Hero', 1).items).toEqual([])
    // чужой слот, неверная форма — без изменений
    expect(forgetEquip(f, 'Hero', 'Nope', 13)).toBe(f)
    expect(put(f, 'Helmet', item('ring'))).toBe(f)
    expect(put(f, 'Ring 1', { kind: 'ring' } as EquipItem)).toBe(f)
  })

  it('время записи ставит main, а не окно', () => {
    const f = putEquip(emptyEquipFile(), null, 'Ring 1', { ...item('ring'), at: 1 }, 777)
    expect(f.sets[0].items[0].at).toBe(777)
  })

  it('та же вещь в другом слоте переезжает', () => {
    let f = put(emptyEquipFile(), 'Ring 1', item('ring', 30))
    f = put(f, 'Ring 2', item('ring', 30), 11)
    expect(equipStateOf(f, 'Hero', 1).items.map((e) => e.slot)).toEqual(['Ring 2'])
  })

  it('руки: двуручное снимает щит, лук оставляет колчан, щит снимает двуручное', () => {
    let f = put(emptyEquipFile(), 'Weapon 1', item('weapon1h'), 1)
    f = put(f, 'Weapon 2', item('shield'), 2)
    f = put(f, 'Weapon 1', item('weapon2h'), 3)
    expect(equipStateOf(f, 'Hero', 1).items.map((e) => e.kind)).toEqual(['weapon2h'])
    f = put(f, 'Weapon 2', item('shield', 5), 4)
    expect(equipStateOf(f, 'Hero', 1).items.map((e) => e.kind)).toEqual(['shield'])
    let g = put(emptyEquipFile(), 'Weapon 2', item('quiver'), 1)
    g = put(g, 'Weapon 1', item('bow'), 2)
    expect(equipStateOf(g, 'Hero', 1).items.map((e) => e.kind).sort()).toEqual(['bow', 'quiver'])
    g = put(g, 'Weapon 1', item('weapon1h'), 3)
    expect(equipStateOf(g, 'Hero', 1).items.map((e) => e.kind)).toEqual(['weapon1h'])
  })

  it('«мои сопротивления»: числа в пределах, null — убрать, мусор — без изменений', () => {
    let f = setMine(emptyEquipFile(), 'Hero', { res: { fire: 75, cold: '50', lightning: 999, chaos: -30 } }, 5)
    expect(equipStateOf(f, 'Hero', 1).mine).toEqual({ res: { fire: 75, chaos: -30 }, at: 5 })
    expect(setMine(f, 'Hero', { res: { fire: 'x' } }, 6)).toBe(f)
    f = setMine(f, 'Hero', null, 7)
    expect(equipStateOf(f, 'Hero', 1).mine).toBeNull()
  })

  it('файл после изменений читается обратно тем же', () => {
    let f = put(emptyEquipFile(), 'Ring 1', item('ring', 30))
    f = put(f, 'Flask 1', item('flask', 0, { base: 'Divine Life Flask', flask: { ...flask } }), 11)
    f = setMine(f, 'Hero', { res: { fire: 60 } }, 12)
    expect(parseEquipFile(JSON.parse(JSON.stringify(f)))).toEqual(f)
  })
})
