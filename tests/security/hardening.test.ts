import { readFileSync, readdirSync, statSync } from 'fs'
import { join, relative, resolve } from 'path'
import { describe, expect, it } from 'vitest'

// Сторож hardening Electron (S29) по исходникам: следующие этапы не должны незаметно открыть окна
// с preload чужим страницам, отдать renderer'у общий ipcRenderer или вставить чужой HTML.
// Подробно — docs/security.md.

const ROOT = resolve(__dirname, '../..')

function files(dir: string, ext: RegExp): string[] {
  const abs = join(ROOT, dir)
  return readdirSync(abs).flatMap((f) => {
    const p = join(abs, f)
    return statSync(p).isDirectory() ? files(relative(ROOT, p), ext) : ext.test(f) ? [p] : []
  })
}

/** Код без комментариев. */
function code(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}

const name = (f: string): string => relative(ROOT, f).replace(/\\/g, '/')
const MAIN = files('src/main', /\.ts$/)
const PRELOAD = files('src/preload', /\.ts$/)
const RENDERER = files('src/renderer/src', /\.tsx?$/)

describe('main: защита окон ставится до IPC и окон', () => {
  const src = code(join(ROOT, 'src/main/index.ts'))

  it('installAppSecurity() — верхний уровень, раньше схемы poeth:// и bootstrap', () => {
    const at = src.indexOf('\ninstallAppSecurity()')
    expect(at).toBeGreaterThan(0)
    expect(at).toBeLessThan(src.indexOf('\nregisterPoethScheme()'))
    expect(at).toBeLessThan(src.indexOf('app.whenReady().then(bootstrap)'))
  })

  it('ipcMain регистрируют только домены src/main/ipc/** (их оборачивает security/ipcGuard.ts)', () => {
    const outside = MAIN.filter((f) => !/src[\\/]main[\\/](ipc|security)[\\/]/.test(f)).filter((f) =>
      /ipcMain\.(handle|handleOnce|on|once|addListener|prependListener)\(/.test(code(f))
    )
    expect(outside.map(name)).toEqual([])
  })
})

describe('main: webPreferences окон', () => {
  it.each([
    [/webSecurity:\s*false/, 'webSecurity: false'],
    [/allowRunningInsecureContent:\s*true/, 'allowRunningInsecureContent'],
    [/experimentalFeatures:\s*true/, 'experimentalFeatures'],
    [/nodeIntegration(InSubFrames|InWorker)?:\s*true/, 'nodeIntegration: true'],
    [/contextIsolation:\s*false/, 'contextIsolation: false'],
    [/webviewTag:\s*true/, 'webviewTag: true']
  ])('нигде нет %s', (re) => {
    for (const f of MAIN) expect(re.test(code(f)), name(f)).toBe(false)
  })

  it('каждое webPreferences с preload — в песочнице, с contextIsolation: true и nodeIntegration: false', () => {
    let seen = 0
    for (const f of MAIN) {
      const src = code(f)
      for (const m of src.matchAll(/webPreferences:\s*\{([^}]*)\}/g)) {
        if (!/preload:/.test(m[1])) continue
        seen++
        expect(m[1], name(f)).toMatch(/contextIsolation:\s*true/)
        expect(m[1], name(f)).toMatch(/nodeIntegration:\s*false/)
        // собранный preload требует только «electron» (проверка ниже) — песочнице этого хватает
        expect(m[1], name(f)).toMatch(/sandbox:\s*true/)
      }
    }
    // компаньон, оверлей, сайдбар трейд-окна, служебные окна
    expect(seen).toBeGreaterThanOrEqual(4)
  })

  it('страница сайта GGG грузится только в webContents без preload (siteWebPreferences)', () => {
    for (const f of MAIN) {
      const src = code(f)
      if (!/loadURL\([^)]*(pathofexile|siteLoginUrl|https:\/\/)/.test(src)) continue
      expect(src, name(f)).toMatch(/siteWebPreferences\(\)/)
    }
  })
})

