import { useEffect, useId, useState } from 'react'
import type { AdvisorItemHit } from '@shared/ipc/advisor'
import type { UiLang } from '@shared/types'
import { useT } from '../../i18n'
import { useGameLang } from '../../gameLang'
import { Currency } from '../../components/Currency'
import { chaosText } from './view'

// Поиск предмета для редактора (S17): по русскому или английскому имени, в подсказке оба имени и цена штуки по
// живым ценам. Ищет main (данные APT + имена фида обмена). Стрелки, Enter — выбрать, Esc — закрыть.

export function ItemPicker({ lang, onPick, label }: { lang: string; onPick: (hit: AdvisorItemHit) => void; label: string }) {
  const t = useT()
  const id = useId()
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<AdvisorItemHit[]>([])
  const [active, setActive] = useState(0)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (q.trim().length < 2) {
      setHits([])
      return
    }
    let alive = true
    const timer = setTimeout(() => {
      void window.overlayApi.advisor.searchItems(q).then((h) => {
        if (!alive) return
        setHits(h)
        setActive(0)
        setOpen(true)
      })
    }, 150)
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [q])

  const pick = (h: AdvisorItemHit): void => {
    onPick(h)
    setQ('')
    setHits([])
    setOpen(false)
  }
  // главное имя — как в игре (S26), второе — на другом языке
  const gameLang = useGameLang(lang === 'en' ? 'en' : 'ru')
  const main = (h: AdvisorItemHit): string => (gameLang === 'ru' && h.ru ? h.ru : h.ref)
  const other = (h: AdvisorItemHit): string => (gameLang === 'ru' ? (h.ru ? h.ref : '') : (h.ru ?? ''))

  return (
    <div className="ad-combo">
      <label className="ui-field">
        <span className="ui-field__label">{label}</span>
        <input
          className="ui-input ui-input--lg"
          role="combobox"
          aria-expanded={open && hits.length > 0}
          aria-controls={id}
          aria-autocomplete="list"
          value={q}
          placeholder={t('advisor.ed.search.ph')}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => hits.length && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') setActive((a) => Math.min(a + 1, hits.length - 1))
            else if (e.key === 'ArrowUp') setActive((a) => Math.max(a - 1, 0))
            else if (e.key === 'Enter' && hits[active]) pick(hits[active])
            else if (e.key === 'Escape') setOpen(false)
            else return
            e.preventDefault()
          }}
        />
      </label>
      {open && q.trim().length >= 2 && (
        <div className="ui-menu ad-combo__menu" role="listbox" id={id}>
          {!hits.length && <div className="ad-combo__none">{t('advisor.ed.search.none')}</div>}
          {hits.map((h, i) => (
            <button
              key={`${h.kind}:${h.ref}`}
              type="button"
              role="option"
              aria-selected={i === active}
              className={`ui-menu__item ad-opt${i === active ? ' is-active' : ''}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(h)}
            >
              <span>{main(h)}</span>
              {other(h) && <small>{other(h)}</small>}
              <span className="ad-opt__price">
                {h.unit === null ? t('advisor.noPrice') : <Currency tag="chaos" text={`~${chaosText(h.unit, lang)}`} lang={lang as UiLang} noTip />}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
