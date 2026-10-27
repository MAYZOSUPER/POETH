import { useEffect } from 'react'
import type { RegexLang, RegexPage, RegexPrefs } from '@shared/types'
import { useLang, useT } from '../i18n'
import { useAppStore } from '../store/useAppStore'
import { useRegexStore } from '../store/useRegexStore'
import { Switch, useSimple } from './regex/common'
import { Ico, type IcoName } from './regex/Ico'
import { MapsPage } from './regex/MapsPage'
import { VendorPage } from './regex/VendorPage'
import { LibraryPage } from './regex/LibraryPage'
import './regex/regex.css'

// Вкладка «Regex» компаньона (PoE1, этап S7) по утверждённому макету: подвкладки «Карты»,
// «Торговец», «Библиотека»; справа — язык клиента игры и простой/экспертный режим.

const PAGES: { id: RegexPage; icon: IcoName }[] = [
  { id: 'maps', icon: 'map' },
  { id: 'vendor', icon: 'coins' },
  { id: 'library', icon: 'book' }
]

export function RegexTab() {
  const t = useT()
  const uiLang = useLang()
  const simple = useSimple()
  const patchSettings = useAppStore((s) => s.patchSettings)
  const game = useAppStore((s) => s.settings?.game ?? 'poe1')
  const ready = useRegexStore((s) => s.ready)
  const init = useRegexStore((s) => s.init)
  const page = useRegexStore((s) => s.prefs.page)
  const gameLang = useRegexStore((s) => s.prefs.gameLang)
  const libCount = useRegexStore((s) => s.library?.entries.filter((e) => e.game === game).length ?? 0)
  const setPrefs = useRegexStore((s) => s.setPrefs)

  useEffect(() => {
    void init()
  }, [init])

  if (!ready) return <div className="ui-empty">{t('regex.maps.loading')}</div>

  const langOptions: { value: RegexPrefs['gameLang']; label: string }[] = [
    { value: 'auto', label: t('regex.gameLang.auto', { lang: t(`regex.lang.${uiLang}`) }) },
    ...(['ru', 'en'] as RegexLang[]).map((l) => ({ value: l, label: t(`regex.lang.${l}`) }))
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
            {t(`regex.page.${p.id}`)}
            {p.id === 'library' && libCount > 0 && <span className="ui-count">{libCount}</span>}
          </button>
        ))}
        <span className="rx-grow" />
        <label className="rx-lang" title={t('regex.gameLang.title')}>
          <span>{t('regex.gameLang')}</span>
          <select
            className="ui-select"
            value={gameLang}
            onChange={(e) => setPrefs({ gameLang: e.target.value as RegexPrefs['gameLang'] })}
          >
            {langOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <Switch on={!simple} onChange={(expert) => void patchSettings({ ui: { simpleMode: !expert } })}>
          {t('regex.expert')}
        </Switch>
      </div>
      <div className="rx-body ui-scroll">
        {page === 'maps' && <MapsPage />}
        {page === 'vendor' && <VendorPage />}
        {page === 'library' && <LibraryPage />}
      </div>
    </div>
  )
}
