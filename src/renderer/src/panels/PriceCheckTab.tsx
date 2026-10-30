import { useEffect, useState } from 'react'
import type { LeaguesState, Poe2SessionNotice } from '@shared/types'
import { useAppStore } from '../store/useAppStore'
import { useShellStore } from '../store/useShellStore'
import { useT } from '../i18n'
import { Ico } from './regex/Ico'
import { useAuthStore } from './account/useAuthStore'
import { Poe1PriceCheckTab } from './Poe1PriceCheckTab'

// Вкладка «Прайс-чек» PoE 2 в компаньоне (S47): окно цены теперь, как у PoE 1, поверх игры (Ctrl+D) — здесь та же
// страница S37 (как пользоваться, клавиша, «Сменить клавишу») и своё у PoE 2: лига trade2 и вход в аккаунт.
// Поля POESESSID больше нет: вход общий для PoE 1 и PoE 2 — официальная страница pathofexile.com (cookies сайта
// общие для trade и trade2). Старый ключ из компаса main один раз перенёс во вход — об этом баннер.

const NOTICE_KEYS: Record<Poe2SessionNotice, string> = {
  moved: 'pc2.notice.moved',
  expired: 'pc2.notice.expired',
  already: 'pc2.notice.already'
}

/** Настройки, раздел «Аккаунт» (id блока — в SettingsPanel). */
function openAccountSettings(): void {
  useShellStore.getState().setPage('settings')
  requestAnimationFrame(() => document.getElementById('set-account')?.scrollIntoView({ block: 'start' }))
}

/** Разовое уведомление: чем кончился перенос старого POESESSID PoE 2 во вход. */
function SessionNotice() {
  const t = useT()
  const [notice, setNotice] = useState<Poe2SessionNotice | null>(null)
  useEffect(() => {
    void window.overlayApi.auth.poe2Notice().then(setNotice).catch(() => undefined)
  }, [])
  if (!notice) return null
  const dismiss = (): void => {
    setNotice(null)
    void window.overlayApi.auth.poe2NoticeDismiss()
  }
  return (
    <div className="ui-banner pct-banner pct-banner--info" role="status">
      <Ico name="info" />
      <span>{t(NOTICE_KEYS[notice])}</span>
      <button type="button" className="ui-btn ui-btn--sm" onClick={dismiss}>
        {t('pc2.notice.ok')}
      </button>
    </div>
  )
}

/** Лига trade2 (auto = текущая челлендж-лига) и вход в аккаунт. */
function LeagueAndAccount() {
  const t = useT()
  const choice = useAppStore((s) => s.settings?.poe2.league ?? 'auto')
  const patchSettings = useAppStore((s) => s.patchSettings)
  const status = useAuthStore((s) => s.status)
  const initAuth = useAuthStore((s) => s.init)
  const login = useAuthStore((s) => s.login)
  const [leagues, setLeagues] = useState<LeaguesState | null>(null)

  useEffect(() => initAuth(), [initAuth])
  useEffect(() => {
    void window.overlayApi.leagues.get().then(setLeagues).catch(() => undefined)
    return window.overlayApi.onLeagues(setLeagues)
  }, [])

  const list = leagues?.leagues ?? []
  const loggedIn = !!status?.loggedIn

  return (
    <section className="ui-box">
      <div className="ui-box__head">
        <span className="ui-label">{t('pc2.tab.trade')}</span>
      </div>
      <div className="ui-box__body pct-poe2">
        <label className="pct-row">
          <span className="pct-row__label">{t('pc2.tab.league')}</span>
          <select
            className="ui-select"
            value={choice}
            title={t('pc2.tab.league.title')}
            onChange={(e) => void patchSettings({ poe2: { league: e.target.value } })}
          >
            <option value="auto">{t('pc2.tab.league.auto', { league: leagues?.auto ?? '…' })}</option>
            {list.map((l) => (
              <option key={l.id} value={l.id}>
                {l.text}
              </option>
            ))}
            {choice !== 'auto' && !list.some((l) => l.id === choice) && <option value={choice}>{choice}</option>}
          </select>
        </label>
        {leagues?.stale && <p className="pct-note">{t('pc2.tab.league.stale', { league: choice, auto: leagues.auto })}</p>}

        <div className="pct-row">
          <span className="pct-row__label">{t('pc2.tab.account')}</span>
          <span className="pct-account">
            {loggedIn ? (
              <>
                <span className="ui-dot" />
                {status?.accountName ? t('pc2.tab.account.in', { name: status.accountName }) : t('pc2.tab.account.inAnon')}
              </>
            ) : (
              t(status && !status.checking ? 'pc2.tab.account.out' : 'pc2.tab.account.checking')
            )}
          </span>
          <span className="pct-grow" />
          {!loggedIn && (
            <button type="button" className="ui-btn ui-btn--sm ui-btn--primary" onClick={() => void login()}>
              <Ico name="external" />
              {t('pc2.tab.login')}
            </button>
          )}
          <button type="button" className="ui-btn ui-btn--sm ui-btn--ghost" onClick={openAccountSettings}>
            {t('pc2.tab.accountSettings')}
          </button>
        </div>
        <p className="pct-note">{t('pc2.tab.account.why')}</p>
      </div>
    </section>
  )
}

/** Вкладка «Прайс-чек» в режиме PoE 2. */
export function PriceCheckTab() {
  return (
    <Poe1PriceCheckTab game="poe2" banner={<SessionNotice />}>
      <LeagueAndAccount />
    </Poe1PriceCheckTab>
  )
}
