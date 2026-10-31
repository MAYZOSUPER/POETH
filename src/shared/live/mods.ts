import type { LiveHit } from '../types/live'
import type { Poe2Data } from '../poe2/data/Poe2Data'
import { ModifierType } from '../poe2/parser/modifiers'
import { poe2ModLineToEn } from '../build/poe2ItemEn'

// Моды находки live PoE 2 на языке клиента игры (S63, по образцу имён S31 — ./names.ts). trade2 для PoE 2 — www:
// строки модов приходят по-английски (description без разметки, live/hits.ts), а игрок с RU-клиентом видит в игре
// русские. Строка → стат EN-данных EE2 → RU-шаблон того же стата (тот же ref) → числа строки по порядку — тот же
// перевод, что у «Предмета по-английски» PoE 2 (poe2ModLineToEn, направление EN → RU). Не нашёлся стат — строка
// как есть (английская). Находки PoE 1 не трогаем: их моды — на языке сайта (siteHost). Чистые функции.

type Lang = 'ru' | 'en'

const CYR = /[А-Яа-яЁё]/

/** Нужен ли перевод модов находки на язык клиента (PoE 2, RU-клиент, есть английские строки). */
export function hitModsNeedTranslation(hit: Pick<LiveHit, 'game' | 'mods'>, gameLang: Lang): boolean {
  return hit.game === 'poe2' && gameLang === 'ru' && hit.mods.some((m) => !CYR.test(m))
}

/** Одна строка мода EN → RU по статам EE2; не вышло — null. */
export function poe2ModLineToRu(line: string, en: Poe2Data, ru: Poe2Data): string | null {
  return poe2ModLineToEn(line, ModifierType.Explicit, en, ru)
}

/**
 * Моды находки на языке клиента игры. en/ru — данные EE2 (null — ещё не загружены: как пришло). Строки, которых
 * нет в данных, остаются английскими.
 */
export function hitModsIn(hit: Pick<LiveHit, 'game' | 'mods'>, gameLang: Lang, en: Poe2Data | null, ru: Poe2Data | null): string[] {
  if (!hitModsNeedTranslation(hit, gameLang) || !en || !ru) return hit.mods
  return hit.mods.map((m) => (CYR.test(m) ? m : (poe2ModLineToRu(m, en, ru) ?? m)))
}
