import { useId, useMemo, useState } from 'react'
import {
  INSTILL_EMOTIONS,
  emotionName,
  instillByEmotions,
  instillCost,
  instillCostView,
  instillEmotions,
  instillsMatching,
  notableName,
  searchInstill,
  type InstillData
} from '@shared/poe2/build/instill'
import type { GameLang } from '@shared/types/settings'
import { useT } from '../../i18n'
import { BIco } from '../build/ui'
import { useEmotionPrices, useInstillData, type EmotionPrices } from './useInstill'

// «Вложение» PoE 2 (S66), как «Анойнт» PoE 1 (S54): вложение с амулета автора и поиск «нотабл ↔ эмоции». Порядок
// эмоций в рецепте важен — места 1 → 2 → 3. Имена нотаблов и эмоций — на языке клиента игры (данные EE2); тексты
// свойств — только английские (RU-текстов в открытых данных нет). Цены — у Ange (S61), пока их нет — без суммы.

type Mode = 'note' | 'em'
const HITS_SIMPLE = 5
const HITS_EXPERT = 8
const CANDIDATES = 6

type T = ReturnType<typeof useT>

function Recipe({ data, hash, lang, prices, t }: { data: InstillData; hash: number; lang: GameLang; prices: EmotionPrices | null; t: T }) {
  const em = instillEmotions(data, hash) ?? []
  const cost = instillCost(em, prices?.byName)
  const view = cost.total !== null ? instillCostView(cost.total, prices?.exaltedPerDivine) : null
  return (
    <span className="b2-recipe">
      {em.map((e, i) => (
        <span key={i} className="b2-em">
          <span className="b2-em__n">{i + 1}</span>
          {emotionName(e, lang)}
        </span>
      ))}
      {view ? (
        <b className="b2-cost">{t('build2.in.total', { n: view.n, unit: t(`build2.unit.${view.unit}`) })}</b>
      ) : (
        prices && <span className="b2-muted">{t('build2.in.noPrice')}</span>
      )}
    </span>
  )
}

function Row({ data, hash, lang, prices, expert, onPick }: { data: InstillData; hash: number; lang: GameLang; prices: EmotionPrices | null; expert: boolean; onPick?: () => void }) {
  const t = useT()
  const n = data.notables.get(hash)
  if (!n) return null
  return (
    <div className="b2-in-row">
      <div className="b2-in-row__name">
        <b>{notableName(n, lang)}</b>
        {lang === 'ru' && n.ru && n.en !== n.ru && <span className="b2-muted">{n.en}</span>}
        {onPick && (
          <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm" onClick={onPick}>
            <BIco name="check" size="sm" />
          </button>
        )}
      </div>
      <Recipe data={data} hash={hash} lang={lang} prices={prices} t={t} />
      {expert && n.stats.length > 0 && (
        <div className="b2-stats" title={t('build2.in.stats')}>
          {n.stats.map((s, i) => (
            <span key={i}>{s}</span>
          ))}
        </div>
      )}
    </div>
  )
}

