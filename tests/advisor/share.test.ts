import { describe, expect, it } from 'vitest'
import { MAX_CODE_CHARS } from '@shared/advisor/codec'
import { MAX_ISSUE_URL, deepLinkCode, deepLinkFromArgv, issueUrl, strategyLink } from '@shared/advisor/share'

// «Поделиться», форма каталога и «Открыть в POETH» (S17): из аргументов запуска — только путь импорта.

const CODE = 'POETH1:eJyrVkrOz0vOz0nVUSouSSxJVbJSMjI2MDE3NTVKSUlRqgUAhQUJGQ'

describe('советник: ссылки стратегии', () => {
  it('ссылка на сайт: код после #', () => {
    expect(strategyLink(CODE)).toBe(`https://mayzosuper.github.io/POETH/strategies/view#${CODE}`)
  })

  it('форма GitHub: точный адрес репозитория, шаблон, название и код; длинный код — без кода', () => {
    const r = issueUrl(CODE, 'Сущности + засада')
    expect(r.withCode).toBe(true)
    const u = new URL(r.url)
    expect(u.origin + u.pathname).toBe('https://github.com/MAYZOSUPER/POETH/issues/new')
    expect(u.searchParams.get('template')).toBe('strategy.yml')
    expect(u.searchParams.get('title')).toBe('Стратегия: Сущности + засада')
    expect(u.searchParams.get('code')).toBe(CODE)
    const long = issueUrl('POETH1:' + 'A'.repeat(MAX_ISSUE_URL), 'x')
    expect(long.withCode).toBe(false)
    expect(new URL(long.url).searchParams.get('code')).toBeNull()
  })

  it('протокол: принимается только poeth-strategy://import#<код>', () => {
    expect(deepLinkCode(`poeth-strategy://import#${CODE}`)).toBe(CODE)
    expect(deepLinkCode(`poeth-strategy://import/#${CODE}`)).toBe(CODE)
    expect(deepLinkCode(`POETH-STRATEGY://import#${encodeURIComponent(CODE)}`)).toBe(CODE)
    for (const bad of [
      `poeth://import#${CODE}`, // внутренняя схема приложения — не из ОС
      `poeth://data/poe1/ru/items.ndjson`,
      `poeth-strategy://settings#${CODE}`,
      `poeth-strategy://import?x=1#${CODE}`,
      `poeth-strategy://import#hello`,
      `poeth-strategy://import`,
      `https://mayzosuper.github.io/POETH/strategies/view#${CODE}`,
      `--inspect=9229`,
      `poeth-strategy://import#POETH1:` + 'A'.repeat(MAX_CODE_CHARS + 500),
      42,
      null
    ]) {
      expect(deepLinkCode(bad)).toBeNull()
    }
  })

  it('аргументы запуска: первая ссылка импорта, остальное игнорируется', () => {
    expect(deepLinkFromArgv(['C:\\POETH\\POETH.exe', '--allow-file-access-from-files', `poeth-strategy://import#${CODE}`])).toBe(CODE)
    expect(deepLinkFromArgv(['C:\\POETH\\POETH.exe', '--squirrel-firstrun', 'poeth://brand/x.png'])).toBeNull()
    expect(deepLinkFromArgv([])).toBeNull()
  })
})
