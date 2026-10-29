import type { ItemCheckResult, ItemFlipState, ItemLot, ItemRow, UiLang } from '@shared/types'
import { useT } from '../../../i18n'
import { CoinIcon } from '../../../components/Currency'
import { Confidence } from '../ui'
import { useItemsStore } from './useItemsStore'
import { daysText, money, signed, useUniqueName } from './format'
import { FormTags, IIco, Price } from './ui'

// Итог «Проверить сейчас» (S33): один поиск на трейде с порогом k × цена poe.ninja и до 10 лотов, каждый —
// с вердиктом антискама. «Выгодно» — по ожидаемой цене продажи (не по лучшему лоту), комиссия мгновенного
// выкупа — в золоте отдельно. Покупает игрок сам на сайте (трейд-окно), POETH ничего не покупает.

const GOOD = new Set(['deal'])

function LotRow({ l, s, lang }: { l: ItemLot; s: ItemFlipState; lang: UiLang }) {
  const t = useT()
  const raw = l.amount !== null && l.currency ? `${l.amount} ${l.currency}` : '—'
  return (
    <tr>
      <td className="is-num">{l.chaos !== null ? <Price chaos={l.chaos} divine={s.divine} lang={lang} /> : raw}</td>
      <td>
        {l.kind === 'instant' ? (
          <span className="fi-kind">
            <span className="ui-tag ui-tag--merchant">{t('flip.items.lot.instant')}</span>
            {l.fee !== undefined && (
              <span className="fi-fee" title={t('flip.items.lot.fee.title')}>
                <CoinIcon tag="gold" lang={lang} />
                {l.fee.toLocaleString(lang === 'ru' ? 'ru-RU' : 'en-US')}
              </span>
            )}
          </span>
        ) : (
          <span className="fi-kind">
            <span className="ui-tag ui-tag--person">{t('flip.items.lot.person')}</span>
            <span className={`ui-dot${l.online === 'afk' ? ' ui-dot--afk' : l.online === 'offline' ? ' ui-dot--off' : ''}`} />
            <span className="fi-sub">{t(`flip.items.lot.${l.online}`)}</span>
          </span>
        )}
      </td>
      <td className="is-num is-faint">
        {l.ageDays === undefined
          ? '—'
          : l.ageDays < 1
            ? t('flip.items.lot.ageH', { n: Math.max(1, Math.round(l.ageDays * 24)) })
            : t('flip.items.lot.age', { n: daysText(l.ageDays, lang) })}
      </td>
      <td>
        <span className="fi-verdict">
          <span className={`ui-tag ${GOOD.has(l.verdict) ? 'ui-tag--good' : l.verdict === 'thin' ? '' : 'ui-tag--bad'}`} title={t(`flip.items.v.${l.verdict}.help`)}>
            {l.verdict === 'deal' || l.verdict === 'thin' ? (
              <>
                {t(l.verdict === 'thin' && (l.profit ?? 0) <= 0 ? 'flip.items.v.loss' : `flip.items.v.${l.verdict}`)}{' '}
                {signed(money(l.profit ?? 0, s.divine, lang).text, l.profit ?? 0)}{' '}
                {money(l.profit ?? 0, s.divine, lang).tag === 'divine' ? 'div' : 'c'}
              </>
            ) : (
              t(`flip.items.v.${l.verdict}`)
            )}
          </span>
          {l.tooCheap && (
            <span className="ui-tag ui-tag--warn" title={t('flip.items.v.tooCheap.help')}>
              {t('flip.items.v.tooCheap')}
            </span>
          )}
        </span>
      </td>
      <td>{l.confidence !== undefined ? <Confidence value={l.confidence} word={false} /> : null}</td>
    </tr>
  )
}

function errorText(r: Extract<ItemCheckResult, { ok: false }>, t: ReturnType<typeof useT>): string {
  if (r.error === 'rate-limited') return t('flip.items.err.rate', { s: Math.max(1, Math.ceil((r.retryAfterMs ?? 10_000) / 1000)) })
  return t(`flip.items.err.${r.error}`)
}

