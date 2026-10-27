import { useState } from 'react'
import type { Deal, DealsConfig, DealsFilter } from '@shared/types'
import { filterDeals, HISTORY_LIMITS } from '@shared/deals/history'
import { useLang, useT } from '../../i18n'
import { useAppStore } from '../../store/useAppStore'
import { useDealsStore } from '../../store/useDealsStore'
import {
  Box,
  Hint,
  Ico,
  Switch,
  blacklistWarning,
  coinClass,
  formatTime,
  statusTag,
  useSimple
} from './common'
import { playChime } from './sound'

// «История» вкладки «Сделки»: фильтры и поиск, таблица сделок, переключатели карточек,
// хранение/экспорт истории, в экспертном режиме — проверка строки лога.

const FILTERS: DealsFilter[] = ['all', 'in', 'out', 'sold']

export function HistoryPage() {
  const t = useT()
  const simple = useSimple()
  const state = useDealsStore((s) => s.state)
  const filter = useDealsStore((s) => s.filter)
  const query = useDealsStore((s) => s.query)
  const setFilter = useDealsStore((s) => s.setFilter)
  const setQuery = useDealsStore((s) => s.setQuery)
  if (!state) return null

  const rows = filterDeals(state.deals, filter, query)
  const hasDemo = state.deals.some((d) => d.demo)

  return (
    <div className="dl-stack">
      {simple && <Hint text={t('deals.hint.history')} />}
      <div className="dl-toolbar">
        {FILTERS.map((f) => (
          <button key={f} type="button" className="ui-chip" aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {t(`deals.filter.${f}`)}
          </button>
        ))}
        <span className="dl-grow" />
        {state.deals.length > 0 && (
          <span className="dl-muted">{t('deals.count', { n: rows.length, total: state.deals.length })}</span>
        )}
        <input
          className="ui-input ui-input--lg dl-search"
          type="search"
          value={query}
          placeholder={t('deals.search.ph')}
          aria-label={t('deals.search.ph')}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {state.deals.length === 0 ? <EmptyHistory /> : <DealsTable rows={rows} />}

      <div className="dl-two">
        <CardsBox config={state.config} />
        <HistoryBox hasDemo={hasDemo} ignored={state.ignoredCount} limit={state.config.historyLimit} />
      </div>
      {!simple && <CheckLineBox />}
    </div>
  )
}

function EmptyHistory() {
  const t = useT()
  const lang = useLang()
  const demo = useDealsStore((s) => s.demo)
  return (
    <div className="dl-box ui-empty">
      <Ico name="history" size="lg" />
      <div className="ui-empty__title">{t('deals.empty.title')}</div>
      <p className="dl-empty-text">{t('deals.empty.text')}</p>
      <button type="button" className="ui-btn ui-btn--primary" onClick={() => void demo(lang)}>
        {t('deals.empty.demo')}
      </button>
    </div>
  )
}

