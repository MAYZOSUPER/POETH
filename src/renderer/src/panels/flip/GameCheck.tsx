import { useEffect, useState } from 'react'
import type { FlipRoute, UiLang } from '@shared/types'
import { legFill, matchLeg } from '@shared/flip/book'
import { useT } from '../../i18n'
import { Currency, useCurrencyNames } from '../../components/Currency'
import { useAppStore } from '../../store/useAppStore'
import { FIco } from './ui'
import { accelText, fixed, pct, price, rangeText, UNIT } from './format'
import { gameCheck, gameKey, gameRatio, parseGameRatio, type GameSide } from './view'
import { useFlipStore } from './useFlipStore'
import { BookLeg } from './BookLeg'

// «Цена в игре сейчас» (S25) в карточке «Как сделать»: как увидеть настоящий стакан (Alt над «Рыночным курсом»),
// поле для курса из игры на каждую ногу и пересчёт прибыли со штуки, в час и на 1000 золота с выводом
// «выгодно / на грани / невыгодно». Ничего не автоматизируем: курс вводит игрок, POETH его только считает.
// Введённое живёт до перезапуска и общее для маршрутов с той же ногой (покупка Valdo за chaos).
// S28: стакан можно считать с экрана хоткеем (держите Alt над «Рыночным курсом» и нажмите bookRead) — тогда
// нога считается по глубине стакана (средняя цена исполнения размера маршрута), а не по курсу из поля.

/** Сколько показывать неудачную попытку чтения стакана (подсказка «держите Alt…»). */
const FAIL_SHOWN_MS = 2 * 60_000

/** Текущее время, раз в 30 с — «считан N мин назад», «устарел». */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(id)
  }, [])
  return now
}

const TAG = { good: 'ui-tag--good', thin: 'ui-tag--warn', bad: 'ui-tag--bad' } as const

