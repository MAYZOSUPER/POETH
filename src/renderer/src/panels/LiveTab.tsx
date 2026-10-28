import { useEffect, useState, type FormEvent } from 'react'
import type { LiveHit, LiveSearchView, UiLang } from '@shared/types'
import { useT } from '../i18n'
import { useAppStore } from '../store/useAppStore'
import { useLiveStore } from './live/useLiveStore'
import { LiveIco, LiveSwitch } from './live/ui'
import { ago, hitName, priceAmount, rarityColor, searchStatus } from './live/format'
import { Currency } from '../components/Currency'
import './live/live.css'

// Вкладка Live компаньона (PoE1, S6) по утверждённому макету: общие переключатели и счётчик
// «Активно N из 10», список поисков (статус, вкл/выкл, звук, убрать), последние находки.
// Поиски добавляются ссылкой с сайта трейда; позже S5 подключит флаг live из избранного.

function useNow(): number {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])
  return now
}

function SearchRow({ s, now, masterOn, max }: { s: LiveSearchView; now: number; masterOn: boolean; max: number }) {
  const t = useT()
  const setEnabled = useLiveStore((st) => st.setEnabled)
  const update = useLiveStore((st) => st.update)
  const remove = useLiveStore((st) => st.remove)
  const limitId = useLiveStore((st) => st.limitId)
  const st = searchStatus(t, s, now, masterOn)
  const dot = st.level === 'ok' ? '' : st.level === 'warn' ? ' ui-dot--afk' : st.level === 'bad' ? ' ui-dot--bad' : ' ui-dot--off'
  // поисками избранного управляет молния в трейд-окне (S5)
  const fav = s.source === 'favorite'
  return (
    <div className="live-row">
      <span className={`ui-dot${dot}`} />
      <span className="live-t">
        <b title={`${s.title} · ${s.league}`}>
          {s.title}
          <span className="live-league"> · {s.league}</span>
          {fav && (
            <span className="ui-tag live-fav" title={t('live.row.favHint')}>
              {t('live.row.fav')}
            </span>
          )}
          {!s.notify && <span className="ui-tag live-fav">{t('live.row.quiet')}</span>}
        </b>
        <span className={`st-${st.level}`}>{st.text}</span>
        {limitId === s.id && <span className="st-bad">{t('live.row.limit', { max })}</span>}
      </span>
      <span className="live-acts">
        <LiveSwitch
          live
          on={s.enabled}
          disabled={fav}
          title={fav ? t('live.row.favHint') : t('live.row.on')}
          onChange={(v) => void setEnabled(s.id, v)}
        />
        <button
          type="button"
          className="ui-btn ui-btn--sm ui-btn--ghost ui-btn--icon"
          aria-pressed={s.sound}
          title={t('live.row.sound')}
          aria-label={t('live.row.sound')}
          onClick={() => void update(s.id, { sound: !s.sound })}
        >
          <span className={s.sound ? 'live-on' : 'live-off'}>
            <LiveIco name="volume" />
          </span>
        </button>
        <button
          type="button"
          className="ui-btn ui-btn--sm ui-btn--ghost ui-btn--icon"
          title={t('live.row.open')}
          aria-label={t('live.row.open')}
          onClick={() => void window.overlayApi.tradeWindow.open({ url: s.siteUrl, game: 'poe1' })}
        >
          <LiveIco name="external" />
        </button>
        {fav ? null : s.state === 'invalid' ? (
          <button type="button" className="ui-btn ui-btn--sm ui-btn--danger" onClick={() => void remove(s.id)}>
            <LiveIco name="trash" />
            {t('live.row.remove')}
          </button>
        ) : (
          <button
            type="button"
            className="ui-btn ui-btn--sm ui-btn--ghost ui-btn--icon"
            title={t('live.row.remove')}
            aria-label={t('live.row.remove')}
            onClick={() => void remove(s.id)}
          >
            <LiveIco name="trash" />
          </button>
        )}
      </span>
    </div>
  )
}

function HitRow({ hit, now }: { hit: LiveHit; now: number }) {
  const t = useT()
  const [note, setNote] = useState<string | null>(null)
  const lang = useAppStore((s) => s.settings?.uiLang ?? 'ru') as UiLang
  const whisper = async (): Promise<void> => {
    const r = await window.overlayApi.live.whisper(hit.key)
    setNote(r === 'ok' ? t('live.toast.done.note') : t(`live.act.err.${r}`))
  }
  const copy = async (): Promise<void> => {
    const ok = await window.overlayApi.live.copyWhisper(hit.key)
    setNote(ok ? t('live.act.copied') : t('live.act.err.no-whisper'))
  }
  return (
    <tr>
      <td>
        <span className="it" style={{ color: rarityColor(hit.rarity) }}>
          {hitName(hit)}
        </span>
        <span className="live-hit-sub">
          {hit.searchTitle}
          {hit.merchant && <span className="ui-tag ui-tag--merchant">{t('live.merchant')}</span>}
        </span>
        {note && <span className="live-hit-note">{note}</span>}
      </td>
      <td className="price">
        {hit.price ? <Currency tag={hit.price.currency} text={priceAmount(hit.price.amount, lang)} lang={lang} /> : '—'}
      </td>
      <td className="live-when">{ago(t, hit.at, now)}</td>
      <td className="live-hit-acts">
        {hit.merchant ? (
          <button type="button" className="ui-btn ui-btn--sm" title={t('live.act.open.title')} onClick={() => void window.overlayApi.live.openHit(hit.key)}>
            <LiveIco name="external" />
            {t('live.act.open')}
          </button>
        ) : (
          <>
            <button type="button" className="ui-btn ui-btn--sm" title={t('live.act.whisper.title')} onClick={() => void whisper()}>
              <LiveIco name="chat" />
              {t('live.act.whisper')}
            </button>
            <button
              type="button"
              className="ui-btn ui-btn--sm ui-btn--ghost ui-btn--icon"
              title={t('live.act.copy')}
              aria-label={t('live.act.copy')}
              onClick={() => void copy()}
            >
              <LiveIco name="copy" />
            </button>
          </>
        )}
      </td>
    </tr>
  )
}