function DealsTable({ rows }: { rows: Deal[] }) {
  const t = useT()
  const simple = useSimple()
  if (rows.length === 0) return <div className="dl-box ui-empty">{t('deals.empty.filtered')}</div>
  return (
    <div className="dl-box dl-tablewrap ui-scroll">
      <table className="dl-tbl">
        <thead>
          <tr>
            <th>{t('deals.col.time')}</th>
            <th />
            <th>{t('deals.col.player')}</th>
            <th>{t('deals.col.item')}</th>
            <th>{t('deals.col.price')}</th>
            <th>{t('deals.col.status')}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((d) => (
            <DealRow key={d.id} d={d} expert={!simple} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function DealRow({ d, expert }: { d: Deal; expert: boolean }) {
  const t = useT()
  const lang = useLang()
  const setStatus = useDealsStore((s) => s.setStatus)
  const remove = useDealsStore((s) => s.remove)
  const [copied, setCopied] = useState(false)
  const tag = statusTag(d, lang)
  const open = d.status === 'new' || d.status === 'invited'

  const copy = (): void => {
    void navigator.clipboard.writeText(`@${d.player} `).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    })
  }

  const where =
    d.pos &&
    t('deals.where', { tab: d.tab ? d.tab : t('deals.where.noTab'), left: d.pos.left, top: d.pos.top })

  return (
    <tr className={d.blacklist ? 'dl-row--bad' : undefined}>
      <td className="dl-time">{formatTime(d.ts)}</td>
      <td>
        <span
          className={`ui-tag ${d.dir === 'in' ? 'ui-tag--good' : 'ui-tag--person'}`}
          title={t(`deals.dir.${d.dir}.title`)}
        >
          {t(`deals.dir.${d.dir}`)}
        </span>
      </td>
      <td className="dl-who">
        <span className="dl-player">{d.player}</span>
        {expert && d.guild && <span className="dl-muted"> &lt;{d.guild}&gt;</span>}
        {d.demo && <span className="ui-tag dl-demo">{t('deals.demo.tag')}</span>}
        {d.blacklist && (
          <div className="dl-bl">{blacklistWarning(d.blacklist, lang)}</div>
        )}
      </td>
      <td className="dl-item">
        <span className={d.gem ? 'dl-it dl-it--gem' : d.bulk ? 'dl-it dl-it--cur' : 'dl-it'}>
          {d.itemAmount !== undefined ? `${d.itemAmount} × ` : ''}
          {d.item}
        </span>
        <div className="dl-meta">
          {d.gem && <span>{t('deals.gem', { level: d.gem.level, quality: d.gem.quality })}</span>}
          {d.bulk && <span>{t('deals.bulk')}</span>}
          {where && (
            <span className="dl-where">
              <Ico name="grid" size="sm" />
              {where}
            </span>
          )}
          {d.message && <span className="dl-msg">«{d.message}»</span>}
        </div>
        {expert && d.raw && (
          <div className="dl-raw" title={d.raw}>
            {d.raw}
          </div>
        )}
      </td>
      <td className="dl-price">
        {d.price ? (
          <>
            <i className={coinClass(d.priceValue?.currency)} />
            {d.price}
          </>
        ) : (
          '—'
        )}
      </td>
      <td>
        <span className={`ui-tag ${tag.cls}`}>{tag.text}</span>
      </td>
      <td>
        <div className="dl-acts__in">
          <button
            type="button"
            className="ui-btn ui-btn--sm ui-btn--ghost ui-btn--icon"
            title={copied ? t('deals.act.copied') : t('deals.act.copy', { player: d.player })}
            aria-label={t('deals.act.copy', { player: d.player })}
            onClick={copy}
          >
            <Ico name={copied ? 'check' : 'chat'} />
          </button>
          {open && d.dir === 'in' && (
            <button
              type="button"
              className="ui-btn ui-btn--sm ui-btn--ghost ui-btn--icon"
              title={t('deals.act.sold.title')}
              aria-label={t('deals.act.sold')}
              onClick={() => void setStatus(d.id, 'sold')}
            >
              <Ico name="sold" />
            </button>
          )}
          {open ? (
            <button
              type="button"
              className="ui-btn ui-btn--sm ui-btn--ghost ui-btn--icon"
              title={t('deals.act.ignore')}
              aria-label={t('deals.act.ignore')}
              onClick={() => void setStatus(d.id, 'ignored')}
            >
              <Ico name="close" />
            </button>
          ) : (
            <button
              type="button"
              className="ui-btn ui-btn--sm ui-btn--ghost ui-btn--icon"
              title={t('deals.act.restore')}
              aria-label={t('deals.act.restore')}
              onClick={() => void setStatus(d.id, 'new')}
            >
              <Ico name="refresh" />
            </button>
          )}
          {expert && (
            <button
              type="button"
              className="ui-btn ui-btn--sm ui-btn--ghost ui-btn--icon"
              title={t('deals.act.delete')}
              aria-label={t('deals.act.delete')}
              onClick={() => void remove(d.id)}
            >
              <Ico name="trash" />
            </button>
          )}
        </div>
      </td>
    </tr>
  )
}

const CARD_SWITCHES: (keyof Pick<
  DealsConfig,
  'sound' | 'hideAfterSold' | 'checkBlacklist' | 'highlightStash' | 'showOutgoing'
>)[] = ['sound', 'hideAfterSold', 'checkBlacklist', 'highlightStash', 'showOutgoing']

function LogRow() {
  const t = useT()
  const log = useDealsStore((s) => s.log)
  const pickLog = useDealsStore((s) => s.pickLog)
  if (!log) return null
  const tag = log.connected
    ? { cls: 'ui-tag--good', text: t(log.custom ? 'deals.log.custom' : 'deals.log.auto') }
    : { cls: 'ui-tag--warn', text: t('deals.log.notFound') }
  return (
    <div className="dl-field">
      <span className="ui-field__label">{t('deals.log.title')}</span>
      {log.logPath && <span className="dl-path">{log.logPath}</span>}
      <div className="dl-row">
        <span className={`ui-tag ${tag.cls}`}>{tag.text}</span>
        <button type="button" className="ui-btn ui-btn--sm" onClick={() => void pickLog()}>
          {t('deals.log.pick')}
        </button>
        {log.custom && (
          <button type="button" className="ui-btn ui-btn--sm ui-btn--ghost" onClick={() => void pickLog(true)}>
            {t('deals.log.reset')}
          </button>
        )}
      </div>
      {!log.connected && <span className="ui-field__help">{t('deals.log.help')}</span>}
    </div>
  )
}

function CardsBox({ config }: { config: DealsConfig }) {
  const t = useT()
  const setConfig = useDealsStore((s) => s.setConfig)
  const sound = useAppStore((s) => s.settings?.sound)
  return (
    <Box title={t('deals.cards.title')} icon="layers">
      <LogRow />
      {CARD_SWITCHES.map((k) => (
        <Switch key={k} on={config[k]} onChange={(v) => void setConfig({ [k]: v })}>
          {t(`deals.cfg.${k}`)}
        </Switch>
      ))}
      <div className="dl-row">
        <button
          type="button"
          className="ui-btn ui-btn--sm"
          disabled={!sound?.enabled}
          onClick={() => playChime(sound?.volume ?? 0.6)}
        >
          <Ico name="volume" />
          {t('deals.sound.test')}
        </button>
        {sound && !sound.enabled && <span className="dl-muted">{t('deals.sound.globalOff')}</span>}
      </div>
    </Box>
  )
}

function HistoryBox({ hasDemo, ignored, limit }: { hasDemo: boolean; ignored: number; limit: number }) {
  const t = useT()
  const setConfig = useDealsStore((s) => s.setConfig)
  const clear = useDealsStore((s) => s.clear)
  const exportHistory = useDealsStore((s) => s.exportHistory)
  const [note, setNote] = useState<{ bad: boolean; text: string } | null>(null)
  const [confirm, setConfirm] = useState(false)
  const limits: number[] = (HISTORY_LIMITS as readonly number[]).includes(limit)
    ? [...HISTORY_LIMITS]
    : [...HISTORY_LIMITS, limit].sort((a, b) => a - b)

  const doExport = async (): Promise<void> => {
    const r = await exportHistory()
    if (r.status === 'saved') setNote({ bad: false, text: t('deals.history.saved', { path: r.path ?? '' }) })
    else if (r.status === 'error') setNote({ bad: true, text: t('deals.history.saveError') })
    else setNote(null)
  }
  const doClear = (): void => {
    if (!confirm) {
      setConfirm(true)
      setTimeout(() => setConfirm(false), 4000)
      return
    }
    setConfirm(false)
    void clear()
  }

  return (
    <Box title={t('deals.history.title')} icon="history">
      <label className="dl-field">
        <span className="ui-field__label">{t('deals.history.limit')}</span>
        <select
          className="ui-select dl-select"
          value={limit}
          onChange={(e) => void setConfig({ historyLimit: Number(e.target.value) })}
        >
          {limits.map((n) => (
            <option key={n} value={n}>
              {t('deals.history.limitN', { n })}
            </option>
          ))}
        </select>
      </label>
      {ignored > 0 && <span className="dl-muted">{t('deals.history.ignored', { n: ignored })}</span>}
      <div className="dl-row">
        <button type="button" className="ui-btn ui-btn--sm" onClick={() => void doExport()}>
          <Ico name="export" />
          {t('deals.history.export')}
        </button>
        {hasDemo && (
          <button type="button" className="ui-btn ui-btn--sm ui-btn--ghost" onClick={() => void clear(true)}>
            {t('deals.demo.clear')}
          </button>
        )}
        <button type="button" className="ui-btn ui-btn--sm ui-btn--danger" onClick={doClear}>
          <Ico name="trash" />
          {confirm ? t('deals.history.clearConfirm') : t('deals.history.clear')}
        </button>
      </div>
      {note && <span className={note.bad ? 'ui-field__error' : 'dl-muted dl-path'}>{note.text}</span>}
    </Box>
  )
}

function CheckLineBox() {
  const t = useT()
  const simulate = useDealsStore((s) => s.simulate)
  const [line, setLine] = useState('')
  const [result, setResult] = useState<string | null>(null)
  const run = async (): Promise<void> => {
    const added = await simulate(line.split(/\r?\n/).filter((l) => l.trim()))
    setResult(added.length > 0 ? t('deals.check.added', { n: added.length }) : t('deals.check.none'))
  }
  return (
    <Box title={t('deals.check.title')} icon="search">
      <span className="ui-field__help">{t('deals.check.help')}</span>
      <textarea
        className="ui-input ui-input--mono dl-textarea"
        rows={2}
        value={line}
        placeholder={t('deals.check.ph')}
        onChange={(e) => {
          setLine(e.target.value)
          setResult(null)
        }}
      />
      <div className="dl-row">
        <button type="button" className="ui-btn ui-btn--sm" disabled={!line.trim()} onClick={() => void run()}>
          {t('deals.check.run')}
        </button>
        {result && <span className="dl-muted">{result}</span>}
      </div>
    </Box>
  )
}
