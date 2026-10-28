import { describe, expect, it } from 'vitest'
import {
  AUTOSTART_ARG,
  compareVersions,
  decideStartup,
  isSafeDataPath,
  loginItemSettings,
  loopbackUrl,
  releaseNotesText,
  releasePageUrl,
  shouldOfferUpdate,
  validateDataManifest
} from '@shared/updates'
import { isAllowedDataUrl, DATA_MANIFEST_URL } from '@shared/links'
import { readFileSync } from 'fs'
import path from 'path'

const SHA = 'a'.repeat(64)

describe('compareVersions', () => {
  it('числа, «v», пререлизы', () => {
    expect(compareVersions('0.1.0', '0.1.1')).toBe(-1)
    expect(compareVersions('0.2.0', '0.1.9')).toBe(1)
    expect(compareVersions('v1.0.0', '1.0.0')).toBe(0)
    expect(compareVersions('1.0.0-beta.1', '1.0.0')).toBe(-1)
    expect(compareVersions('1.0.0-beta.2', '1.0.0-beta.10')).toBe(-1)
    expect(compareVersions('1.0.0-alpha', '1.0.0-beta')).toBe(-1)
    expect(compareVersions('1.0.0-1', '1.0.0-alpha')).toBe(-1)
    expect(compareVersions('1.0.0+build.5', '1.0.0')).toBe(0)
    expect(compareVersions('10.0.0', '9.9.9')).toBe(1)
  })

  it('мусор — самая старая версия', () => {
    expect(compareVersions('abc', '0.0.1')).toBe(-1)
    expect(compareVersions('0.0.1', '')).toBe(1)
    expect(compareVersions('x', 'y')).toBe(0)
  })
})

describe('shouldOfferUpdate — окно «Вышло обновление»', () => {
  it('только если версия новее установленной', () => {
    expect(shouldOfferUpdate('0.1.0', '0.1.1', null)).toBe(true)
    expect(shouldOfferUpdate('0.1.1', '0.1.1', null)).toBe(false)
    expect(shouldOfferUpdate('0.2.0', '0.1.9', null)).toBe(false)
    expect(shouldOfferUpdate('0.1.0', '0.1.0-beta.1', null)).toBe(false)
  })

  it('«Позже» прячет именно эту версию до перезапуска, следующую — нет', () => {
    expect(shouldOfferUpdate('0.1.0', '0.1.1', '0.1.1')).toBe(false)
    expect(shouldOfferUpdate('0.1.0', '0.1.2', '0.1.1')).toBe(true)
  })
})

describe('releaseNotesText — «что нового»', () => {
  it('HTML описания релиза → текст', () => {
    const html = '<h2>Что нового</h2><ul><li>Прайс-чек &amp; фильтры</li><li>Исправлен <b>Ctrl+D</b></li></ul><p>Спасибо!<br>Команда</p>'
    expect(releaseNotesText(html)).toBe('Что нового\n• Прайс-чек & фильтры\n• Исправлен Ctrl+D\nСпасибо!\nКоманда')
  })

  it('массив заметок по версиям и пустые значения', () => {
    expect(releaseNotesText([{ version: '0.1.1', note: 'Первое' }, { version: '0.1.2', note: 'Второе' }])).toBe('Первое\nВторое')
    expect(releaseNotesText(null)).toBe('')
    expect(releaseNotesText(undefined)).toBe('')
  })

  it('длинное описание обрезается', () => {
    const t = releaseNotesText('x'.repeat(5000))
    expect(t.length).toBeLessThanOrEqual(1200)
    expect(t.endsWith('…')).toBe(true)
  })

  it('двуязычное описание (build/release-notes.md): в окно — раздел языка интерфейса', () => {
    const md = readFileSync(path.join(__dirname, '../../build/release-notes.md'), 'utf8')
    const ru = releaseNotesText(md, 'ru')
    const en = releaseNotesText(md, 'en')
    expect(ru.startsWith('• ')).toBe(true)
    expect(ru).toContain('Как установить: скачайте POETH-Setup-')
    expect(ru).not.toMatch(/What.s new|\*\*|\]\(|<!--/)
    expect(en.startsWith('• ')).toBe(true)
    expect(en).toContain('How to install: download POETH-Setup-')
    expect(en).not.toMatch(/[а-яё]/i)
    // без языка — весь текст (оба раздела)
    expect(releaseNotesText(md)).toMatch(/Что нового[\s\S]*What.s new/)
  })

  it('HTML описания с GitHub: тоже раздел языка', () => {
    const html = '<p><strong>POETH v0.2.0</strong></p><h2>Что нового</h2><ul><li>Новое</li></ul><h2>What’s new</h2><ul><li>New</li></ul>'
    expect(releaseNotesText(html, 'ru')).toBe('• Новое')
    expect(releaseNotesText(html, 'en')).toBe('• New')
  })

  it('одноязычное описание — как есть', () => {
    expect(releaseNotesText('<h2>Что нового</h2><ul><li>Тест</li></ul>', 'en')).toBe('Что нового\n• Тест')
  })
})

