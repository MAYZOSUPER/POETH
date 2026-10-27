import { useEffect } from 'react'
import type { RegexLang, RegexPage, RegexPrefs } from '@shared/types'
import { useLang, useT } from '../i18n'
import { useRegexStore } from '../store/useRegexStore'
import { Seg } from './regex/common'
import { MapsPage } from './regex/MapsPage'
import { VendorPage } from './regex/VendorPage'
import { LibraryPage } from './regex/LibraryPage'
import './regex/regex.css'

// Вкладка «Regex» компаньона (PoE1, этап S7): строки для поля поиска игры —
// «Карты», «Торговец», «Библиотека». Язык строки = язык клиента игры (настройка вкладки).

const PAGES: RegexPage[] = ['maps', 'vendor', 'library']

export function RegexTab() {
  const t = useT()
  const uiLang = useLang()
  const ready = useRegexStore((s) => s.ready)
  const init = useRegexStore((s) => s.init)
  const page = useRegexStore((s) => s.prefs.page)
  const gameLang = useRegexStore((s) => s.prefs.gameLang)
  const setPrefs = useRegexStore((s) => s.setPrefs)

  useEffect(() => {
    void init()
  }, [init])

  if (!ready) return <div className="rx-loading">{t('regex.maps.loading')}</div>

  const langOptions: { value: RegexPrefs['gameLang']; label: string }[] = [
    { value: 'auto', label: t('regex.gameLang.auto', { lang: t(`regex.lang.${uiLang}`) }) },
    ...(['ru', 'en'] as RegexLang[]).map((l) => ({ value: l, label: t(`regex.lang.${l}`) }))
  ]

  return (
    <div className="rx">
      <div className="rx-head">
        <Seg
          value={page}
          onChange={(p) => setPrefs({ page: p })}
          options={PAGES.map((p) => ({ value: p, label: t(`regex.page.${p}`) }))}
        />
        <label className="rx-lang" title={t('regex.gameLang.title')}>
          <span className="muted small">{t('regex.gameLang')}</span>
          <select
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
      </div>
      <div className="rx-body">
        {page === 'maps' && <MapsPage />}
        {page === 'vendor' && <VendorPage />}
        {page === 'library' && <LibraryPage />}
      </div>
    </div>
  )
}
