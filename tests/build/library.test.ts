import { describe, expect, it } from 'vitest'
import { importPobCode } from '@shared/pob/import'
import { inflateNode } from '@shared/advisor/codecNode'
import type { PobBuild } from '@shared/pob/model'
import {
  BUILDS_FORMAT,
  BUILDS_MAX,
  addBuild,
  buildFingerprint,
  cleanEdits,
  cleanPobBuild,
  cleanSource,
  emptyLibrary,
  mainSkill,
  openBuild,
  parseLibrary,
  removeBuild,
  setBuildEdits,
  sourceHost,
  stateOf
} from '@shared/build/library'
import { fixtureCode } from '../pob/fixtures'

// Библиотека билдов вкладки «Билд» (S39): userData/builds.json, проверка файла с диска, вставка, недавние.

function build(name: string): PobBuild {
  const res = importPobCode(fixtureCode(name), inflateNode)
  if (!res.ok) throw new Error(`${name}: ${res.error}`)
  return res.build
}

let n = 0
const newId = (): string => `id${String(++n).padStart(4, '0')}`
const LINK = { kind: 'link' as const, site: 'pobbin' as const, pageUrl: 'https://pobb.in/mgRsfu9CcuUO' }

describe('библиотека билдов', () => {
  it('новый билд — в начало и открыт; тот же код второй раз не плодит запись и сохраняет правки', () => {
    const a = build('pobbin-acts-all-axes')
    let lib = addBuild(emptyLibrary(), a, { kind: 'code' }, 1000, newId)
    expect(lib.builds).toHaveLength(1)
    expect(lib.active).toBe(lib.builds[0].id)
    const id = lib.builds[0].id
    lib = setBuildEdits(lib, id, { current: 'spec:2', stages: { 'spec:1': { from: 12 } } })
    lib = addBuild(lib, build('pobbin-acts-all-axes'), { kind: 'code' }, 2000, newId)
    expect(lib.builds).toHaveLength(1)
    expect(lib.builds[0].id).toBe(id)
    expect(lib.builds[0].edits).toEqual({ current: 'spec:2', stages: { 'spec:1': { from: 12 } } })
    expect(lib.builds[0].openedAt).toBe(2000)
  })

  it('та же ссылка — тот же билд (даже если автор поменял код)', () => {
    let lib = addBuild(emptyLibrary(), build('pobbin-crit'), LINK, 1, newId)
    lib = addBuild(lib, build('pobbin-guardian'), LINK, 2, newId)
    expect(lib.builds).toHaveLength(1)
    expect(lib.builds[0].build.ascendClassName).toBe('Guardian')
  })

  it('не больше BUILDS_MAX: уходит давно не открытый, открытый остаётся', () => {
    const b = build('pobbin-crit')
    let lib = emptyLibrary()
    for (let i = 0; i < BUILDS_MAX + 3; i++) {
      // разные «коды»: меняем заметки — другой отпечаток
      lib = addBuild(lib, { ...b, notes: `v${i}` }, { kind: 'code' }, 100 + i, newId)
    }
    const oldest = lib.builds[lib.builds.length - 1].id
    lib = openBuild(lib, oldest, 10)
    lib = addBuild(lib, { ...b, notes: 'last' }, { kind: 'code' }, 999, newId)
    expect(lib.builds).toHaveLength(BUILDS_MAX)
    expect(lib.builds.some((x) => x.id === oldest)).toBe(false)
    expect(lib.builds.some((x) => x.id === lib.active)).toBe(true)
  })

  it('открыть, закрыть (пустое состояние), убрать', () => {
    let lib = addBuild(emptyLibrary(), build('pobbin-crit'), { kind: 'code' }, 1, newId)
    const id = lib.builds[0].id
    lib = openBuild(lib, null, 2)
    expect(stateOf(lib).active).toBeNull()
    expect(stateOf(lib).recent).toHaveLength(1)
    lib = openBuild(lib, 'нет-такого', 3)
    expect(lib.active).toBeNull()
    lib = openBuild(lib, id, 4)
    expect(stateOf(lib).active?.id).toBe(id)
    lib = removeBuild(lib, id)
    expect(stateOf(lib)).toEqual({ active: null, recent: [] })
  })

  it('недавние: без модели, главный камень и класс', () => {
    const lib = addBuild(emptyLibrary(), build('pobbin-acts-all-axes'), LINK, 1, newId)
    const [r] = stateOf(lib).recent
    expect(r).not.toHaveProperty('build')
    expect(r.className).toBe('Duelist')
    expect(r.ascendClassName).toBe('Champion')
    // ключ PoB трансфигурированного камня (variantId), а не id предмета
    expect(r.mainGemId).toBe('Metadata/Items/Gems/SkillGemBoneshatterAltY')
    expect(r.source).toEqual(LINK)
    expect(sourceHost(r.source)).toBe('pobb.in/mgRsfu9CcuUO')
  })

  it('главный камень: mainSocketGroup и mainActiveSkill, иначе первый активный', () => {
    expect(mainSkill(build('pobbin-acts-level-gems')).name).toBe('Poisonous Concoction')
    // в коде gemId — id предмета (SkillGemChargedAttack), ключ PoB — SkillGemBladeFlurry
    expect(mainSkill(build('pobcodes-nightblade'))).toEqual({ name: 'Blade Flurry', gemId: 'Metadata/Items/Gems/SkillGemBladeFlurry' })
  })

  it('отпечаток: один код — один отпечаток, разные билды — разные', () => {
    expect(buildFingerprint(build('pobbin-crit'))).toBe(buildFingerprint(build('pobbin-crit')))
    expect(buildFingerprint(build('pobbin-crit'))).not.toBe(buildFingerprint(build('pobbin-guardian')))
  })
})