describe('portable (S10b)', () => {
  it('«Скачать новую версию» — страница релиза этой версии', () => {
    expect(releasePageUrl('0.1.1')).toBe('https://github.com/MAYZOSUPER/POETH/releases/tag/v0.1.1')
    expect(releasePageUrl('v0.2.0-beta.1')).toBe('https://github.com/MAYZOSUPER/POETH/releases/tag/v0.2.0-beta.1')
    expect(releasePageUrl('../../evil')).toBe('https://github.com/MAYZOSUPER/POETH/releases/latest')
    expect(releasePageUrl(undefined)).toBe('https://github.com/MAYZOSUPER/POETH/releases/latest')
  })

  it('автозапуск portable ведёт на сам exe, а не на распакованную копию', () => {
    const exe = 'D:\\Games\\POETH-Portable-0.1.0.exe'
    expect(loginItemSettings(true, true, exe)).toEqual({ openAtLogin: true, args: [AUTOSTART_ARG], path: exe })
    expect(loginItemSettings(false, true, exe)).toEqual({ openAtLogin: false, args: [], path: exe })
  })
})

describe('decideStartup — запуск как APT/Sidekick', () => {
  const base = { firstRun: false, autostarted: false, minimized: true, game: 'poe1' as const }

  it('PoE1: окно не открывается само, экран загрузки — при ручном запуске', () => {
    expect(decideStartup(base)).toEqual({ splash: true, showCompanion: false })
    expect(decideStartup({ ...base, autostarted: true })).toEqual({ splash: false, showCompanion: false })
  })

  it('первый запуск — окно открывается (даже при автозапуске)', () => {
    expect(decideStartup({ ...base, firstRun: true }).showCompanion).toBe(true)
    expect(decideStartup({ ...base, firstRun: true, autostarted: true }).showCompanion).toBe(true)
  })

  it('снят «Запускать свёрнутым» — окно открывается', () => {
    expect(decideStartup({ ...base, minimized: false }).showCompanion).toBe(true)
    expect(decideStartup({ ...base, minimized: false, autostarted: true }).showCompanion).toBe(true)
  })

  it('PoE2: трекер кампании открывается при ручном запуске, свёрнутым — только при автозапуске', () => {
    expect(decideStartup({ ...base, game: 'poe2' }).showCompanion).toBe(true)
    expect(decideStartup({ ...base, game: 'poe2', autostarted: true }).showCompanion).toBe(false)
    expect(decideStartup({ ...base, game: 'poe2', autostarted: true, minimized: false }).showCompanion).toBe(true)
  })
})

describe('loginItemSettings — «Запускать вместе с Windows»', () => {
  it('упакованное приложение: вкл с флагом --autostart, выкл без аргументов', () => {
    expect(loginItemSettings(true, true)).toEqual({ openAtLogin: true, args: [AUTOSTART_ARG] })
    expect(loginItemSettings(false, true)).toEqual({ openAtLogin: false, args: [] })
  })

  it('dev — не трогаем автозапуск Windows', () => {
    expect(loginItemSettings(true, false)).toBeNull()
  })
})

describe('манифест данных', () => {
  const good = {
    version: '3.30.0-1',
    game: 'poe1',
    minApp: '0.1.0',
    files: { 'en/stats.ndjson': { sha256: SHA, size: 10 }, 'regex/maps.ru.json': { sha256: SHA, size: 0 } }
  }

  it('корректный манифест', () => {
    const r = validateDataManifest(good, '0.1.0')
    expect(r).toEqual({ ok: true, manifest: good })
  })

  it('пути: только относительные, без «..», корня и обратных слэшей', () => {
    for (const p of ['en/stats.ndjson', 'regex/maps.en.json', 'a/b/c/d.txt']) expect(isSafeDataPath(p), p).toBe(true)
    for (const p of ['../x', 'en/../../x', '/etc/passwd', 'C:/x', 'en\\x', '', '.hidden', 'a/b/c/d/e.txt', 'en/', 'x.']) {
      expect(isSafeDataPath(p), p).toBe(false)
    }
  })

  it('битые манифесты отклоняются с причиной', () => {
    const bad: [unknown, string][] = [
      [null, 'not an object'],
      [{ ...good, version: '' }, 'bad version'],
      [{ ...good, game: 'poe3' }, 'bad game'],
      [{ ...good, files: {} }, 'bad file count'],
      [{ ...good, files: { '../x': { sha256: SHA, size: 1 } } }, 'bad path ../x'],
      [{ ...good, files: { 'manifest.json': { sha256: SHA, size: 1 } } }, 'bad path manifest.json'],
      [{ ...good, files: { 'a.txt': { sha256: 'xyz', size: 1 } } }, 'bad sha256 a.txt'],
      [{ ...good, files: { 'a.txt': { sha256: SHA, size: -1 } } }, 'bad size a.txt'],
      [{ ...good, minApp: 'new' }, 'bad minApp']
    ]
    for (const [raw, error] of bad) expect(validateDataManifest(raw, '0.1.0')).toEqual({ ok: false, error })
  })

  it('пакет для более новой версии приложения пропускается', () => {
    expect(validateDataManifest({ ...good, minApp: '0.2.0' }, '0.1.0')).toEqual({ ok: false, error: 'needs app 0.2.0' })
  })

  it('источник данных: https + allowlist; тестовый сервер — только loopback', () => {
    expect(isAllowedDataUrl(DATA_MANIFEST_URL)).toBe(true)
    expect(isAllowedDataUrl('http://raw.githubusercontent.com/x')).toBe(false)
    expect(isAllowedDataUrl('https://evil.example/manifest.json')).toBe(false)
    expect(loopbackUrl('http://127.0.0.1:8080/')).toBe('http://127.0.0.1:8080/')
    expect(loopbackUrl('http://localhost:1/m.json')).toBe('http://localhost:1/m.json')
    expect(loopbackUrl('https://127.0.0.1/')).toBeNull()
    expect(loopbackUrl('http://example.com/')).toBeNull()
    expect(loopbackUrl(undefined)).toBeNull()
  })
})
