import type { GameLang, GameLangSettings } from '@shared/types'
import { useLang, useT } from '../i18n'
import { useAppStore } from '../store/useAppStore'
import { setGameLangChoice, useGameLangInfo } from '../gameLang'
import { Ico } from '../panels/regex/Ico'

// Строка настроек «Язык клиента игры» (S26) рядом с языком интерфейса: авто / English / Русский, что определено
// и откуда; при ручном выборе, который расходится с игрой, — предупреждение и «Определять по игре».

const LANG_NAME: Record<GameLang, string> = { ru: 'Русский', en: 'English' }

export function GameLangSetting() {
  const t = useT()
  const uiLang = useLang()
  const info = useGameLangInfo(uiLang)
  const key = useAppStore((s) => s.settings?.hotkeys.priceCheck.accel) || 'Control+D'
  const d = info.detected
  const by = d ? t(`glang.by.${d.by}`) : ''
  const note =
    info.choice !== 'auto'
      ? ''
      : d
        ? t('glang.detected', { lang: LANG_NAME[d.lang], by })
        : t('glang.unknown', { lang: LANG_NAME[uiLang], key: key.replace(/Control/g, 'Ctrl') })
  const mismatch = info.choice !== 'auto' && d && d.lang !== info.choice
  return (
    <>
      <div className="setting">
        <label htmlFor="set-game-lang">{t('glang.label')}</label>
        <select
          id="set-game-lang"
          className="lang-select"
          value={info.choice}
          onChange={(e) => void setGameLangChoice(e.target.value as GameLangSettings['choice'])}
        >
          <option value="auto">{t('glang.auto')}</option>
          <option value="en">English</option>
          <option value="ru">Русский</option>
        </select>
      </div>
      {mismatch && (
        <div className="ui-banner" role="status">
          <Ico name="warn" />
          <span>{t('glang.mismatch', { lang: LANG_NAME[d.lang], by })}</span>
          <button type="button" className="ui-btn ui-btn--sm" onClick={() => void setGameLangChoice('auto')}>
            {t('glang.toAuto')}
          </button>
        </div>
      )}
      <div className="hint small muted">{note ? `${note} ${t('glang.note')}` : t('glang.note')}</div>
    </>
  )
}
