import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'

// S64: фильтр NeverSink для PoE 2 — свой репозиторий (NeverSinkDev/NeverSink-Filter-for-PoE2), имена файлов
// `NeverSink's filter 2 - <уровень>.filter`, свои стили, папка «Документы/My Games/Path of Exile 2», свой файл
// состояния. Установка — на временной папке с кириллицей в пути (реальная папка игрока не трогается).
// PoE 1 при этом не меняется: те же вызовы без игры дают прежние адреса и правила (tests/lootFilter/*.test.ts S53).

let docs = ''
vi.mock('electron', () => ({ app: { getPath: (k: string) => (k === 'documents' ? docs : 'C:\\nowhere') } }))

const { installFilter } = await import('../../src/main/lootFilter/install')
const { normalizeLootFilterData, dataFileName } = await import('../../src/main/lootFilter/store')
const { folderOf, defaultFolderPath, hasNonAscii, DIR_ENV } = await import('../../src/main/lootFilter/service')
const src = await import('@shared/lootFilter/source')
const { pickFilterEntry, filterPathPattern } = await import('@shared/lootFilter/archive')
const { LEVELS, STYLES, STYLES_POE2, isStyle, stylesFor } = await import('@shared/lootFilter/levels')
const { looksLikeNeverSinkFilter } = await import('@shared/lootFilter/rules')
const { makeZip, treeJson, filterText, RELEASE_JSON } = await import('./zipFixture')
type FixtureEntry = import('./zipFixture').FixtureEntry
type Net = import('../../src/main/lootFilter/install').Net

const ROOT2 = 'NeverSink-Filter-for-PoE2-0.10.4a'
const CODES = ['0-SOFT', '1-REGULAR', '2-SEMI-STRICT', '3-STRICT', '4-VERY-STRICT', '5-UBER-STRICT', '6-UBER-PLUS-STRICT']
const STYLE_DIRS = ['AURA', 'COBALT', 'CUSTOMSOUNDS', 'DARKMODE', 'MYTHIC', 'VAAL', 'ZEN']

/** Текст как у настоящего фильтра PoE 2 (шапка называет игру). */
function filterText2(type: string, style = 'DEFAULT', extra = ''): string {
  return filterText(type, style, extra).replace("Loot Filter - for Path of Exile", 'Loot Filter - for Path of Exile 2').replace('8.20.2', '0.10.4')
}

/** Архив как у релиза PoE 2 0.10.4a (имена — из дерева тега на GitHub, 31.10.2026). */
function release2(): FixtureEntry[] {
  const out: FixtureEntry[] = [{ name: `${ROOT2}/` }]
  for (const dir of STYLE_DIRS) {
    out.push({ name: `${ROOT2}/(STYLE) ${dir}/` })
    for (const code of CODES) {
      const extra = dir === 'CUSTOMSOUNDS' ? '\tCustomAlertSound "1maybevaluable.mp3" 300' : ''
      out.push({ name: `${ROOT2}/(STYLE) ${dir}/NeverSink's filter 2 - ${code} (${dir.toLowerCase()}) .filter`, data: filterText2(code, dir, extra) })
    }
  }
  for (const code of CODES) out.push({ name: `${ROOT2}/NeverSink's filter 2 - ${code}.filter`, data: filterText2(code) })
  out.push({ name: `${ROOT2}/ADDITIONAL-FILES/Deprecated/DEPRECATED NeverSinks Litefilter.filter`, data: 'Show' })
  out.push({ name: `${ROOT2}/LICENSE`, data: 'MIT License' })
  return out
}

const RELEASE2 = { ...RELEASE_JSON, tag_name: '0.10.4a', name: "NeverSink's PoE2 Filter - version 0.10.4a", published_at: '2026-10-15T11:58:14Z' }

function fakeNet(entries = release2(), root = ROOT2): Net & { urls: string[] } {
  const urls: string[] = []
  return {
    urls,
    json: async (url) => {
      urls.push(url)
      return { ok: true, json: url.includes('/releases/latest') ? RELEASE2 : treeJson(entries, root) }
    },
    zip: async (url) => {
      urls.push(url)
      return { ok: true, body: makeZip(entries) }
    }
  }
}

