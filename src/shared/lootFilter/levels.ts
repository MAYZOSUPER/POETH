import type { GameId } from '../games'
import type { LootFilterLevel, LootFilterStyle } from '../types/lootFilter'

// Уровни строгости и стили фильтра NeverSink (S53). Имена — как в файлах релиза
// (`NeverSink's filter - 1-REGULAR.filter`, папки `(STYLE) ABYSS/…`). Тексты для игрока — в i18n (lf.level.*).
// S64: у фильтра PoE 2 те же 7 уровней с теми же кодами (`NeverSink's filter 2 - 1-REGULAR.filter`), стили — свои.

export interface LevelDef {
  level: LootFilterLevel
  /** кусок имени файла релиза: 0-SOFT … 6-UBER-PLUS-STRICT */
  code: string
  /** название NeverSink (экспертный режим) */
  name: string
}

export const LEVELS: readonly LevelDef[] = [
  { level: 0, code: '0-SOFT', name: 'Soft' },
  { level: 1, code: '1-REGULAR', name: 'Regular' },
  { level: 2, code: '2-SEMI-STRICT', name: 'Semi-Strict' },
  { level: 3, code: '3-STRICT', name: 'Strict' },
  { level: 4, code: '4-VERY-STRICT', name: 'Very Strict' },
  { level: 5, code: '5-UBER-STRICT', name: 'Uber Strict' },
  { level: 6, code: '6-UBER-PLUS-STRICT', name: 'Uber Plus Strict' }
]

/** Уровень по умолчанию — Regular: начало лиги и кампания, мусор уже спрятан. */
export const DEFAULT_LEVEL: LootFilterLevel = 1

export function isLevel(v: unknown): v is LootFilterLevel {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 6
}

export function levelDef(level: LootFilterLevel): LevelDef {
  return LEVELS[level]
}

export interface StyleDef {
  id: LootFilterStyle
  /** папка в релизе без «(STYLE) »; у 'default' — нет (файлы в корне) */
  dir: string | null
  /** название NeverSink */
  name: string
}

/**
 * Стили релиза 8.20.x. `(STYLE) CUSTOMSOUNDS` не берём: фильтр ссылается на mp3 рядом с собой, а мы кладём
 * в папку игры только один `.filter`. Если в новом релизе стиля нет — установка вернёт 'not-in-archive'.
 */
export const STYLES: readonly StyleDef[] = [
  { id: 'default', dir: null, name: 'Default' },
  { id: 'abyss', dir: 'ABYSS', name: 'Abyss' },
  { id: 'alloy', dir: 'ALLOY', name: 'Alloy' },
  { id: 'azurite', dir: 'AZURITE', name: 'Azurite' },
  { id: 'cobalt', dir: 'COBALT', name: 'Cobalt' },
  { id: 'crimson', dir: 'CRIMSON', name: 'Crimson' },
  { id: 'elder', dir: 'ELDER', name: 'Elder' },
  { id: 'gaia', dir: 'GAIA', name: 'Gaia' },
  { id: 'krangled', dir: 'KRANGLED', name: 'Krangled' },
  { id: 'lunaris', dir: 'LUNARIS', name: 'Lunaris' },
  { id: 'necros', dir: 'NECROS', name: 'Necros' },
  { id: 'purple', dir: 'PURPLE', name: 'Purple' },
  { id: 'tabula-rasa', dir: 'TABULA RASA', name: 'Tabula Rasa' },
  { id: 'vaal', dir: 'VAAL', name: 'Vaal' },
  { id: 'velvet', dir: 'VELVET', name: 'Velvet' },
  { id: 'wow', dir: 'WOW', name: 'WoW' }
]

/**
 * Стили фильтра PoE 2 (релиз 0.10.4a, 15.10.2026): Aura, Cobalt, Darkmode, Mythic, Vaal, Zen. CUSTOMSOUNDS не берём —
 * как и у PoE 1, он ссылается на звуки рядом с файлом (209 строк CustomAlertSound в Regular).
 */
export const STYLES_POE2: readonly StyleDef[] = [
  { id: 'default', dir: null, name: 'Default' },
  { id: 'aura', dir: 'AURA', name: 'Aura' },
  { id: 'cobalt', dir: 'COBALT', name: 'Cobalt' },
  { id: 'darkmode', dir: 'DARKMODE', name: 'Darkmode' },
  { id: 'mythic', dir: 'MYTHIC', name: 'Mythic' },
  { id: 'vaal', dir: 'VAAL', name: 'Vaal' },
  { id: 'zen', dir: 'ZEN', name: 'Zen' }
]

/** Стили фильтра этой игры. */
export function stylesFor(game: GameId): readonly StyleDef[] {
  return game === 'poe2' ? STYLES_POE2 : STYLES
}

export const DEFAULT_STYLE: LootFilterStyle = 'default'

/** Стиль есть у фильтра этой игры (без игры — PoE 1, как в S53). */
export function isStyle(v: unknown, game: GameId = 'poe1'): v is LootFilterStyle {
  return typeof v === 'string' && stylesFor(game).some((s) => s.id === v)
}

export function styleDef(style: LootFilterStyle, game: GameId = 'poe1'): StyleDef {
  const list = stylesFor(game)
  return list.find((s) => s.id === style) ?? list[0]
}

/**
 * Подсказка «когда брать» (ключ i18n lf.when.<…>): кампания и первые дни — 0–1, первые карты — 2,
 * карты T11+ — 3, дальше — для тех, кто фармит быстро и знает, что ценно.
 */
export function levelWhen(level: LootFilterLevel): 'start' | 'maps' | 'late' | 'expert' {
  if (level <= 1) return 'start'
  if (level === 2) return 'maps'
  if (level === 3) return 'late'
  return 'expert'
}
