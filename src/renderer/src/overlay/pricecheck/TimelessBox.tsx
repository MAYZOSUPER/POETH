import { useEffect, useMemo, useRef, useState } from 'react'
import type { NetError, UiLang } from '@shared/types'
import type { ParsedItem } from '@shared/poe1/parser'
import { getDefaultPoe1DataStore } from '@shared/poe1/data'
import { buildRequest, localizeTradeRequest, type TimelessSearch, type TradeRequest } from '@shared/poe1/pricecheck'
import { honestPrice, marketPrice, type MarketPrice } from '@shared/poe1/pricecheck/results'
import { chaosRates } from '@shared/poe1/pricecheck/currency'
import { marketView } from '@shared/poe1/pricecheck/priceBlock'
import type { TimelessDataRaw } from '@shared/poe1/timeless/data'
import { dataKindOf, dataSeedOf, itemSeedOf, type BuildFit, type SocketScore } from '@shared/poe1/timeless/evaluate'
import type { StoredBuild } from '@shared/types/build'
import {
  ANON_ANALOG_FILTERS,
  MAX_ANALOG_FILTERS,
  analogConquerors,
  analogPreset,
  isTooComplex,
  maxAnalogSeeds,
  nextAnalogFilters
} from '@shared/poe1/timeless/query'
import { netErrorText } from '../../panels/account/netError'
import { Currency } from '../../components/Currency'
import { Icon } from '../Icon'
import { activePresetOf, usePriceCheckStore } from './store'
import { fmtNum } from './format'
import { buildGuideOn } from '../leveling/buildGuide'
import { calcTimeless, timelessData } from './timelessClient'
import type { TimelessCalc, TimelessProgress } from './timelessEngine'
import './timeless.css'

// «Умная оценка» timeless-самоцвета (S45) в окне цены Ctrl+D (PoE 1): что сид даёт в 21 гнезде дерева, лучшее
// гнездо по правилам самоцвета (shared/poe1/timeless/rules.ts) и цена реальных аналогов — один count-запрос на трейд
// «сиды с таким же или лучшим исходом», только по кнопке игрока (шлюз main: interactive, лимиты, кэш). Без входа сайт
// принимает меньше фильтров: начинаем с ANON_ANALOG_FILTERS, на «слишком сложно» — кнопка «искать по N сидов»
// (вдвое меньше), выученный лимит живёт до перезапуска окна.
// Пока считается — «Симуляция: проверено N из 21 гнезда» (прогресс из worker'а, окно не ждёт). Есть билд во вкладке
// «Билд» — строка «Для вашего билда»: гнездо, радиус которого задевает больше всего его нотаблов, и что с ними станет.
// Простой режим — одна строка (+ строка билда); эксперт — заметки гнезда, другие гнёзда, редкость исхода. Имена нод и строки исходов —
// на языке клиента игры (их ищут в игре), остальное — на языке интерфейса.

type T = (key: string, params?: Record<string, string | number>) => string

type Analog =
  | { phase: 'idle' }
  | { phase: 'busy' }
  | { phase: 'done'; total: number; market?: MarketPrice; siteUrl: string; cached: boolean; seeds: number }
  | { phase: 'fail'; error?: NetError; /** «слишком сложно»: повторить с таким лимитом фильтров */ retryFilters?: number }

/** Сколько других гнёзд показать эксперту и сколько заметок у гнезда. */
const OTHER_SOCKETS = 2
const NOTES = 3

/** Лимит фильтров без входа, выученный по ответам сайта за эту сессию окна. */
let anonFilters = ANON_ANALOG_FILTERS

function useHasSession(): boolean | null {
  const [has, setHas] = useState<boolean | null>(null)
  useEffect(() => {
    let alive = true
    void window.overlayApi.trade
      .hasSession()
      .then((v) => alive && setHas(Boolean(v)))
      .catch(() => alive && setHas(false))
    return () => {
      alive = false
    }
  }, [])
  return has
}

function openExternal(url: string): void {
  window.overlayApi.window.openExternal(url)
}

/** Ноды дерева активного билда вкладки «Билд» (спек, выбранный в PoB); null — вкладка выключена или билда нет. */
function useBuildNodes(): number[] | null {
  const [build, setBuild] = useState<StoredBuild | null>(null)
  useEffect(() => {
    const api = window.overlayApi?.build
    if (!api || !buildGuideOn()) return
    let alive = true
    void api
      .state()
      .then((s) => alive && setBuild(s.active))
      .catch(() => undefined)
    const off = window.overlayApi.onBuildState((s) => setBuild(s.active))
    return () => {
      alive = false
      off()
    }
  }, [])
  return useMemo(() => {
    const spec = build?.build.specs[build.build.activeSpec]
    return spec?.nodes.length ? [...new Set(spec.nodes)].sort((a, b) => a - b) : null
  }, [build])
}