describe('источник PoE 2', () => {
  it('адреса — репозиторий NeverSink для PoE 2; без игры — прежние адреса PoE 1', () => {
    expect(src.latestReleaseUrl('poe2')).toBe('https://api.github.com/repos/NeverSinkDev/NeverSink-Filter-for-PoE2/releases/latest')
    expect(src.zipUrl('0.10.4a', 'poe2')).toBe('https://codeload.github.com/NeverSinkDev/NeverSink-Filter-for-PoE2/zip/refs/tags/0.10.4a')
    expect(src.treeUrl('0.10.4a', 'poe2')).toBe(
      'https://api.github.com/repos/NeverSinkDev/NeverSink-Filter-for-PoE2/git/trees/0.10.4a?recursive=1'
    )
    expect(src.LATEST_RELEASE_URL).toBe('https://api.github.com/repos/NeverSinkDev/NeverSink-Filter/releases/latest')
    expect(src.zipUrl('8.20.2')).toBe('https://codeload.github.com/NeverSinkDev/NeverSink-Filter/zip/refs/tags/8.20.2')
  })

  it('allowlist пускает оба репозитория NeverSink и ничего больше', () => {
    for (const u of [src.latestReleaseUrl('poe2'), src.zipUrl('0.10.4a', 'poe2'), src.treeUrl('0.10.4a', 'poe2')]) {
      expect(src.isLootFilterUrl(u), u).toBe(true)
    }
    for (const bad of [
      'https://api.github.com/repos/NeverSinkDev/NeverSink-Filter-for-PoE3/releases/latest',
      'https://api.github.com/repos/NeverSinkDev/NeverSink-Filter-for-PoE2x/releases/latest',
      'https://codeload.github.com/NeverSinkDev/NeverSink-Filter-for-PoE2/tar.gz/refs/tags/0.10.4a',
      'https://api.github.com/repos/Someone/NeverSink-Filter-for-PoE2/releases/latest',
      'https://api.github.com/repos/NeverSinkDev/NeverSink-Filter-for-PoE2/../../user'
    ]) {
      expect(src.isLootFilterUrl(bad), bad).toBe(false)
    }
  })

  it('теги PoE 2 вида 0.10.4a проходят и сравниваются', () => {
    expect(src.isSafeTag('0.10.4a')).toBe(true)
    expect(src.isNewerTag('0.10.4a', '0.10.4')).toBe(true)
    expect(src.isNewerTag('0.10.4', '0.10.4a')).toBe(false)
    expect(src.isNewerTag('1.0.0', '0.10.4a')).toBe(true)
  })

  it('ссылки экрана: лицензия в ветке main, FilterBlade и ладдер PoE 2', () => {
    expect(src.linkUrl('repo', null, 'poe2')).toBe('https://github.com/NeverSinkDev/NeverSink-Filter-for-PoE2')
    expect(src.linkUrl('license', null, 'poe2')).toBe('https://github.com/NeverSinkDev/NeverSink-Filter-for-PoE2/blob/main/LICENSE')
    expect(src.linkUrl('release', '0.10.4a', 'poe2')).toBe('https://github.com/NeverSinkDev/NeverSink-Filter-for-PoE2/releases/tag/0.10.4a')
    expect(src.linkUrl('filterblade', null, 'poe2')).toBe('https://www.filterblade.xyz/?game=Poe2')
    expect(src.linkUrl('ladder', null, 'poe2', 'www.pathofexile.com')).toBe('https://pathofexile2.com/item-filter/ladder/follower')
    expect(src.linkUrl('ladder', null, 'poe2', 'ru.pathofexile.com')).toBe('https://pathofexile2.com/ru/item-filter/ladder/follower')
  })

  it('PoE 1 — ссылки как в S53 (ладдер теперь открывает main, адрес тот же)', () => {
    expect(src.linkUrl('license')).toBe('https://github.com/NeverSinkDev/NeverSink-Filter/blob/master/LICENSE')
    expect(src.linkUrl('filterblade')).toBe('https://www.filterblade.xyz/?game=Poe1')
    expect(src.linkUrl('ladder', null, 'poe1', 'ru.pathofexile.com')).toBe(src.ladderUrl('ru.pathofexile.com'))
    expect(src.linkUrl('ladder', null, 'poe1', 'www.pathofexile.com')).toBe('https://www.pathofexile.com/item-filter/ladder/follower')
  })
})

