import { deflateSync } from 'zlib'
import { describe, expect, it } from 'vitest'
import {
  CODE_PREFIX,
  MAX_CODE_CHARS,
  MAX_JSON_BYTES,
  decodeStrategyCode,
  extractCode,
  fromBase64Url,
  strategyFingerprint,
  toBase64Url
} from '@shared/advisor/codec'
import { decodeStrategyNode, encodeStrategyNode, inflateNode } from '@shared/advisor/codecNode'
import { deflateBrowser, inflateBrowser } from '@shared/advisor/codecBrowser'
import { LIMITS, validateStrategy } from '@shared/advisor/validate'
import type { AdvisorStrategy } from '@shared/types/advisor'
import { strategy, T } from './fixtures'

// Код стратегии POETH1 (S17): недоверенные данные — лимиты до и после распаковки, строгий валидатор после.

const raw = (payload: unknown): string => CODE_PREFIX + toBase64Url(new Uint8Array(deflateSync(Buffer.from(JSON.stringify(payload)))))

const full = (): AdvisorStrategy =>
  strategy({
    id: 'essence-ambush',
    source: { kind: 'mine', author: 'mapper_42', date: '2026-11-15' },
    measured: { maps: 41, hours: 3.5, perHour: 88, date: '2026-11-14', patch: '3.30' },
    atlas: [T('Ветки сущностей и сундуков', 'Essence and strongbox branches')],
    atlasTree: 'https://www.pathofexile.com/fullscreen-atlas-skill-tree/3.30.0/AAAABgMAJQ8b',
    patch: '3.30'
  })

