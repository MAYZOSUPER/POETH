import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { getPath: () => tmpdir() }, session: {} }))

const { createIconCache, iconSourceUrl, sniffIcon, ICON_MAX_BYTES } = await import('../../src/main/services/iconCache')

const ICON = 'https://web.poecdn.com/gen/image/WzI1LDE0/ec48896769/CurrencyModValues.png'
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4])
const WEBP = new Uint8Array([...'RIFF'].map((c) => c.charCodeAt(0)).concat([0, 0, 0, 0], [...'WEBPVP8 '].map((c) => c.charCodeAt(0))))

function reply(body: Uint8Array | string, type = 'image/png', status = 200, extra: Record<string, string> = {}): Response {
  return new Response(typeof body === 'string' ? body : body.slice(), { status, headers: { 'Content-Type': type, ...extra } })
}

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'poeth-icons-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('iconSourceUrl — allowlist', () => {
  it('пускает https://web.poecdn.com/…png|webp', () => {
    expect(iconSourceUrl(ICON)?.href).toBe(ICON)
    expect(iconSourceUrl('https://web.poecdn.com/image/Art/2DItems/Currency/x.webp')).not.toBeNull()
    expect(iconSourceUrl(`${ICON}#frag`)?.href).toBe(ICON)
  })

  it.each([
    ['http (не https)', ICON.replace('https:', 'http:')],
    ['чужой хост', 'https://evil.example/CurrencyModValues.png'],
    ['хост-приманка', 'https://web.poecdn.com.evil.example/x.png'],
    ['поддомен', 'https://cdn.web.poecdn.com/x.png'],
    ['логин в адресе', 'https://user:pass@web.poecdn.com/x.png'],
    ['порт', 'https://web.poecdn.com:8443/x.png'],
    ['не картинка', 'https://web.poecdn.com/api/currency-exchange'],
    ['svg', 'https://web.poecdn.com/x.svg'],
    ['file', 'file:///C:/Windows/win.ini'],
    ['мусор', 'not a url'],
    ['пусто', ''],
    ['null', null],
    ['слишком длинный', `https://web.poecdn.com/${'a'.repeat(2100)}.png`]
  ])('%s → null', (_name, raw) => expect(iconSourceUrl(raw)).toBeNull())
})

describe('sniffIcon', () => {
  it('PNG и WebP по сигнатуре, прочее — null', () => {
    expect(sniffIcon(PNG)).toBe('image/png')
    expect(sniffIcon(WEBP)).toBe('image/webp')
    expect(sniffIcon(new TextEncoder().encode('<!doctype html>'))).toBeNull()
    expect(sniffIcon(new Uint8Array([0x89, 0x50]))).toBeNull()
  })
})

describe('createIconCache', () => {
  it('качает один раз, хранит в папке и потом отдаёт с диска', async () => {
    const fetch = vi.fn(async () => reply(PNG))
    const cache = createIconCache({ dir, fetch })
    const hit = await cache.get(ICON)
    expect(hit?.type).toBe('image/png')
    expect(Array.from(hit!.bytes)).toEqual(Array.from(PNG))
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(readdirSync(dir)).toHaveLength(1)
    expect(readdirSync(dir)[0]).toMatch(/^[0-9a-f]{40}\.png$/)

    // новый экземпляр (перезапуск) — без сети
    const offline = vi.fn(async () => {
      throw new Error('offline')
    })
    expect((await createIconCache({ dir, fetch: offline }).get(ICON))?.type).toBe('image/png')
    expect(offline).not.toHaveBeenCalled()
  })

  it('одновременные запросы одной иконки — одна загрузка', async () => {
    const fetch = vi.fn(async () => reply(PNG))
    const cache = createIconCache({ dir, fetch })
    const all = await Promise.all([cache.get(ICON), cache.get(ICON), cache.get(ICON)])
    expect(all.every((h) => h?.type === 'image/png')).toBe(true)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('чужой хост не качается вовсе', async () => {
    const fetch = vi.fn(async () => reply(PNG))
    expect(await createIconCache({ dir, fetch }).get('https://evil.example/x.png')).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })

  it.each([
    ['text/html', () => reply('<!doctype html>', 'text/html')],
    ['svg', () => reply('<svg/>', 'image/svg+xml')],
    ['png-заголовок, но внутри html', () => reply('<!doctype html><html></html>', 'image/png')],
    ['webp-заголовок, внутри png', () => reply(PNG, 'image/webp')],
    ['404', () => reply(PNG, 'image/png', 404)],
    ['Content-Length больше лимита', () => reply(PNG, 'image/png', 200, { 'Content-Length': String(ICON_MAX_BYTES + 1) })]
  ])('отказ: %s → null и ничего на диске', async (_name, make) => {
    const cache = createIconCache({ dir, fetch: async () => make() })
    expect(await cache.get(ICON)).toBeNull()
    expect(readdirSync(dir)).toHaveLength(0)
  })

  it('тело больше лимита обрывается, даже без Content-Length', async () => {
    const big = new Uint8Array(64 * 1024)
    big.set(PNG)
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        for (let i = 0; i < 8; i++) c.enqueue(big.slice())
        c.close()
      }
    })
    const cache = createIconCache({ dir, maxBytes: 100 * 1024, fetch: async () => new Response(stream, { headers: { 'Content-Type': 'image/png' } }) })
    expect(await cache.get(ICON)).toBeNull()
    expect(readdirSync(dir)).toHaveLength(0)
  })

  it('WebP принимается', async () => {
    const cache = createIconCache({ dir, fetch: async () => reply(WEBP, 'image/webp; charset=binary') })
    expect((await cache.get(ICON))?.type).toBe('image/webp')
    expect(readdirSync(dir)[0]).toMatch(/\.webp$/)
  })

  it('после сбоя сети не долбит сервер, пока не пройдёт пауза', async () => {
    let t = 1000
    let fail = true
    const fetch = vi.fn(async () => {
      if (fail) throw new Error('offline')
      return reply(PNG)
    })
    const cache = createIconCache({ dir, fetch, retryMs: 60_000, now: () => t })
    expect(await cache.get(ICON)).toBeNull()
    expect(await cache.get(ICON)).toBeNull()
    expect(fetch).toHaveBeenCalledTimes(1)
    fail = false
    t += 60_001
    expect((await cache.get(ICON))?.type).toBe('image/png')
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('подменённый файл в кэше (не картинка) не отдаётся, иконка качается заново', async () => {
    const first = createIconCache({ dir, fetch: async () => reply(PNG) })
    await first.get(ICON)
    const [file] = readdirSync(dir)
    writeFileSync(join(dir, file), '<script>alert(1)</script>')
    const fetch = vi.fn(async () => reply(PNG))
    expect((await createIconCache({ dir, fetch }).get(ICON))?.type).toBe('image/png')
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('лимит файлов: сверх него отдаём, но на диск не пишем', async () => {
    const cache = createIconCache({ dir, maxFiles: 1, fetch: async () => reply(PNG) })
    expect(await cache.get(ICON)).not.toBeNull()
    expect(await cache.get(ICON.replace('CurrencyModValues', 'CurrencyRerollRare'))).not.toBeNull()
    expect(readdirSync(dir)).toHaveLength(1)
  })
})