describe('стили и выбор файла из архива PoE 2', () => {
  it('стили PoE 2 свои; CustomSounds не берём; PoE 1 — прежние 16', () => {
    expect(STYLES_POE2.map((s) => s.id)).toEqual(['default', 'aura', 'cobalt', 'darkmode', 'mythic', 'vaal', 'zen'])
    expect(stylesFor('poe1')).toBe(STYLES)
    expect(STYLES).toHaveLength(16)
    expect(isStyle('aura', 'poe2')).toBe(true)
    expect(isStyle('aura')).toBe(false) // без игры — PoE 1, как в S53
    expect(isStyle('abyss', 'poe2')).toBe(false)
    expect(isStyle('customsounds', 'poe2')).toBe(false)
  })

  it('каждый уровень каждого стиля PoE 2 находится ровно один раз', () => {
    const names = release2().map((e) => e.name)
    for (const s of STYLES_POE2) {
      for (const d of LEVELS) {
        const pick = pickFilterEntry(names, d.level, s.id, 'poe2')
        expect(pick.ok, `${s.id} ${d.code}`).toBe(true)
        if (pick.ok) expect(pick.repoPath).toContain(`NeverSink's filter 2 - ${d.code}`)
      }
    }
  })

  it('шаблон PoE 1 не берёт файлы PoE 2 и наоборот', () => {
    expect(filterPathPattern(1, 'default').test("NeverSink's filter 2 - 1-REGULAR.filter")).toBe(false)
    expect(filterPathPattern(1, 'default', 'poe2').test("NeverSink's filter - 1-REGULAR.filter")).toBe(false)
    expect(pickFilterEntry(release2().map((e) => e.name), 1, 'default')).toEqual({ ok: false, error: 'not-in-archive' })
  })

  it('«это фильтр PoE 2»: шапка должна называть Path of Exile 2', () => {
    const enc = (s: string): Uint8Array => new TextEncoder().encode(s)
    expect(looksLikeNeverSinkFilter(enc(filterText2('1-REGULAR')), 'poe2')).toBe(true)
    expect(looksLikeNeverSinkFilter(enc(filterText('1-REGULAR')), 'poe2')).toBe(false)
    expect(looksLikeNeverSinkFilter(enc(filterText('1-REGULAR')))).toBe(true) // PoE 1 — как раньше
  })
})