export function CheckCard({ row, s, lang, expert }: { row: ItemRow; s: ItemFlipState; lang: UiLang; expert: boolean }) {
  const t = useT()
  const nameOf = useUniqueName(lang)
  const res = useItemsStore((st) => st.checks[row.id])
  const busy = useItemsStore((st) => st.checking[row.id] === true)
  const check = useItemsStore((st) => st.check)
  const watchRow = useItemsStore((st) => st.watchRow)
  const watch = useItemsStore((st) => st.watch[row.id])
  const k = s.config.k
  const buy = Math.max(1, Math.floor(row.chaos * k))
  const profit = row.sell - buy

  const deals = res?.ok ? res.lots.filter((l) => l.verdict === 'deal') : []
  return (
    <section className="ui-box fi-card" aria-live="polite">
      <div className="ui-box__head">
        <span className="ui-label">
          <IIco name="search" size="sm" />
          <b className="fi-card__name">{nameOf(row)}</b>
          <FormTags row={row} />
        </span>
        <span className="ui-label__grow" />
        {res?.ok && (
          <span className="fx-liq">
            {t('flip.items.check.at', { at: new Date(res.at).toLocaleTimeString(lang === 'ru' ? 'ru-RU' : 'en-US', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }) })}
          </span>
        )}
      </div>
      <div className="ui-box__body fi-card__body">
        <p className="fi-say">
          {t('flip.items.say.buy', { name: nameOf(row) })} <Price chaos={buy} divine={s.divine} lang={lang} prefix="≤ " />
          {', '}
          {t('flip.items.say.sell')} <Price chaos={row.sell} divine={s.divine} lang={lang} />
          {', '}
          {t('flip.items.say.profit')} <Price chaos={profit} divine={s.divine} lang={lang} prefix="~" />
          {', '}
          {t(`flip.items.liq.${row.liquidity}`)}.
        </p>
        {!expert && <p className="fi-note">{t('flip.items.say.how')}</p>}

        {res && !res.ok && (
          <div className="ui-banner ui-banner--bad" role="alert">
            <IIco name="warn" />
            <span>{errorText(res, t)}</span>
          </div>
        )}
        {res?.ok && (
          <>
            <p className="fi-note">
              {t('flip.items.check.total', { n: res.total })} <Price chaos={res.maxChaos} divine={s.divine} lang={lang} prefix="≤ " />
              {deals.length > 0 ? ` · ${t('flip.items.check.deals', { n: deals.length })}` : ''}
            </p>
            {res.market && (
              <div className="ui-banner fx-warn" role="note">
                <IIco name="warn" />
                <span>
                  {t('flip.items.check.market', { n: res.market.n })} <Price chaos={res.market.price} divine={s.divine} lang={lang} prefix="~" />
                  {' — '}
                  {t('flip.items.check.market.tail')}
                </span>
              </div>
            )}
            {res.lots.length ? (
              <div className="fx-scroll ui-scroll">
                <table className="ui-table fx-table fi-lots">
                  <thead>
                    <tr>
                      <th className="is-num">{t('flip.items.lot.price')}</th>
                      <th>{t('flip.items.lot.kind')}</th>
                      <th className="is-num">{t('flip.items.lot.listed')}</th>
                      <th>{t('flip.items.lot.verdict')}</th>
                      <th>{t('flip.col.conf')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {res.lots.map((l) => (
                      <LotRow key={l.id} l={l} s={s} lang={lang} />
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="ui-empty fx-empty">
                <span className="ui-empty__title">{t('flip.items.check.none')}</span>
                <span>{t('flip.items.check.none.tip')}</span>
              </div>
            )}
          </>
        )}
        <div className="fi-actions">
          <button type="button" className="ui-btn ui-btn--primary" disabled={busy} title={t('flip.items.check.help')} onClick={() => void check(row.id)}>
            <IIco name={busy ? 'history' : 'search'} />
            {busy ? t('flip.items.check.busy') : res ? t('flip.items.check.again') : t('flip.items.check')}
          </button>
          {res?.ok && (
            <button
              type="button"
              className="ui-btn"
              title={t('flip.items.open.help')}
              onClick={() => void window.overlayApi.tradeWindow.open({ game: 'poe1', url: res.siteUrl })}
            >
              <IIco name="external" />
              {t('flip.items.open')}
            </button>
          )}
          <button
            type="button"
            className="ui-btn ui-btn--live"
            title={t('flip.items.watch.help')}
            disabled={watch === 'busy'}
            aria-pressed={watch === 'done' || watch === 'dup'}
            onClick={() => void watchRow(row.id)}
          >
            <IIco name={watch === 'done' || watch === 'dup' ? 'check' : 'bolt'} />
            {t(watch ? `flip.items.watch.${watch}` : 'flip.items.watch')}
          </button>
          {expert && (
            <span className="fx-liq">
              {t('flip.items.k.now', { pct: Math.round(k * 100) })} · {t('flip.items.col.sample')} {row.count} / {row.listings}
            </span>
          )}
        </div>
      </div>
    </section>
  )
}
