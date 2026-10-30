import { sameItem } from '@shared/build/equipCompare'
import type { EquipEntry, EquipItem, EquipSlot } from '@shared/types/equip'
import type { PobCompareRequest } from '@shared/types/pobCompare'

// Тексты надетых вещей для «Точного расчёта (PoB)» (S44): только в памяти окна оверлея, на диск не пишутся
// (equipped.json хранит одни числа). Попадают сюда по «Запомнить как надетое» и по Ctrl+D на надетой вещи при
// включённой бете; в запрос идут только для слотов, где запомнена та же вещь (sameItem по числам).

const MAX_CHARS = 20
const worn = new Map<string, Map<EquipSlot, { eq: EquipItem; text: string }>>()
const key = (char: string | null): string => char ?? ''

export function rememberWorn(char: string | null, slot: EquipSlot, eq: EquipItem, text: string): void {
  const k = key(char)
  let m = worn.get(k)
  if (!m) {
    if (worn.size >= MAX_CHARS) worn.delete(worn.keys().next().value as string)
    m = new Map()
    worn.set(k, m)
  }
  m.set(slot, { eq, text })
}

/** Надетые вещи с текстом для запроса: только совпавшие с запомненными числами. */
export function wornFor(char: string | null, entries: readonly EquipEntry[]): PobCompareRequest['worn'] {
  const m = worn.get(key(char))
  if (!m) return []
  const out: PobCompareRequest['worn'] = []
  for (const e of entries) {
    const w = m.get(e.slot)
    if (w && sameItem(e, w.eq) && !e.slot.startsWith('Jewel') && !e.slot.startsWith('Flask')) out.push({ slot: e.slot as PobCompareRequest['worn'][number]['slot'], item: w.text })
  }
  return out
}

/** Для тестов. */
export function clearWorn(): void {
  worn.clear()
}
