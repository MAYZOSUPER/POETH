import { getDefaultPoe1DataStore } from '@shared/poe1/data'
import { parseItemText, type ParsedItem } from '@shared/poe1/parser'

// Факты о предмете находки по тексту item.extended.text — парсер S2 (EN/RU).
// Строки модов на тосте берём из JSON fetch (это ровно текст сайта): в тексте с трейда
// crafted/fractured не отличить от explicit (заметка S2), а парсер даёт надёжные факты:
// уровень предмета, связи, осквернение, влияние, тир карты, уровень камня.

export interface ItemFact {
  key: string
  params?: Record<string, string | number>
}

const cache = new Map<string, Promise<ItemFact[]>>()

function facts(item: ParsedItem): ItemFact[] {
  const out: ItemFact[] = []
  if (item.mapTier) out.push({ key: 'live.fact.mapTier', params: { n: item.mapTier } })
  if (item.gemLevel) out.push({ key: 'live.fact.gem', params: { n: item.gemLevel, q: item.quality ?? 0 } })
  else if (item.itemLevel && !item.mapTier) out.push({ key: 'live.fact.ilvl', params: { n: item.itemLevel } })
  if (item.sockets?.linked && item.sockets.linked >= 5) out.push({ key: 'live.fact.links', params: { n: item.sockets.linked } })
  if (item.influences.length) out.push({ key: 'live.fact.influence' })
  if (item.isFractured) out.push({ key: 'live.fact.fractured' })
  if (item.isSynthesised) out.push({ key: 'live.fact.synthesised' })
  if (item.isCorrupted) out.push({ key: 'live.fact.corrupted' })
  return out
}

/** Разобрать текст предмета (один раз на текст); не разобрался — пустой список. */
export function itemFacts(text: string | undefined): Promise<ItemFact[]> {
  if (!text) return Promise.resolve([])
  let p = cache.get(text)
  if (!p) {
    p = parseItemText(text, getDefaultPoe1DataStore())
      .then((res) => (res.ok ? facts(res.value) : []))
      .catch(() => [])
    cache.set(text, p)
    if (cache.size > 100) cache.delete(cache.keys().next().value as string)
  }
  return p
}