describe('preload: только узкий мост', () => {
  it('preload в песочнице: из модулей — только electron и свои исходники', () => {
    for (const f of PRELOAD) {
      for (const m of code(f).matchAll(/^import\s+(?!type\b)[^'"]*from\s+'([^']+)'/gm)) {
        expect(m[1], name(f)).toMatch(/^(electron|\.{1,2}\/|@shared\/)/)
      }
      expect(code(f), name(f)).not.toMatch(/\brequire\(/)
    }
  })

  it('в renderer уходит один объект overlayApi', () => {
    const exposed = PRELOAD.flatMap((f) => [...code(f).matchAll(/exposeInMainWorld\(\s*'([^']+)'/g)].map((m) => m[1]))
    expect(exposed).toEqual(['overlayApi'])
  })

  it('ipcRenderer не отдаётся наружу и каналы — константы IPC, а не строки из renderer', () => {
    for (const f of PRELOAD) {
      const src = code(f)
      expect(src, name(f)).not.toMatch(/exposeInMainWorld\([^)]*ipcRenderer/)
      // ipcRenderer как значение (а не вызов его метода) — вне строк import
      expect(src.replace(/^import .*$/gm, ''), name(f)).not.toMatch(/:\s*ipcRenderer\b|ipcRenderer\s*[,})]/)
      for (const m of src.matchAll(/ipcRenderer\.(invoke|send|sendSync|postMessage)\(\s*([^,)]+)/g)) {
        expect(m[2], `${name(f)}: ${m[0]}`).toMatch(/^(IPC\.|[a-z]{1,2}\.)/)
      }
      for (const m of src.matchAll(/\bsubscribe(?:<[^>]*>)?\(\s*([^,)]+)/g)) {
        if (name(f).endsWith('subscribe.ts')) continue
        expect(m[1], `${name(f)}: ${m[0]}`).toMatch(/^IPC\.events\./)
      }
    }
  })
})

describe('renderer: CSP всех страниц', () => {
  it.each(['index.html', 'overlay.html', 'trade-sidebar.html'])('%s', (page) => {
    const html = readFileSync(join(ROOT, 'src/renderer', page), 'utf8')
    const csp = /http-equiv="Content-Security-Policy"\s+content="([^"]+)"/.exec(html)?.[1] ?? ''
    const dir = (n: string): string => csp.split(';').map((s) => s.trim()).find((s) => s.startsWith(`${n} `)) ?? ''
    expect(dir('default-src')).toBe("default-src 'self'")
    expect(dir('script-src')).toBe("script-src 'self'")
    expect(dir('object-src')).toBe("object-src 'none'")
    expect(dir('base-uri')).toBe("base-uri 'none'")
    expect(dir('form-action')).toBe("form-action 'none'")
    // картинки: свои, data: и poeth:// (иконки, бренд) — не любой файл с диска и не сеть
    expect(dir('img-src')).toBe("img-src 'self' data: poeth:")
    expect(csp).not.toMatch(/unsafe-eval|https?:|\*/)
  })
})

describe('renderer: чужой текст не становится HTML или ссылкой', () => {
  it('dangerouslySetInnerHTML — только встроенный спрайт иконок', () => {
    const hits = RENDERER.filter((f) => /dangerouslySetInnerHTML/.test(code(f)))
    expect(hits.map(name)).toEqual(['src/renderer/src/overlay/Icon.tsx'])
    expect(code(hits[0])).toMatch(/dangerouslySetInnerHTML=\{\{ __html: sprite \}\}/)
    expect(code(hits[0])).toMatch(/import sprite from '[^']*icons-sprite\.svg\?raw'/)
  })

  it('innerHTML — только спрайт иконок (встроенный или poeth://brand/)', () => {
    for (const f of RENDERER) {
      for (const m of code(f).matchAll(/\.(innerHTML|outerHTML)\s*=\s*([^\n;]+)/g)) {
        expect(m[2].trim(), name(f)).toMatch(/^(sprite|svg)$/)
      }
      expect(code(f), name(f)).not.toMatch(/insertAdjacentHTML|document\.write|createContextualFragment/)
    }
  })

  it('нет ссылок <a> и eval: внешние адреса открывает только main (openExternal с allowlist)', () => {
    for (const f of RENDERER) {
      const src = code(f)
      expect(src, name(f)).not.toMatch(/<a[\s>]/)
      expect(src, name(f)).not.toMatch(/\beval\(|new Function\(/)
    }
  })
})
