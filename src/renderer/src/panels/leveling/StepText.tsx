import type { ReactNode } from 'react'
import type { LevelingData, LvPart, LvTag } from '@shared/types/leveling'
import { renderParts } from '@shared/leveling/render'

// Текст шага прокачки (S14) — общий для вкладки «Кампания» PoE1 и гида поверх игры: зоны, квесты, боссы и
// предметы подсвечены (lv-seg--*), направления — стрелками. Текст — на языке интерфейса (lang), имена — на языке
// клиента игры (gameLang, S31).

export function StepText({
  parts,
  data,
  lang,
  gameLang = lang
}: {
  parts: LvPart[]
  data: LevelingData
  lang: 'ru' | 'en'
  gameLang?: 'ru' | 'en'
}) {
  const segs = renderParts(parts, data, lang, gameLang)
  return (
    <>
      {segs.map((s, i) => (
        <span key={i} className={`lv-seg lv-seg--${s.kind}`}>
          {i > 0 && !/^[,.:;]/.test(s.text) ? ' ' : ''}
          {s.text}
        </span>
      ))}
    </>
  )
}

/**
 * Теги шага — .ui-reward: цвет всегда вместе с иконкой того же имени и словом (дизайн-система). Иконку рисует
 * вызывающий: в оверлее спрайт уже в странице (Icon), в компаньоне — Ico.
 */
export function StepTags({
  tags,
  t,
  icon,
  passives = 1
}: {
  tags: LvTag[]
  t: (k: string) => string
  icon: (tag: LvTag) => ReactNode
  /** очков пассивов за шаг (stepPassives) — «+2 пассива» вместо «+1 пассив» */
  passives?: number
}) {
  if (!tags.length) return null
  return (
    <span className="lv-tags">
      {tags.map((tag) => (
        <span key={tag} className={`ui-reward ui-reward--${tag}`} title={t(`lev.tag.${tag}.long`)}>
          {icon(tag)}
          {tag === 'passive' && passives > 1 ? t('lev.tag.passives').replace('{n}', String(passives)) : t(`lev.tag.${tag}`)}
        </span>
      ))}
    </span>
  )
}
