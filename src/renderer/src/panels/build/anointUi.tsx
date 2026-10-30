import type { ReactNode } from 'react'
import { anointCost, anointOils, costView, type AnointData, type AnointOil } from '@shared/build/anoints'
import { lineText, nodeName } from '@shared/build/data'
import type { TreeData } from '@shared/build/types'
import type { UiLang } from '@shared/types'
import { CoinIcon, Currency, useCurrencyTable } from '../../components/Currency'
import { useGameLang } from '../../gameLang'
import { useT } from '../../i18n'
import { BIco } from './ui'
import type { OilPrices } from './useAnoints'

// Части анойнта (S54): масла рецепта с иконками, сумма по ценам масел, строка ноты. Имена нот и масел — на языке
// клиента игры (ноты — tree.json, масла — данные APT по tradeTag), пояснения — на языке интерфейса.

/** Имя масла на языке клиента; пока данные APT не загрузились — английское. */
export function useOilName(lang: UiLang): (o: AnointOil) => string {
  const table = useCurrencyTable(useGameLang(lang))
  return (o) => table?.get(o.tag)?.name ?? o.en
}

export function fmtNum(n: number, lang: UiLang): string {
  return n.toLocaleString(lang === 'ru' ? 'ru-RU' : 'en-US', { maximumFractionDigits: 1 })
}

/**
 * «= [иконка] Золотое масло + [иконка] Золотое масло + …»: знак переносится вместе со своим маслом; compact — только
 * иконки (имя — в подсказке).
 */
export function OilList({ oils, lang, compact = false, lead }: { oils: readonly AnointOil[]; lang: UiLang; compact?: boolean; lead?: string }) {
  const name = useOilName(lang)
  const sign = (s: string) => (
    <span className="an-sign" aria-hidden="true">
      {s}
    </span>
  )
  return (
    <span className="an-oils">
      {oils.map((o, i) => (
        <span key={i} className="an-oil" title={compact ? name(o) : undefined}>
          {i > 0 ? sign('+') : lead ? sign(lead) : null}
          <CoinIcon tag={o.tag} lang={lang} />
          {compact ? <span className="bd-sr">{name(o)}</span> : <span>{name(o)}</span>}
        </span>
      ))}
    </span>
  )
}

/** Сумма за три масла: «≈ 249 Сфер хаоса» (эксперт — «≈ 249 c»); цены хотя бы одного масла нет — «без цены». */
export function CostText({
  oils,
  prices,
  loading,
  expert,
  lang
}: {
  oils: readonly AnointOil[]
  prices: OilPrices | null
  loading: boolean
  expert: boolean
  lang: UiLang
}) {
  const t = useT()
  const name = useOilName(lang)
  const cost = anointCost(oils, prices?.byTag)
  if (cost.total === null || !prices) {
    if (loading) return <span className="bd-tip">{t('bd.an.loading')}</span>
    return (
      <span className="bd-tip an-noprice" title={t('bd.an.noPrice.tip')}>
        {t('bd.an.noPrice')}
      </span>
    )
  }
  const v = costView(cost.total, prices.chaosPerDivine)
  const each = (
    <span className="ui-cur-tip__faint">
      {oils.map((o, i) => `${name(o)} — ${fmtNum(costView(cost.each[i] ?? 0, null).n, lang)} c`).join(' · ')}
    </span>
  )
  return <Currency tag={v.unit} text={`≈ ${fmtNum(v.n, lang)}`} full={!expert} lang={lang} className="an-cost" extra={each} />
}

/**
 * Имя ноты на другом языке клиента: RU-клиент — английское (гайды), EN-клиент при русском интерфейсе — русское.
 * Как подсказка валют (S18).
 */
function otherName(en: string, ru: string, gameLang: 'ru' | 'en', lang: UiLang): string | null {
  if (gameLang === 'ru') return en !== ru ? en : null
  return lang === 'ru' && ru !== en ? ru : null
}

/** Строка ноты анойнта: имя, «только анойнтом», масла, сумма; в простом режиме — что даёт нота. */
export function AnointRow({
  hash,
  data,
  tree,
  prices,
  loading,
  expert,
  lang,
  note,
  onPick
}: {
  hash: number
  data: AnointData
  tree: TreeData
  prices: OilPrices | null
  loading: boolean
  expert: boolean
  lang: UiLang
  /** строка под маслами (откуда анойнт) */
  note?: ReactNode
  /** выбрать эту ноту (поиск по маслам: дописать недостающие масла) */
  onPick?: () => void
}) {
  const t = useT()
  const gameLang = useGameLang(lang)
  const node = tree.nodes.get(hash)
  const oils = anointOils(data, hash)
  if (!node || !oils) return null
  const name = nodeName(node, gameLang)
  const other = otherName(node.en, node.ru, gameLang, lang)
  const lines = expert ? [] : node.stats.slice(0, 3).map((l) => lineText(l, gameLang))
  return (
    <div className="bd-row an-row">
      <BIco name="passive" />
      <span className="bd-row__t">
        <span className="an-name">
          {onPick ? (
            <button type="button" className="bd-link-btn" onClick={onPick}>
              {name}
            </button>
          ) : (
            <b>{lang === 'ru' ? `«${name}»` : name}</b>
          )}
          {other && <span className="an-other">{other}</span>}
          {data.only.has(hash) && (
            <span className="ui-tag" title={t('bd.an.only.tip')}>
              {t('bd.an.only')}
            </span>
          )}
        </span>
        <span className="an-recipe">
          <OilList oils={oils} lang={lang} lead="=" />
        </span>
        {note}
        {lines.length > 0 && (
          <span className="an-stats">
            {lines.map((l, i) => (
              <span key={i}>{l}</span>
            ))}
          </span>
        )}
      </span>
      <span className="bd-row__end">
        <CostText oils={oils} prices={prices} loading={loading} expert={expert} lang={lang} />
      </span>
    </div>
  )
}
