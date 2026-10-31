// Готовые строки PoE 2 для новичков (библиотека, S62): что ищет каждая — в описании (ключи i18n
// regex.poe2.preset.<id>.name / .desc). Строки собираются движком из данных генератора под язык клиента.

import type { Poe2RegexData, Poe2ScaryReason, Poe2VendorQuery, TabletQuery, WaystoneQuery } from '../../types/regex'
import { selectable } from './common'
import { buildTabletRegex, emptyTabletQuery } from './tablet'
import { buildPoe2VendorRegex, emptyPoe2VendorQuery } from './vendor'
import { buildWaystoneRegex, emptyWaystoneQuery } from './waystone'

export interface Poe2Preset {
  id: string
  page: 'waystone' | 'tablet' | 'vendor'
  starter?: boolean
  waystone?: (data: Poe2RegexData) => Partial<WaystoneQuery>
  tablet?: Partial<TabletQuery>
  vendor?: Partial<Poe2VendorQuery>
}

/** Моды путевых камней, которые опасны большинству билдов (по пометкам генератора). */
export function scaryWaystoneIds(data: Poe2RegexData, reasons: Poe2ScaryReason[]): string[] {
  return data.waystone.mods.filter((m) => m.scary && reasons.includes(m.scary) && selectable(m)).map((m) => m.id)
}

export const POE2_PRESETS: readonly Poe2Preset[] = [
  {
    id: 'waystoneSafe',
    page: 'waystone',
    starter: true,
    waystone: (d) => ({ avoid: scaryWaystoneIds(d, ['maxRes', 'recovery', 'noDamage']) })
  },
  {
    id: 'waystoneLoot',
    page: 'waystone',
    waystone: (d) => ({ avoid: scaryWaystoneIds(d, ['maxRes', 'noDamage']), thresholds: { itemRarity: 30, packSize: 20 } })
  },
  { id: 'waystoneHigh', page: 'waystone', waystone: () => ({ tierMin: 15, tierMax: 16, unidentified: 'exclude' }) },
  { id: 'tabletFresh', page: 'tablet', tablet: { usesMin: 10 } },
  { id: 'poe2MoveSpeed', page: 'vendor', starter: true, vendor: { mods: { moveSpeed: 10 }, itemClass: 'boots' } },
  { id: 'poe2Resists', page: 'vendor', vendor: { mods: { resFire: 10, resCold: 10, resLightning: 10, resAll: 5 } } },
  { id: 'poe2SpellLevels', page: 'vendor', vendor: { mods: { gemSpell: 1, gemFire: 1, gemCold: 1, gemLightning: 1, gemChaos: 1, gemPhys: 1 } } },
  { id: 'poe2Sockets', page: 'vendor', vendor: { sockets: 2 } }
]

/** Текст пресета для данных языка клиента ('' — пусто или длиннее лимита). */
export function poe2PresetText(p: Poe2Preset, data: Poe2RegexData): string {
  const r =
    p.page === 'waystone'
      ? buildWaystoneRegex(data.waystone, { ...emptyWaystoneQuery(), ...(p.waystone?.(data) ?? {}) })
      : p.page === 'tablet'
        ? buildTabletRegex(data.tablet, { ...emptyTabletQuery(), ...p.tablet })
        : buildPoe2VendorRegex(data.vendor, { ...emptyPoe2VendorQuery(), ...p.vendor })
  return r.ok ? r.text : ''
}
