// client_strings.json → TranslationDict. JSON строит tools/data/sync-apt-data.mjs из client_strings.js APT
// (без исполнения кода): RegExp сериализованы как {"$re": source, "$flags": flags}.

import type { TranslationDict } from './interfaces'

interface SerializedRegExp {
  $re: string
  $flags: string
}

function isSerializedRegExp(v: unknown): v is SerializedRegExp {
  return typeof v === 'object' && v !== null && typeof (v as SerializedRegExp).$re === 'string'
}

export function reviveClientStrings(json: unknown): TranslationDict {
  if (typeof json !== 'object' || json === null || Array.isArray(json)) {
    throw new Error('client_strings.json: ожидался объект')
  }
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(json as Record<string, unknown>)) {
    out[key] = isSerializedRegExp(value) ? new RegExp(value.$re, value.$flags ?? '') : value
  }
  for (const key of ['ITEM_CLASS', 'RARITY', 'MODIFIER_LINE'] as const) {
    if (!(key in out)) throw new Error(`client_strings.json: нет ключа ${key}`)
  }
  return out as unknown as TranslationDict
}
