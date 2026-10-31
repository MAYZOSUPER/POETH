import type { GameId } from '@shared/games'
import { XP_RULES, type ZoneXp } from '@shared/leveling/zoneXp'

// Текст подсказки опыта компаса PoE 2 (S64, ZoneXpHint): «Эта зона даёт ~40 % опыта — идите дальше по маршруту».
// Чистый модуль (tests/leveling/poe2ZoneXp.test.ts). Причины «ниже / выше» — общие ключи гида S52 (lev.xp.*),
// у путевых камней — своя (lev.p2xp.low.map).

type T = (key: string, params?: Record<string, string | number>) => string

/** Ключ по числу, как pluralKey гида S52 (panels/leveling/ZoneLab.tsx): RU — 1 / 2–4 / 5+, EN — 1 / прочие. */
function pluralKey(base: string, n: number, lang: 'ru' | 'en'): string {
  const a = Math.abs(n)
  if (lang === 'en') return `${base}.${a === 1 ? 1 : 5}`
  const d = a % 10
  const h = a % 100
  if (d === 1 && h !== 11) return `${base}.1`
  if (d >= 2 && d <= 4 && (h < 12 || h > 14)) return `${base}.2`
  return `${base}.5`
}

/** Основная строка и подробности для экспертного режима. */
export function zoneXpHintText(x: ZoneXp, t: T, lang: 'ru' | 'en', game: GameId): { main: string; extra: string } {
  const gives = t('lev.p2xp.gives', { n: Math.max(1, Math.round(x.mult * 100)) })
  const why =
    x.kind === 'high'
      ? t(pluralKey('lev.xp.high', x.gap, lang)).replace('{n}', String(x.gap))
      : x.where === 'map'
        ? t('lev.p2xp.low.map')
        : t(`lev.xp.low.${x.where}`)
  const extra = [t('lev.p2xp.head', { z: x.areaLevel, p: x.playerLevel }), t('lev.xp.expert').replace('{safe}', String(x.safe))]
  if (!XP_RULES[game].safeConfirmed) extra.push(t('lev.p2xp.unconfirmed'))
  return { main: `${gives} — ${why}`, extra: extra.join(' · ') }
}
