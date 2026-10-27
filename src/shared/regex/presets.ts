// Готовые строки для новичков (библиотека): что ищет каждая — в описании (ключи i18n
// regex.preset.<id>.name / .desc). Строки собираются движком под язык клиента игры, а для
// карт — из данных генератора, поэтому всегда совпадают с текущими токенами.

import type { MapQuery, MapRegexData, RegexLang, VendorQuery } from '../types/regex'
import { buildMapRegex, emptyMapQuery } from './maps'
import { buildVendorRegex, emptyVendorQuery } from './vendor'

export interface RegexPreset {
  id: string
  /** 'maps' — нужны данные карт; 'vendor' — торговец/стэш */
  page: 'maps' | 'vendor'
  /** Пометка для новичка: с чего начать */
  starter?: boolean
  vendor?: Partial<VendorQuery>
  maps?: (data: MapRegexData) => Partial<MapQuery>
}

/** Моды, которые стоит избегать большинству билдов (по пометкам генератора). */
function scaryIds(data: MapRegexData, reasons: string[]): string[] {
  return data.mods.filter((m) => m.scary && reasons.includes(m.scary) && !m.tags.includes('t17')).map((m) => m.id)
}

export const REGEX_PRESETS: readonly RegexPreset[] = [
  {
    id: 'mapsSafe',
    page: 'maps',
    starter: true,
    maps: (d) => ({ avoid: scaryIds(d, ['reflect', 'regen', 'maxRes', 'recovery']) })
  },
  {
    id: 'mapsQuantity',
    page: 'maps',
    maps: (d) => ({
      avoid: scaryIds(d, ['reflect', 'regen']),
      thresholds: { quantity: 70, packSize: 20 }
    })
  },
  { id: 'chromatic', page: 'vendor', starter: true, vendor: { rgb: true } },
  { id: 'links4', page: 'vendor', starter: true, vendor: { links: 4 } },
  { id: 'links5', page: 'vendor', vendor: { links: 5 } },
  { id: 'jeweller', page: 'vendor', vendor: { sixSockets: true } },
  { id: 'moveSpeed', page: 'vendor', starter: true, vendor: { movementSpeed: 10 } },
  { id: 'plusGems', page: 'vendor', vendor: { plusGemLevel: true } },
  { id: 'gemQuality', page: 'vendor', vendor: { quality: 1 } },
  { id: 'leveling', page: 'vendor', vendor: { links: 3, movementSpeed: 10, plusGemLevel: true } }
]

/** Текст пресета для языка клиента; null — нет данных карт для пресета карт. */
export function presetText(p: RegexPreset, lang: RegexLang, mapData: MapRegexData | null): string | null {
  if (p.page === 'vendor') return buildVendorRegex(lang, { ...emptyVendorQuery(), ...p.vendor }).text
  if (!mapData || !p.maps) return null
  return buildMapRegex(mapData, { ...emptyMapQuery(), ...p.maps(mapData) }).text
}
