import { useEffect, useRef, useState } from 'react'
import type {
  LootFilterConfirmReason,
  LootFilterInstallResult,
  LootFilterLevel,
  LootFilterState,
  LootFilterStyle
} from '@shared/types/lootFilter'
import { LEVELS, STYLES, levelWhen } from '@shared/lootFilter/levels'
import { installedFileName } from '@shared/lootFilter/rules'
import { isNewerTag, ladderUrl } from '@shared/lootFilter/source'
import { useAppStore } from '../../store/useAppStore'
import { Select } from '../../components/Select'
import { useLang, useT } from '../../i18n'
import { Ico } from '../regex/Ico'
import { LootFilterGuide } from './LootFilterGuide'
import './lootfilter.css'

// Раздел настроек «Фильтр лута» (S53, только PoE 1): фильтр NeverSink в один клик — строгость 0–6 с объяснением,
// стиль, «Установить» / «Обновить», что установлено, как включить в игре. Сеть и запись — в main (lootFilter:*);
// здесь только выбор игрока. Проверка новой версии — когда раздел впервые показался на экране (раз в сутки,
// решает main), установка — только по кнопке.

type Note = { kind: 'ok' | 'err'; text: string } | null

function fmtDate(iso: string | undefined, lang: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString(lang === 'en' ? 'en-GB' : 'ru-RU')
}

function fmtWhen(ms: number | null, lang: string): string {
  if (!ms) return '—'
  return new Date(ms).toLocaleString(lang === 'en' ? 'en-GB' : 'ru-RU', { dateStyle: 'short', timeStyle: 'short' })
}

