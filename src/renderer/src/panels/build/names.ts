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

/**
 * Стартер (S59): класс и восхождение по английским именам PoB → на языке клиента (данные дерева S36);
 * восхождения нет в данных (новое в лиге) — как в PoB.
 */
export function starterClass(
  tree: TreeData | null,
  lang: GameLang,
  className: string,
  ascendancy: string | null
): { cls: string; asc: string | null } {
  const c = tree?.classes.find((x) => x.en === className)
  const a = c && ascendancy ? c.asc.find((x) => x.en === ascendancy) : undefined
  return {
    cls: c ? (lang === 'ru' ? c.ru : c.en) : className,
    asc: a ? (lang === 'ru' ? a.ru : a.en) : ascendancy
  }
}
