import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import type { UiLang } from '@shared/types'
import {
  otherBase,
  type CompareRow,
  type LotComparison,
  type MatchStatus,
  type PlayerStat
} from '@shared/poe1/pricecheck/compare'
import { modTextString } from '@shared/poe1/pricecheck/filters/mod-text'
import type { LotModKind, Poe1Listing } from '@shared/poe1/pricecheck/results'
import { Icon, type IconName } from '../Icon'
import { fmtNum } from './format'
import { usePriceCheckStore } from './store'

// S21: карточка предмета продавца — «что он продаёт и похоже ли на ваш». Всплывает сбоку от окна цены
// (окно не растёт), напротив строки лота; места нет ни справа, ни слева — над строкой или под ней.
// Моды лота — на языке сайта, каждый с итогом сравнения: есть и не хуже / хуже вашего / лишний;
// ниже — свойства вашего предмета, которых у лота нет. Цвет всегда вместе с иконкой.
// Только показ (pointer-events: none): закрепление и снятие — по строке лота.
// S23: сверху — другая база лота и суммы (сопротивления, здоровье, мана, ES — как псевдо-статы окна);
// свойства игрока — как в игре, с числами («Adds 3 to 34 …», «+40 to …»).

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

/** «+71», «-10» — как у сумм в игре. */
const signed = (v: number, lang: UiLang): string => `${v >= 0 ? '+' : ''}${fmtNum(v, lang)}`

/**
 * Свойство игрока текстом, как в игре: «+120 to Accuracy Rating», «Adds 3 to 34 Lightning Damage to Attacks»;
 * сумма — «+71% к сопротивлению стихиям (сумма)». Без строки предмета — шаблон: два # — «… · 8».
 */
export function playerStatText(p: PlayerStat, lang: UiLang, t: T): string {
  if (p.sum) return t(`pc1.s23.sum.${p.sum}`, { v: signed(p.value ?? 0, lang) })
  if (p.shown) return modTextString(p.shown, (n) => fmtNum(n, lang))
  if (p.value === undefined) return p.text.replace(/#/g, '…')
  const v = fmtNum(shown(p, p.value), lang)
  const first = p.text.indexOf('#')
  if (first === -1) return p.text
  if (p.text.indexOf('#', first + 1) !== -1) return `${p.text.replace(/#/g, '…')} · ${v}`
  return p.text.slice(0, first) + v + p.text.slice(first + 1)
}

function ModLine({ row, lang, t }: { row: CompareRow; lang: UiLang; t: T }) {
  const kind = row.lot ? KIND_KEY[row.lot.kind] : undefined
  // у мода, вошедшего в сумму, «у вас …» — в строке суммы
  const yours =
    row.status === 'worse' && !row.sum && row.mine?.value !== undefined ? fmtNum(shown(row.mine, row.mine.value), lang) : undefined
  return (
    <li className="pc-lotmod" data-status={row.status}>
      <Icon name={ICON[row.status]} />
      <span className="pc-lotmod__text">
        {row.lot ? row.lot.text : row.mine ? playerStatText(row.mine, lang, t) : ''}
        {kind && <span className="pc-lotmod__kind"> · {t(kind)}</span>}
        {yours !== undefined && <span className="pc-lotmod__yours"> · {t(row.differs ? 'pc1.lot.yoursOther' : 'pc1.lot.yours', { v: yours })}</span>}
      </span>
    </li>
  )
}

/** S23: сумма у лота (сопротивления, здоровье…) против вашей. */
function SumLine({ row, lang, t }: { row: CompareRow; lang: UiLang; t: T }) {
  const sum = row.mine!.sum!
  const theirs = row.theirs !== undefined ? signed(row.theirs, lang) : '…'
  const yours = row.status === 'worse' && row.mine?.value !== undefined ? fmtNum(row.mine.value, lang) : undefined
  return (
    <li className="pc-lotmod" data-status={row.status}>
      <Icon name={ICON[row.status]} />
      <span className="pc-lotmod__text">
        {t(`pc1.s23.sum.${sum}`, { v: theirs })}
        {yours !== undefined && <span className="pc-lotmod__yours"> · {t('pc1.lot.yours', { v: yours })}</span>}
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
  const item = usePriceCheckStore((s) => s.item)
  // S23: другая база — строкой «другая база: …» (имплициты базы игрока compareLot тогда уже не сравнивал)
  const base = item ? otherBase(item, l.baseType) : undefined

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
  const sums = cmp.rows.filter((r) => !r.lot && r.status !== 'missing')
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
        <div className="pc-lotcard__sum" data-full={(cmp.matched === cmp.total && !base) || undefined}>
          <Icon name={cmp.matched === cmp.total && !base ? 'check' : 'layers'} />
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
      {(base || sums.length > 0) && (
        <ul className="pc-lotcard__mods">
          {base && (
            <li className="pc-lotmod" data-status="worse">
              <Icon name="swap" />
              <span className="pc-lotmod__text">{t('pc1.s23.otherBase', { base })}</span>
            </li>
          )}
          {sums.map((r, i) => (
            <SumLine key={i} row={r} lang={lang} t={t} />
          ))}
        </ul>
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
