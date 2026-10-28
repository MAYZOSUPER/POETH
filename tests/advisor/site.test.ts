import { readFileSync, readdirSync } from 'fs'
import { join, resolve } from 'path'
import { pathToFileURL } from 'url'
import { describe, expect, it } from 'vitest'
import { strategyFingerprint } from '@shared/advisor/codec'
import { decodeStrategyNode } from '@shared/advisor/codecNode'

// Страницы «Стратегии» сайта (S17): файлы из приложения свежие (тот же валидатор и формат — бандл, а не копия),
// каталог раскрывается в те же стратегии, всё из кода выводится без innerHTML, у страниц строгая CSP.

const ROOT = resolve(__dirname, '../..')
const SITE = resolve(ROOT, 'site/strategies')
const read = (name: string): string => readFileSync(join(SITE, name), 'utf8').replace(/\r\n/g, '\n')

interface BuildSite {
  buildSiteFiles: () => Promise<Record<string, string>>
}
const tool = (): Promise<BuildSite> => import(pathToFileURL(join(ROOT, 'tools/advisor/build-site.mjs')).href)

describe('сайт: стратегии', () => {
  it('бандл strategy-core.js собран из текущего src/shared/advisor (иначе: node tools/advisor/build-site.mjs)', async () => {
    const files = await (await tool()).buildSiteFiles()
    expect(read('strategy-core.js') === files['strategy-core.js'], 'strategy-core.js устарел — запустите node tools/advisor/build-site.mjs').toBe(true)
    expect(JSON.parse(read('names-ru.json'))).toEqual(JSON.parse(files['names-ru.json']))
  }, 60_000)

  it('catalog.json: те же стратегии, что в данных приложения, коды раскрываются в них же', async () => {
    const fresh = JSON.parse((await (await tool()).buildSiteFiles())['catalog.json'])
    const cur = JSON.parse(read('catalog.json'))
    expect(cur.patch).toBe(fresh.patch)
    expect(cur.prices).toBe(fresh.prices)
    expect(cur.strategies.map((s: { kind: string; checked: string; strategy: unknown }) => [s.kind, s.checked, s.strategy])).toEqual(
      fresh.strategies.map((s: { kind: string; checked: string; strategy: unknown }) => [s.kind, s.checked, s.strategy])
    )
    for (const it of cur.strategies) {
      const d = await decodeStrategyNode(it.code)
      expect(d.ok && strategyFingerprint(d.strategy), it.strategy.id).toBe(strategyFingerprint(it.strategy))
    }
  }, 60_000)

  it('всё из кода — только через textContent: в скриптах страниц нет innerHTML, outerHTML, insertAdjacentHTML, document.write, eval', () => {
    for (const name of readdirSync(SITE).filter((n) => n.endsWith('.js'))) {
      const code = read(name)
      expect(code, name).not.toMatch(/\.(innerHTML|outerHTML)\b|insertAdjacentHTML|document\.write|\beval\(|new Function\(/)
    }
  })

  it('страницы: строгая CSP (только свои файлы), без встроенных скриптов и стилей', () => {
    for (const name of ['index.html', 'view.html']) {
      const html = read(name)
      expect(html, name).toContain(`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self';`)
      expect(html, name).not.toMatch(/<script>(?!<\/script>)|<script(?![^>]*\bsrc=)[^>]*>|\sstyle="|\son[a-z]+="/)
      expect(html, name).toContain('<script src="strategy-core.js" defer></script>')
      expect(html, name).not.toMatch(/https?:\/\/(?!github\.com\/MAYZOSUPER\/POETH)[^"\s]+\.js/) // сторонних скриптов нет
    }
  })

  it('ссылки «Стратегии» в меню главной страницы пока нет (включим вместе с вкладкой)', () => {
    const main = readFileSync(resolve(ROOT, 'site/index.html'), 'utf8')
    expect(main).not.toMatch(/href="strategies\//)
  })
})
