import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join, resolve } from 'path'

// Сторож правила (docs/PLAN-POETH.md): «Travel to Hideout» и «Direct whisper» — только родные кнопки
// сайта, которые жмёт игрок. В коде трейд-окна и избранного не должно быть программных кликов,
// инъекций в страницу сайта и своих запросов к эндпоинтам whisper/телепорта.

const ROOT = resolve(__dirname, '../..')
const FILES = [
  'src/main/windows/tradeWindow.ts',
  'src/main/ipc/fav.ts',
  'src/main/services/favoritesStore.ts',
  'src/shared/ipc/fav.ts',
  'src/preload/domains/fav.ts',
  'src/shared/favorites',
  'src/renderer/src/trade-sidebar'
]

function collect(rel: string): string[] {
  const abs = join(ROOT, rel)
  if (statSync(abs).isFile()) return [abs]
  return readdirSync(abs).flatMap((f) => collect(join(rel, f)))
}

/** Код без комментариев (правило упоминается в комментариях — это не нарушение). */
function code(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}

const FORBIDDEN: [RegExp, string][] = [
  [/executeJavaScript/, 'выполнение JS в странице сайта'],
  [/sendInputEvent/, 'программный ввод/клик'],
  [/insertCSS|insertText/, 'инъекция в страницу сайта'],
  [/\.debugger\b/, 'отладчик webContents'],
  [/addChildView\([^)]*\)\s*;?\s*\w+\.webContents\.setDevToolsWebContents/, 'devtools на сайт'],
  [/\/api\/trade2?\/whisper/i, 'запрос к эндпоинту whisper'],
  [/hideout/i, 'запрос/кнопка телепорта в убежище']
]

describe('трейд-окно не нажимает кнопки сайта', () => {
  const files = FILES.flatMap(collect).filter((f) => /\.(ts|tsx)$/.test(f))

  it('проверяемые файлы на месте', () => {
    expect(files.length).toBeGreaterThan(8)
  })

  it.each(FORBIDDEN)('нет %s (%s)', (re) => {
    for (const f of files) expect(re.test(code(f)), f.replace(ROOT, '')).toBe(false)
  })

  it('siteView создаётся без preload, с правилами сайта S3', () => {
    const src = code(join(ROOT, 'src/main/windows/tradeWindow.ts'))
    expect(src).toMatch(/new WebContentsView\(\{ webPreferences: siteWebPreferences\(\) \}\)/)
    expect(src).toMatch(/hardenSiteContents\(siteView\.webContents/)
  })
})
