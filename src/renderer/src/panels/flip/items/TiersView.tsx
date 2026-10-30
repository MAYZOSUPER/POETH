import { useMemo } from 'react'
import type { ItemFlipState, ItemRow, UiLang, UniqueTier } from '@shared/types'
import { groupTiers, type TierGroup } from '@shared/flip/items/tiers'
import { useT } from '../../../i18n'
import { tKey } from '../../../i18n/hotkey'
import { useAppStore } from '../../../store/useAppStore'
import { useItemsStore } from './useItemsStore'
import { useBaseName, useUniqueName, pctText } from './format'
import { FormTags, IIco, Price, TierTag } from './ui'
import { Confidence } from '../ui'

// «Тиры уников»: новичку — «этот уник дорогой, не продавай торговцу». Простой режим — по уникам (обычная
// форма + «бывает дороже: 6L / Foulborn»), эксперт — все строки poe.ninja (варианты, связи, выборка, неделя).

const SHOW = 150
const TIERS: Array<UniqueTier | 'all'> = ['all', 'T0', 'T1', 'T2']

const norm = (s: string): string => s.toLowerCase().replace(/ё/g, 'е')

export function TiersView({ s, lang, expert }: { s: ItemFlipState; lang: UiLang; expert: boolean }) {
  const t = useT()
  const pcKey = useAppStore((st) => st.settings?.hotkeys.priceCheck.accel)
  const q = useItemsStore((st) => st.q)
  const tier = useItemsStore((st) => st.tier)
  const sure = useItemsStore((st) => st.sure)
  const setView = useItemsStore((st) => st.setView)
  const nameOf = useUniqueName(lang)
  const baseOf = useBaseName(lang)

  const match = useMemo(() => {
    const words = norm(q).split(/\s+/).filter(Boolean)
    return (r: ItemRow): boolean => {
      if (!words.length) return true
      const hay = norm(`${nameOf(r)} ${r.name} ${baseOf(r.base)} ${r.variant ?? ''}`)
      return words.every((w) => hay.includes(w))
    }
  }, [q, nameOf])
  const groups = useMemo(() => {
    if (expert) return []
    const okTier = (g: TierGroup): boolean => tier === 'all' || g.main.tier === tier || g.top?.tier === tier
    return groupTiers(s.rows.filter((r) => !sure || !r.thin)).filter((g) => okTier(g) && g.rows.some(match))
  }, [s.rows, expert, sure, match, tier])
  const rows = useMemo(() => {
    if (!expert) return []
    return s.rows.filter((r) => match(r) && (tier === 'all' || r.tier === tier) && (!sure || !r.thin)).sort((a, b) => b.chaos - a.chaos)
  }, [s.rows, expert, sure, match, tier])
  const total = expert ? rows.length : groups.length

  return (
    <div className="fi-view">
      <div className="ui-hint fx-hint">
        <IIco name="help" />
        <span>{tKey(t, 'flip.items.tiers.hint', pcKey)}</span>
      </div>
      <div className="ui-chips">
        <div className="ui-seg" role="group" aria-label={t('flip.items.tier')}>
          {TIERS.map((x) => (
            <button key={x} type="button" aria-pressed={tier === x} onClick={() => setView({ tier: x })}>
              {x === 'all' ? t('flip.items.tier.all') : x}
            </button>
          ))}
        </div>
        <button type="button" className="ui-chip" aria-pressed={sure} title={t('flip.items.sure.title')} onClick={() => setView({ sure: !sure })}>
          {t('flip.items.sure')}
        </button>
        <input
          className="ui-input fx-search"
          type="search"
          value={q}
          placeholder={t('flip.items.search')}
          aria-label={t('flip.items.search')}
          onChange={(e) => setView({ q: e.target.value })}
        />
      </div>
      <div className="ui-box">
        <div className="ui-box__head">
          <span className="ui-label">
            <IIco name="layers" size="sm" />
            {t('flip.items.tiers.list', { n: total })}
          </span>
        </div>
        <div className="fx-scroll ui-scroll">
          <table className="ui-table fx-table fi-table">
            <thead>
              <tr>
                <th>{t('flip.items.col.tier')}</th>
                <th>{t('flip.items.col.unique')}</th>
                <th className="is-num">{t('flip.items.col.price')}</th>
                {expert ? (
                  <>
                    <th className="is-num" title={t('flip.items.col.sample.title')}>
                      {t('flip.items.col.sample')}
                    </th>
                    <th className="is-num">{t('flip.items.col.week')}</th>
                    <th>{t('flip.col.conf')}</th>
                  </>
                ) : (
                  <th>{t('flip.items.col.advice')}</th>
                )}
              </tr>
            </thead>
            <tbody>
              {expert
                ? rows.slice(0, SHOW).map((r) => (
                    <tr key={r.id}>
                      <td>
                        <TierTag tier={r.tier} thin={r.thin} />
                      </td>
                      <td>
                        <span className="fi-name">
                          <b className="ui-item ui-item--unique">{nameOf(r)}</b>
                          <span className="fi-sub">
                            {baseOf(r.base)} <FormTags row={r} />
                          </span>
                        </span>
                      </td>
                      <td className="is-num">
                        <Price chaos={r.chaos} divine={s.divine} lang={lang} />
                      </td>
                      <td className="is-num is-faint">
                        {r.count} / {r.listings}
                      </td>
                      <td className={`is-num ${r.change && Math.abs(r.change) >= 20 ? 'fx-trend' : 'is-faint'}`}>
                        {r.change !== undefined ? pctText(r.change, lang) : '—'}
                      </td>
                      <td>
                        <Confidence value={r.confidence} word={false} />
                      </td>
                    </tr>
                  ))
                : groups.slice(0, SHOW).map((g) => (
                    <tr key={g.main.id}>
                      <td>
                        <TierTag tier={g.main.tier} thin={g.main.thin} />
                      </td>
                      <td>
                        <span className="fi-name">
                          <b className="ui-item ui-item--unique">{nameOf(g.main)}</b>
                          <span className="fi-sub">
                            {baseOf(g.base)}
                            {g.top && (
                              <>
                                {' · '}
                                {t('flip.items.tiers.more')} <FormTags row={g.top} /> <TierTag tier={g.top.tier} />{' '}
                                <Price chaos={g.top.chaos} divine={s.divine} lang={lang} prefix="≈ " />
                              </>
                            )}
                          </span>
                        </span>
                      </td>
                      <td className="is-num">
                        <Price chaos={g.main.chaos} divine={s.divine} lang={lang} prefix="≈ " />
                      </td>
                      <td className="fi-advice">
                        {g.top && g.main.tier === 'low' ? tKey(t, 'flip.items.advice.check', pcKey) : t(`flip.items.advice.${g.main.tier}`)}
                      </td>
                    </tr>
                  ))}
              {total === 0 && (
                <tr>
                  <td colSpan={expert ? 6 : 4}>
                    <div className="ui-empty fx-empty">
                      <span className="ui-empty__title">{t('flip.items.tiers.empty')}</span>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="ui-box__foot fx-foot">
          <IIco name="info" size="sm" />
          <span>{total > SHOW ? t('flip.items.more', { n: SHOW, total }) : tKey(t, 'flip.items.tiers.foot', pcKey)}</span>
        </div>
      </div>
    </div>
  )
}
