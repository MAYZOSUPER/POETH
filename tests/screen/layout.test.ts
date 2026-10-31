import { describe, expect, it } from 'vitest'
import { LAYOUT_LIMITS, parseLayoutSet } from '@shared/screen/layout'
import { loadLayouts } from './helpers'

// Файл раскладок (S68): приходит и с пакетом данных — пределы на вкладки, ячейки, имена, координаты.

const slot = (item: unknown = 'Chaos Orb') => ({ x: 10, y: 20, w: 70, h: 70, item })
const set = (tabs: unknown[]) => ({ version: 1, game: 'poe2', refHeight: 1440, tabs })

describe('parseLayoutSet', () => {
  it('раскладки PoE 2 в данных проходят', () => {
    const l = loadLayouts('poe2')
    expect(l.tabs.length).toBe(13)
    expect(l.tabs.every((t) => t.slots.length <= LAYOUT_LIMITS.slots)).toBe(true)
  })

  it('свободная ячейка — item null', () => {
    expect(parseLayoutSet(set([{ id: 'orbs', slots: [slot(null)] }]))?.tabs[0].slots[0].item).toBeNull()
  })

  it('слишком много вкладок или ячеек — весь файл отклонён', () => {
    expect(parseLayoutSet(set(Array.from({ length: LAYOUT_LIMITS.tabs + 1 }, (_, i) => ({ id: `t${i}`, slots: [slot()] }))))).toBeNull()
    expect(parseLayoutSet(set([{ id: 'orbs', slots: Array.from({ length: LAYOUT_LIMITS.slots + 1 }, () => slot()) }]))).toBeNull()
  })

  it('кривые id, длинные имена, огромные координаты — мимо', () => {
    const r = parseLayoutSet(
      set([
        { id: '../evil', slots: [slot()] },
        {
          id: 'ok',
          slots: [slot('x'.repeat(LAYOUT_LIMITS.name + 1)), { ...slot(), x: 1e9 }, { ...slot(), alt: Array.from({ length: 20 }, (_, i) => `A${i}`) }, slot()]
        }
      ])
    )
    expect(r?.tabs.map((t) => t.id)).toEqual(['ok'])
    expect(r?.tabs[0].slots).toHaveLength(2)
    expect(r?.tabs[0].slots[0].alt).toHaveLength(LAYOUT_LIMITS.alt)
  })

  it('эталонная высота вне пределов — null', () => {
    expect(parseLayoutSet({ ...set([{ id: 'orbs', slots: [slot()] }]), refHeight: 1e6 })).toBeNull()
  })
})
