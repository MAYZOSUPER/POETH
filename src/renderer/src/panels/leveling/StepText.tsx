import type { LevelingData, LvPart, LvTag } from '@shared/types/leveling'
import { renderParts } from '@shared/leveling/render'

// Текст шага прокачки (S14) — общий для вкладки «Кампания» PoE1 и гида поверх игры: зоны, квесты, боссы и
// предметы подсвечены (lv-seg--*), направления — стрелками.

export function StepText({ parts, data, lang }: { parts: LvPart[]; data: LevelingData; lang: 'ru' | 'en' }) {
  const segs = renderParts(parts, data, lang)
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

/** Теги шага: цвет всегда вместе с текстом (дизайн-система). */
export function StepTags({ tags, t }: { tags: LvTag[]; t: (k: string) => string }) {
  if (!tags.length) return null
  return (
    <span className="lv-tags">
      {tags.map((tag) => (
        <span key={tag} className={`lv-tag lv-tag--${tag}`} title={t(`lev.tag.${tag}.long`)}>
          {t(`lev.tag.${tag}`)}
        </span>
      ))}
    </span>
  )
}
