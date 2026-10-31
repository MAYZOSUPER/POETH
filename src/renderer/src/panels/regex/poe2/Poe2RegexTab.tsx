import { useEffect, useMemo } from 'react'
import type { GameLangSettings, Poe2RegexPage, RegexLang } from '@shared/types'
import { resolveGameLang } from '@shared/gameLang'
import { POE2_PRESETS, poe2PresetText } from '@shared/regex/poe2'
import { useLang, useT } from '../../../i18n'
import { useAppStore } from '../../../store/useAppStore'
import { useRegexStore } from '../../../store/useRegexStore'
import { setGameLangChoice, useGameLangInfo } from '../../../gameLang'
import { Switch, useGameLang, useSimple } from '../common'
import { Ico, type IcoName } from '../Ico'
import { LibraryPage, type LibraryPreset } from '../LibraryPage'
import { WaystonePage } from './WaystonePage'
import { TabletPage } from './TabletPage'
import { Poe2VendorPage } from './VendorPage'
import { usePoe2RegexStore } from './usePoe2RegexStore'
import './poe2.css'

// Вкладка «Regex» в режиме PoE 2 (S62): «Путевые камни», «Плитки», «Торговец», «Библиотека» (общая со строками
// PoE 1, показывает строки игры 'poe2'; хоткеи вставки — по игре). Справа — язык клиента игры и экспертный режим,
// как у PoE 1. Данные — regex:poe2Data (генератор tools/regex/poe2), страницы — на компонентах regex и ui-*.

const PAGES: { id: Poe2RegexPage; icon: IcoName }[] = [
  { id: 'waystone', icon: 'map' },
  { id: 'tablet', icon: 'layers' },
  { id: 'vendor', icon: 'coins' },
  { id: 'library', icon: 'book' }
]

export function Poe2RegexTab() {
  const t = useT()
  const uiLang = useLang()
  const lang = useGameLang()
  const simple = useSimple()
  const patchSettings = useAppStore((s) => s.patchSettings)
  const gameLang = useGameLangInfo(uiLang)
  const ready = usePoe2RegexStore((s) => s.ready)
  const init = usePoe2RegexStore((s) => s.init)
  const page = usePoe2RegexStore((s) => s.prefs.page)
  const setPrefs = usePoe2RegexStore((s) => s.setPrefs)
  const allData = usePoe2RegexStore((s) => s.data)
  const ensureData = usePoe2RegexStore((s) => s.ensureData)
  const libReady = useRegexStore((s) => s.ready)
  const libInit = useRegexStore((s) => s.init)
  const libCount = useRegexStore((s) => s.library?.entries.filter((e) => e.game === 'poe2').length ?? 0)

  useEffect(() => {
    void init()
    void libInit()
  }, [init, libInit])
  useEffect(() => {
    void ensureData(lang)
    if (uiLang !== lang) void ensureData(uiLang)
  }, [lang, uiLang, ensureData])

  const data = allData[lang]
  const other = uiLang !== lang ? (allData[uiLang] ?? null) : null
  const presets = useMemo<LibraryPreset[]>(
    () =>
      data
        ? POE2_PRESETS.map((p) => ({
            id: p.id,
            starter: p.starter,
            name: t(`regex.poe2.preset.${p.id}.name`),
            desc: t(`regex.poe2.preset.${p.id}.desc`),
            text: poe2PresetText(p, data)
          })).filter((p) => !!p.text)
        : [],
    [data, t]
  )

  if (!ready || !libReady) return <div className="ui-empty">{t('regex.maps.loading')}</div>

  const autoLang = resolveGameLang({ choice: 'auto', detected: gameLang.detected }, uiLang).lang
  const langOptions: { value: GameLangSettings['choice']; label: string }[] = [
    {
      value: 'auto',
      label: t('regex.gameLang.auto', { lang: t(`regex.lang.${autoLang}`) })
    },
    ...(['ru', 'en'] as RegexLang[]).map((l) => ({
      value: l,
      label: t(`regex.lang.${l}`)
    }))
  ]

  return (
    <div className="rx">
      <div className="ui-tabs rx-tabs" role="tablist">
        {PAGES.map((p) => (
          <button
            key={p.id}
            type="button"
            className="ui-tab"
            role="tab"
            aria-selected={page === p.id}
            onClick={() => setPrefs({ page: p.id })}
          >
            <Ico name={p.icon} />
            {t(`regex.poe2.page.${p.id}`)}
            {p.id === 'library' && libCount > 0 && <span className="ui-count">{libCount}</span>}
          </button>
        ))}
        <span className="rx-grow" />
        <label className="rx-lang" title={t('regex.gameLang.title')}>
          <span>{t('regex.gameLang')}</span>
          <select
            className="ui-select"
            value={gameLang.choice}
            onChange={(e) => void setGameLangChoice(e.target.value as GameLangSettings['choice'])}
          >
            {langOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <Switch
          on={!simple}
          title={t('regex.expert.title')}
          onChange={(expert) => void patchSettings({ ui: { simpleMode: !expert } })}
        >
          {t('regex.expert')}
        </Switch>
      </div>
      <div className="rx-body ui-scroll">
        {simple && page !== 'library' && (
          <div className="ui-banner ui-banner--info rx-banner rx-p2-banner">
            <Ico name="info" />
            <span>{t('regex.poe2.beta')}</span>
            <span />
          </div>
        )}
        {page === 'library' ? (
          <LibraryPage presets={presets} />
        ) : data === undefined ? (
          <div className="ui-empty">{t('regex.maps.loading')}</div>
        ) : data === null ? (
          <div className="ui-empty">{t('regex.maps.noData', { lang: t(`regex.lang.${lang}`) })}</div>
        ) : page === 'waystone' ? (
          <WaystonePage data={data} other={other} />
        ) : page === 'tablet' ? (
          <TabletPage data={data} other={other} />
        ) : (
          <Poe2VendorPage data={data} />
        )}
      </div>
    </div>
  )
}
