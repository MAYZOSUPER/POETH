import { useMemo, useState } from 'react'
import type { PobStagePlan } from '@shared/pob/stages'
import { anointByName, buildAnoint } from '@shared/build/anoints'
import type { StoredBuild } from '@shared/types/build'
import { useLang, useT } from '../../i18n'
import { useBuildStore } from '../../store/useBuildStore'
import { AnointFinder } from './AnointFinder'
import { AnointRow } from './anointUi'
import { BIco } from './ui'
import { useAnointData, useOilPrices } from './useAnoints'
import './anoint.css'

// «Анойнт амулета» (S54) — в левой колонке «Билда» после «Предметов этапа»: анойнт, который указал автор (строка
// «Allocates X» на амулете набора предметов этапа, иначе ближайшего этапа с анойнтом), = три масла и сумма по ценам
// обмена у Фаустуса. Анойнта у автора нет — так и пишем, ничего не подбираем. Кнопка «Нота ↔ масла» открывает
// маленький поиск (AnointFinder): рецепт любой ноты и нота по трём маслам.

export function AnointBox({
  build,
  plan,
  shown,
  labels,
  expert
}: {
  build: StoredBuild
  plan: PobStagePlan
  shown: number
  labels: string[]
  expert: boolean
}) {
  const t = useT()
  const lang = useLang()
  const tree = useBuildStore((s) => s.tree)
  const { data, ready } = useAnointData()
  const [open, setOpen] = useState(false)
  const anoint = useMemo(() => buildAnoint(build.build, plan, shown), [build, plan, shown])
  const hash = data && tree && anoint ? anointByName(data, tree, anoint.name) : null
  const { prices, loading } = useOilPrices(data, hash !== null || open)

  const from =
    anoint && !anoint.here ? (
      <span className="an-from">
        {anoint.stage !== null ? t('bd.an.from.stage', { s: labels[anoint.stage] ?? '' }) : t('bd.an.from.set')}
      </span>
    ) : undefined
  const time = prices ? new Date(prices.lastHour).toLocaleTimeString(lang === 'ru' ? 'ru-RU' : 'en-GB', { hour: '2-digit', minute: '2-digit' }) : null

  return (
    <section className="ui-box an-box">
      <div className="ui-box__head">
        <span className="ui-label">
          <BIco name="seal" />
          {t('bd.an.title')}
        </span>
        <span className="ui-label__grow" />
        <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm" aria-expanded={open} onClick={() => setOpen(!open)}>
          <BIco name={open ? 'chev-d' : 'search'} />
          {t('bd.an.find')}
        </button>
      </div>
      {!anoint ? (
        <p className="bd-none">{expert ? t('bd.an.none') : `${t('bd.an.none')} ${t('bd.an.none.d')}`}</p>
      ) : !ready || !tree ? (
        <p className="bd-none">{t('bd.af.loading')}</p>
      ) : hash === null || !data ? (
        <p className="bd-none">{t(data ? 'bd.an.unknown' : 'bd.af.err', { name: anoint.name })}</p>
      ) : (
        <div className="bd-rows">
          <AnointRow hash={hash} data={data} tree={tree} prices={prices} loading={loading} expert={expert} lang={lang} note={from} />
        </div>
      )}
      {!expert && <p className="an-what">{t('bd.an.what')}</p>}
      {open && (
        <div className="an-find-wrap">
          {data && tree ? (
            <AnointFinder data={data} tree={tree} prices={prices} loading={loading} expert={expert} lang={lang} />
          ) : (
            <p className="bd-none">{t(ready ? 'bd.af.err' : 'bd.af.loading')}</p>
          )}
        </div>
      )}
      {(hash !== null || open) && (
        <div className="ui-box__foot bd-foot">
          <BIco name="info" size="sm" />
          <span>{time ? t('bd.an.foot', { time }) : loading ? t('bd.an.foot.wait') : t('bd.an.foot.none')}</span>
        </div>
      )}
    </section>
  )
}
