import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { resolve } from 'path'
import { DOMAIN_DICTS } from '../src/renderer/src/i18n/dicts'

// Мёртвые ключи (S42, выписка S37): нигде не показывались — удалены из RU и EN. Если ключ снова понадобится,
// пусть появится осознанно (и этот список поправят), а не вернётся из старой ветки.

const REMOVED = [
  'pc.session.label',
  'pc.result.listings',
  'pc1.rate.title',
  'overlay.item.title',
  'overlay.item.client',
  'overlay.item.lines',
  'overlay.item.close',
  'overlay.item.demo',
  'overlay.item.keys',
  'overlay.status.admin',
  'net.retry',
  'deals.col.where',
  'lev.class.auto',
  'lev.optional',
  'lev.rewards.passive',
  'lev.hud.next',
  // дубль 'wealth.unpriced.rare': Gains.tsx для причины 'rare' берёт его, до этого ключа не доходило
  'wealth.reason.rare'
]

describe('удалённые ключи i18n (S42)', () => {
  it.each(REMOVED)('%s нет ни в RU, ни в EN', (key) => {
    for (const [domain, d] of Object.entries(DOMAIN_DICTS)) {
      expect(key in d.ru, `${domain}.ru`).toBe(false)
      expect(key in d.en, `${domain}.en`).toBe(false)
    }
  })

  it('в коде (src/**) их тоже нет', () => {
    const files = (dir: string): string[] =>
      readdirSync(dir).flatMap((f) => {
        const p = resolve(dir, f)
        return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(f) ? [p] : []
      })
    const src = files(resolve(__dirname, '../src')).map((f) => readFileSync(f, 'utf8')).join('\n')
    expect(REMOVED.filter((k) => src.includes(`'${k}'`) || src.includes(`"${k}"`))).toEqual([])
  })

  it('заглушка .coming-soon удалена из globals.css', () => {
    const css = readFileSync(resolve(__dirname, '../src/renderer/src/styles/globals.css'), 'utf8')
    expect(css).not.toContain('.coming-soon')
  })
})
