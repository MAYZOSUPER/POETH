import { useEffect, useState } from 'react'
import type { HotkeyConflict } from '@shared/types'
import { isAllowedExternalUrl } from '@shared/links'
import { useAppStore } from '../store/useAppStore'
import { useShellStore } from '../store/useShellStore'
import { useT } from '../i18n'
import { Ico, type IcoName } from './regex/Ico'
import { Switch } from './regex/common'
import { Kbd, accelKeys } from './onboarding/Kbd'
import './pricecheck/pricecheckTab.css'

// Вкладка «Прайс-чек» PoE 1 в компаньоне (S37): само окно цены живёт поверх игры (S4/S15/S23/S24),
// здесь — как им пользоваться, что оно покажет, текущая клавиша и переход в настройки.
// Истории проверок нет: окно цены держит только текущий предмет (overlay/pricecheck/store.ts).

/** Гайд по функциям на сайте (S30b, якорь #price; EN — ?lang=en). */
const GUIDE_URL = 'https://mayzosuper.github.io/POETH/guide/'

function guideUrl(lang: string): string {
  return `${GUIDE_URL}${lang === 'en' ? '?lang=en' : ''}#price`
}

/** Настройки, раздел «Горячие клавиши» (id блока — в SettingsPanel). */
function openHotkeySettings(): void {
  useShellStore.getState().setPage('settings')
  requestAnimationFrame(() => document.getElementById('set-hotkeys')?.scrollIntoView({ block: 'start' }))
}

/** Что покажет окно цены: иконка и ключи pc1.tab.show.<id> / .<id>.text. */
const SHOWS: Array<[string, IcoName]> = [
  ['verdict', 'ask'],
  ['market', 'coins'],
  ['mods', 'check'],
  ['actions', 'external']
]

export function Poe1PriceCheckTab() {
  const t = useT()
  const lang = useAppStore((s) => s.settings?.uiLang ?? 'ru')
  const simple = useAppStore((s) => s.settings?.ui.simpleMode ?? true)
  const accel = useAppStore((s) => s.settings?.hotkeys.priceCheck.accel) ?? ''
  const patchSettings = useAppStore((s) => s.patchSettings)
  // клавиша прайс-чека занята другой программой (APT, Sidekick…) — окно не откроется
  const [conflicts, setConflicts] = useState<HotkeyConflict[]>([])
  useEffect(() => {
    void window.overlayApi.overlay.hotkeyConflicts().then(setConflicts)
    return window.overlayApi.onHotkeyConflicts(setConflicts)
  }, [])
  const taken = conflicts.some((c) => c.action === 'priceCheck')
  const guide = guideUrl(lang)
  // ссылку открывает main только для хостов из allowlist (@shared/links); нет хоста — нет кнопки
  const canOpenGuide = isAllowedExternalUrl(guide)

  const key = <Kbd accel={accel} empty={t('pc1.tab.key.none')} />
  const actions = (
    <div className="pct-actions">
      <button type="button" className="ui-btn ui-btn--sm" onClick={openHotkeySettings}>
        <Ico name="keyboard" />
        {t(accel ? 'pc1.tab.key.change' : 'pc1.tab.key.set')}
      </button>
      {canOpenGuide && (
        <button type="button" className="ui-btn ui-btn--sm ui-btn--ghost" onClick={() => window.overlayApi.window.openExternal(guide)}>
          <Ico name="book" />
          {t('pc1.tab.guide')}
        </button>
      )}
    </div>
  )

  return (
    <div className="pct-tab ui-scroll">
      <div className="pct-top">
        <h2 className="pct-title">{t('pc1.tab.title')}</h2>
        <span className="ui-tag ui-tag--good">{t('pc1.tab.noLogin')}</span>
        <span className="pct-grow" />
        <Switch
          on={!simple}
          title={t('pc1.tab.expert.title')}
          onChange={(expert) => void patchSettings({ ui: { simpleMode: !expert } })}
        >
          {t('pc1.tab.expert')}
        </Switch>
      </div>

      {(!accel || taken) && (
        <div className="ui-banner pct-banner" role="alert">
          <Ico name="warn" />
          <span>{!accel ? t('pc1.tab.key.noneText') : t('pc1.tab.key.taken', { key: accelKeys(accel).join('+') })}</span>
          <button type="button" className="ui-btn ui-btn--sm" onClick={openHotkeySettings}>
            {t(accel ? 'pc1.tab.key.change' : 'pc1.tab.key.set')}
          </button>
        </div>
      )}

      {simple ? (
        <section className="ui-box">
          <div className="ui-box__head">
            <span className="ui-label">{t('pc1.tab.how')}</span>
          </div>
          <ol className="ui-box__body pct-steps">
            <li>
              <span className="pct-n">1</span>
              <span>{t('pc1.tab.step1')}</span>
            </li>
            <li>
              <span className="pct-n">2</span>
              <span>
                {t('pc1.tab.step2.press')} {key} {t('pc1.tab.step2.text')}
              </span>
            </li>
            <li>
              <span className="pct-n">3</span>
              <span>
                {t('pc1.tab.step3')} {t('pc1.tab.step3.close')} {key}.
              </span>
            </li>
          </ol>
          <div className="ui-box__foot">{actions}</div>
        </section>
      ) : (
        <section className="ui-box">
          <div className="ui-box__head">
            <span className="ui-label">{t('pc1.tab.key')}</span>
            {key}
            <span className="pct-grow" />
            {actions}
          </div>
          <ul className="ui-box__body pct-list">
            {(['presets', 'enter', 'cache', 'position'] as const).map((id) => (
              <li key={id}>{t(`pc1.tab.x.${id}`)}</li>
            ))}
          </ul>
        </section>
      )}

      {simple && (
        <section className="ui-box">
          <div className="ui-box__head">
            <span className="ui-label">{t('pc1.tab.show')}</span>
          </div>
          <ul className="ui-box__body pct-shows">
            {SHOWS.map(([id, icon]) => (
              <li key={id}>
                <Ico name={icon} />
                <span>
                  <b>{t(`pc1.tab.show.${id}`)}</b> {t(`pc1.tab.show.${id}.text`)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="ui-hint pct-hint">
        <Ico name="info" />
        <span>{t('pc1.tab.window')}</span>
      </div>
    </div>
  )
}