export function LootFilterSection() {
  const t = useT()
  const lang = useLang()
  const simple = useAppStore((s) => s.settings?.ui.simpleMode ?? true)
  const siteHost = useAppStore((s) => s.settings?.siteHost)
  const api = window.overlayApi.lootFilter
  const [st, setSt] = useState<LootFilterState | null>(null)
  const [working, setWorking] = useState(false)
  const [note, setNote] = useState<Note>(null)
  const [confirm, setConfirm] = useState<{ reason: LootFilterConfirmReason; file: string } | null>(null)
  const [guideOpen, setGuideOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    void api.state().then(setSt)
    return window.overlayApi.onLootFilterState(setSt)
  }, [api])

  // «экран открыт» — раздел впервые попал в видимую область настроек: тогда main может спросить GitHub
  // (раз в сутки решает main). Раздел рисуется, когда состояние пришло, — поэтому ждём `shown`.
  const shown = !!st?.on
  const openedRef = useRef(false)
  useEffect(() => {
    const el = rootRef.current
    if (!shown || !el || openedRef.current) return
    const opened = (): void => {
      if (openedRef.current) return
      openedRef.current = true
      void api.screenOpened().then(setSt)
    }
    if (typeof IntersectionObserver === 'undefined') {
      opened()
      return
    }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        opened()
        io.disconnect()
      }
    })
    io.observe(el)
    return () => io.disconnect()
  }, [api, shown])

  if (!st || !st.on) return null

  const level = st.prefs.level
  const style = st.prefs.style
  const file = installedFileName(level)
  const current = st.installed.find((i) => i.file === file && !i.missing)
  const latest = st.latest
  const updateTo = current && latest && isNewerTag(latest.tag, current.tag) ? latest.tag : null
  const anyOutdated = st.installed.some((i) => i.outdated && !i.missing)
  const busy = working || st.busy

  const setLevel = (l: LootFilterLevel): void => {
    setConfirm(null)
    setNote(null)
    // уровень уже стоит — показываем его стиль, чтобы «Обновить» не сменил стиль незаметно
    const inst = st.installed.find((i) => i.level === l && !i.missing)
    void api.setPrefs(inst ? { level: l, style: inst.style } : { level: l }).then(setSt)
  }
  const setStyle = (s: LootFilterStyle): void => {
    setConfirm(null)
    setNote(null)
    void api.setPrefs({ style: s }).then(setSt)
  }

  const run = (confirmed: boolean): void => {
    setWorking(true)
    setNote(null)
    setConfirm(null)
    void api
      .install({ level, style, confirm: confirmed })
      .then((r: LootFilterInstallResult) => {
        setSt(r.state)
        if (r.ok) {
          setNote({ kind: 'ok', text: t('lf.done', { file: r.file }) })
          setGuideOpen(true)
        } else if (r.confirm) {
          setConfirm({ reason: r.confirm, file: r.file ?? file })
        } else {
          setNote({ kind: 'err', text: t(`lf.err.${r.error}`) })
        }
      })
      .catch(() => setNote({ kind: 'err', text: t('lf.err.network') }))
      .finally(() => setWorking(false))
  }

  const styleOptions = STYLES.map((s) => ({ value: s.id, label: s.id === 'default' ? t('lf.style.default') : s.name }))
  const folder = st.folder

  return (
    <div className="block lf" id="set-lootfilter" ref={rootRef}>
      <div className="block-title">{t('lf.title')}</div>
      <div className="small muted">{t('lf.lead')}</div>

      <div className="lf-label">{t('lf.level')}</div>
      <div className="lf-levels" role="radiogroup" aria-label={t('lf.level')}>
        {LEVELS.map((d) => {
          const on = d.level === level
          const inst = st.installed.find((i) => i.level === d.level && !i.missing)
          return (
            <button
              key={d.level}
              type="button"
              role="radio"
              aria-checked={on}
              className={'lf-level' + (on ? ' is-on' : '')}
              disabled={busy}
              onClick={() => setLevel(d.level)}
            >
              <span className="lf-level__dot" aria-hidden="true" />
              <span className="lf-level__main">
                <span className="lf-level__name">
                  {d.level} · {d.name}
                  <span className={`ui-tag lf-when lf-when--${levelWhen(d.level)}`}>{t(`lf.when.${levelWhen(d.level)}`)}</span>
                  {inst && (
                    <span className="ui-tag ui-tag--good">
                      <Ico name="check" /> {t('lf.installed')}
                    </span>
                  )}
                  {!simple && <code className="lf-code">{d.code}</code>}
                </span>
                <span className="lf-level__desc small muted">{t(`lf.level.${d.level}`)}</span>
              </span>
            </button>
          )
        })}
      </div>
      {simple && (
        <div className="ui-hint lf-hint">
          <Ico name="info" />
          <span>{t('lf.tip')}</span>
        </div>
      )}

      <div className="lf-row">
        <span className="lf-label">{t('lf.style')}</span>
        <Select<LootFilterStyle> value={style} options={styleOptions} onChange={setStyle} label={t('lf.style')} className="lf-style" />
      </div>
      <div className="small muted">{t('lf.style.hint')}</div>

      {!folder.found && (
        <div className="ui-banner ui-banner--bad small" role="alert">
          <Ico name="warn" />
          <span>{t('lf.err.no-folder')}</span>
        </div>
      )}

      <div className="lf-actions">
        <button
          type="button"
          className="ui-btn ui-btn--primary"
          disabled={busy || !folder.found}
          onClick={() => run(false)}
        >
          <Ico name={updateTo ? 'refresh' : 'import'} />
          {working ? t('lf.installing') : st.busy ? t('lf.checking') : updateTo ? t('lf.update', { version: updateTo }) : current ? t('lf.reinstall') : t('lf.install')}
        </button>
        <span className="small muted lf-file">{t('lf.file', { file })}</span>
      </div>

      {confirm && (
        <div className="ui-banner ui-banner--info lf-confirm" role="alertdialog" aria-live="polite">
          <Ico name="warn" />
          <div className="small">{t(confirm.reason === 'modified' ? 'lf.confirm.modified' : 'lf.confirm.unknown', { file: confirm.file })}</div>
          <div className="lf-confirm__btns">
            <button type="button" className="ui-btn ui-btn--sm ui-btn--danger" onClick={() => run(true)}>
              {t('lf.confirm.yes')}
            </button>
            <button type="button" className="ui-btn ui-btn--sm ui-btn--ghost" onClick={() => setConfirm(null)}>
              {t('lf.confirm.no')}
            </button>
          </div>
        </div>
      )}
      {note && (
        <div className={'small ' + (note.kind === 'ok' ? 'lf-ok' : 'danger')} role={note.kind === 'err' ? 'alert' : 'status'}>
          {note.kind === 'ok' ? <Ico name="check" /> : <Ico name="warn" />} {note.text}
        </div>
      )}

      <div className="small muted lf-status">
        {latest ? t('lf.latest', { version: latest.tag, date: fmtDate(latest.publishedAt, lang) }) : t('lf.latest.unknown')}
        {!simple && st.lastCheckAt ? ` · ${t('lf.checked', { when: fmtWhen(st.lastCheckAt, lang) })}` : ''}
        {!simple && st.checkError ? ` · ${t(`lf.err.${st.checkError}`)}` : ''}
      </div>
      {anyOutdated && latest && <div className="small lf-newer">{t('lf.newer', { version: latest.tag })}</div>}

      {st.installed.length > 0 && (
        <ul className="lf-installed small">
          {st.installed.map((i) => (
            <li key={i.file}>
              <span className="lf-mono">{i.file}</span>
              <span className="muted">
                {' '}
                · {t('lf.installed.row', { version: i.tag, date: fmtDate(i.installedAt, lang) })}
                {!simple && i.style !== 'default' ? ` · ${STYLES.find((s) => s.id === i.style)?.name ?? i.style}` : ''}
              </span>
              {i.missing ? (
                <span className="ui-tag ui-tag--bad">{t('lf.tag.missing')}</span>
              ) : i.outdated ? (
                <span className="ui-tag ui-tag--warn">{t('lf.tag.outdated')}</span>
              ) : (
                <span className="ui-tag ui-tag--good">{t('lf.tag.current')}</span>
              )}
              {i.modified && !i.missing && <span className="ui-tag ui-tag--warn">{t('lf.tag.modified')}</span>}
            </li>
          ))}
        </ul>
      )}

      <label className="row-toggle">
        <input type="checkbox" checked={st.prefs.autoCheck} onChange={(e) => void api.setPrefs({ autoCheck: e.target.checked }).then(setSt)} />
        {t('lf.autoCheck')}
      </label>
      <div className="small muted">{t('lf.autoCheck.hint')}</div>

      <button type="button" className="ui-btn ui-btn--sm ui-btn--ghost lf-guide-toggle" aria-expanded={guideOpen} onClick={() => setGuideOpen((v) => !v)}>
        <Ico name={guideOpen ? 'chev-d' : 'chev-r'} />
        {t('lf.guide.title')}
      </button>
      {guideOpen && <LootFilterGuide t={t} file={file} onLadder={() => window.overlayApi.window.openExternal(ladderUrl(siteHost))} />}

      {!simple && (
        <div className="lf-folder small">
          <div>
            <span className="lf-label">{t('lf.folder')}</span>{' '}
            <span className="lf-mono" title={folder.path}>
              {folder.path}
            </span>
            {folder.source === 'env' && <span className="muted"> · {t('lf.folder.env')}</span>}
          </div>
          {!folder.found && <div className="danger">{t('lf.folder.missing', { path: folder.path })}</div>}
          {folder.found && !folder.looksLikeGame && <div className="muted">{t('lf.folder.notGame')}</div>}
          <div className="lf-folder__btns">
            <button type="button" className="ui-btn ui-btn--sm" disabled={!folder.found} onClick={() => void api.openFolder()}>
              <Ico name="folder" />
              {t('lf.folder.open')}
            </button>
            <button type="button" className="ui-btn ui-btn--sm ui-btn--ghost" disabled={busy || folder.source === 'env'} onClick={() => void api.pickFolder().then(setSt)}>
              {t('lf.folder.pick')}
            </button>
            {folder.source === 'custom' && (
              <button type="button" className="ui-btn ui-btn--sm ui-btn--ghost" disabled={busy} onClick={() => void api.resetFolder().then(setSt)}>
                {t('lf.folder.reset')}
              </button>
            )}
          </div>
        </div>
      )}
      {simple && !folder.found && (
        <div className="lf-folder__btns">
          <button type="button" className="ui-btn ui-btn--sm" disabled={busy || folder.source === 'env'} onClick={() => void api.pickFolder().then(setSt)}>
            <Ico name="folder" />
            {t('lf.folder.pick')}
          </button>
        </div>
      )}

      <div className="lf-credit small muted">
        {t('lf.credit')}
        <span className="lf-links">
          <button type="button" className="ui-btn ui-btn--sm ui-btn--ghost lf-inline" onClick={() => void api.openLink('repo')}>
            {t('lf.link.repo')} ↗
          </button>
          <button type="button" className="ui-btn ui-btn--sm ui-btn--ghost lf-inline" onClick={() => void api.openLink('license')}>
            {t('lf.link.license')} ↗
          </button>
          {latest && (
            <button type="button" className="ui-btn ui-btn--sm ui-btn--ghost lf-inline" onClick={() => void api.openLink('release')}>
              {t('lf.link.release')} ↗
            </button>
          )}
          {!simple && (
            <button type="button" className="ui-btn ui-btn--sm ui-btn--ghost lf-inline" onClick={() => void api.openLink('filterblade')}>
              {t('lf.link.filterblade')} ↗
            </button>
          )}
        </span>
      </div>
      {!simple && <div className="small muted">{t('lf.filterblade.hint')}</div>}
      {!simple && <div className="small muted">{t('lf.privacy')}</div>}
    </div>
  )
}
