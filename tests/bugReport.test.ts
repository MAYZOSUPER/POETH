import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'
import { BUG_REPORT_URL, bugReportUrl, isBugReportUrl } from '../src/shared/bugReport'

// «Сообщить об ошибке» (S56): адрес формы и совпадение параметров с id полей .github/ISSUE_TEMPLATE/bug.yml.

describe('bugReportUrl', () => {
  it('подставляет версию, игру и языки', () => {
    const url = bugReportUrl({ version: '0.1.0-rc.12', game: 'poe1', clientLang: 'en', uiLang: 'ru' })
    expect(url).toBe(
      `${BUG_REPORT_URL}&version=0.1.0-rc.12&game=PoE%201&client_lang=English&ui_lang=${encodeURIComponent('Русский')}`
    )
    expect(url.startsWith('https://github.com/MAYZOSUPER/POETH/issues/new?template=bug.yml&')).toBe(true)
    expect(isBugReportUrl(url)).toBe(true)
  })

  it('не подставляет неизвестный язык клиента и странную версию', () => {
    const url = bugReportUrl({ version: 'x y/../z', game: 'poe2', clientLang: null, uiLang: 'en' })
    expect(url).toBe(`${BUG_REPORT_URL}&game=PoE%202&ui_lang=English`)
  })

  it('в адресе только поля формы — ничего о пользователе', () => {
    const url = new URL(bugReportUrl({ version: '1.2.3', game: 'poe1', clientLang: 'ru', uiLang: 'ru' }))
    expect([...url.searchParams.keys()].sort()).toEqual(['client_lang', 'game', 'template', 'ui_lang', 'version'])
  })

  it('isBugReportUrl пропускает только нашу форму', () => {
    expect(isBugReportUrl(BUG_REPORT_URL)).toBe(true)
    expect(isBugReportUrl('https://github.com/MAYZOSUPER/POETH/issues/new?template=strategy.yml')).toBe(false)
    expect(isBugReportUrl(`${BUG_REPORT_URL}.evil.example`)).toBe(false)
    expect(isBugReportUrl('https://example.com/?template=bug.yml')).toBe(false)
    expect(isBugReportUrl(null)).toBe(false)
  })

  it('параметры адреса = id полей формы bug.yml', () => {
    const yml = readFileSync(path.join(__dirname, '../.github/ISSUE_TEMPLATE/bug.yml'), 'utf8')
    const ids = [...yml.matchAll(/^\s+id:\s*(\S+)/gm)].map((m) => m[1])
    for (const key of ['version', 'game', 'client_lang', 'ui_lang']) expect(ids).toContain(key)
    expect(yml).toMatch(/labels: \["bug"\]/)
  })
})
