import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import type { UiLang } from '@shared/types'
import type { CompareRow, LotComparison, MatchStatus, PlayerStat } from '@shared/poe1/pricecheck/compare'
import type { LotModKind, Poe1Listing } from '@shared/poe1/pricecheck/results'
import { Icon, type IconName } from '../Icon'
import { fmtNum } from './format'

// S21: карточка предмета продавца — «что он продаёт и похоже ли на ваш». Всплывает сбоку от окна цены
// (окно не растёт), напротив строки лота; места нет ни справа, ни слева — над строкой или под ней.
// Моды лота — на языке сайта, каждый с итогом сравнения: есть и не хуже / хуже вашего / лишний;
// ниже — свойства вашего предмета, которых у лота нет. Цвет всегда вместе с иконкой.
// Только показ (pointer-events: none): закрепление и снятие — по строке лота.

type T = (key: string, params?: Record<string, string | number>) => string

const ICON: Record<MatchStatus, IconName> = { match: 'check', worse: 'arrow-down', missing: 'cross', extra: 'dash' }
/** Метка источника мода (имплицит отделён чертой, как в игре). */
const KIND_KEY: Partial<Record<LotModKind, string>> = {
  crafted: 'pc1.lot.kind.crafted',
  fractured: 'pc1.lot.kind.fractured',
  enchant: 'pc1.lot.kind.enchant',
  veiled: 'pc1.lot.kind.veiled'
}
const TOP_KINDS = new Set<LotModKind>(['enchant', 'scourge', 'implicit'])
const RARITY_CLASS: Record<string, string> = { magic: 'magic', rare: 'rare', unique: 'unique', relic: 'unique', gem: 'gem', currency: 'currency', card: 'currency' }

const GAP = 8

/** Значение так, как его видит игрок: у «reduced» — без минуса. */
function shown(p: PlayerStat, v: number): number {
  return p.negated ? -v : v
}

