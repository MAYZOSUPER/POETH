import { describe, expect, it } from 'vitest'
import { checkArchiveNames, filterPathPattern, isSafeEntryName, pickFilterEntry } from '@shared/lootFilter/archive'
import { LEVELS, STYLES, isLevel, isStyle, levelWhen } from '@shared/lootFilter/levels'
import { ROOT, releaseEntries } from './zipFixture'

// S53: выбор файла из архива релиза NeverSink — только один .filter нужного уровня и стиля, без обхода путей.

const names = releaseEntries().map((e) => e.name)

describe('isSafeEntryName', () => {
  it('пропускает имена архива GitHub', () => {
    for (const n of names) expect(isSafeEntryName(n), n).toBe(true)
  })

  it.each([
    ['../evil.filter'],
    [`${ROOT}/../evil.filter`],
    [`${ROOT}/a/../../evil.filter`],
    ['/etc/passwd'],
    ['C:/Windows/evil.filter'],
    [`${ROOT}\\..\\evil.filter`],
    [`${ROOT}/./x.filter`],
    [`${ROOT}//x.filter`],
    [`${ROOT}/x.filter:stream`],
    [`${ROOT}/x\u0000.filter`],
    [`${ROOT}/x\n.filter`],
    [`${ROOT}/x.filter.`],
    [`${ROOT}/x.filter `],
    [`${ROOT}/ x.filter`],
    [`${ROOT}/x?.filter`],
    [''],
    ['a'.repeat(401)]
  ])('отвергает %j', (n) => {
    expect(isSafeEntryName(n)).toBe(false)
  })
})

describe('checkArchiveNames', () => {
  it('одна корневая папка — ок', () => {
    expect(checkArchiveNames(names)).toEqual({ ok: true, root: ROOT })
  })
  it('вторая корневая папка — отказ', () => {
    expect(checkArchiveNames([...names, 'other/x.filter']).ok).toBe(false)
  })
  it('файл в корне архива — отказ', () => {
    expect(checkArchiveNames([...names, 'x.filter']).ok).toBe(false)
  })
  it('одно опасное имя — отказ всего архива', () => {
    expect(checkArchiveNames([...names, `${ROOT}/../x.filter`])).toMatchObject({ ok: false, bad: `${ROOT}/../x.filter` })
  })
  it('пустой архив — отказ', () => {
    expect(checkArchiveNames([]).ok).toBe(false)
  })
})

describe('pickFilterEntry', () => {
  it('каждый уровень стиля по умолчанию — файл в корне', () => {
    for (const d of LEVELS) {
      const r = pickFilterEntry(names, d.level, 'default')
      expect(r).toEqual({ ok: true, entry: `${ROOT}/NeverSink's filter - ${d.code}.filter`, repoPath: `NeverSink's filter - ${d.code}.filter` })
    }
  })

  it('стиль — файл из папки (STYLE), регистр не важен', () => {
    const r = pickFilterEntry(names, 2, 'abyss')
    expect(r).toEqual({
      ok: true,
      entry: `${ROOT}/(STYLE) ABYSS/NeverSink's filter - 2-SEMI-STRICT (abyss) .filter`,
      repoPath: "(STYLE) ABYSS/NeverSink's filter - 2-SEMI-STRICT (abyss) .filter"
    })
  })

  it('стиля нет в архиве — not-in-archive', () => {
    expect(pickFilterEntry(names, 1, 'vaal')).toEqual({ ok: false, error: 'not-in-archive' })
  })

  it('архив с обходом пути — bad-archive, даже если нужный файл есть', () => {
    expect(pickFilterEntry([...names, `${ROOT}/../../Documents/x.filter`], 1, 'default')).toEqual({ ok: false, error: 'bad-archive' })
  })

  it('два кандидата — bad-archive', () => {
    const dup = [...names, `${ROOT}/(STYLE) abyss/NeverSink's filter - 1-REGULAR (abyss).filter`]
    expect(pickFilterEntry(dup, 1, 'abyss')).toEqual({ ok: false, error: 'bad-archive' })
  })

  it('папка с именем фильтра — не файл', () => {
    const onlyDir = [`${ROOT}/`, `${ROOT}/NeverSink's filter - 1-REGULAR.filter/`]
    expect(pickFilterEntry(onlyDir, 1, 'default')).toEqual({ ok: false, error: 'not-in-archive' })
  })

  it('похожие имена не путаются: SOFT ≠ SEMI-STRICT, STRICT ≠ VERY-STRICT', () => {
    expect(filterPathPattern(3, 'default').test("NeverSink's filter - 4-VERY-STRICT.filter")).toBe(false)
    expect(filterPathPattern(3, 'default').test("NeverSink's filter - 3-STRICT.filter")).toBe(true)
    expect(filterPathPattern(5, 'default').test("NeverSink's filter - 6-UBER-PLUS-STRICT.filter")).toBe(false)
  })

  it('не берёт файлы вне корня репозитория и чужие .filter (TROLLFILTER)', () => {
    const r = pickFilterEntry(names, 1, 'default')
    expect(r.ok && r.entry.includes('ADDITIONAL-FILES')).toBe(false)
  })
})

describe('уровни и стили', () => {
  it('7 уровней 0–6 по порядку', () => {
    expect(LEVELS.map((l) => l.level)).toEqual([0, 1, 2, 3, 4, 5, 6])
    expect(isLevel(6)).toBe(true)
    expect(isLevel(7)).toBe(false)
    expect(isLevel(1.5)).toBe(false)
    expect(isLevel('1')).toBe(false)
  })
  it('CustomSounds нет среди стилей (нужны mp3)', () => {
    expect(STYLES.some((s) => s.dir === 'CUSTOMSOUNDS')).toBe(false)
    expect(isStyle('customsounds')).toBe(false)
    expect(isStyle('abyss')).toBe(true)
  })
  it('подсказки «когда брать»: 0–1 — начало лиги, 2 — карты', () => {
    expect([0, 1, 2, 3, 4, 5, 6].map((l) => levelWhen(l as 0))).toEqual(['start', 'start', 'maps', 'late', 'expert', 'expert', 'expert'])
  })
})
