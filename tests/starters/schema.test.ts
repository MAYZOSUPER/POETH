import { describe, expect, it } from 'vitest'
import {
  STARTER_LIMITS,
  comparePatch,
  isNewerSchema,
  patchOf,
  validateIndex,
  validateStarter,
  validateStartersFile
} from '@shared/starters/schema'
import { readFix, record } from './fixtures'

// Строгий валидатор записи стартера (S59, ST1): недоверенные данные из пакета данных.

const bad = (patch: Record<string, unknown>): string => {
  const r = validateStarter(record(patch))
  return r.ok ? 'ok' : r.error
}

describe('стартер: хорошая запись', () => {
  it('проходит целиком, без отброшенных полей', () => {
    const r = validateStarter(record())
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.dropped).toEqual([])
    expect(r.value).toMatchObject({ id: 'test-champion-boneshatter', class: 'Duelist', ascendancy: 'Champion', pick: true, lang: 'ru' })
    expect(r.value.tags.modes).toEqual(['sc', 'hc', 'ssf'])
  })

  it('необязательные: modes и content по умолчанию пусты, note и checked — null', () => {
    const rec = record({ pick: false, note: undefined, checked: undefined })
    delete (rec.tags as unknown as Record<string, unknown>).modes
    delete (rec.tags as unknown as Record<string, unknown>).content
    const r = validateStarter(rec)
    expect(r.ok && r.value).toMatchObject({ note: null, checked: null, tags: { modes: [], content: [] } })
  })

  it('порядок режимов — как в схеме, повтор — ошибка', () => {
    const r = validateStarter(record({ tags: { ...record().tags, modes: ['ssf', 'sc'] } }))
    expect(r.ok && r.value.tags.modes).toEqual(['sc', 'ssf'])
    expect(bad({ tags: { ...record().tags, modes: ['sc', 'sc'] } })).toContain('дважды')
  })
})

describe('стартер: лишние поля отбрасываются', () => {
  it('на любом уровне — в dropped с путём, запись остаётся', () => {
    const rec = record({ rating: 99, guide: 'x' })
    ;(rec.links as Record<string, unknown>).discord = 'https://discord.gg/abc'
    ;(rec.tags as unknown as Record<string, unknown>).tier = 'S'
    ;(rec.pob as Record<string, unknown>).code = 'eNq…'
    const r = validateStarter(rec)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.dropped.sort()).toEqual(
      ['test-champion-boneshatter.guide', 'test-champion-boneshatter.links.discord', 'test-champion-boneshatter.pob.code', 'test-champion-boneshatter.rating', 'test-champion-boneshatter.tags.tier'].sort()
    )
    expect(r.value).not.toHaveProperty('rating')
    expect(r.value.links).not.toHaveProperty('discord')
    expect(r.value.pob).toEqual({ sha256: record().pob.sha256, checkedAt: '2026-11-12' })
  })
})

describe('стартер: плохие ссылки', () => {
  const links = (l: Record<string, unknown>) => bad({ links: { ...record().links, ...l } })

  it('только https', () => {
    expect(links({ video: 'http://youtu.be/abc' })).toContain('links.video')
    expect(links({ pob: 'http://pobb.in/abcdef' })).toContain('links.pob')
  })

  it('хосты — только авторов (AUTHOR_LINK_HOSTS)', () => {
    expect(links({ guide: 'https://evil.example.com/guide' })).toContain('links.guide')
    expect(links({ channel: 'https://youtube.com.evil.ru/x' })).toContain('links.channel')
    expect(links({ video: 'https://xn--ytube-6ve.com/x' })).toContain('links.video')
  })

  it('без логина и порта', () => {
    expect(links({ video: 'https://user:pw@youtu.be/abc' })).toContain('links.video')
    expect(links({ video: 'https://youtu.be:8443/abc' })).toContain('links.video')
  })

  it('PoB — только паста, которую узнаёт разбор ссылок S35', () => {
    expect(links({ pob: 'https://www.youtube.com/watch?v=abc' })).toContain('паст')
    expect(links({ pob: 'https://maxroll.gg/poe/build-guides/x' })).toContain('паст')
    expect(links({ pob: 'https://pastebin.com/abcdefgh' })).toContain('links.pob') // паста есть, но хост не автора
    expect(links({ pob: 'https://maxroll.gg/poe/pob/abcd1234' })).toBe('ok')
    expect(links({ pob: 'https://pob.codes/b/abcd1234' })).toBe('ok')
  })

  it('PoB обязателен, адрес не длиннее предела', () => {
    expect(bad({ links: { video: 'https://youtu.be/abc' } })).toContain('links.pob')
    expect(links({ guide: `https://maxroll.gg/${'a'.repeat(STARTER_LIMITS.url)}` })).toContain('links.guide')
    expect(links({ guide: 42 })).toContain('links.guide')
  })
})

