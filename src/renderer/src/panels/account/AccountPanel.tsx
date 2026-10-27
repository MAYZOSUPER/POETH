import { useEffect, useId, useState, type FormEvent } from 'react'
import { useT } from '../../i18n'
import { useAuthStore } from './useAuthStore'
import { SiteCheckBanner } from './SiteCheckBanner'
import { Ico } from './icons'
import './account.css'

// Раздел «Аккаунт» в настройках — по утверждённому макету (Настройки → Аккаунт):
// карточка «Вы вошли на pathofexile.com» / «Вход не выполнен», объяснение безопасности,
// Войти/Выйти, запасной путь «Вставить POESESSID вручную» со строгим предупреждением.
// Вход — только на официальной странице GGG в отдельном окне (после S5 — в трейд-окне).

export function AccountPanel({ title = true }: { title?: boolean }) {
  const t = useT()
  const status = useAuthStore((s) => s.status)
  const busy = useAuthStore((s) => s.busy)
  const pasteResult = useAuthStore((s) => s.pasteResult)
  const init = useAuthStore((s) => s.init)
  const login = useAuthStore((s) => s.login)
  const logout = useAuthStore((s) => s.logout)
  const recheck = useAuthStore((s) => s.recheck)
  const paste = useAuthStore((s) => s.paste)
  const [pasteOpen, setPasteOpen] = useState(false)
  const [value, setValue] = useState('')
  const inputId = useId()

  useEffect(() => init(), [init])

  const loggedIn = !!status?.loggedIn
  const checking = !status || (status.checking && !status.loggedIn)
  // после успешной вставки форма больше не нужна
  const showPaste = pasteOpen && !loggedIn
  const pasteError = pasteResult && pasteResult !== 'ok' ? pasteResult : null

  const onPaste = (e: FormEvent): void => {
    e.preventDefault()
    const v = value.trim()
    // значение не держим в состоянии дольше, чем нужно для отправки в main
    setValue('')
    if (v) void paste(v)
  }

  return (
    <section className="account" aria-labelledby={title ? `${inputId}-h` : undefined}>
      {title && (
        <h3 className="account-title" id={`${inputId}-h`}>
          {t('auth.title')}
        </h3>
      )}

      {loggedIn ? (
        <div className="account-card">
          <Ico name="shield" className="account-card__ico" />
          <div className="account-card__body">
            <h4 className="account-card__title">{t('auth.in.title')}</h4>
            {(status?.accountName || status?.source === 'pasted') && (
              <div className="account-card__who">
                <span className="ui-dot" />
                {status?.accountName && <span className="account-card__name">{status.accountName}</span>}
                {status?.source === 'pasted' && <span className="ui-tag">{t('auth.in.pasted')}</span>}
              </div>
            )}
            <ul className="account-card__list">
              <li>{t(status?.source === 'pasted' ? 'auth.in.p1.pasted' : 'auth.in.p1')}</li>
              <li>{t('auth.in.p2')}</li>
              <li>{t('auth.in.p3')}</li>
            </ul>
            <div className="account-card__btns">
              <button
                type="button"
                className="ui-btn ui-btn--danger"
                disabled={busy}
                title={t('auth.logout.hint')}
                onClick={() => void logout()}
              >
                <Ico name="logout" />
                {t('auth.logout')}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="account-card account-card--out">
          <Ico name="lock" className="account-card__ico" />
          <div className="account-card__body">
            <h4 className="account-card__title">{checking ? t('auth.checking') : t('auth.out.title')}</h4>
            <ul className="account-card__list">
              <li>{t('auth.out.p1')}</li>
              <li>{t('auth.out.p2')}</li>
            </ul>
            <div className="account-card__btns">
              <button type="button" className="ui-btn ui-btn--primary" onClick={() => void login()}>
                <Ico name="external" />
                {t('auth.login')}
              </button>
              <button
                type="button"
                className="ui-btn ui-btn--ghost"
                title={t('auth.paste.title')}
                aria-expanded={showPaste}
                onClick={() => setPasteOpen((v) => !v)}
              >
                {t('auth.paste.open')}
              </button>
            </div>
          </div>
        </div>
      )}

      {status?.problem === 'blocked' && <SiteCheckBanner context="account" action={loggedIn} />}
      {status?.problem === 'network' && (
        <div className="ui-banner" role="status">
          <Ico name="warn" />
          <span>
            <b>{t('auth.net.title')}</b> {t('auth.net.text')}
          </span>
          <button type="button" className="ui-btn ui-btn--sm" disabled={busy} onClick={() => void recheck()}>
            <Ico name="refresh" />
            {t('auth.recheck')}
          </button>
        </div>
      )}

      {showPaste && (
        <div className="account-paste">
          <div className="ui-banner ui-banner--bad">
            <Ico name="warn" />
            <span>
              <b>{t('auth.paste.warn.title')}</b> {t('auth.paste.warn')}
            </span>
            <span />
          </div>
          <form className="ui-field" onSubmit={onPaste}>
            <label className="ui-field__label" htmlFor={inputId}>
              POESESSID
            </label>
            <div className="account-paste__row">
              <input
                id={inputId}
                type="password"
                className="ui-input ui-input--lg ui-input--mono"
                autoComplete="off"
                spellCheck={false}
                maxLength={64}
                placeholder={t('auth.paste.placeholder')}
                aria-invalid={pasteError ? true : undefined}
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
              <button type="submit" className="ui-btn ui-btn--primary" disabled={busy || !value.trim()}>
                {t('auth.paste.save')}
              </button>
              <button type="button" className="ui-btn ui-btn--ghost" onClick={() => setPasteOpen(false)}>
                {t('auth.paste.cancel')}
              </button>
            </div>
            <span className="ui-field__help">{t('auth.paste.how')}</span>
            {pasteError && <span className="ui-field__error">{t(`auth.paste.err.${pasteError}`)}</span>}
          </form>
        </div>
      )}

      <div className="ui-hint account-hint">
        <Ico name="help" />
        <span>{t(loggedIn ? 'auth.logout.hint' : 'auth.login.hint')}</span>
      </div>
    </section>
  )
}