describe('установка PoE 2 во временную папку с кириллицей', () => {
  let tmp: string
  let dir: string

  beforeEach(() => {
    tmp = mkdtempSync(path.join(tmpdir(), 'poeth-lf2-'))
    // как у игрока с «Документами» по-русски: …\Документы\My Games\Path of Exile 2
    dir = path.join(tmp, 'Пользователь Иван', 'Документы', 'My Games', 'Path of Exile 2')
    mkdirSync(dir, { recursive: true })
    writeFileSync(path.join(dir, 'poe2_production_Config.ini'), '[GAME]')
    writeFileSync(path.join(dir, 'Мой фильтр.filter'), 'Show # мой')
  })
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true })
  })

  it('ставит свой файл уровня из архива PoE 2, чужие файлы не трогает, ходит только в репозиторий PoE 2', async () => {
    const net = fakeNet()
    const out = await installFilter({ req: { level: 1, style: 'default' }, dir, records: [], net, game: 'poe2' })
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.release.tag).toBe('0.10.4a')
    expect(out.record.file).toBe('POETH-NeverSink-1-REGULAR.filter')
    expect(readFileSync(path.join(dir, 'POETH-NeverSink-1-REGULAR.filter'), 'utf8')).toBe(filterText2('1-REGULAR'))
    expect(readFileSync(path.join(dir, 'Мой фильтр.filter'), 'utf8')).toBe('Show # мой')
    expect(readdirSync(dir).sort()).toEqual(['POETH-NeverSink-1-REGULAR.filter', 'poe2_production_Config.ini', 'Мой фильтр.filter'].sort())
    expect(net.urls).toHaveLength(3)
    for (const u of net.urls) {
      expect(src.isLootFilterUrl(u), u).toBe(true)
      expect(u).toContain('NeverSink-Filter-for-PoE2')
    }
  })

  it('стиль PoE 2 (Aura) кладётся в тот же файл уровня', async () => {
    const out = await installFilter({ req: { level: 3, style: 'aura' }, dir, records: [], net: fakeNet(), game: 'poe2' })
    expect(out.ok).toBe(true)
    expect(readFileSync(path.join(dir, 'POETH-NeverSink-3-STRICT.filter'), 'utf8')).toBe(filterText2('3-STRICT', 'AURA'))
  })

  it('в архиве фильтр PoE 1 под именем PoE 2 — ничего не записано', async () => {
    const entries = release2().map((e) => (e.name.endsWith("filter 2 - 1-REGULAR.filter") ? { ...e, data: filterText('1-REGULAR') } : e))
    const out = await installFilter({ req: { level: 1, style: 'default' }, dir, records: [], net: fakeNet(entries), game: 'poe2' })
    expect(out.ok).toBe(false)
    if (!out.ok) expect(out.error).toBe('not-filter')
    expect(readdirSync(dir)).not.toContain('POETH-NeverSink-1-REGULAR.filter')
  })
})

describe('папка и состояние PoE 2', () => {
  let tmp: string
  beforeEach(() => {
    tmp = mkdtempSync(path.join(tmpdir(), 'poeth-lf2d-'))
    docs = path.join(tmp, 'Документы')
    delete process.env[DIR_ENV]
  })
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true })
    docs = ''
  })

  it('по умолчанию — Документы/My Games/Path of Exile 2; признак игры — poe2_production_Config.ini', () => {
    const p2 = path.join(docs, 'My Games', 'Path of Exile 2')
    expect(defaultFolderPath('poe2')).toBe(p2)
    expect(defaultFolderPath('poe1')).toBe(path.join(docs, 'My Games', 'Path of Exile'))
    const empty = normalizeLootFilterData(null, 'poe2')
    expect(folderOf(empty, 'poe2')).toMatchObject({ path: p2, source: 'default', found: false, looksLikeGame: false, nonAscii: true })
    mkdirSync(p2, { recursive: true })
    expect(folderOf(empty, 'poe2')).toMatchObject({ found: true, looksLikeGame: false })
    writeFileSync(path.join(p2, 'poe2_production_Config.ini'), '[GAME]')
    expect(folderOf(empty, 'poe2')).toMatchObject({ found: true, looksLikeGame: true })
  })

  it('кириллица в пути замечается', () => {
    expect(hasNonAscii('C:\\Users\\Иван\\Documents')).toBe(true)
    expect(hasNonAscii('C:\\Users\\Ivan\\Documents\\My Games\\Path of Exile 2')).toBe(false)
  })

  it('свой файл состояния у PoE 2; стили — только свои', () => {
    expect(dataFileName('poe1')).toBe('lootfilter.json')
    expect(dataFileName('poe2')).toBe('lootfilter-poe2.json')
    const abs = process.platform === 'win32' ? 'C:\\Games\\PoE2' : '/games/poe2'
    const rec = { file: 'POETH-NeverSink-1-REGULAR.filter', level: 1, style: 'aura', tag: '0.10.4a', sha256: 'a'.repeat(64), size: 1, installedAt: 'x', dir: abs }
    const d2 = normalizeLootFilterData({ prefs: { level: 2, style: 'aura' }, installed: [rec, { ...rec, style: 'abyss' }] }, 'poe2')
    expect(d2.prefs.style).toBe('aura')
    expect(d2.installed.map((r) => r.style)).toEqual(['aura'])
    const d1 = normalizeLootFilterData({ prefs: { level: 2, style: 'aura' }, installed: [rec] })
    expect(d1.prefs.style).toBe('default')
    expect(d1.installed).toEqual([])
  })
})