describe('советник: код POETH1', () => {
  it('туда-обратно: тот же объект, что после валидатора', async () => {
    const s = full()
    const code = await encodeStrategyNode(s)
    expect(code.startsWith('POETH1:')).toBe(true)
    expect(code).toMatch(/^POETH1:[A-Za-z0-9_-]+$/)
    const r = await decodeStrategyNode(code)
    expect(r.ok && r.strategy).toEqual(s)
    expect(r.ok && r.code).toBe(code)
  })

  it('код из ссылки сайта, ссылки протокола, с переносами строк и %-кодированием', async () => {
    const code = await encodeStrategyNode(full())
    for (const input of [
      `https://mayzosuper.github.io/POETH/strategies/view#${code}`,
      `poeth-strategy://import#${code}`,
      `  ${code.slice(0, 30)}\n${code.slice(30, 70)}\r\n ${code.slice(70)}  `,
      `смотри: ${code}.`,
      `https://mayzosuper.github.io/POETH/strategies/view#${encodeURIComponent(code)}`
    ]) {
      expect(extractCode(input)).toBe(code)
      const r = await decodeStrategyNode(input)
      expect(r.ok).toBe(true)
    }
  })

  it('не код: пусто, обычный текст, другая программа', async () => {
    expect(await decodeStrategyNode('')).toEqual({ ok: false, error: 'empty' })
    expect(await decodeStrategyNode('   ')).toEqual({ ok: false, error: 'empty' })
    expect(await decodeStrategyNode('привет, вот моя стратегия: сущности + засада, вход 3 c')).toEqual({ ok: false, error: 'notcode' })
    expect(await decodeStrategyNode('eNrtWktv2zgQ…')).toEqual({ ok: false, error: 'notcode' })
    expect(await decodeStrategyNode('POETH0:eJyrVkrOz0vO')).toEqual({ ok: false, error: 'notcode' })
  })

  it('обрезанный и испорченный код — «обрезан или повреждён»', async () => {
    const code = await encodeStrategyNode(full())
    for (const cut of [code.slice(0, Math.floor(code.length * 0.6)), code.slice(0, 40), 'POETH1:', 'POETH1:A']) {
      expect((await decodeStrategyNode(cut)).ok).toBe(false)
      expect(await decodeStrategyNode(cut)).toMatchObject({ error: 'broken' })
    }
    // мусор в base64url и мусор после распаковки
    expect(await decodeStrategyNode('POETH1:abc$%^')).toMatchObject({ ok: false })
    expect(await decodeStrategyNode('POETH1:' + toBase64Url(new Uint8Array([1, 2, 3, 4, 5, 6])))).toMatchObject({ error: 'broken' })
    expect(await decodeStrategyNode('POETH1:' + toBase64Url(new Uint8Array(deflateSync(Buffer.from('не json')))))).toMatchObject({ error: 'broken' })
    // испорченный байт в середине — либо deflate не сходится, либо JSON
    const bytes = fromBase64Url(code.slice(7)) as Uint8Array
    bytes[Math.floor(bytes.length / 2)] ^= 0xff
    expect(await decodeStrategyNode('POETH1:' + toBase64Url(bytes))).toMatchObject({ ok: false })
  })

  it('zip-бомба и огромный код — «слишком большой», распаковка обрывается на пределе', async () => {
    const bomb = 'POETH1:' + toBase64Url(new Uint8Array(deflateSync(Buffer.alloc(20 * 1024 * 1024, 0x20))))
    expect(bomb.length).toBeLessThan(MAX_CODE_CHARS)
    expect(await decodeStrategyNode(bomb)).toEqual({ ok: false, error: 'toolarge' })
    expect(() => inflateNode(fromBase64Url(bomb.slice(7)) as Uint8Array, MAX_JSON_BYTES)).toThrow()
    expect(await decodeStrategyNode('POETH1:' + 'A'.repeat(MAX_CODE_CHARS))).toEqual({ ok: false, error: 'toolarge' })
    // и в браузерной распаковке (сайт)
    const viaBrowser = await decodeStrategyCode(bomb, inflateBrowser)
    expect(viaBrowser).toEqual({ ok: false, error: 'toolarge' })
  })

  it('новая версия: префикс POETH2 и схема 2 внутри — «обновите POETH»', async () => {
    const code = await encodeStrategyNode(full())
    expect(await decodeStrategyNode('POETH2:' + code.slice(7))).toEqual({ ok: false, error: 'newer' })
    expect(await decodeStrategyNode(raw({ schema: 2, strategy: full(), newField: 1 }))).toEqual({ ok: false, error: 'newer' })
    expect(await decodeStrategyNode(raw({ schema: 0, strategy: full() }))).toMatchObject({ ok: false, error: 'invalid' })
    expect(await decodeStrategyNode(raw({ strategy: full() }))).toMatchObject({ ok: false, error: 'invalid' })
    expect(await decodeStrategyNode(raw([1, 2]))).toMatchObject({ ok: false, error: 'invalid' })
  })

  it('после распаковки — строгий валидатор: HTML, лишние поля, цены, http-ссылки — ошибка с причиной', async () => {
    const bad = (patch: Record<string, unknown>) => raw({ schema: 1, strategy: { ...full(), ...patch } })
    expect(await decodeStrategyNode(bad({ name: { ru: '<img src=x onerror=alert(1)>' } }))).toMatchObject({ error: 'invalid', detail: expect.stringContaining('HTML') })
    expect(await decodeStrategyNode(bad({ price: 10 }))).toMatchObject({ error: 'invalid', detail: expect.stringContaining('price') })
    expect(await decodeStrategyNode(bad({ atlasTree: 'http://evil.example/tree' }))).toMatchObject({ error: 'invalid', detail: expect.stringContaining('https') })
    expect(await decodeStrategyNode(bad({ atlasTree: 'javascript:alert(1)' }))).toMatchObject({ error: 'invalid' })
    expect(await decodeStrategyNode(raw({ schema: 1, strategy: full(), account: 'me' }))).toMatchObject({ error: 'invalid', detail: expect.stringContaining('account') })
    // без значений по умолчанию: patch обязателен
    const { patch: _p, ...noPatch } = full()
    expect(await decodeStrategyNode(raw({ schema: 1, strategy: noPatch }))).toMatchObject({ error: 'invalid', detail: expect.stringContaining('patch') })
  })

  it('самая большая допустимая стратегия (кириллица, все лимиты) помещается в код', async () => {
    const ru = (n: number) => 'ж'.repeat(n)
    const en = (n: number) => 'w'.repeat(n)
    const txt = (n: number) => ({ ru: ru(n), en: en(n) })
    const line = (i: number) => ({ item: { kind: 'stackable' as const, ref: `Item ${i} ${'x'.repeat(80)}`, label: txt(LIMITS.label) }, qty: 1, note: txt(LIMITS.note) })
    const big = full()
    Object.assign(big, {
      name: txt(LIMITS.name),
      summary: txt(LIMITS.summary),
      why: txt(LIMITS.why),
      steps: Array.from({ length: LIMITS.steps }, () => txt(LIMITS.step)),
      atlas: Array.from({ length: LIMITS.atlasItems }, () => txt(LIMITS.atlas)),
      warnings: Array.from({ length: LIMITS.warnings }, () => txt(LIMITS.warning)),
      inputs: Array.from({ length: LIMITS.inputs }, (_, i) => line(i)),
      outputs: Array.from({ length: LIMITS.outputs }, (_, i) => line(100 + i)),
      build: { damage: 3, survival: 3, speed: 3, note: txt(LIMITS.buildNote) }
    })
    const checked = validateStrategy(JSON.parse(JSON.stringify(big)))
    expect(checked.ok).toBe(true)
    const json = new TextEncoder().encode(JSON.stringify({ schema: 1, strategy: big }))
    expect(json.length).toBeLessThan(MAX_JSON_BYTES)
    const code = await encodeStrategyNode(big)
    expect(code.length).toBeLessThan(MAX_CODE_CHARS)
    expect((await decodeStrategyNode(code)).ok).toBe(true)
  })

  it('сайт и приложение понимают коды друг друга (CompressionStream ↔ zlib)', async () => {
    const s = full()
    const node = await encodeStrategyNode(s)
    expect((await decodeStrategyCode(node, inflateBrowser)).ok).toBe(true)
    const json = new TextEncoder().encode(JSON.stringify({ schema: 1, strategy: s }))
    const browser = CODE_PREFIX + toBase64Url(await deflateBrowser(json))
    const r = await decodeStrategyNode(browser)
    expect(r.ok && r.strategy).toEqual(s)
  })

  it('base64url: без паддинга, только безопасные для ссылки символы', () => {
    for (const n of [0, 1, 2, 3, 4, 5, 255, 1000]) {
      const bytes = Uint8Array.from({ length: n }, (_, i) => (i * 37 + 11) & 0xff)
      const s = toBase64Url(bytes)
      expect(s).toMatch(/^[A-Za-z0-9_-]*$/)
      expect(fromBase64Url(s)).toEqual(bytes)
    }
    expect(fromBase64Url('abcde')).toBeNull() // длина 4n+1 невозможна
    expect(fromBase64Url('ab+/')).toBeNull()
  })

  it('отпечаток: содержание без источника — та же для своей, импорта и кода с ником; другой — при правке содержания', () => {
    const s = full()
    expect(strategyFingerprint({ ...s, source: { ...s.source, kind: 'imported' } })).toBe(strategyFingerprint(s))
    expect(strategyFingerprint({ ...s, source: { kind: 'mine', date: '2026-12-01' } })).toBe(strategyFingerprint(s))
    expect(strategyFingerprint({ ...s, draft: true })).toBe(strategyFingerprint(s))
    expect(strategyFingerprint({ ...s, minutesPerMap: 6 })).not.toBe(strategyFingerprint(s))
    expect(strategyFingerprint({ ...s, steps: [T('другой шаг', 'other step')] })).not.toBe(strategyFingerprint(s))
  })
})