export function InstillBox({ author, gameLang, expert }: { author: { hash: number | null; name: string } | null | undefined; gameLang: GameLang; expert: boolean }) {
  const t = useT()
  const id = useId()
  const { data, ready } = useInstillData()
  const [mode, setMode] = useState<Mode>('note')
  const [query, setQuery] = useState('')
  const [slots, setSlots] = useState<(number | null)[]>([null, null, null])
  const show = !!author?.hash || query.trim() !== '' || slots.some((s) => s !== null)
  const { prices } = useEmotionPrices(data, show)
  const limit = expert ? HITS_EXPERT : HITS_SIMPLE

  const hits = useMemo(() => (data ? searchInstill(data, query, gameLang, limit + 1) : []), [data, query, gameLang, limit])
  const full = slots.every((s) => s !== null)
  const result = data && full ? instillByEmotions(data, slots as number[]) : null
  const candidates = useMemo(() => {
    if (!data || full) return []
    const name = (h: number): string => {
      const n = data.notables.get(h)
      return n ? notableName(n, gameLang) : ''
    }
    return instillsMatching(data, slots).sort((a, b) => name(a).localeCompare(name(b), gameLang))
  }, [data, slots, full, gameLang])

  const pickSlot = (e: number): void => {
    const i = slots.indexOf(null)
    if (i < 0) return
    const next = [...slots]
    next[i] = e
    setSlots(next)
  }

  return (
    <section className="ui-box b2-box" aria-labelledby={`${id}-t`}>
      <h2 className="b2-h" id={`${id}-t`}>
        <BIco name="delirium" />
        {t('build2.in.title')}
      </h2>
      {!expert && <p className="b2-lead">{t('build2.in.what')}</p>}
      {!ready ? (
        <p className="b2-muted">{t('build2.in.loading')}</p>
      ) : !data ? (
        <p className="b2-muted">{t('build2.in.err')}</p>
      ) : (
        <>
          {author !== undefined && (
            <div className="b2-in-author">
              {!author ? (
                <p className="b2-muted">{t('build2.in.author.none')}</p>
              ) : author.hash === null ? (
                <p className="b2-muted">{t('build2.in.unknown', { name: author.name })}</p>
              ) : (
                <>
                  <div className="ui-label">{t('build2.in.author')}</div>
                  <Row data={data} hash={author.hash} lang={gameLang} prices={prices} expert={expert} />
                </>
              )}
            </div>
          )}

          <span className="ui-seg" role="group" aria-label={t('build2.in.mode')}>
            <button type="button" aria-pressed={mode === 'note'} onClick={() => setMode('note')}>
              {t('build2.in.mode.note')}
            </button>
            <button type="button" aria-pressed={mode === 'em'} onClick={() => setMode('em')}>
              {t('build2.in.mode.em')}
            </button>
          </span>

          {mode === 'note' ? (
            <>
              <div className="ui-field">
                <label className="ui-field__label" htmlFor={`${id}-q`}>
                  {t('build2.in.q.label')}
                </label>
                <input
                  id={`${id}-q`}
                  className="ui-input"
                  type="search"
                  value={query}
                  placeholder={t('build2.in.q.ph')}
                  maxLength={60}
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(e) => setQuery(e.target.value)}
                />
                {!expert && <p className="ui-field__help">{t('build2.in.q.help')}</p>}
              </div>
              {query.trim() !== '' &&
                (hits.length === 0 ? (
                  <p className="b2-muted">{t('build2.in.q.none')}</p>
                ) : (
                  <div className="b2-in-list" aria-live="polite">
                    {hits.slice(0, limit).map((h) => (
                      <Row key={h.hash} data={data} hash={h.hash} lang={gameLang} prices={prices} expert={expert} />
                    ))}
                    {hits.length > limit && <p className="b2-muted">{t('build2.in.q.more', { n: limit })}</p>}
                  </div>
                ))}
            </>
          ) : (
            <>
              <div className="b2-slots" role="group" aria-label={t('build2.in.pick')}>
                {slots.map((s, i) => {
                  const e = s !== null ? data.emotions[s] : null
                  return e ? (
                    <button
                      key={i}
                      type="button"
                      className="b2-slot is-full"
                      aria-label={t('build2.in.remove', { name: emotionName(e, gameLang) })}
                      onClick={() => setSlots(slots.map((x, j) => (j === i ? null : x)))}
                    >
                      <span className="b2-em__n">{i + 1}</span>
                      {emotionName(e, gameLang)}
                      <BIco name="close" size="sm" />
                    </button>
                  ) : (
                    <span key={i} className="b2-slot">
                      {t('build2.in.slot', { n: i + 1 })}
                    </span>
                  )
                })}
                {slots.some((s) => s !== null) && (
                  <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm" onClick={() => setSlots([null, null, null])}>
                    {t('build2.in.clear')}
                  </button>
                )}
              </div>
              <div className="ui-chips b2-pal" role="group" aria-label={t('build2.in.pal')}>
                {data.emotions.map((e) => (
                  <button key={e.id} type="button" className="ui-chip" disabled={full} onClick={() => pickSlot(e.index)}>
                    {emotionName(e, gameLang)}
                  </button>
                ))}
              </div>
              {full && (
                <div className="b2-in-list" aria-live="polite">
                  {result !== null ? (
                    <Row data={data} hash={result} lang={gameLang} prices={prices} expert={expert} />
                  ) : (
                    <p className="b2-muted">{t('build2.in.result.none')}</p>
                  )}
                </div>
              )}
              {candidates.length > 0 && (
                <div className="b2-in-list" aria-live="polite">
                  <p className="b2-muted">{t('build2.in.left', { n: candidates.length })}</p>
                  {candidates.slice(0, CANDIDATES).map((h) => (
                    <Row
                      key={h}
                      data={data}
                      hash={h}
                      lang={gameLang}
                      prices={prices}
                      expert={expert}
                      onPick={() => setSlots([...(data.recipes.get(h) ?? [null, null, null])].slice(0, INSTILL_EMOTIONS))}
                    />
                  ))}
                </div>
              )}
            </>
          )}
          <p className="b2-muted b2-foot">{prices ? t('build2.in.price') : t('build2.in.price.none')}</p>
        </>
      )}
    </section>
  )
}
