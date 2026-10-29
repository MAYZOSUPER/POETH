import { readFileSync, readdirSync, statSync } from 'fs'
import { join, relative, resolve } from 'path'
import { afterEach, describe, expect, it, vi } from 'vitest'

// Переменные окружения разработчика (S29) действуют только в незапакованной сборке: в установленном POETH
// они не грузят чужой адрес в окна с preload, не открывают DevTools и не пишут захваты на диск.

const app = vi.hoisted(() => ({ isPackaged: false }))
vi.mock('electron', () => ({ app }))

const { devEnv } = await import('../../src/main/devEnv')

const NAMES = ['ELECTRON_RENDERER_URL', 'OVERLAY_DEVTOOLS', 'POETH_OVERLAY_DEVTOOLS', 'POETH_SAVE_CAPTURES', 'POETH_OCR_FIXTURES'] as const

afterEach(() => {
  for (const n of NAMES) delete process.env[n]
  app.isPackaged = false
})

describe('devEnv', () => {
  it.each(NAMES)('%s: в dev — значение переменной, в собранной версии — нет', (name) => {
    process.env[name] = name === 'ELECTRON_RENDERER_URL' ? 'https://evil.example' : '1'
    expect(devEnv(name)).toBe(process.env[name])
    app.isPackaged = true
    expect(devEnv(name)).toBeUndefined()
  })
})

describe('main читает эти переменные только через devEnv', () => {
  const ROOT = resolve(__dirname, '../..')
  const files = (dir: string): string[] =>
    readdirSync(join(ROOT, dir)).flatMap((f) => {
      const p = join(ROOT, dir, f)
      return statSync(p).isDirectory() ? files(relative(ROOT, p)) : f.endsWith('.ts') ? [p] : []
    })

  it('нет process.env.<имя> вне src/main/devEnv.ts', () => {
    const re = new RegExp(`process\\.env(\\.|\\[['"])(${NAMES.join('|')})\\b`)
    const hits = files('src/main')
      .filter((f) => !f.endsWith('devEnv.ts'))
      .filter((f) => re.test(readFileSync(f, 'utf8').replace(/^\s*\/\/.*$/gm, '')))
      .map((f) => relative(ROOT, f))
    expect(hits).toEqual([])
  })
})