function useTimeless(info: TimelessSearch): {
  data: TimelessDataRaw | null
  calc: TimelessCalc | null
  state: 'loading' | 'ready' | 'na'
  progress: TimelessProgress | null
} {
  const kind = dataKindOf(info.jewel)
  const max = maxAnalogSeeds(info)
  const build = useBuildNodes()
  const [data, setData] = useState<TimelessDataRaw | null>(null)
  const [calc, setCalc] = useState<TimelessCalc | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'na'>(kind ? 'loading' : 'na')
  const [progress, setProgress] = useState<TimelessProgress | null>(null)
  useEffect(() => {
    if (!kind) return setState('na')
    let alive = true
    setState('loading')
    setProgress(null)
    void (async () => {
      const d = await timelessData()
      const seed = d ? dataSeedOf(d, kind, info.seed) : null
      const req = { kind, seed: seed ?? 0, max, ...(build ? { build } : {}) }
      const c = d && seed != null ? await calcTimeless(req, (p) => alive && setProgress(p)) : null
      if (!alive) return
      setData(d)
      setCalc(c)
      setState(c ? 'ready' : 'na')
    })()
    return () => {
      alive = false
    }
  }, [kind, info.seed, max, build])
  return { data, calc, state, progress }
}

function progressText(p: TimelessProgress | null, t: T): string {
  if (p?.phase === 'sockets') return t('pc1.tl.sim.sockets', { n: p.done, total: p.total })
  if (p?.phase === 'seeds') return t('pc1.tl.sim.seeds', { n: Math.round((p.done / p.total) * 100) })
  return t('pc1.tl.sim.load')
}

/** «Для вашего билда: гнездо «X» (взято) — N ваших нотаблов: исход ×k, …» на языке клиента игры. */
function FitLine({ fit, data, kind, game, simple, t }: { fit: BuildFit; data: TimelessDataRaw; kind: NonNullable<ReturnType<typeof dataKindOf>>; game: 'en' | 'ru'; simple: boolean; t: T }) {
  const outcomes = data.jewels[kind].outcomes
  const pick = (pair: [string, string]): string => pair[game === 'ru' ? 1 : 0]
  const name = data.names[data.sockets[fit.socket].near]
  const notes = fit.notes.slice(0, simple ? 2 : NOTES).map((n) => {
    const o = outcomes[n.code]
    const text = o.name ? pick(o.name) : o.lines.map(pick).join(' · ')
    return n.count > 1 ? `${text} ×${n.count}` : text
  })
  return (
    <span className="tl-line tl-fit" title={t('pc1.tl.fit.help')}>
      <Icon name="passive" />
      <span>
        {t(fit.allocated ? 'pc1.tl.fit.taken' : 'pc1.tl.fit.free', {
          socket: t('pc1.tl.socket', { name: name ? pick(name) : '?' }),
          n: fit.notables
        })}
        {notes.length > 0 && ` — ${notes.join('; ')}`}
        {fit.unknown > 0 && <span className="tl-muted"> {t('pc1.tl.fit.unknown', { n: fit.unknown })}</span>}
      </span>
    </span>
  )
}

/** Подпись гнезда на языке клиента игры: «Iron Reflexes» (ближайший кейстоун или нотабл). */
function socketName(data: TimelessDataRaw, s: SocketScore, game: 'en' | 'ru', t: T): string {
  const pair = data.names[data.sockets[s.socket].near]
  return t('pc1.tl.socket', { name: pair ? pair[game === 'ru' ? 1 : 0] : '?' })
}

function scoreText(s: SocketScore, t: T): string {
  return t('pc1.tl.theme', { theme: t(`pc1.tl.theme.${s.theme}`), n: s.score })
}

function naText(info: TimelessSearch, t: T): string {
  if (info.jewel === 'GV') return t('pc1.tl.na.gv')
  if (info.jewel === 'ABYSS') return t('pc1.tl.na.abyss')
  return t('pc1.tl.na.data')
}

