import { useEffect, useState, type FormEvent } from 'react'
import { useT } from '../../i18n'
import { useAuthStore } from './useAuthStore'
import './account.css'

// Блок «Аккаунт pathofexile.com» для настроек (подключает лид в SettingsPanel).
// Вход — только на официальной странице GGG в отдельном окне; здесь — статус,
// «Войти»/«Выйти» и фолбэк «вставить POESESSID» с предупреждением.

export function AccountPanel() {
  const t = useT()
  const status = useAuthStore((s) => s.status)
  const busy = useAuthStore((s) => s.busy)
  const pasteResult = useAuthStore((s) => s.pasteResult)
  const init = useAuthStore((s) => s.init)
  const login = useAuthStore((s) => s.login)
  const logout = useAuthStore((s) => s.logout)
  const recheck = useAuthStore((s) => s.recheck)
  const paste = useAuthStore((s) => s.paste)
  const [value, setValue] = useState('')

  useEffect(() => init(), [init])

  const checking = !status || status.checking
  const line =
    !status || (status.checking && !status.loggedIn)
      ? t('auth.status.checking')
      : status.loggedIn
        ? status.accountName
          ? t('auth.status.inAs', { name: status.accountName })
          : t('auth.status.in')
        : t('auth.status.out')

  const onPaste = (e: FormEvent): void => {
    e.preventDefault()
    const v = value.trim()
    // значение не держим в состоянии дольше, чем нужно для отправки в main
    setValue('')
    if (v) void paste(v)
  }

  return (
    <div className="block account">
      <div className="block-title">{t('auth.title')}</div>

      <div className="account-status">
        <span className={'account-dot ' + (status?.loggedIn ? 'on' : checking ? 'wait' : 'off')} />
        <span>{line}</span>
        {status?.loggedIn && status.source === 'pasted' && (
          <span className="small muted">· {t('auth.status.pasted')}</span>
        )}
      </div>
      {status?.problem && <div className="small account-danger">{t(`auth.problem.${status.problem}`)}</div>}

      <div className="account-actions">
        {status?.loggedIn ? (
          <button className="btn small" disabled={busy} onClick={() => void logout()}>
            {t('auth.logout')}
          </button>
        ) : (
          <button className="btn small" onClick={() => void login()}>
            {t('auth.login')}
          </button>
        )}
        <button className="btn small" disabled={busy || checking} onClick={() => void recheck()}>
          {t('auth.recheck')}
        </button>
      </div>

      <div className="small muted">{t('auth.why')}</div>
      <ul className="account-notes small muted">
        <li>{t('auth.safe')}</li>
        <li>{t('auth.2fa')}</li>
        <li>{t('auth.steam')}</li>
        <li>{t('auth.logoutNote')}</li>
      </ul>

      <details className="account-paste">
        <summary className="small">{t('auth.paste.toggle')}</summary>
        <div className="account-warn small">⚠ {t('auth.paste.warn')}</div>
        <div className="small muted">{t('auth.paste.how')}</div>
        <form className="account-paste-row" onSubmit={onPaste}>
          <input
            type="password"
            className="pc-input"
            autoComplete="off"
            spellCheck={false}
            maxLength={64}
            placeholder={t('auth.paste.placeholder')}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <button className="btn small" type="submit" disabled={busy || !value.trim()}>
            {t('auth.paste.save')}
          </button>
        </form>
        {pasteResult && (
          <div className={'small ' + (pasteResult === 'ok' ? 'account-ok' : 'account-danger')}>
            {pasteResult === 'ok' ? t('auth.paste.ok') : t(`auth.paste.err.${pasteResult}`)}
          </div>
        )}
      </details>
    </div>
  )
}
