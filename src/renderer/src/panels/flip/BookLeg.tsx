import { useState } from 'react'
import type { BookReading, BookRow, FlipRoute } from '@shared/types'
import { allDoubts, bookLevels, confirmBook, editBook, isBookStale, legFill, topPrice, unitsWithin, type BookSide } from '@shared/flip/book'
import { useT } from '../../i18n'
import { FIco } from './ui'
import { int, price, UNIT } from './format'

// Стакан из игры у одной ноги (S28): таблица «Курс / Кол-во» как в игре, сомнительные ячейки подсвечены,
// любую можно поправить; «Верно» — игрок сверил с игрой. Ниже — цена исполнения размера маршрута по глубине.
// Числа считываются с экрана по хоткею; в игре POETH ничего не нажимает.

/** «1 : 296» / «1,04» → числа строки; null — не курс. */
function parseRatioCell(text: string): { want: number; have: number } | null {
  const m = /^(\d*[.,]?\d+)\s*:\s*(\d*[.,]?\d+)$/.exec(text.trim())
  if (!m) return null
  const want = Number(m[1].replace(',', '.'))
  const have = Number(m[2].replace(',', '.'))
  return want > 0 && have > 0 ? { want, have } : null
}

const ratioText = (r: BookRow, lang: string): string => `${price(r.want, lang)} : ${price(r.have, lang)}`

/** Метка сомнительной ячейки — не только цветом. */
function Doubt() {
  const t = useT()
  return (
    <span className="fx-book__q" title={t('flip.book.check', { n: 1 })}>
      ?
    </span>
  )
}

export function BookLeg({
  r,
  side,
  book,
  lang,
  expert,
  now,
  onChange
}: {
  r: FlipRoute
  side: BookSide
  book: BookReading
  lang: string
  expert: boolean
  now: number
  onChange: (b: BookReading | null) => void
}) {
  const t = useT()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Record<string, string>>({})
  const doubts = allDoubts(book)
  const unsure = (row: number, cell: 'want' | 'have' | 'stock'): boolean => doubts.some((d) => d.row === row && d.cell === cell)
  const stale = isBookStale(book, now)
  const mins = Math.max(0, Math.floor((now - book.at) / 60_000))
  const fill = legFill(r, side, book)
  // лучшая строка в 1,6 раза дальше оценки — скорее всего, другой предмет или другая сторона обмена
  const top = topPrice(book.rows, side)
  const far = top !== null && r[side].price > 0 && Math.abs(Math.log(top / r[side].price)) > Math.log(1.6)
  const unit = UNIT[r[side].base]
  const units = r.units > 0 ? r.units : 1

  const commit = (row: number, cell: 'ratio' | 'stock', text: string): void => {
    if (cell === 'ratio') {
      const p = parseRatioCell(text)
      if (p) onChange(editBook(book, row, p))
    } else {
      const n = Number(text.replace(/\s/g, ''))
      if (Number.isInteger(n) && n > 0) onChange(editBook(book, row, { stock: n }))
    }
  }
  const key = (row: number, cell: string): string => `${row}:${cell}`

  return (
    <div className="fx-book">
      <div className="fx-book__head">
        <span className="fx-book__when">
          {t('flip.book.read', { n: book.rows.length, ago: mins < 1 ? t('flip.book.now') : t('flip.book.min', { n: mins }) })}
          {book.source === 'manual' && ` · ${t('flip.book.manual')}`}
        </span>
        {stale && <span className="ui-tag ui-tag--warn">{t('flip.book.stale')}</span>}
        {doubts.length > 0 && <span className="ui-tag ui-tag--warn">{t('flip.book.check', { n: doubts.length })}</span>}
        {far && <span className="ui-tag ui-tag--warn">{t('flip.book.far')}</span>}
      </div>
      <table className="ui-table fx-book__table">
        <thead>
          <tr>
            <th scope="col" className="is-num">
              {t('flip.book.ratio')}
            </th>
            <th scope="col" className="is-num">
              {t('flip.book.stock')}
            </th>
          </tr>
        </thead>
        <tbody>
          {book.rows.map((row, i) => (
            <tr key={i}>
              <td className={`is-num${unsure(i, 'want') || unsure(i, 'have') ? ' is-bad' : ''}`}>
                {editing ? (
                  <>
                    {row.beyond && <span title={t('flip.book.beyond')}>‹ </span>}
                    <input
                      className="ui-input fx-book__input"
                      inputMode="decimal"
                      spellCheck={false}
                      aria-label={t('flip.book.ratio')}
                      aria-invalid={unsure(i, 'want') || unsure(i, 'have')}
                      value={draft[key(i, 'ratio')] ?? ratioText(row, lang)}
                      onChange={(e) => setDraft({ ...draft, [key(i, 'ratio')]: e.currentTarget.value })}
                      onBlur={(e) => commit(i, 'ratio', e.currentTarget.value)}
                    />
                  </>
                ) : (
                  <>
                    {row.beyond && <span title={t('flip.book.beyond')}>‹ </span>}
                    {ratioText(row, lang)}
                    {(unsure(i, 'want') || unsure(i, 'have')) && <Doubt />}
                  </>
                )}
              </td>
              <td className={`is-num${unsure(i, 'stock') ? ' is-bad' : ''}`}>
                {editing ? (
                  <input
                    className="ui-input fx-book__input fx-book__input--stock"
                    inputMode="numeric"
                    spellCheck={false}
                    aria-label={t('flip.book.stock')}
                    aria-invalid={unsure(i, 'stock')}
                    value={draft[key(i, 'stock')] ?? String(row.stock)}
                    onChange={(e) => setDraft({ ...draft, [key(i, 'stock')]: e.currentTarget.value })}
                    onBlur={(e) => commit(i, 'stock', e.currentTarget.value)}
                  />
                ) : (
                  <>
                    {int(row.stock, lang)}
                    {unsure(i, 'stock') && <Doubt />}
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="fx-book__res" role="status">
        {fill ? (
          <span>
            {t(fill.enough ? 'flip.book.fill' : 'flip.book.short', {
              units: int(fill.enough ? units : fill.units, lang),
              avg: `${fill.bounded ? (side === 'buy' ? '≥ ' : '≤ ') : ''}${price(fill.avg, lang)} ${unit}`,
              worst: `${price(fill.worst, lang)} ${unit}`
            })}
            {expert && (
              <span className="fx-check__note">
                {' · '}
                {t(`flip.book.within.${side}`, {
                  n: int(unitsWithin(bookLevels(book.rows, side), side, r[side].price), lang),
                  price: `${price(r[side].price, lang)} ${unit}`
                })}
              </span>
            )}
          </span>
        ) : (
          <span className="fx-check__note">
            <FIco name="warn" size="sm" /> {t('flip.book.unusable')}
          </span>
        )}
      </div>
      <div className="fx-book__actions">
        {doubts.length > 0 && !editing && book.doubt.length > 0 && (
          <button type="button" className="ui-btn ui-btn--sm" onClick={() => onChange(confirmBook(book))}>
            <FIco name="check" size="sm" />
            {t('flip.book.ok')}
          </button>
        )}
        <button
          type="button"
          className="ui-btn ui-btn--ghost ui-btn--sm"
          aria-pressed={editing}
          onClick={() => {
            setEditing(!editing)
            setDraft({})
          }}
        >
          {t(editing ? 'flip.book.done' : 'flip.book.edit')}
        </button>
        <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm" onClick={() => onChange(null)}>
          {t('flip.book.drop')}
        </button>
      </div>
    </div>
  )
}
