import { useEffect, useState, type CSSProperties } from 'react'
import type { CurrentSearchResult } from '@shared/types'
import { UNSORTED_TITLE } from '@shared/favorites/model'
import { useT } from '../i18n'
import { useAppStore } from '../store/useAppStore'
import { Ico } from '../panels/regex/Ico'
import { FavList, InlineEdit } from './FavList'
import { UrlBar } from './UrlBar'
import { useFavStore } from './useFavStore'
import { SiteRail } from './SiteRail'
import { SiteBar } from './SiteBar'
import { SitesManage, SitesNote, SiteWait } from './SitePages'

// Сайдбар трейд-окна (S5) по утверждённому макету: «Избранное» + лига, поиск по избранному,
// «Сохранить текущий поиск», папки, live-счётчик, импорт/экспорт Better Trading, новая папка,
// статус входа. Справа сверху — адресная строка сайта; сам сайт — отдельный siteView.
// S43: у PoE 1 слева — рельс вкладок сайтов; на вкладке сайта колонки избранного нет, а под вью сайта —
// заметка о приватности, страница «Сайты» или «Загрузка…».

const api = (): Window['overlayApi'] => window.overlayApi

export function TradeSidebarApp() {
  const t = useT()
  const ready = useFavStore((s) => s.ready)
  const init = useFavStore((s) => s.init)
  const collapsed = useFavStore((s) => !!s.site?.sidebarCollapsed)
  const overGame = useFavStore((s) => !!s.site?.overGame)
  const sites = useFavStore((s) => s.sites)
  const [filter, setFilter] = useState('')
  const rail = !!sites?.on
  const trade = !rail || sites.active === 'trade'

  useEffect(() => init(), [init])

  // Поверх игры Esc прячет окно (на сайте его ловит main). Меню и переименование закрываются
  // своим Esc первыми (preventDefault) — проверяем после всех обработчиков нажатия.
  useEffect(() => {
    if (!overGame) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape' || e.ctrlKey || e.altKey || e.shiftKey || e.metaKey) return
      setTimeout(() => {
        if (!e.defaultPrevented) void api().tradeWindow.hide()
      }, 0)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [overGame])

  if (!trade && sites) {
    return (
      <div className={`ts ts--rail ts--web${overGame ? ' ts--game' : ''}`}>
        <SiteRail />
        <SiteBar />
        {sites.active === 'manage' ? <SitesManage /> : sites.needsNote ? <SitesNote /> : <SiteWait />}
      </div>
    )
  }

  return (
    <div className={`ts${collapsed ? ' ts--collapsed' : ''}${overGame ? ' ts--game' : ''}${rail ? ' ts--rail' : ''}`}>
      {rail && <SiteRail />}
      <aside className="ts-side">
        <Head />
        <div className="ts-top">
          <input
            className="ui-input ui-input--lg"
            value={filter}
            placeholder={t('fav.filter')}
            aria-label={t('fav.filter')}
            onChange={(e) => setFilter(e.target.value)}
          />
          <SaveCurrent />
          <NoticeLine />
        </div>
        <div className="ts-list ui-scroll">{ready && <FavList filter={filter} />}</div>
        <Foot />
      </aside>
      <UrlBar />
      <div className="ts-site-wait">{t('tw.loading')}</div>
    </div>
  )
}

function Head() {
  const t = useT()
  const settings = useAppStore((s) => s.settings)
  const leagues = useFavStore((s) => s.leagues)
  const refreshSettings = useFavStore((s) => s.refreshSettings)
  const game = settings?.game ?? 'poe1'
  // S47: у PoE2 тоже список лиг trade2 и «текущая» (net/leagues по запущенной игре)
  const chosen = (game === 'poe2' ? settings?.poe2.league : settings?.poe1.league) ?? 'auto'
  return (
    <div className="ui-panel__head ts-head">
      <span className="ui-panel__title">{t('fav.title')}</span>
      <select
        className="ui-select ts-league"
        aria-label={t('fav.league')}
        title={t('fav.league.title')}
        value={chosen}
        onChange={(e) => void api().settings.set({ [game]: { league: e.target.value } }).then(refreshSettings)}
      >
        <option value="auto">{t('fav.league.auto', { league: leagues?.auto ?? '…' })}</option>
        {(leagues?.leagues ?? []).map((l) => (
          <option key={l.id} value={l.id}>
            {l.text || l.id}
          </option>
        ))}
        {chosen !== 'auto' && !(leagues?.leagues ?? []).some((l) => l.id === chosen) && <option value={chosen}>{chosen}</option>}
      </select>
    </div>
  )
}

type Folder = { id: string; title: string }

function SaveCurrent() {
  const t = useT()
  const game = useAppStore((s) => s.settings?.game ?? 'poe1')
  const data = useFavStore((s) => s.data)
  const setNotice = useFavStore((s) => s.setNotice)
  const toggleFolder = useFavStore((s) => s.toggleFolder)
  const [form, setForm] = useState<{
    cur: Extract<CurrentSearchResult, { ok: true }>
    title: string
    folderId: string
    newFolder: string
    ownLeague: boolean
  } | null>(null)

  const folders: Folder[] = data.folders
    .filter((f) => f.game === game && !f.archivedAt)
    .sort((a, b) => a.order - b.order)
    .map((f) => ({ id: f.id, title: f.title === UNSORTED_TITLE ? t('fav.unsorted') : f.title }))

  const start = async (): Promise<void> => {
    const cur = await api().fav.current()
    if (!cur.ok) {
      setNotice(`fav.err.${cur.reason}`, undefined, 'warn')
      return
    }
    setForm({
      cur,
      title: cur.title || cur.info.slug || '',
      folderId: folders[0]?.id ?? '__new',
      newFolder: '',
      ownLeague: cur.info.league !== cur.currentLeague
    })
  }

  const save = async (): Promise<void> => {
    if (!form || !form.title.trim()) return
    const { info } = form.cur
    let folderId = form.folderId
    if (folderId === '__new') {
      const title = form.newFolder.trim()
      folderId = title ? await api().fav.saveFolder({ title, game: info.game }) : ''
    }
    const s = await api().fav.saveSearch({
      folderId: folderId || undefined,
      title: form.title,
      game: info.game,
      type: info.type,
      slug: info.slug ?? '',
      league: form.ownLeague ? info.league : undefined
    })
    setForm(null)
    if (s) {
      toggleFolder(s.folderId, true)
      setNotice('fav.save.done')
    }
  }

  if (!form) {
    return (
      <button type="button" className="ui-btn ui-btn--primary ui-btn--block" onClick={() => void start()}>
        <Ico name="star" />
        {t('fav.saveCurrent')}
      </button>
    )
  }
  return (
    <form
      className="ts-form"
      onSubmit={(e) => {
        e.preventDefault()
        void save()
      }}
    >
      <label className="ui-field">
        <span className="ui-field__label">{t('fav.save.title')}</span>
        <input
          className="ui-input"
          value={form.title}
          autoFocus
          maxLength={120}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
        />
      </label>
      <label className="ui-field">
        <span className="ui-field__label">{t('fav.save.folder')}</span>
        <select className="ui-select" value={form.folderId} onChange={(e) => setForm({ ...form, folderId: e.target.value })}>
          {folders.map((f) => (
            <option key={f.id} value={f.id}>
              {f.title}
            </option>
          ))}
          <option value="__new">{t('fav.save.newFolder')}</option>
        </select>
      </label>
      {form.folderId === '__new' && (
        <input
          className="ui-input"
          value={form.newFolder}
          maxLength={120}
          placeholder={t('fav.save.newFolderName')}
          aria-label={t('fav.save.newFolderName')}
          onChange={(e) => setForm({ ...form, newFolder: e.target.value })}
        />
      )}
      {form.cur.info.league !== form.cur.currentLeague && (
        <label className="ts-check">
          <button
            type="button"
            className="ui-check"
            role="checkbox"
            aria-checked={form.ownLeague}
            onClick={() => setForm({ ...form, ownLeague: !form.ownLeague })}
          >
            <Ico name="check" />
          </button>
          <span>{t('fav.save.ownLeague', { league: form.cur.info.league })}</span>
        </label>
      )}
      <div className="ts-row">
        <button type="submit" className="ui-btn ui-btn--sm ui-btn--primary" disabled={!form.title.trim()}>
          {t('fav.save.do')}
        </button>
        <button type="button" className="ui-btn ui-btn--sm ui-btn--ghost" onClick={() => setForm(null)}>
          {t('fav.cancel')}
        </button>
      </div>
    </form>
  )
}

function NoticeLine() {
  const t = useT()
  const notice = useFavStore((s) => s.notice)
  if (!notice) return null
  const cls = notice.kind === 'bad' ? ' ui-banner--bad' : notice.kind === 'ok' ? ' ui-banner--info' : ''
  return (
    <div className={`ui-banner ts-notice${cls}`} role="status">
      <Ico name={notice.kind === 'ok' ? 'check' : 'warn'} />
      <span>{t(notice.key, notice.params)}</span>
      <span />
    </div>
  )
}

function Foot() {
  const t = useT()
  const simple = useAppStore((s) => s.settings?.ui.simpleMode ?? true)
  const game = useAppStore((s) => s.settings?.game ?? 'poe1')
  const live = useFavStore((s) => s.live)
  const auth = useFavStore((s) => s.auth)
  const setNotice = useFavStore((s) => s.setNotice)
  const toggleFolder = useFavStore((s) => s.toggleFolder)
  const [importing, setImporting] = useState<string | null>(null)
  const [newFolder, setNewFolder] = useState(false)

  const doImport = async (): Promise<void> => {
    if (importing === null) return
    const r = await api().fav.importBt(importing)
    if (!r.ok) setNotice('fav.import.invalid', undefined, 'bad')
    else if (r.folders === 0) setNotice('fav.import.none', undefined, 'warn')
    else {
      setNotice('fav.import.done', { folders: r.folders, searches: r.searches })
      setImporting(null)
    }
  }
  const doExport = async (): Promise<void> => {
    const s = await api().fav.exportBt(null, game)
    if (!s) return setNotice('fav.export.empty', undefined, 'warn')
    await api().fav.copy(s)
    setNotice('fav.export.done', { n: s.split('\n').length })
  }

  const meterStyle = { '--v': `${live.max ? Math.min(100, (live.used / live.max) * 100) : 0}%` } as CSSProperties
  return (
    <div className="ts-foot">
      {live.available && (
        <div className="ui-meter" data-level={live.used >= live.max ? 'warn' : undefined} style={meterStyle}>
          <div className="ui-meter__row">
            <span>{t('fav.live.meter')}</span>
            <span>
              <b>{live.used}</b> {t('fav.live.of')} {live.max}
            </span>
          </div>
          <div className="ui-meter__bar" />
        </div>
      )}
      {importing !== null && (
        <div className="ts-form">
          <span className="ui-field__label">{t('fav.import.title')}</span>
          <textarea
            className="ui-input ui-input--mono ts-textarea"
            value={importing}
            rows={4}
            autoFocus
            placeholder="3:…"
            onChange={(e) => setImporting(e.target.value)}
          />
          <span className="ui-field__help">{t('fav.import.hint')}</span>
          <div className="ts-row">
            <button type="button" className="ui-btn ui-btn--sm ui-btn--primary" disabled={!importing.trim()} onClick={() => void doImport()}>
              {t('fav.import.do')}
            </button>
            <button type="button" className="ui-btn ui-btn--sm ui-btn--ghost" onClick={() => setImporting(null)}>
              {t('fav.cancel')}
            </button>
          </div>
        </div>
      )}
      {newFolder && (
        <InlineEdit
          value=""
          placeholder={t('fav.folder.newName')}
          onDone={(v) => {
            setNewFolder(false)
            if (v.trim()) void api().fav.saveFolder({ title: v, game }).then((id) => id && toggleFolder(id, true))
          }}
        />
      )}
      <div className="ts-acts">
        <button type="button" className="ui-btn ui-btn--sm" title="Better Trading 3:…" onClick={() => setImporting(importing === null ? '' : null)}>
          <Ico name="import" />
          {t('fav.import')}
        </button>
        <button type="button" className="ui-btn ui-btn--sm" title="Better Trading 3:…" onClick={() => void doExport()}>
          <Ico name="export" />
          {t('fav.export')}
        </button>
        <button type="button" className="ui-btn ui-btn--sm ui-btn--ghost" onClick={() => setNewFolder(true)}>
          <Ico name="plus" />
          {t('fav.folder.new')}
        </button>
      </div>
      <div className="ts-acct">
        <Ico name="shield" size="sm" />
        <span className={`ui-dot${auth?.loggedIn ? '' : ' ui-dot--off'}`} />
        <span className="ts-grow" title={auth?.accountName}>
          {auth?.loggedIn
            ? auth.accountName
              ? `${t('fav.acct.in')} · ${auth.accountName}`
              : t('fav.acct.in')
            : auth?.checking
              ? t('fav.acct.checking')
              : t('fav.acct.out')}
        </span>
        {auth?.loggedIn ? (
          <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm" onClick={() => void api().auth.logout()}>
            <Ico name="logout" />
            {t('fav.acct.logout')}
          </button>
        ) : (
          <button type="button" className="ui-btn ui-btn--sm" onClick={() => void api().auth.login()}>
            {t('fav.acct.login')}
          </button>
        )}
      </div>
      {simple && !auth?.loggedIn && <div className="ui-field__help">{t('fav.acct.hint')}</div>}
    </div>
  )
}