describe('builds.json с диска — недоверенные данные', () => {
  it('файл → библиотека → тот же файл (JSON туда и обратно)', () => {
    const lib = addBuild(emptyLibrary(), build('pobbin-acts-level-gems'), LINK, 5, newId)
    const back = parseLibrary(JSON.parse(JSON.stringify(lib)))
    expect(back).toEqual(lib)
  })

  it('мусор, чужой формат, битые записи — пусто или без них', () => {
    expect(parseLibrary(null)).toEqual(emptyLibrary())
    expect(parseLibrary({ v: 99, builds: [] })).toEqual(emptyLibrary())
    expect(parseLibrary('строка')).toEqual(emptyLibrary())
    const ok = addBuild(emptyLibrary(), build('pobbin-crit'), { kind: 'code' }, 1, newId)
    const raw = JSON.parse(JSON.stringify(ok))
    raw.builds.push({ id: '../../etc', build: raw.builds[0].build }, { id: 'goodid', build: { game: 'poe2' } }, 42)
    raw.active = 'чужой'
    const lib = parseLibrary(raw)
    expect(lib.builds.map((b) => b.id)).toEqual([ok.builds[0].id])
    expect(lib.active).toBeNull()
  })

  it('модель: типы и пределы проверяются, лишние поля и __proto__ отбрасываются', () => {
    const b = JSON.parse(JSON.stringify(build('pobbin-crit')))
    b.level = 'девяносто'
    b.specs[0].nodes = [1, 'x', -5, 2, 2, 3.5]
    b.stats = JSON.parse('{"Life": 100, "__proto__": 1, "bad key": 5, "Mana": "x"}')
    b.notes = 7
    b.extra = { evil: true }
    b.config = { resistancePenalty: -45 }
    const clean = cleanPobBuild(b)!
    expect(clean.level).toBe(1)
    expect(clean.specs[0].nodes).toEqual([1, 2])
    expect(clean.stats).toEqual({ Life: 100 })
    expect(Object.getPrototypeOf(clean.stats)).toBe(Object.prototype)
    expect(clean.notes).toBe('')
    expect(clean).not.toHaveProperty('extra')
    expect(clean.config.resistancePenalty).toBe(-60)
    expect(cleanPobBuild({ ...b, game: 'poe2' })).toBeNull()
  })

  it('источник: ссылка — только страница сайта из списка S35, иначе «код»', () => {
    expect(cleanSource(LINK)).toEqual(LINK)
    expect(cleanSource({ kind: 'link', pageUrl: 'https://evil.example/x' })).toEqual({ kind: 'code' })
    expect(cleanSource({ kind: 'link', pageUrl: 'javascript:alert(1)' })).toEqual({ kind: 'code' })
    expect(cleanSource({ kind: 'link', site: 'pobbin', pageUrl: 'https://pobb.in/abcd1234/raw' })).toEqual({
      kind: 'link',
      site: 'pobbin',
      pageUrl: 'https://pobb.in/abcd1234'
    })
  })

  it('правки этапов: только известные поля и простые значения', () => {
    expect(
      cleanEdits({
        current: 'spec:3',
        stages: {
          'spec:1': { from: 12, leveling: false, evil: 'x' },
          'skills:0:2': { skills: { set: 0, section: 1 }, items: null },
          'bad key': { from: 3 },
          'spec:2': { from: 'десять', leveling: 'нет' }
        }
      })
    ).toEqual({
      current: 'spec:3',
      stages: { 'spec:1': { from: 12, leveling: false }, 'skills:0:2': { skills: { set: 0, section: 1 }, items: null } }
    })
    expect(cleanEdits('мусор')).toEqual({})
    expect(BUILDS_FORMAT).toBe(1)
  })
})