export function LiveTab() {
  const t = useT()
  const simple = useAppStore((s) => s.settings?.ui.simpleMode ?? true)
  const snap = useLiveStore((s) => s.snap)
  const busy = useLiveStore((s) => s.busy)
  const addError = useLiveStore((s) => s.addError)
  const addedOff = useLiveStore((s) => s.addedOff)
  const init = useLiveStore((s) => s.init)
  const add = useLiveStore((s) => s.add)
  const setOptions = useLiveStore((s) => s.setOptions)
  const [input, setInput] = useState('')
  const [title, setTitle] = useState('')
  const now = useNow()

  useEffect(() => init(), [init])

  if (!snap) return <div className="live-tab" />
  const { options, searches, active, max, loggedIn, recent } = snap
  const needLogin = !loggedIn && options.enabled && searches.some((s) => s.state === 'auth')
  const meterLevel = active >= max ? 'over' : active >= max * 0.8 ? 'warn' : undefined

  const onAdd = async (e: FormEvent): Promise<void> => {
    e.preventDefault()
    if (!input.trim()) return
    if (await add(input.trim(), title.trim())) {
      setInput('')
      setTitle('')
    }
  }

  return (
    <div className="live-tab ui-scroll">
      <div className="live-top">
        <LiveSwitch live on={options.enabled} label={t('live.opt.enabled')} onChange={(v) => void setOptions({ enabled: v })} />
        <LiveSwitch on={options.sound} label={t('live.opt.sound')} onChange={(v) => void setOptions({ sound: v })} />
        <LiveSwitch on={options.notifyWindows} label={t('live.opt.notify')} onChange={(v) => void setOptions({ notifyWindows: v })} />
        <div className="ui-meter live-meter" data-level={meterLevel} style={{ ['--v' as string]: `${Math.min(100, (active / Math.max(1, max)) * 100)}%` }}>
          <div className="ui-meter__row">
            <span>{t('live.meter.active')}</span>
            <span>
              <b>{active}</b> {t('live.meter.of')} {max}
            </span>
          </div>
          <div className="ui-meter__bar" />
        </div>
      </div>

      {needLogin && (
        <div className="ui-banner live-banner" role="status">
          <LiveIco name="lock" />
          <span>
            <b>{t('live.auth.title')}</b> {t('live.auth.text')}
          </span>
          <button type="button" className="ui-btn ui-btn--sm ui-btn--primary" onClick={() => void window.overlayApi.auth.login()}>
            {t('live.auth.btn')}
          </button>
        </div>
      )}

      <form className="live-box live-add" onSubmit={(e) => void onAdd(e)}>
        <div className="ui-field">
          <label className="ui-field__label" htmlFor="live-add-url">
            {t('live.add.label')}
          </label>
          <div className="live-add-row">
            <input
              id="live-add-url"
              className="ui-input ui-input--lg"
              placeholder={t('live.add.placeholder')}
              spellCheck={false}
              aria-invalid={addError ? true : undefined}
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
            <input
              className="ui-input ui-input--lg live-add-title"
              placeholder={t('live.add.title')}
              maxLength={80}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <button type="submit" className="ui-btn ui-btn--live" disabled={busy || !input.trim()}>
              <LiveIco name="bolt" />
              {t('live.add.btn')}
            </button>
          </div>
          {addError ? (
            <span className="ui-field__error">{t(`live.add.err.${addError}`)}</span>
          ) : addedOff ? (
            <span className="ui-field__error">{t('live.add.off', { max })}</span>
          ) : (
            simple && <span className="ui-field__help">{t('live.add.help')}</span>
          )}
        </div>
      </form>

      {searches.length ? (
        <div className="live-box">
          {searches.map((s) => (
            <SearchRow key={s.id} s={s} now={now} masterOn={options.enabled} max={max} />
          ))}
        </div>
      ) : (
        <div className="ui-empty live-box">
          <span className="ui-empty__title">{t('live.empty.title')}</span>
          <span>{t('live.empty.text')}</span>
        </div>
      )}

      {simple && (
        <div className="ui-hint live-hint">
          <LiveIco name="help" />
          <span>{t('live.hint')}</span>
        </div>
      )}

      <div className="ui-label live-label">
        <LiveIco name="history" size="sm" />
        {t('live.recent')}
      </div>
      <div className="live-box">
        {recent.length ? (
          <table className="live-tbl">
            <thead>
              <tr>
                <th>{t('live.col.item')}</th>
                <th>{t('live.col.price')}</th>
                <th>{t('live.col.when')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {recent.map((h) => (
                <HitRow key={h.key} hit={h} now={now} />
              ))}
            </tbody>
          </table>
        ) : (
          <div className="live-recent-empty">{t('live.recent.empty')}</div>
        )}
      </div>
    </div>
  )
}
