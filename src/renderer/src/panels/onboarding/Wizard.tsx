import { useEffect, useState, type ReactNode } from 'react'
import type { AuthStatus, OverlayStatus, UiLang } from '@shared/types'
import type { GameId, SiteHost } from '@shared/games'
import { BOOSTY_URL } from '@shared/links'
import { useT } from '../../i18n'
import { tKey } from '../../i18n/hotkey'
import { useAppStore } from '../../store/useAppStore'
import { BrandImg } from '../../components/BrandImg'
import { Ico } from '../regex/Ico'
import { Kbd } from './Kbd'
import './onboarding.css'

// Мастер первого запуска (S9) по утверждённому макету «последний шаг мастера»: модальная панель
// поверх компаньона, 4–5 шагов простым языком. Язык интерфейса и сайт применяются сразу,
// смена игры — после «Начать» (перезапуск). «Пропустить» и «Начать» ставят startup.firstRunDone.

type StepId = 'lang' | 'client' | 'howto' | 'account' | 'done'

const GAME_NAME: Record<GameId, string> = { poe1: 'Path of Exile 1', poe2: 'Path of Exile 2' }
const SITES: SiteHost[] = ['www.pathofexile.com', 'ru.pathofexile.com']

export function Wizard({ onClose }: { onClose: () => void }) {
  const t = useT()
  const settings = useAppStore((s) => s.settings)
  const patchSettings = useAppStore((s) => s.patchSettings)
  const [game, setGame] = useState<GameId>(settings?.game ?? 'poe1')
  // язык клиента: если POETH уже узнал его по журналу игры — сразу он (S26), иначе как интерфейс
  const detectedLang = settings?.gameLang.detected?.lang
  const [clientLang, setClientLang] = useState<UiLang>(detectedLang ?? settings?.uiLang ?? 'ru')
  const [i, setI] = useState(0)
  const [auth, setAuth] = useState<AuthStatus | null>(null)
  const [overlay, setOverlay] = useState<OverlayStatus | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const api = window.overlayApi
    void api.auth.status().then(setAuth).catch(() => undefined)
    void api.overlay
      .getState()
      .then((s) => setOverlay(s.status))
      .catch(() => undefined)
    const offAuth = api.onAuthStatus(setAuth)
    const offOverlay = api.onOverlayStatus(setOverlay)
    return () => {
      offAuth()
      offOverlay()
    }
  }, [])

  if (!settings) return null
  const running = settings.game
  const steps: StepId[] = game === 'poe1' ? ['lang', 'client', 'howto', 'account', 'done'] : ['lang', 'client', 'howto', 'done']
  const idx = Math.min(i, steps.length - 1)
  const step = steps[idx]
  const last = idx === steps.length - 1

  const finish = async (): Promise<void> => {
    setBusy(true)
    try {
      // язык клиента игры — общая настройка (S26): названия предметов и валют, строки regex
      await patchSettings({ gameLang: { choice: clientLang }, startup: { firstRunDone: true } })
      onClose()
      if (game !== running) await window.overlayApi.app.switchGame(game)
    } finally {
      setBusy(false)
    }
  }
  const skip = async (): Promise<void> => {
    await patchSettings({ startup: { firstRunDone: true } })
    onClose()
  }
  const pickClient = (lang: UiLang): void => {
    setClientLang(lang)
    // русский клиент — удобнее ru-сайт (сообщения продавцам на языке игры); можно поменять ниже
    void patchSettings({ siteHost: lang === 'ru' ? 'ru.pathofexile.com' : 'www.pathofexile.com' })
  }

  const hk = settings.hotkeys
  const hideout = settings.chatCommands.find((c) => c.enabled && c.hotkey && c.text.trim() === '/hideout')

  let body: ReactNode
  if (step === 'lang') {
    body = (
      <>
        <h3>{t('wiz.lang.h')}</h3>
        <p className="onb-lead">{t('wiz.lang.lead')}</p>
        <Field label={t('wiz.lang.ui')}>
          <Seg
            value={settings.uiLang}
            options={[
              ['ru', 'Русский'],
              ['en', 'English']
            ]}
            onChange={(v) => {
              void patchSettings({ uiLang: v as UiLang })
              setClientLang(detectedLang ?? (v as UiLang))
            }}
          />
        </Field>
        <Field label={t('wiz.lang.game')} help={game !== running ? t('wiz.lang.game.help') : undefined}>
          <Seg
            value={game}
            options={[
              ['poe1', GAME_NAME.poe1],
              ['poe2', GAME_NAME.poe2]
            ]}
            onChange={(v) => setGame(v as GameId)}
          />
        </Field>
      </>
    )
  } else if (step === 'client') {
    body = (
      <>
        <h3>{t('wiz.client.h')}</h3>
        <p className="onb-lead">{t('wiz.client.lead')}</p>
        <Field
          label={t('wiz.client.lang')}
          help={detectedLang ? t('wiz.client.detected', { lang: detectedLang === 'ru' ? 'Русский' : 'English' }) : undefined}
        >
          <Seg
            value={clientLang}
            options={[
              ['ru', 'Русский'],
              ['en', 'English']
            ]}
            onChange={(v) => pickClient(v as UiLang)}
          />
        </Field>
        <Field label={t('wiz.client.site')} help={t('wiz.client.site.help')}>
          <Seg
            value={settings.siteHost}
            options={SITES.map((s) => [s, s])}
            onChange={(v) => void patchSettings({ siteHost: v as SiteHost })}
          />
        </Field>
      </>
    )
  } else if (step === 'howto') {
    const rows: [string, string][] =
      game === 'poe1'
        ? [
            [hk.priceCheck.accel, t('wiz.howto.priceCheck')],
            [hk.overlayToggle.accel, t('wiz.howto.overlay')],
            ...(hideout ? [[hideout.hotkey, t('wiz.howto.hideout')] as [string, string]] : []),
            [hk.toggleTradeWindow.accel, t('wiz.howto.tradeWindow')],
            [hk.toggleCompanion.accel, t('wiz.howto.companion')]
          ]
        : [
            [hk.priceCheck.accel, t('wiz.howto.priceCheck')],
            [hk.toggleCompanion.accel, t('wiz.howto.companion')],
            [[hk.prevStep.accel, hk.nextStep.accel].filter(Boolean).join(' / '), t('wiz.howto.campaign')]
          ]
    const live = game === running && overlay?.tracking ? overlay : null
    body = (
      <>
        <h3>{t('wiz.howto.h')}</h3>
        <p className="onb-lead">{t('wiz.howto.lead')}</p>
        <ul className="onb-keys">
          {rows.map(([accel, text], k) => (
            <li key={k}>
              {accel.includes(' / ') ? (
                <span className="onb-keypair">
                  {accel.split(' / ').map((a, j) => (
                    <Kbd key={j} accel={a} />
                  ))}
                </span>
              ) : (
                <Kbd accel={accel} empty={t('wiz.howto.notSet')} />
              )}
              <span>{text}</span>
            </li>
          ))}
        </ul>
        <div className="onb-window">
          <span className="ui-label">{t('wiz.window.title')}</span>
          <ul className="onb-checks">
            <li>
              <Ico name="game" />
              <span>{t('wiz.window.mode')}</span>
            </li>
            <li>
              <Ico name="shield" />
              <span>{tKey(t, 'wiz.window.admin', hk.priceCheck.accel)}</span>
            </li>
          </ul>
          {live?.attached && live.hasAccess === false && <Banner kind="bad">{t('wiz.window.adminNow')}</Banner>}
          {live?.attached && live.fullscreen === true && <Banner kind="warn">{t('wiz.window.fullscreenNow')}</Banner>}
          {live?.attached && live.hasAccess !== false && live.fullscreen !== true && (
            <Banner kind="ok">{t('wiz.window.found')}</Banner>
          )}
        </div>
      </>
    )
  } else if (step === 'account') {
    body = (
      <>
        <h3>{t('wiz.account.h')}</h3>
        <ul className="onb-bullets">
          <li>{t('wiz.account.p1')}</li>
          <li>{t('wiz.account.p2')}</li>
          <li>{t('wiz.account.p3')}</li>
        </ul>
        <div className="onb-row">
          {auth?.loggedIn ? (
            <span className="onb-ok">
              <Ico name="check" />
              {t('wiz.account.in')}
              {auth.accountName ? ` · ${auth.accountName}` : ''}
            </span>
          ) : (
            <>
              <button type="button" className="ui-btn" onClick={() => void window.overlayApi.auth.login()}>
                <Ico name="external" />
                {t('wiz.account.login')}
              </button>
              <span className="onb-faint">{t('wiz.account.out')}</span>
            </>
          )}
        </div>
      </>
    )
  } else {
    const items: [string, string][] = [
      [t('wiz.done.game'), `${GAME_NAME[game]} · ${t(`wiz.done.client.${clientLang}`)}`],
      [t('wiz.done.site'), settings.siteHost],
      ...(game === 'poe1'
        ? [[t('wiz.done.signin'), t(auth?.loggedIn ? 'wiz.done.signin.in' : 'wiz.done.signin.out')] as [string, string]]
        : []),
      [t('wiz.done.priceCheck'), keysText(hk.priceCheck.accel)],
      ...(game === 'poe1' ? [[t('wiz.done.overlay'), keysText(hk.overlayToggle.accel)] as [string, string]] : [])
    ]
    body = (
      <>
        <h3>{t('wiz.done.h')}</h3>
        <ul className="onb-done">
          {items.map(([k, v]) => (
            <li key={k}>
              <Ico name="check" />
              <span className="onb-done__k">{k}</span>
              <span>{v}</span>
            </li>
          ))}
        </ul>
        <div className="ui-hint onb-hint">
          <Ico name="help" />
          <span>
            <b>{t('wiz.done.tryTitle')}</b> {t('wiz.done.try', { key: keysText(hk.priceCheck.accel) })}
          </span>
        </div>
        {game !== running && <div className="ui-field__help">{t('wiz.restart.note')}</div>}
        <span className="onb-quiet">{t('wiz.done.quiet')}</span>
      </>
    )
  }

  return (
    <div className="onb-scrim">
      <div className="ui-panel ui-panel--solid onb-wiz" role="dialog" aria-modal="true" aria-label={t('wiz.title')}>
        <div className="ui-panel__head">
          <BrandImg file="mark.svg" className="onb-mark" fallback={<Ico name="compass" />} />
          <span className="ui-panel__title">{t('wiz.title')}</span>
          <span className="onb-steps" aria-label={t('wiz.step', { n: idx + 1, total: steps.length })}>
            {steps.map((s, k) => (
              <i key={s} className={k <= idx ? 'on' : ''} />
            ))}
            <span>{t('wiz.step', { n: idx + 1, total: steps.length })}</span>
          </span>
        </div>
        <div className="onb-body ui-scroll">{body}</div>
        <div className="onb-foot">
          {last ? (
            <button
              type="button"
              className="ui-btn ui-btn--ghost ui-btn--sm"
              title="boosty.to/twistedthreadstudios"
              onClick={() => window.overlayApi.window.openExternal(BOOSTY_URL)}
            >
              <Ico name="support" />
              {t('wiz.support')}
            </button>
          ) : (
            <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm" title={t('wiz.skip.title')} onClick={() => void skip()}>
              {t('wiz.skip')}
            </button>
          )}
          <span className="onb-grow" />
          {idx > 0 && (
            <button type="button" className="ui-btn" onClick={() => setI(idx - 1)}>
              {t('wiz.back')}
            </button>
          )}
          {last ? (
            <button type="button" className="ui-btn ui-btn--primary" disabled={busy} onClick={() => void finish()}>
              {t('wiz.start')}
            </button>
          ) : (
            <button type="button" className="ui-btn ui-btn--primary" onClick={() => setI(idx + 1)}>
              {t('wiz.next')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function keysText(accel: string): string {
  return accel ? accel.replace(/Control/g, 'Ctrl') : '—'
}

function Field({ label, help, children }: { label: string; help?: string; children: ReactNode }) {
  return (
    <div className="onb-field">
      <span className="onb-field__label">{label}</span>
      {children}
      {help && <span className="ui-field__help">{help}</span>}
    </div>
  )
}

function Seg({ value, options, onChange }: { value: string; options: [string, string][]; onChange: (v: string) => void }) {
  return (
    <div className="ui-seg onb-seg" role="group">
      {options.map(([v, label]) => (
        <button key={v} type="button" aria-pressed={v === value} onClick={() => onChange(v)}>
          {label}
        </button>
      ))}
    </div>
  )
}

function Banner({ kind, children }: { kind: 'ok' | 'warn' | 'bad'; children: ReactNode }) {
  const cls = kind === 'bad' ? ' ui-banner--bad' : kind === 'ok' ? ' ui-banner--info' : ''
  return (
    <div className={`ui-banner onb-banner${cls}`} role="status">
      <Ico name={kind === 'ok' ? 'check' : 'warn'} />
      <span>{children}</span>
      <span />
    </div>
  )
}
