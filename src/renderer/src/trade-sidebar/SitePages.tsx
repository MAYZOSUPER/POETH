import { useState } from 'react'
import { BOOKMARK_LIMIT, BOOKMARK_TITLE_MAX, SITES, type BookmarkError } from '@shared/sites'
import { useT } from '../i18n'
import { Ico } from '../panels/regex/Ico'
import { tabName } from './SiteBar'
import { useFavStore } from './useFavStore'

// Место под сайтом во вкладках сайтов (S43): пока вью сайта нет — заметка о приватности (первое открытие
// вкладки сайта), страница «Сайты» (свои закладки, данные сайтов) или «Загрузка…». Когда вью сайта видна,
// она лежит поверх этого места.

const api = (): Window['overlayApi'] => window.overlayApi

/** Первое открытие вкладки сайта: сайты видят IP и свои cookies, как браузер. */
export function SitesNote() {
  const t = useT()
  const sites = useFavStore((s) => s.sites)
  if (!sites) return null
  const name = tabName(sites, t('sites.manage'))
  return (
    <div className="ts-page ui-scroll">
      <section className="ts-note">
        <h2 className="ts-page__title">
          <Ico name="shield" />
          {t('sites.note.title')}
        </h2>
        <ul className="ts-note__list">
          <li>{t('sites.note.ip')}</li>
          <li>{t('sites.note.account')}</li>
          <li>{t('sites.note.password')}</li>
          <li>{t('sites.note.clear')}</li>
        </ul>
        <div className="ts-row">
          <button type="button" className="ui-btn ui-btn--primary" autoFocus onClick={() => void api().sites.ackNote()}>
            {t('sites.note.ok', { site: name })}
          </button>
        </div>
      </section>
    </div>
  )
}

const ERR_KEYS: Record<BookmarkError, string> = {
  url: 'sites.bm.err.url',
  https: 'sites.bm.err.https',
  host: 'sites.bm.err.host',
  poe: 'sites.bm.err.poe',
  site: 'sites.bm.err.site',
  dup: 'sites.bm.err.dup',
  limit: 'sites.bm.err.limit'
}

function AddBookmark() {
  const t = useT()
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [agree, setAgree] = useState(false)
  const [error, setError] = useState<BookmarkError | null>(null)
  const add = async (): Promise<void> => {
    if (!agree || !url.trim()) return
    const r = await api().sites.addBookmark({ title, url })
    if (!r.ok) return setError(r.reason)
    setTitle('')
    setUrl('')
    setAgree(false)
    setError(null)
  }
  return (
    <form
      className="ts-form ts-bm-form"
      onSubmit={(e) => {
        e.preventDefault()
        void add()
      }}
    >
      <label className="ui-field">
        <span className="ui-field__label">{t('sites.bm.url')}</span>
        <input
          className="ui-input"
          value={url}
          placeholder="https://"
          maxLength={2000}
          spellCheck={false}
          onChange={(e) => {
            setUrl(e.target.value)
            setError(null)
          }}
        />
      </label>
      <label className="ui-field">
        <span className="ui-field__label">{t('sites.bm.title')}</span>
        <input className="ui-input" value={title} maxLength={BOOKMARK_TITLE_MAX} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <div className="ui-banner ts-notice" role="note">
        <Ico name="warn" />
        <span>{t('sites.bm.warn')}</span>
        <span />
      </div>
      <label className="ts-check">
        <button type="button" className="ui-check" role="checkbox" aria-checked={agree} onClick={() => setAgree(!agree)}>
          <Ico name="check" />
        </button>
        <span>{t('sites.bm.agree')}</span>
      </label>
      {error && <span className="ui-field__error">{t(ERR_KEYS[error], { n: BOOKMARK_LIMIT })}</span>}
      <div className="ts-row">
        <button type="submit" className="ui-btn ui-btn--sm ui-btn--primary" disabled={!agree || !url.trim()}>
          <Ico name="plus" />
          {t('sites.bm.add')}
        </button>
      </div>
    </form>
  )
}

/** Страница «Сайты»: сайты по умолчанию, свои закладки (с предупреждением), данные сайтов. */
export function SitesManage() {
  const t = useT()
  const sites = useFavStore((s) => s.sites)
  const setSiteNotice = useFavStore((s) => s.setSiteNotice)
  const [confirmClear, setConfirmClear] = useState(false)
  if (!sites) return null
  return (
    <div className="ts-page ui-scroll">
      <section className="ts-note">
        <h2 className="ts-page__title">
          <Ico name="layers" />
          {t('sites.page.title')}
        </h2>
        <p className="ts-page__lead">{t('sites.page.lead')}</p>

        <h3 className="ui-label">{t('sites.page.builtin')}</h3>
        <div className="ts-site-list">
          {SITES.map((s) => (
            <button key={s.id} type="button" className="ts-site-row" onClick={() => void api().sites.select(s.id)}>
              <span className="ts-rail__mark" data-site={s.id}>
                {s.mark}
              </span>
              <b>{s.name}</b>
              <span>{t(s.aboutKey)}</span>
            </button>
          ))}
        </div>

        <h3 className="ui-label">{t('sites.page.mine')}</h3>
        {sites.bookmarks.length === 0 ? (
          <p className="ui-field__help">{t('sites.page.mine.empty')}</p>
        ) : (
          <div className="ts-site-list">
            {sites.bookmarks.map((b) => (
              <div key={b.id} className="ts-site-row ts-site-row--own">
                <button type="button" className="ts-site-row__open" onClick={() => void api().sites.select(`bm:${b.id}`)}>
                  <b>{b.title}</b>
                  <span>{b.url}</span>
                </button>
                <button
                  type="button"
                  className="ui-btn ui-btn--ghost ui-btn--icon ui-btn--sm"
                  aria-label={t('sites.bm.remove')}
                  title={t('sites.bm.remove')}
                  onClick={() => void api().sites.removeBookmark(b.id)}
                >
                  <Ico name="trash" size="sm" />
                </button>
              </div>
            ))}
          </div>
        )}
        {sites.bookmarks.length < BOOKMARK_LIMIT && <AddBookmark />}

        <h3 className="ui-label">{t('sites.page.data')}</h3>
        <p className="ui-field__help">{t('sites.page.data.help')}</p>
        <div className="ts-row">
          {confirmClear ? (
            <>
              <button
                type="button"
                className="ui-btn ui-btn--sm ui-btn--danger"
                onClick={() => {
                  setConfirmClear(false)
                  void api()
                    .sites.clearData()
                    .then(() => setSiteNotice('sites.clear.done'))
                }}
              >
                <Ico name="trash" size="sm" />
                {t('sites.clear.confirm')}
              </button>
              <button type="button" className="ui-btn ui-btn--sm ui-btn--ghost" onClick={() => setConfirmClear(false)}>
                {t('fav.cancel')}
              </button>
            </>
          ) : (
            <button type="button" className="ui-btn ui-btn--sm" onClick={() => setConfirmClear(true)}>
              <Ico name="trash" size="sm" />
              {t('sites.clear')}
            </button>
          )}
        </div>
      </section>
    </div>
  )
}

/** Под вью сайта, пока она не нарисовалась. */
export function SiteWait() {
  const t = useT()
  const sites = useFavStore((s) => s.sites)
  if (!sites) return null
  return <div className="ts-site-wait ts-site-wait--site">{t('sites.loading', { site: tabName(sites, t('sites.manage')) })}</div>
}
