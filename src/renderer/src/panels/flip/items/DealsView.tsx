import { useMemo, useState } from 'react'
import type { ItemFlipState, ItemRow, UiLang } from '@shared/types'
import { K_MAX, K_MIN, maxPriceOf } from '@shared/flip/items/query'
import { useT } from '../../../i18n'
import { Confidence } from '../ui'
import { useItemsStore } from './useItemsStore'
import { useBaseName, useUniqueName } from './format'
import { CheckCard } from './CheckCard'
import { FormTags, IIco, Price, TierTag } from './ui'

// «Недооценённые уники» (S33): игрок берёт топ ликвидных или выбирает свои; по каждому — «купи ≤ k × цены
// poe.ninja, обычно продаётся за …». «Проверить сейчас» — один поиск на трейде; «Следить» — тот же запрос в live
// search. Поисков по таймеру нет.

const K_PRESETS = [0.6, 0.7, 0.8]
const SUGGEST = 8

const norm = (s: string): string => s.toLowerCase().replace(/ё/g, 'е')

function Picker({ s, lang }: { s: ItemFlipState; lang: UiLang }) {
  const t = useT()
  const [q, setQ] = useState('')
  const nameOf = useUniqueName(lang)
  const baseOf = useBaseName(lang)
  const togglePick = useItemsStore((st) => st.togglePick)
  const found = useMemo(() => {
    const words = norm(q).split(/\s+/).filter(Boolean)
    if (!words.length) return []
    const picked = new Set(s.config.picks)
    return s.rows
      .filter((r) => !picked.has(r.id) && words.every((w) => norm(`${nameOf(r)} ${r.name} ${baseOf(r.base)}`).includes(w)))
      .sort((a, b) => b.chaos * b.count - a.chaos * a.count)
      .slice(0, SUGGEST)
  }, [q, s.rows, s.config.picks, nameOf])
  return (
    <div className="fi-picker">
      <input
        className="ui-input fx-search"
        type="search"
        value={q}
        placeholder={t('flip.items.pick.search')}
        aria-label={t('flip.items.pick.search')}
        onChange={(e) => setQ(e.target.value)}
      />
      {found.length > 0 && (
        <div className="fi-suggest" role="list">
          {found.map((r) => (
            <button key={r.id} type="button" className="ui-btn ui-btn--sm ui-btn--ghost" role="listitem" onClick={() => void togglePick(r.id)}>
              <IIco name="plus" size="sm" />
              {nameOf(r)} <FormTags row={r} /> <Price chaos={r.chaos} divine={s.divine} lang={lang} prefix="≈ " />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function KControl({ s, lang, expert }: { s: ItemFlipState; lang: UiLang; expert: boolean }) {
  const t = useT()
  const setConfig = useItemsStore((st) => st.setConfig)
  const k = s.config.k
  if (!expert) {
    return (
      <div className="ui-seg" role="group" aria-label={t('flip.items.k')}>
        {K_PRESETS.map((p) => (
          <button key={p} type="button" aria-pressed={Math.abs(k - p) < 0.001} title={t('flip.items.k.help')} onClick={() => void setConfig({ k: p })}>
            {t('flip.items.k.preset', { pct: Math.round(p * 100) })}
          </button>
        ))}
      </div>
    )
  }
  const shown = k.toLocaleString(lang === 'ru' ? 'ru-RU' : 'en-US', { maximumFractionDigits: 2 })
  return (
    <label className="fx-num" title={t('flip.items.k.help')}>
      {t('flip.items.k')}
      <input
        key={shown}
        className="ui-input ui-input--num"
        inputMode="decimal"
        defaultValue={shown}
        aria-label={t('flip.items.k')}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        onBlur={(e) => {
          const n = Number(e.currentTarget.value.replace(',', '.'))
          if (Number.isFinite(n) && n >= K_MIN && n <= K_MAX && n !== k) void setConfig({ k: n })
          else e.currentTarget.value = shown
        }}
      />
      × {t('flip.items.k.of')}
    </label>
  )
}

export function DealsView({ s, lang, expert }: { s: ItemFlipState; lang: UiLang; expert: boolean }) {
  const t = useT()
  const nameOf = useUniqueName(lang)
  const baseOf = useBaseName(lang)
  const selected = useItemsStore((st) => st.selected)
  const pick = useItemsStore((st) => st.pick)
  const check = useItemsStore((st) => st.check)
  const checking = useItemsStore((st) => st.checking)
  const checks = useItemsStore((st) => st.checks)
  const setConfig = useItemsStore((st) => st.setConfig)
  const togglePick = useItemsStore((st) => st.togglePick)
  const list = s.config.list

  const rows: ItemRow[] = useMemo(() => {
    if (list === 'top') return s.rows.filter((r) => r.top).sort((a, b) => b.chaos * b.count - a.chaos * a.count)
    const byId = new Map(s.rows.map((r) => [r.id, r]))
    return s.config.picks.map((id) => byId.get(id)).filter((r): r is ItemRow => !!r)
  }, [s.rows, s.config.picks, list])
  const current = rows.find((r) => r.id === selected) ?? null
  const k = s.config.k

  return (
    <div className="fi-view">
      <div className="ui-chips">
        <div className="ui-seg" role="group" aria-label={t('flip.items.list')}>
          {(['top', 'mine'] as const).map((l) => (
            <button key={l} type="button" aria-pressed={list === l} title={t(`flip.items.list.${l}.help`)} onClick={() => void setConfig({ list: l })}>
              {t(`flip.items.list.${l}`)}
              {l === 'mine' && s.config.picks.length > 0 && ` · ${s.config.picks.length}`}
            </button>
          ))}
        </div>
        <KControl s={s} lang={lang} expert={expert} />
      </div>
      {list === 'mine' && <Picker s={s} lang={lang} />}
      {!expert && (
        <div className="ui-hint fx-hint">
          <IIco name="help" />
          <span>{t('flip.items.deals.hint', { pct: Math.round(k * 100) })}</span>
        </div>
      )}
      <div className="ui-box">
        <div className="ui-box__head">
          <span className="ui-label">
            <IIco name="coins" size="sm" />
            {t(`flip.items.deals.list.${list}`, { n: rows.length })}
          </span>
        </div>
        <div className="fx-scroll ui-scroll">
          <table className="ui-table ui-table--pick fx-table fi-table">
            <thead>
              <tr>
                <th>{t('flip.items.col.unique')}</th>
                {expert ? (
                  <>
                    <th className="is-num">{t('flip.items.col.ninja')}</th>
                    <th className="is-num">{t('flip.items.col.buy')}</th>
                    <th className="is-num">{t('flip.items.col.sell')}</th>
                    <th className="is-num">{t('flip.items.col.profit')}</th>
                  </>
                ) : (
                  <th>{t('flip.items.col.todo')}</th>
                )}
                <th>{t('flip.col.conf')}</th>
                <th className="fi-act-col">
                  <span className="fx-sr">{t('flip.items.col.actions')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const buy = maxPriceOf(r, k)
                const res = checks[r.id]
                const found = res?.ok ? res.lots.filter((l) => l.verdict === 'deal').length : null
                return (
                  <tr
                    key={r.id}
                    aria-selected={r.id === current?.id}
                    tabIndex={0}
                    onClick={() => pick(r.id)}
                    onKeyDown={(e) => {
                      if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return
                      e.preventDefault()
                      pick(r.id)
                    }}
                  >
                    <td>
                      <span className="fi-name">
                        <b className="ui-item ui-item--unique">{nameOf(r)}</b>
                        <span className="fi-sub">
                          <TierTag tier={r.tier} thin={r.thin} /> {baseOf(r.base)} <FormTags row={r} />
                        </span>
                      </span>
                    </td>
                    {expert ? (
                      <>
                        <td className="is-num">
                          <Price chaos={r.chaos} divine={s.divine} lang={lang} />
                        </td>
                        <td className="is-num">
                          <Price chaos={buy} divine={s.divine} lang={lang} prefix="≤ " />
                        </td>
                        <td className="is-num">
                          <Price chaos={r.sell} divine={s.divine} lang={lang} />
                        </td>
                        <td className="is-num is-good">
                          <Price chaos={r.sell - buy} divine={s.divine} lang={lang} prefix="~" />
                        </td>
                      </>
                    ) : (
                      <td className="fi-todo">
                        {t('flip.items.say.buyShort')} <Price chaos={buy} divine={s.divine} lang={lang} prefix="≤ " />
                        {', '}
                        {t('flip.items.say.sell')} <Price chaos={r.sell} divine={s.divine} lang={lang} />
                        {', '}
                        {t('flip.items.say.profit')} <Price chaos={r.sell - buy} divine={s.divine} lang={lang} prefix="~" />
                        {', '}
                        {t(`flip.items.liq.${r.liquidity}`)}
                      </td>
                    )}
                    <td>
                      <Confidence value={r.confidence} word={!expert} />
                    </td>
                    <td className="fi-act">
                      <button
                        type="button"
                        className="ui-btn ui-btn--sm"
                        disabled={checking[r.id]}
                        title={t('flip.items.check.help')}
                        onClick={(e) => {
                          e.stopPropagation()
                          void check(r.id)
                        }}
                      >
                        <IIco name={checking[r.id] ? 'history' : 'search'} size="sm" />
                        {found !== null ? t('flip.items.check.found', { n: found }) : t('flip.items.check')}
                      </button>
                      {list === 'mine' && (
                        <button
                          type="button"
                          className="ui-btn ui-btn--sm ui-btn--ghost ui-btn--icon"
                          title={t('flip.items.pick.remove')}
                          aria-label={t('flip.items.pick.remove')}
                          onClick={(e) => {
                            e.stopPropagation()
                            void togglePick(r.id)
                          }}
                        >
                          <IIco name="close" size="sm" />
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={expert ? 7 : 4}>
                    <div className="ui-empty fx-empty">
                      <span className="ui-empty__title">{t(`flip.items.deals.empty.${list}`)}</span>
                      <span>{t(`flip.items.deals.empty.${list}.tip`)}</span>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="ui-box__foot fx-foot">
          <IIco name="info" size="sm" />
          <span>{t('flip.items.deals.foot')}</span>
        </div>
      </div>
      {current && <CheckCard row={current} s={s} lang={lang} expert={expert} />}
    </div>
  )
}
