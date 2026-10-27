import { useAppStore } from '../store/useAppStore'
import type { Reward, UiLang } from '@shared/types'
import type { Dict } from './types'
import { DOMAIN_DICTS } from './dicts'

// Interface language. Game zone/boss/quest names always stay English (they must
// match the English game client), so they are NOT translated here — only our own
// UI chrome, hints framing, reward descriptions and layout types are.
// Строки лежат по доменам в ./dict/*.ts (список — ./dicts.ts).

function merge(lang: UiLang): Dict {
  const out: Dict = {}
  for (const d of Object.values(DOMAIN_DICTS)) Object.assign(out, d[lang])
  return out
}

const RU = merge('ru')
const DICT: Record<UiLang, Dict> = { ru: RU, en: merge('en') }

export function translate(
  lang: UiLang,
  key: string,
  params?: Record<string, string | number>
): string {
  let s = DICT[lang]?.[key] ?? RU[key] ?? key
  if (params) for (const k of Object.keys(params)) s = s.replace(`{${k}}`, String(params[k]))
  return s
}

export function useLang(): UiLang {
  return useAppStore((s) => s.settings?.uiLang ?? 'ru')
}

export function useT(): (key: string, params?: Record<string, string | number>) => string {
  const lang = useLang()
  return (key, params) => translate(lang, key, params)
}

export function layoutLabel(lang: UiLang, type: string): string {
  return translate(lang, `layout.${type}`)
}

/** Normalize an English name for the EN->RU name map lookup. */
export function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[’'`]/g, '')
    .replace(/[^a-z0-9а-яё]+/gi, ' ')
    .trim()
}

/** Returns a localizer for game zone/boss names based on the nameLang setting. */
export function useName(): (en: string) => string {
  const nameLang = useAppStore((s) => s.settings?.nameLang ?? 'en')
  const namesRu = useAppStore((s) => s.dataset?.namesRu)
  return (en: string) => {
    if (nameLang === 'ru' && en) {
      const ru = namesRu?.[norm(en)]
      if (ru) return ru
    }
    return en
  }
}

const RES_RU: Record<string, string> = {
  cold: 'холоду',
  fire: 'огню',
  lightning: 'молнии',
  chaos: 'хаосу'
}

/** Localize a reward description. English mode keeps the canonical value. */
export function formatReward(r: Reward, lang: UiLang): string {
  if (lang === 'en') return r.value
  const n = r.numeric
  switch (r.kind) {
    case 'passive_point':
    case 'skill_point':
      return `+${n ?? ''} очк. умений`.replace('+ ', '+')
    case 'weapon_set_point':
      return `+${n ?? ''} очк. набора оружия`.replace('+ ', '+')
    case 'spirit':
      return `+${n ?? ''} духа`.replace('+ ', '+')
    case 'resistance': {
      const v = r.value.toLowerCase()
      const el =
        (Object.keys(RES_RU).find((k) => v.includes(k)) &&
          RES_RU[Object.keys(RES_RU).find((k) => v.includes(k)) as string]) ||
        ''
      return `+${n ?? ''}% сопр. ${el}`.trim()
    }
    case 'life':
      return r.value.includes('%') ? `+${n}% к макс. жизни` : `+${n} к макс. жизни`
    case 'uncut_gem':
      return 'Необраб. камень'
    case 'support_gem':
      return 'Камень поддержки'
    case 'skill_gem':
      return 'Камень умения'
    case 'charm_slot':
      return 'Чарм'
    default:
      return r.value
  }
}
