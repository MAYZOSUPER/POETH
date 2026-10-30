import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { UiLang } from '@shared/types'

// Заголовок окна «Вышло обновление» (S42): на языке интерфейса, как диалоги main (services/dialogText.ts),
// и не подменяется <title> страницы после загрузки.

const state = vi.hoisted(() => ({
  windows: [] as { title?: string; listeners: Map<string, (e: { preventDefault: () => void }) => void> }[]
}))

vi.mock('electron', () => {
  class BrowserWindow {
    listeners = new Map<string, (e: { preventDefault: () => void }) => void>()
    title?: string
    constructor(opts: { title?: string }) {
      this.title = opts.title
      state.windows.push(this)
    }
    on(ev: string, fn: (e: { preventDefault: () => void }) => void): this {
      this.listeners.set(ev, fn)
      return this
    }
    once(): this {
      return this
    }
    isDestroyed(): boolean {
      return false
    }
    close(): void {
      this.listeners.get('closed')?.({ preventDefault: () => undefined })
    }
    showInactive(): void {}
  }
  return { BrowserWindow }
})
vi.mock('../../src/main/windows/rendererView', () => ({ loadRendererView: vi.fn(), serviceWindowOptions: () => ({}) }))
vi.mock('../../src/main/services/settingsStore', () => ({ getSettings: async () => ({ uiLang: 'ru' }) }))

beforeEach(() => {
  state.windows.length = 0
  vi.resetModules()
})

async function open(lang?: UiLang) {
  const m = await import('../../src/main/windows/serviceWindows')
  m.openUpdateWindow(lang)
  const w = state.windows[0]
  m.closeUpdateWindow()
  return w
}

describe('окно обновления: заголовок', () => {
  it('EN — «POETH — update», RU — прежний «POETH — обновление»', async () => {
    expect((await open('en')).title).toBe('POETH — update')
    state.windows.length = 0
    vi.resetModules()
    expect((await open('ru')).title).toBe('POETH — обновление')
  })

  it('без языка — по-русски, как раньше', async () => {
    expect((await open()).title).toBe('POETH — обновление')
  })

  it('<title> страницы («POE Trade Helper») заголовок не подменяет', async () => {
    const w = await open('en')
    const preventDefault = vi.fn()
    w.listeners.get('page-title-updated')?.({ preventDefault })
    expect(preventDefault).toHaveBeenCalled()
  })

  it('appUpdater открывает окно с языком интерфейса из настроек', async () => {
    const { readFileSync } = await import('fs')
    const src = readFileSync(new URL('../../src/main/services/appUpdater.ts', import.meta.url), 'utf8')
    expect(src).toMatch(/openUpdateWindow\(s\.uiLang\)/)
  })
})