export function GameCheck({
  r,
  name,
  lang,
  divine,
  minSpread,
  expert
}: {
  r: FlipRoute
  name: string
  lang: string
  divine: number
  minSpread: number
  expert: boolean
}) {
  const t = useT()
  const ul = lang as UiLang
  const names = useCurrencyNames(ul)
  const game = useFlipStore((st) => st.game)
  const setGame = useFlipStore((st) => st.setGame)
  const books = useFlipStore((st) => st.books)
  const setBook = useFlipStore((st) => st.setBook)
  const pending = useFlipStore((st) => st.pendingBook)
  const setPending = useFlipStore((st) => st.setPendingBook)
  const lastBook = useFlipStore((st) => st.lastBook)
  const hotkey = useAppStore((st) => st.settings?.hotkeys.bookRead?.accel ?? '')
  const now = useNow()

  // считанный стакан — к своей ноге, если её видно по цене; иначе спросим игрока (кнопки ниже)
  useEffect(() => {
    if (!pending) return
    const side = matchLeg(pending.rows, r)
    if (!side) return
    setBook(gameKey(r, side), pending)
    setPending(null)
  }, [pending, r, setBook, setPending])

  const book = (side: GameSide) => books[gameKey(r, side)] ?? null
  const text = (side: GameSide): string => game[gameKey(r, side)] ?? ''
  const parsed = (side: GameSide): number | null => parseGameRatio(text(side), side, r[side].price)
  // по стакану (если он есть и сверен) — главнее курса из поля
  const fill = (side: GameSide) => legFill(r, side, book(side))
  const buy = fill('buy')?.avg ?? parsed('buy')
  const sell = fill('sell')?.avg ?? parsed('sell')
  const res = gameCheck(r, divine, buy, sell, minSpread)
  const entered = buy !== null || sell !== null
  const byBook = fill('buy') !== null || fill('sell') !== null
  const fail = lastBook && !lastBook.result.ok && now - lastBook.result.at < FAIL_SHOWN_MS ? lastBook.result.reason : null
  const assign = (side: GameSide): void => {
    if (!pending) return
    setBook(gameKey(r, side), pending)
    setPending(null)
  }
  const perUnit = (v: number, side: GameSide): string => `${price(v, lang)} ${UNIT[r[side].base]}`
  const signed = (v: number, digits: number): string => `${v > 0 ? '+' : v < 0 ? '−' : ''}${fixed(Math.abs(v), digits, lang)}`
  const ratio = (side: GameSide): string => {
    const { want, have } = gameRatio(r[side].price, side)
    return `${price(want, lang)} : ${price(have, lang)}`
  }

  const leg = (side: GameSide) => {
    const base = names.name(r[side].base)
    const value = text(side)
    const p = parsed(side)
    const id = `fx-game-${side}`
    return (
      <div className="ui-field fx-check__leg">
        <label className="ui-field__label" htmlFor={id}>
          {t(`flip.game.${side}`, side === 'buy' ? { want: name, have: base } : { want: base, have: name })}
        </label>
        <input
          id={id}
          className="ui-input fx-check__input"
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          placeholder={ratio(side)}
          value={value}
          aria-invalid={value.trim() !== '' && p === null}
          onChange={(e) => setGame(gameKey(r, side), e.currentTarget.value)}
        />
        {value.trim() && p === null ? (
          <span className="ui-field__error">{t('flip.game.err', { ex: ratio(side) })}</span>
        ) : (
          <span className="ui-field__help">
            {p !== null
              ? t('flip.game.read', { price: perUnit(p, side) })
              : t('flip.game.est', { price: perUnit(r[side].price, side), range: rangeText(r[side].range, r[side].base, lang) })}
          </span>
        )}
        {book(side) && (
          <BookLeg
            r={r}
            side={side}
            book={book(side)!}
            lang={lang}
            expert={expert}
            now={now}
            onChange={(b) => setBook(gameKey(r, side), b)}
          />
        )}
      </div>
    )
  }

  const partial = buy === null ? t('flip.game.partial.buy') : sell === null ? t('flip.game.partial.sell') : null

  return (
    <div className="fx-check">
      <div className="fx-check__head">
        <FIco name="swap" size="sm" />
        <b>{t('flip.game.title')}</b>
      </div>
      <div className="ui-hint fx-hint">
        <FIco name="help" />
        <span>{t('flip.game.how')}</span>
      </div>
      <div className="fx-book__how">
        <span className="ui-tag">{t('flip.book.beta')}</span>
        <span>{hotkey ? t('flip.book.how', { key: accelText(hotkey) }) : t('flip.book.how.nokey')}</span>
        {fail && <span className="fx-check__note">{t(`flip.book.fail.${fail}`)}</span>}
      </div>
      {pending && (
        <div className="ui-hint fx-book__ask" role="status">
          <FIco name="info" />
          <div className="fx-book__askBody">
            <span>{t('flip.book.ask', { n: pending.rows.length, name })}</span>
            <span className="fx-book__actions">
              <button type="button" className="ui-btn ui-btn--sm" onClick={() => assign('buy')}>
                {t('flip.book.asBuy')}
              </button>
              <button type="button" className="ui-btn ui-btn--sm" onClick={() => assign('sell')}>
                {t('flip.book.asSell')}
              </button>
              <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm" onClick={() => setPending(null)}>
                {t('flip.book.drop')}
              </button>
            </span>
          </div>
        </div>
      )}
      <div className="fx-check__legs">
        {leg('buy')}
        {leg('sell')}
      </div>
      <div className="fx-check__res" role="status" aria-live="polite">
        {entered ? (
          <>
            <span className={`ui-tag ${TAG[res.verdict]}`}>{t(`flip.game.v.${res.verdict}`)}</span>
            {byBook && <span className="ui-tag">{t('flip.book.tag')}</span>}
            <span>
              <Currency tag="chaos" text={signed(res.profit, Math.abs(res.profit) >= 100 ? 0 : 1)} lang={ul} /> {t('flip.game.unit')}
              {res.verdict !== 'bad' && (
                <>
                  {' · '}
                  <Currency tag="chaos" text={`≈ ${signed(Math.round(res.perHour), 0)}`} lang={ul} />/{t('flip.h')}
                  {' · '}
                  <Currency tag="chaos" text={fixed(res.per1000Gold, 1, lang)} lang={ul} /> {t('flip.game.gold')}
                </>
              )}
              {res.verdict === 'thin' && ` — ${t('flip.game.thin', { pct: pct(res.roi, lang), min: pct(minSpread, lang) })}`}
              {res.verdict === 'bad' && ` — ${t('flip.game.bad')}`}
              {partial && <span className="fx-check__note"> ({partial})</span>}
            </span>
            <button
              type="button"
              className="ui-btn ui-btn--ghost ui-btn--sm"
              onClick={() => {
                setGame(gameKey(r, 'buy'), '')
                setGame(gameKey(r, 'sell'), '')
                setBook(gameKey(r, 'buy'), null)
                setBook(gameKey(r, 'sell'), null)
              }}
            >
              {t('flip.game.reset')}
            </button>
          </>
        ) : (
          <span className="fx-check__note">{t('flip.game.prompt')}</span>
        )}
      </div>
    </div>
  )
}
