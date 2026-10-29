import type { FlipRoute, UiLang } from '@shared/types'
import { useT } from '../../i18n'
import { Currency, useCurrencyNames } from '../../components/Currency'
import { FIco } from './ui'
import { fixed, pct, price, rangeText, UNIT } from './format'
import { gameCheck, gameKey, gameRatio, parseGameRatio, type GameSide } from './view'
import { useFlipStore } from './useFlipStore'

// «Цена в игре сейчас» (S25) в карточке «Как сделать»: как увидеть настоящий стакан (Alt над «Рыночным курсом»),
// поле для курса из игры на каждую ногу и пересчёт прибыли со штуки, в час и на 1000 золота с выводом
// «выгодно / на грани / невыгодно». Ничего не автоматизируем: курс вводит игрок, POETH его только считает.
// Введённое живёт до перезапуска и общее для маршрутов с той же ногой (покупка Valdo за chaos).

const TAG = { good: 'ui-tag--good', thin: 'ui-tag--warn', bad: 'ui-tag--bad' } as const

export function GameCheck({
  r,
  name,
  lang,
  divine,
  minSpread
}: {
  r: FlipRoute
  name: string
  lang: string
  divine: number
  minSpread: number
}) {
  const t = useT()
  const ul = lang as UiLang
  const names = useCurrencyNames(ul)
  const game = useFlipStore((st) => st.game)
  const setGame = useFlipStore((st) => st.setGame)

  const text = (side: GameSide): string => game[gameKey(r, side)] ?? ''
  const parsed = (side: GameSide): number | null => parseGameRatio(text(side), side, r[side].price)
  const buy = parsed('buy')
  const sell = parsed('sell')
  const res = gameCheck(r, divine, buy, sell, minSpread)
  const entered = buy !== null || sell !== null
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
      <div className="fx-check__legs">
        {leg('buy')}
        {leg('sell')}
      </div>
      <div className="fx-check__res" role="status" aria-live="polite">
        {entered ? (
          <>
            <span className={`ui-tag ${TAG[res.verdict]}`}>{t(`flip.game.v.${res.verdict}`)}</span>
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
