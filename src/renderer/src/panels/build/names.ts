import { findGem, gemName } from '@shared/build/data'
import type { GemsData, TreeData } from '@shared/build/types'
import type { GameLang } from '@shared/types/settings'

// Имя билда для шапки и недавних (S39). В коде PoB названия билда и автора нет — собираем из главного камня
// и восхождения на языке клиента игры: «Цепь молний · Маг стихий».

/** Главный камень на языке клиента; нет в данных — как в PoB (EN). */
export function mainSkillName(gems: GemsData | null, gemId: string | null, fallback: string, lang: GameLang): string {
  const g = gems && gemId ? findGem(gems, gemId) : null
  return g ? gemName(g, lang) : fallback
}

/** Восхождение (или класс без него) на языке клиента; без данных дерева — как в PoB. */
export function ascOrClass(
  tree: TreeData | null,
  lang: GameLang,
  classId: number,
  ascendClassId: number,
  fallback: { className: string; ascendClassName: string | null }
): string {
  const cls = tree?.classes[classId]
  const asc = cls && ascendClassId > 0 ? cls.asc[ascendClassId - 1] : undefined
  if (asc) return lang === 'ru' ? asc.ru : asc.en
  if (fallback.ascendClassName) return fallback.ascendClassName
  return cls ? (lang === 'ru' ? cls.ru : cls.en) : fallback.className
}

export function buildTitle(skill: string, who: string): string {
  return skill ? `${skill} · ${who}` : who
}
