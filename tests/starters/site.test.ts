import { readFileSync, readdirSync } from 'fs'
import { join, resolve } from 'path'
import { pathToFileURL } from 'url'
import { runInNewContext } from 'vm'
import { describe, expect, it } from 'vitest'
import { FIX, reader } from './fixtures'

// Страница «Стартеры» сайта (ST3): файлы из приложения свежие (бандл того же кода, копии того же списка), бандл в
// браузерном виде грузит список так же, как приложение, всё из данных выводится без innerHTML, у страницы строгая CSP
// и обязательные строки о правах.

const ROOT = resolve(__dirname, '../..')
const SITE = resolve(ROOT, 'site/starters')
const read = (name: string): string => readFileSync(join(SITE, name), 'utf8').replace(/\r\n/g, '\n')

interface BuildSite {
  staleSiteFiles: (opts?: { dataDir?: string; siteDir?: string }) => Promise<string[]>
  buildSiteFiles: (opts?: { dataDir?: string }) => Promise<Record<string, string>>
}
const tool = (): Promise<BuildSite> => import(pathToFileURL(join(ROOT, 'tools/starters/build-site.mjs')).href)

interface SiteBundle {
  loadStarters: (read: (file: string) => Promise<string | null>) => Promise<{
    status: string
    league: string | null
    starters: { id: string }[]
    previous: { league: string; starters: { id: string }[] } | null
    failed: unknown[]
  }>
  toCard: (r: unknown) => { id: string; links: Record<string, string> }
  picksOf: (list: unknown[], league: string | null) => { id: string }[]
}
/** starters-core.js как в браузере: IIFE в пустом контексте, наружу — только глобальный POETHStarters. */
function bundle(): SiteBundle {
  const ctx: Record<string, unknown> = { TextEncoder, URL }
  runInNewContext(read('starters-core.js'), ctx)
  return ctx.POETHStarters as SiteBundle
}

describe('сайт: стартеры', () => {
  it('starters-core.js, data/ и names.json собраны из текущего кода и списка (иначе: node tools/starters/build-site.mjs)', async () => {
    expect(await (await tool()).staleSiteFiles()).toEqual([])
  }, 60_000)

  it('data/ — копии resources/data/poe1/starters: индекс и все лиги из него', async () => {
    const files = await (await tool()).buildSiteFiles()
    const res = resolve(ROOT, 'resources/data/poe1/starters')
    const index = JSON.parse(readFileSync(join(res, 'index.json'), 'utf8'))
    expect(Object.keys(files).filter((k) => k.startsWith('data/')).sort()).toEqual(
      ['data/index.json', ...index.leagues.map((l: string) => `data/${l}.json`)].sort()
    )
    for (const name of Object.keys(files).filter((k) => k.startsWith('data/'))) {
      expect(JSON.parse(read(name)), name).toEqual(JSON.parse(readFileSync(join(res, name.slice(5)), 'utf8')))
    }
  }, 60_000)

  it('бандл грузит список тем же загрузчиком: сейчас 3.30 пуст — «появятся после анонса»', async () => {
    const S = bundle()
    const own = await S.loadStarters(async (file) => {
      try {
        return read(`data/${file}`)
      } catch {
        return null
      }
    })
    expect(own.status).toBe('empty')
    expect(own.league).toBe('3.30')
    expect(own.failed).toEqual([])
  })

  it('бандл на фикстурах: текущая лига, прошлая до анонса, «Рекомендуем» и карточка без адресов', async () => {
    const S = bundle()
    const good = await S.loadStarters(reader('good'))
    expect(good.status).toBe('ready')
    expect(good.failed).toEqual([])
    expect(good.starters).toHaveLength(4)
    expect(S.picksOf(good.starters.map(S.toCard), good.league).map((c) => c.id)).toContain('test-champion-boneshatter')
    const card = S.toCard(good.starters.find((s) => s.id === 'test-champion-boneshatter'))
    expect(card.links.pob).toBe('pobb.in')
    const empty = await S.loadStarters(reader('empty'))
    expect(empty.status).toBe('empty')
    expect(empty.previous?.league).toBe('3.29')
  })

  it('names.json на фикстурах: навык и восхождение на языке клиента', async () => {
    const names = JSON.parse((await (await tool()).buildSiteFiles({ dataDir: join(FIX, 'good') }))['names.json'])
    expect(names.classes.Duelist.asc.Champion).toBeTruthy()
    expect(names.skills['Metadata/Items/Gems/SkillGemBoneshatterAltY']?.en).toBe('Boneshatter of Carnage')
  }, 60_000)

  it('всё из данных — только через textContent: в скриптах страницы нет innerHTML, outerHTML, insertAdjacentHTML, document.write, eval', () => {
    for (const name of readdirSync(SITE).filter((n) => n.endsWith('.js'))) {
      expect(read(name), name).not.toMatch(/\.(innerHTML|outerHTML)\b|insertAdjacentHTML|document\.write|\beval\(|new Function\(/)
    }
  })

  it('страница: строгая CSP, без встроенных скриптов и стилей, сторонних скриптов нет', () => {
    const html = read('index.html')
    expect(html).toContain(`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self';`)
    expect(html).not.toMatch(/<script>(?!<\/script>)|<script(?![^>]*\bsrc=)[^>]*>|\sstyle="|\son[a-z]+="/)
    expect(html).toContain('<script src="starters-core.js" defer></script>')
    expect(html).not.toMatch(/<script[^>]*src="https?:/)
  })

  it('подвал о правах и кнопка «Как играть по стартеру в POETH» на раздел гайда', () => {
    const html = read('index.html')
    expect(html).toContain('Гайды и PoB — авторов, по ссылке. Название и логотип POETH не лицензируются. Not affiliated with GGG.')
    expect(html).toContain('Как играть по стартеру в POETH')
    expect(html).toContain('href="../guide/#starters"')
    expect(readFileSync(resolve(ROOT, 'site/guide/index.html'), 'utf8')).toContain('id="starters"')
  })
})