describe('S59: билды из «Стартеров»', () => {
  const STARTER = { id: 'rf-chieftain', league: '3.30', changed: true }

  it('«Добавить в библиотеку» — в список, открытый не меняется; метка стартера и в недавних', () => {
    const mine = addBuild(emptyLibrary(), build('pobbin-crit'), { kind: 'code' }, 1000, newId)
    const lib = addBuild(mine, build('pobbin-acts-all-axes'), LINK, 2000, newId, { activate: false, starter: STARTER })
    expect(lib.active).toBe(mine.active)
    expect(lib.builds).toHaveLength(2)
    expect(lib.builds[0]).toMatchObject({ source: LINK, starter: STARTER })
    const st = stateOf(lib)
    expect(st.active?.id).toBe(mine.active)
    expect(st.recent.find((r) => r.id === lib.builds[0].id)?.starter).toBe('rf-chieftain')
    expect(st.recent.find((r) => r.id === mine.active)?.starter).toBeUndefined()
  })

  it('«Заменить» — стартер открыт, прежний билд остаётся в библиотеке', () => {
    const mine = addBuild(emptyLibrary(), build('pobbin-crit'), { kind: 'code' }, 1000, newId)
    const lib = addBuild(mine, build('pobbin-acts-all-axes'), LINK, 2000, newId, { starter: STARTER })
    expect(lib.active).toBe(lib.builds[0].id)
    expect(lib.builds.map((b) => b.id)).toContain(mine.active)
  })

  it('тот же стартер второй раз — та же запись, правки этапов сохраняются, метка обновляется', () => {
    let lib = addBuild(emptyLibrary(), build('pobbin-acts-all-axes'), LINK, 1000, newId, { starter: STARTER })
    const id = lib.builds[0].id
    lib = setBuildEdits(lib, id, { current: 'spec:3' })
    lib = addBuild(lib, build('pobbin-acts-all-axes'), LINK, 2000, newId, { starter: { ...STARTER, changed: false } })
    expect(lib.builds).toHaveLength(1)
    expect(lib.builds[0]).toMatchObject({ id, edits: { current: 'spec:3' }, starter: { changed: false } })
  })

  it('метка стартера с диска — проверяется; битая отбрасывается, билд остаётся', () => {
    const lib = addBuild(emptyLibrary(), build('pobbin-crit'), LINK, 5, newId, { starter: STARTER })
    expect(parseLibrary(JSON.parse(JSON.stringify(lib)))).toEqual(lib)
    const raw = JSON.parse(JSON.stringify(lib))
    raw.builds[0].starter = { id: 'https://evil.example', league: '3.30', changed: 'yes' }
    const back = parseLibrary(raw)
    expect(back.builds).toHaveLength(1)
    expect(back.builds[0]).not.toHaveProperty('starter')
    raw.builds[0].starter = { id: 'ok-id', league: '3.30', changed: 'yes', extra: 1 }
    expect(parseLibrary(raw).builds[0].starter).toEqual({ id: 'ok-id', league: '3.30', changed: false })
  })
})