/** Свойство игрока текстом: «# to Accuracy Rating» → «120 to Accuracy Rating»; два # — «… · 8». */
export function playerStatText(p: PlayerStat, lang: UiLang): string {
  if (p.value === undefined) return p.text.replace(/#/g, '…')
  const v = fmtNum(shown(p, p.value), lang)
  const first = p.text.indexOf('#')
  if (first === -1) return p.text
  if (p.text.indexOf('#', first + 1) !== -1) return `${p.text.replace(/#/g, '…')} · ${v}`
  return p.text.slice(0, first) + v + p.text.slice(first + 1)
}

function ModLine({ row, lang, t }: { row: CompareRow; lang: UiLang; t: T }) {
  const kind = row.lot ? KIND_KEY[row.lot.kind] : undefined
  const yours = row.status === 'worse' && row.mine?.value !== undefined ? fmtNum(shown(row.mine, row.mine.value), lang) : undefined
  return (
    <li className="pc-lotmod" data-status={row.status}>
      <Icon name={ICON[row.status]} />
      <span className="pc-lotmod__text">
        {row.lot ? row.lot.text : row.mine ? playerStatText(row.mine, lang) : ''}
        {kind && <span className="pc-lotmod__kind"> · {t(kind)}</span>}
        {yours !== undefined && <span className="pc-lotmod__yours"> · {t(row.differs ? 'pc1.lot.yoursOther' : 'pc1.lot.yours', { v: yours })}</span>}
      </span>
    </li>
  )
}

export function LotCard({
  id,
  l,
  cmp,
  anchor,
  pinned,
  simple,
  lang,
  t
}: {
  id: string
  l: Poe1Listing
  cmp: LotComparison
  anchor: HTMLElement
  pinned: boolean
  simple: boolean
  lang: UiLang
  t: T
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [style, setStyle] = useState<CSSProperties>({ left: 0, top: 0, visibility: 'hidden' })

  useLayoutEffect(() => {
    const place = (): void => {
      const el = ref.current
      if (!el || !anchor.isConnected) return
      const row = anchor.getBoundingClientRect()
      const panel = (anchor.closest('.pc') ?? anchor).getBoundingClientRect()
      const w = el.offsetWidth
      const h = el.offsetHeight
      const vw = window.innerWidth
      const vh = window.innerHeight
      const clampTop = (y: number): number => Math.max(GAP, Math.min(y, vh - h - GAP))
      if (panel.right + GAP + w <= vw - GAP) return setStyle({ left: panel.right + GAP, top: clampTop(row.top) })
      if (panel.left - GAP - w >= GAP) return setStyle({ left: panel.left - GAP - w, top: clampTop(row.top) })
      // сбоку места нет — поверх окна, не закрывая саму строку
      const left = Math.max(GAP, Math.min(row.left, vw - w - GAP))
      const top = row.bottom + GAP + h <= vh - GAP ? row.bottom + GAP : clampTop(row.top - GAP - h)
      setStyle({ left, top })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [anchor, cmp, pinned])

  const lotRows = cmp.rows.filter((r) => r.lot)
  const missing = cmp.rows.filter((r) => r.status === 'missing')
  const splitAt = lotRows.findIndex((r) => !TOP_KINDS.has(r.lot!.kind))
  const meta = [
    l.itemLevel ? t('pc1.meta.ilvl', { n: l.itemLevel }) : '',
    l.sockets ? t('pc1.lot.sockets', { s: l.sockets }) : '',
    l.corrupted ? t('pc1.meta.corrupted') : '',
    l.foulborn ? t('pc1.lot.foulborn') : ''
  ].filter(Boolean)
  const name = l.itemName || l.baseType || ''

  return createPortal(
    <div ref={ref} id={id} role="tooltip" className={`pc-lotcard${pinned ? ' is-pinned' : ''}`} style={style}>
      <div className="pc-lotcard__head">
        <span className={`ui-item ui-item--${RARITY_CLASS[l.rarity ?? ''] ?? 'normal'} pc-lotcard__name`}>{name}</span>
        {l.itemName && l.baseType && <span className="pc-lotcard__base">{l.baseType}</span>}
        {meta.length > 0 && <span className="pc-lotcard__meta">{meta.join(' · ')}</span>}
      </div>
      {cmp.total > 0 && (
        <div className="pc-lotcard__sum" data-full={cmp.matched === cmp.total || undefined}>
          <Icon name={cmp.matched === cmp.total ? 'check' : 'layers'} />
          <b>{t('pc1.lot.similar', { n: cmp.matched, m: cmp.total })}</b>
        </div>
      )}
      {simple && cmp.total > 0 && (
        <div className="pc-lotcard__legend">
          {(['match', 'worse', 'missing'] as const).map((s) => (
            <span key={s} data-status={s}>
              <Icon name={ICON[s]} />
              {t(`pc1.lot.legend.${s}`)}
            </span>
          ))}
        </div>
      )}
      {l.unidentified ? (
        <div className="pc-lotcard__empty">{t('pc1.lot.unid')}</div>
      ) : lotRows.length === 0 ? (
        <div className="pc-lotcard__empty">{t('pc1.lot.noMods')}</div>
      ) : (
        <ul className="pc-lotcard__mods">
          {lotRows.map((r, i) => (
            <ModLine key={i} row={r} lang={lang} t={t} />
          )).flatMap((line, i) => (i === splitAt && i > 0 ? [<li key="sep" className="pc-lotcard__sep" aria-hidden="true" />, line] : [line]))}
        </ul>
      )}
      {missing.length > 0 && (
        <>
          <div className="pc-lotcard__label">{t('pc1.lot.missing')}</div>
          <ul className="pc-lotcard__mods">
            {missing.map((r, i) => (
              <ModLine key={i} row={r} lang={lang} t={t} />
            ))}
          </ul>
        </>
      )}
      {simple && <div className="pc-lotcard__note">{t(pinned ? 'pc1.lot.pinned' : 'pc1.lot.pin')}</div>}
    </div>,
    document.body
  )
}