async function searchAnalogs(info: TimelessSearch, data: TimelessDataRaw, calc: TimelessCalc, maxFilters: number): Promise<Analog> {
  const st = usePriceCheckStore.getState()
  const preset = activePresetOf(st)
  const kind = dataKindOf(info.jewel)
  if (!st.item || !st.data || !preset || !kind || !calc.analogs.seeds.length) return { phase: 'fail' }
  const seeds = calc.analogs.seeds.slice(0, maxAnalogSeeds(info, maxFilters)).map((s) => itemSeedOf(data, kind, s))
  const req = buildRequest(st.item, st.data, analogPreset(preset, info, seeds, maxFilters))
  if (req.api !== 'trade') return { phase: 'fail' }
  let body: unknown = req.body
  // ru.pathofexile.com не принимает английские имена (как основной поиск окна)
  if (st.siteHost === 'ru.pathofexile.com') {
    const ru = await getDefaultPoe1DataStore().ensureLanguage('ru').catch(() => null)
    if (ru) body = localizeTradeRequest(req.body as TradeRequest, ru)
  }
  const res = await window.overlayApi.trade.poe1Search({ league: req.league, body, fetch: 10 })
  if (!res.ok) {
    if (!isTooComplex(res.error)) return { phase: 'fail', error: res.error }
    const next = nextAnalogFilters(info, seeds.length * analogConquerors(info).length)
    return { phase: 'fail', error: res.error, ...(next < maxFilters ? { retryFilters: next } : {}) }
  }
  const now = usePriceCheckStore.getState()
  const rates = chaosRates(now.rate?.chaosPerDivine, now.rates)
  const market = marketPrice(res.listings, honestPrice(res.listings, res.total, rates), rates)
  return { phase: 'done', total: res.total, market, siteUrl: res.siteUrl, cached: res.cached, seeds: seeds.length }
}

function AnalogResult({ a, simple, lang, t }: { a: Extract<Analog, { phase: 'done' }>; simple: boolean; lang: UiLang; t: T }) {
  const rate = usePriceCheckStore((s) => s.rate?.chaosPerDivine)
  const rates = usePriceCheckStore((s) => s.rates)
  if (!a.total) return <span className="tl-none">{t('pc1.tl.similar.none')}</span>
  if (!a.market) return <span className="tl-none">{t('pc1.tl.similar.noprice', { n: a.total })}</span>
  const shown = marketView(a.market, rate, chaosRates(rate, rates))
  return (
    <span className="tl-price">
      {t('pc1.tl.similar')}{' '}
      <Currency tag={shown.mid.currency} text={`~${fmtNum(shown.mid.amount, lang)}`} full={simple} lang={lang} className="pc-price" />
      <span className="tl-muted">
        {' '}
        · {t('pc1.tl.similar.found', { n: a.total })}
        {a.cached && ` · ${t('pc1.cached')}`}
      </span>
    </span>
  )
}

