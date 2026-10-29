import type { ItemRow, UiLang, UniqueTier } from '@shared/types'
import { useT } from '../../../i18n'
import { Currency } from '../../../components/Currency'
import { ensureSprite } from '../../wealth/ui'
import { money } from './format'

// Мелкие компоненты «Предметов» (S33): иконка спрайта, метка тира, цена, метки варианта.

export type IIcoName =
  | 'bolt'
  | 'check'
  | 'close'
  | 'external'
  | 'help'
  | 'history'
  | 'info'
  | 'link'
  | 'plus'
  | 'refresh'
  | 'search'
  | 'star'
  | 'swap'
  | 'warn'
  | 'coins'
  | 'chart'
  | 'layers'

export function IIco({ name, size }: { name: IIcoName; size?: 'sm' | 'lg' }) {
  ensureSprite()
  return (
    <svg className={`ui-ico${size ? ` ui-ico--${size}` : ''}`} aria-hidden="true">
      <use href={`#i-${name}`} />
    </svg>
  )
}

const TIER_CLASS: Record<UniqueTier, string> = { T0: 'ui-tier ui-tier--t1 fi-t0', T1: 'ui-tier ui-tier--t1', T2: 'ui-tier', low: 'ui-tier ui-tier--t3' }

/** Тир словом и меткой; «?» — мало данных. */
export function TierTag({ tier, thin }: { tier: UniqueTier; thin?: boolean }) {
  const t = useT()
  return (
    <span className={TIER_CLASS[tier]} title={`${t(`flip.items.tier.${tier}.help`)}${thin ? ` ${t('flip.items.thin.help')}` : ''}`}>
      {tier === 'low' ? t('flip.items.tier.low') : tier}
      {thin && <em>?</em>}
    </span>
  )
}

export function Price({ chaos, divine, lang, prefix = '' }: { chaos: number; divine: number; lang: UiLang; prefix?: string }) {
  const m = money(chaos, divine, lang)
  return <Currency tag={m.tag} text={`${prefix}${m.text}`} lang={lang} />
}

/** Вариант, связи, Foulborn — метками под именем. */
export function FormTags({ row }: { row: Pick<ItemRow, 'variant' | 'links' | 'unlinked' | 'foulborn' | 'ambiguous'> }) {
  const t = useT()
  return (
    <>
      {row.links && <span className="ui-tag">{row.links}L</span>}
      {row.unlinked && <span className="ui-tag" title={t('flip.items.unlinked.help')}>{t('flip.items.unlinked')}</span>}
      {row.foulborn && (
        <span className="ui-tag ui-tag--warn" title={t('flip.items.foulborn.help')}>
          {t('flip.items.foulborn')}
        </span>
      )}
      {row.variant && <span className="fi-variant">{row.variant}</span>}
      {row.ambiguous && (
        <span className="ui-tag ui-tag--bad" title={t('flip.items.ambiguous.help')}>
          {t('flip.items.ambiguous')}
        </span>
      )}
    </>
  )
}