describe('стартер: тексты и длины', () => {
  it('ник и строка — простой текст в пределах', () => {
    expect(bad({ author: 'a'.repeat(STARTER_LIMITS.author + 1) })).toContain('author: длиннее')
    expect(bad({ author: '' })).toContain('author: пусто')
    expect(bad({ note: { ru: 'я'.repeat(STARTER_LIMITS.note + 1) } })).toContain('note.ru: длиннее')
    expect(bad({ note: { ru: 'я'.repeat(STARTER_LIMITS.note) } })).toBe('ok')
  })

  it('без HTML, управляющих символов, смены направления и переводов строк', () => {
    expect(bad({ note: { en: 'nice <img src=x onerror=alert(1)>' } })).toContain('HTML')
    expect(bad({ author: 'evil‮Nick' })).toContain('HTML')
    expect(bad({ note: { en: 'one\ntwo' } })).toContain('одна строка')
  })

  it('без адресов в тексте — ссылки только в links', () => {
    expect(bad({ note: { ru: 'смотрите на https://evil.example' } })).toContain('адрес')
    expect(bad({ author: 'shop.example.com' })).toContain('адрес')
    expect(bad({ note: { ru: 'купите на www.rmt' } })).toContain('адрес')
  })

  it('«Рекомендуем» — только с причиной; текст хотя бы на одном языке', () => {
    expect(bad({ note: null })).toContain('pick')
    expect(bad({ note: {} })).toContain('хотя бы')
    expect(bad({ pick: false, note: null })).toBe('ok')
  })

  it('имя навыка и ключ камня', () => {
    expect(bad({ skill: { en: 'Fire<script>' } })).not.toBe('ok')
    expect(bad({ skill: { en: 'Righteous Fire', gem: '../../etc/passwd' } })).toContain('skill.gem')
    expect(bad({ skill: { en: 'Righteous Fire' } })).toBe('ok')
  })
})

describe('стартер: прочие поля', () => {
  it('id, класс, восхождение, язык', () => {
    expect(bad({ id: 'Bad Id' })).toContain('id')
    expect(bad({ id: 'x'.repeat(49) })).toContain('id')
    expect(bad({ class: 'Necromancer' })).toContain('class')
    expect(bad({ ascendancy: '<b>' })).toContain('ascendancy')
    expect(bad({ ascendancy: null })).toBe('ok')
    expect(bad({ lang: 'de' })).toContain('lang')
  })

  it('метки — из своих списков', () => {
    const tags = record().tags
    expect(bad({ tags: { ...tags, budget: 'free' } })).toContain('tags.budget')
    expect(bad({ tags: { ...tags, difficulty: 4 } })).toContain('tags.difficulty')
    expect(bad({ tags: { ...tags, newbie: 'yes' } })).toContain('tags.newbie')
    expect(bad({ tags: { ...tags, leveling: 'maybe' } })).toContain('tags.leveling')
    expect(bad({ tags: { ...tags, modes: ['ruthless'] } })).toContain('tags.modes')
  })

  it('отпечаток, даты, версия игры', () => {
    expect(bad({ pob: { sha256: 'abc', checkedAt: '2026-11-12' } })).toContain('pob.sha256')
    expect(bad({ pob: { sha256: 'A'.repeat(64), checkedAt: '2026-11-12' } })).toContain('pob.sha256')
    expect(bad({ added: '12.11.2026' })).toContain('added')
    expect(bad({ added: '2026-13-45' })).toContain('added')
    expect(bad({ patch: '3.30.1' })).toContain('patch')
    expect(bad({ checked: { league: '3.30' } })).toContain('checked.date')
  })

  it('не объект — ошибка, а не исключение', () => {
    for (const v of [null, 42, 'x', [], undefined]) expect(validateStarter(v).ok).toBe(false)
  })
})