export function TimelessBox({ item, info, simple, lang, t }: { item: ParsedItem; info: TimelessSearch; simple: boolean; lang: UiLang; t: T }) {
  const { data, calc, state, progress } = useTimeless(info)
  const hasSession = useHasSession()
  const [analog, setAnalog] = useState<Analog>({ phase: 'idle' })
  const game = item.lang === 'ru' ? 'ru' : 'en'
  // другой сид, самоцвет или режим завоевателя — другой запрос аналогов; ответ прежнего поиска не показываем
  const query = useRef(0)
  useEffect(() => {
    query.current++
    setAnalog({ phase: 'idle' })
  }, [info.seed, info.jewel, info.mode, calc])

  const best = calc?.evaluation.best ?? null
  const others = useMemo(
    () => (calc && best ? calc.evaluation.sockets.filter((s) => s !== best && s.lift > 0).slice(0, OTHER_SOCKETS) : []),
    [calc, best]
  )

  if (state === 'loading') {
    return (
      <div className="tl" aria-busy="true">
        <span className="tl-muted" role="status">
          {progressText(progress, t)}
        </span>
      </div>
    )
  }
  if (state === 'na' || !data || !calc) {
    // GV/Abyss: калькулятор Vilsol и подсказка про PoB уже есть в блоке сида; здесь — одна честная строка
    return (
      <div className="tl">
        <span className="tl-muted">{naText(info, t)}</span>
      </div>
    )
  }

  const kind = dataKindOf(info.jewel)!
  const outcomes = data.jewels[kind].outcomes
  const fitLine = calc.fit ? <FitLine fit={calc.fit} data={data} kind={kind} game={game} simple={simple} t={t} /> : null
  // со входом — лимит PoB (180), без входа — выученный; пока не знаем, есть ли вход, — как без входа
  const maxFilters = hasSession ? MAX_ANALOG_FILTERS : anonFilters
  const querySeeds = Math.min(calc.analogs.seeds.length, maxAnalogSeeds(info, maxFilters))
  const run = async (filters = maxFilters): Promise<void> => {
    if (analog.phase === 'busy') return
    setAnalog({ phase: 'busy' })
    const my = query.current
    const r = await searchAnalogs(info, data, calc, filters).catch(() => ({ phase: 'fail' }) as Analog)
    if (r.phase === 'fail' && r.retryFilters && !hasSession) anonFilters = Math.min(anonFilters, r.retryFilters)
    if (my === query.current) setAnalog(r)
  }
  const analogsHelp = t('pc1.tl.similar.help', { n: querySeeds })
  const analogLine =
    analog.phase === 'done' ? (
      <AnalogResult a={analog} simple={simple} lang={lang} t={t} />
    ) : analog.phase === 'fail' && analog.retryFilters ? (
      // сайт: «слишком сложно» — повторить по кнопке с меньшим числом сидов (без входа лимит ниже)
      <span className="tl-bad">
        {t('pc1.tl.similar.complex')}
        <button type="button" className="ui-btn ui-btn--sm" onClick={() => void run(analog.retryFilters)}>
          <Icon name="search" />
          {t('pc1.tl.similar.fewer', { n: maxAnalogSeeds(info, analog.retryFilters) })}
        </button>
      </span>
    ) : analog.phase === 'fail' ? (
      <span className="tl-bad">
        {analog.error ? t(...netErrorText(analog.error)) : t('pc1.tl.similar.fail')}
        {!simple && analog.error?.message && <span className="tl-muted">({analog.error.message})</span>}{' '}
        <button type="button" className="ui-btn ui-btn--sm ui-btn--ghost" onClick={() => void run()}>
          <Icon name="refresh" />
          {t('pc1.error.retry')}
        </button>
      </span>
    ) : (
      <button
        type="button"
        className="ui-btn ui-btn--sm"
        title={analogsHelp}
        disabled={analog.phase === 'busy' || !best || !calc.analogs.seeds.length}
        onClick={() => void run()}
      >
        <Icon name={analog.phase === 'busy' ? 'refresh' : 'search'} />
        {analog.phase === 'busy' ? t('pc1.tl.similar.busy') : t('pc1.tl.similar.find')}
      </button>
    )

  if (!best) {
    return (
      <div className="tl">
        <span className="tl-muted">{t('pc1.tl.none')}</span>
        {fitLine}
      </div>
    )
  }

  if (simple) {
    return (
      <div className="tl tl--simple">
        <span className="tl-line">
          <Icon name="passive" />
          <span title={t('pc1.tl.socket.help')}>{t('pc1.tl.simple', { socket: socketName(data, best, game, t), score: scoreText(best, t) })}</span>
        </span>
        {fitLine}
        <span className="tl-analog">{analogLine}</span>
      </div>
    )
  }

  const rare = calc.analogs
  return (
    <div className="tl">
      <div className="tl-head">
        <span className="ui-label">{t('pc1.tl.title')}</span>
        <span className="ui-q" title={t('pc1.tl.help')}>
          ?
        </span>
      </div>
      <div className="tl-best">
        <span className="tl-best__k">{t('pc1.tl.best')}</span>
        <b title={t('pc1.tl.socket.help')}>{socketName(data, best, game, t)}</b>
        <span className="ui-tag">{scoreText(best, t)}</span>
      </div>
      {best.notes.length > 0 && (
        <ul className="tl-notes">
          {best.notes.slice(0, NOTES).map((n) => {
            const o = outcomes[n.code]
            const lines = o.lines.map((l) => l[game === 'ru' ? 1 : 0]).join(' · ')
            return (
              <li key={n.code}>
                {o.name ? o.name[game === 'ru' ? 1 : 0] : lines}
                {n.count > 1 && ` ×${n.count}`}
                {o.name && <span className="tl-muted"> — {lines}</span>}
              </li>
            )
          })}
        </ul>
      )}
      {best.total != null && <span className="tl-muted">{t('pc1.tl.devotion', { n: best.total })}</span>}
      {best.unknown > 0 && <span className="tl-muted">{t('pc1.tl.unknown', { n: best.unknown })}</span>}
      {fitLine}
      {others.length > 0 && (
        <span className="tl-muted">
          {t('pc1.tl.others')}: {others.map((s) => `${socketName(data, s, game, t)} — ${scoreText(s, t)}`).join(' · ')}
        </span>
      )}
      <span className="tl-muted">
        {t('pc1.tl.rare', { n: fmtNum(rare.qualifying, lang), total: fmtNum(rare.total, lang) })}
        {querySeeds > 0 && ` · ${t('pc1.tl.query', { n: querySeeds })}`}
      </span>
      <div className="tl-analog">
        {analogLine}
        {analog.phase === 'done' && analog.total > 0 && (
          <button type="button" className="ui-btn ui-btn--sm ui-btn--ghost" onClick={() => openExternal(analog.siteUrl)}>
            <Icon name="external" />
            {t('pc1.tl.similar.open')}
          </button>
        )}
      </div>
    </div>
  )
}
