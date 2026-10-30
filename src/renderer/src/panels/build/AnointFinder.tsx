import { useId, useMemo, useState } from 'react'
import { ANOINT_OILS, anointByOils, anointOils, anointsWithOils, searchAnoints, type AnointData } from '@shared/build/anoints'
import type { TreeData } from '@shared/build/types'
import type { UiLang } from '@shared/types'
import { CoinIcon } from '../../components/Currency'
import { useGameLang } from '../../gameLang'
import { useT } from '../../i18n'
import { AnointRow, useOilName } from './anointUi'
import { BIco } from './ui'
import type { OilPrices } from './useAnoints'

// «Анойнт: нота ↔ масла» (S54) — маленький поиск во вкладке «Билд»: имя ноты (RU или EN, часть имени, слово из
// описания) → три масла и цена; три масла → нота. Не зависит от билда: годится и для отдельной страницы справочника
// (данные — те же anoints.json + tree.json, цены — useOilPrices).

type Mode = 'note' | 'oils'

const HITS_SIMPLE = 5
const HITS_EXPERT = 8
const CANDIDATES = 5

export function AnointFinder({
  data,
  tree,
  prices,
  loading,
  expert,
  lang
}: {
  data: AnointData
  tree: TreeData
  prices: OilPrices | null
  loading: boolean
  expert: boolean
  lang: UiLang
}) {
  const t = useT()
  const gameLang = useGameLang(lang)
  const oilName = useOilName(lang)
  const inputId = useId()
  const [mode, setMode] = useState<Mode>('note')
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<number[]>([])

  const limit = expert ? HITS_EXPERT : HITS_SIMPLE
  const hits = useMemo(() => searchAnoints(data, tree, query, gameLang, limit + 1), [data, tree, query, gameLang, limit])
  const result = picked.length === ANOINT_OILS ? anointByOils(data, picked) : null
  // выбраны не все масла — какие ноты ещё возможны, по имени на языке клиента
  const candidates = useMemo(() => {
    if (picked.length === 0 || picked.length >= ANOINT_OILS) return []
    const name = (h: number): string => {
      const n = tree.nodes.get(h)
      return n ? (gameLang === 'ru' ? n.ru : n.en) : ''
    }
    return anointsWithOils(data, picked).sort((a, b) => name(a).localeCompare(name(b), gameLang))
  }, [data, tree, picked, gameLang])

  const row = (hash: number, onPick?: () => void) => (
    <AnointRow key={hash} hash={hash} data={data} tree={tree} prices={prices} loading={loading} expert={expert} lang={lang} onPick={onPick} />
  )

  return (
    <div className="an-find">
      <div className="an-find__mode">
        <span className="ui-seg" role="group" aria-label={t('bd.af.title')}>
          <button type="button" aria-pressed={mode === 'note'} onClick={() => setMode('note')}>
            {t('bd.af.mode.note')}
          </button>
          <button type="button" aria-pressed={mode === 'oils'} onClick={() => setMode('oils')}>
            {t('bd.af.mode.oils')}
          </button>
        </span>
      </div>

      {mode === 'note' ? (
        <>
          <div className="ui-field an-find__q">
            <label className="ui-field__label" htmlFor={inputId}>
              {t('bd.af.q.label')}
            </label>
            <input
              id={inputId}
              className="ui-input"
              type="search"
              value={query}
              placeholder={t('bd.af.q.ph')}
              maxLength={60}
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => setQuery(e.target.value)}
            />
            {!expert && <p className="ui-field__help">{t('bd.af.q.help')}</p>}
          </div>
          {query.trim() !== '' &&
            (hits.length === 0 ? (
              <p className="bd-none">{t('bd.af.q.none')}</p>
            ) : (
              <div className="bd-rows an-list" aria-live="polite">
                {hits.slice(0, limit).map((h) => row(h.hash))}
                {hits.length > limit && <p className="bd-none an-more">{t('bd.af.q.more', { n: limit })}</p>}
              </div>
            ))}
        </>
      ) : (
        <>
          <div className="an-slots" role="group" aria-label={t('bd.af.pick')}>
            {Array.from({ length: ANOINT_OILS }, (_, i) => {
              const o = picked[i] !== undefined ? data.oils[picked[i]] : null
              return o ? (
                <button
                  key={i}
                  type="button"
                  className="an-slot is-full"
                  title={t('bd.af.remove', { name: oilName(o) })}
                  aria-label={t('bd.af.remove', { name: oilName(o) })}
                  onClick={() => setPicked(picked.filter((_, j) => j !== i))}
                >
                  <CoinIcon tag={o.tag} lang={lang} />
                  <span>{oilName(o)}</span>
                  <BIco name="close" size="sm" />
                </button>
              ) : (
                <span key={i} className="an-slot">
                  {t('bd.af.slot', { n: i + 1 })}
                </span>
              )
            })}
            {picked.length > 0 && (
              <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm" onClick={() => setPicked([])}>
                {t('bd.af.clear')}
              </button>
            )}
          </div>
          <div className="an-pal" role="group" aria-label={t('bd.af.pal')}>
            {data.oils.map((o) => (
              <button
                key={o.tag}
                type="button"
                className="ui-chip an-pal__oil"
                disabled={picked.length >= ANOINT_OILS}
                title={expert ? oilName(o) : undefined}
                onClick={() => setPicked([...picked, o.index])}
              >
                <CoinIcon tag={o.tag} lang={lang} />
                {expert ? <span className="bd-sr">{oilName(o)}</span> : <span>{oilName(o)}</span>}
              </button>
            ))}
          </div>
          {!expert && picked.length === 0 && <p className="ui-field__help an-find__help">{t('bd.af.pick.help')}</p>}
          {picked.length === ANOINT_OILS && (
            <div className="bd-rows an-list" aria-live="polite">
              {result !== null ? row(result) : <p className="bd-none">{t('bd.af.result.none')}</p>}
            </div>
          )}
          {candidates.length > 0 && (
            <div className="bd-rows an-list" aria-live="polite">
              <p className="bd-none an-left">{t('bd.af.left', { k: ANOINT_OILS - picked.length, n: candidates.length })}</p>
              {candidates.slice(0, CANDIDATES).map((h) => row(h, () => setPicked([...(anointOils(data, h) ?? []).map((o) => o.index)])))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