describe('файл списка лиги и индекс', () => {
  it('хороший файл: 4 записи, без отказов', () => {
    const r = validateStartersFile(JSON.parse(readFix('good', '3.30.json')), '3.30')
    expect(r.ok && r.value.file.starters.map((s) => s.id)).toEqual(['test-hiero-brand', 'test-champion-boneshatter', 'test-assassin-flurry', 'test-guardian-dom'])
    expect(r.ok && r.value.failed).toEqual([])
  })

  it('битая запись и повтор id — только они в failed, остальные проходят', () => {
    const raw = JSON.parse(readFix('good', '3.30.json'))
    raw.starters[0].links.pob = 'https://evil.example/pob'
    raw.starters.push({ ...raw.starters[1] })
    const r = validateStartersFile(raw, '3.30')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.file.starters).toHaveLength(3)
    expect(r.value.failed.map((f) => [f.index, f.id])).toEqual([
      [0, 'test-hiero-brand'],
      [4, 'test-champion-boneshatter']
    ])
    expect(r.value.failed[1].error).toContain('повтор')
  })

  it('лига файла должна совпасть с именем; лимит числа записей', () => {
    const raw = JSON.parse(readFix('good', '3.30.json'))
    expect(validateStartersFile(raw, '3.29')).toMatchObject({ ok: false })
    raw.starters = Array.from({ length: STARTER_LIMITS.starters + 1 }, () => raw.starters[0])
    expect(validateStartersFile(raw)).toMatchObject({ ok: false })
  })

  it('индекс: текущая лига — среди файлов, без повторов; лишнее поле — в dropped', () => {
    expect(validateIndex({ schema: 1, current: '3.30', leagues: ['3.30', '3.29'] }).ok).toBe(true)
    expect(validateIndex({ schema: 1, current: '3.31', leagues: ['3.30'] }).ok).toBe(false)
    expect(validateIndex({ schema: 1, current: '3.30', leagues: ['3.30', '3.30'] }).ok).toBe(false)
    expect(validateIndex({ schema: 1, current: '3.30', leagues: [] }).ok).toBe(false)
    expect(validateIndex({ schema: 1, current: '3.30', leagues: ['3.30'], note: 'x' })).toMatchObject({ ok: true, dropped: ['index.note'] })
  })

  it('схема новее — отдельный признак', () => {
    expect(isNewerSchema({ schema: 2 })).toBe(true)
    expect(isNewerSchema({ schema: 1 })).toBe(false)
    expect(isNewerSchema('{"schema":2}')).toBe(false)
  })

  it('версии игры', () => {
    expect(comparePatch('3.29', '3.30')).toBeLessThan(0)
    expect(comparePatch('3.30', '3.30')).toBe(0)
    expect(comparePatch('4.0', '3.30')).toBeGreaterThan(0)
    expect(patchOf('3_30')).toBe('3.30')
    expect(patchOf('3.29.1')).toBe('3.29')
    expect(patchOf('')).toBeNull()
  })
})
