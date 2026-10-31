import { useEffect, useRef, useState } from 'react'
import { GAMES, GAME_IDS, type GameId } from '@shared/games'
import { useAppStore } from '../store/useAppStore'
import { useT } from '../i18n'
import { ShellIcon } from './ShellIcon'
import './gameSwitch.css'

/**
 * Переключатель PoE 1 / PoE 2 в шапке (ui-seg, нажатый сегмент — текущая игра). Смена игры = перезапуск
 * приложения (оверлей цепляется к окну игры один раз), поэтому сначала спрашиваем — панелью под переключателем.
 */
export function GameSwitch() {
  const game = useAppStore((s) => s.settings?.game ?? 'poe1')
  const [pending, setPending] = useState<GameId | null>(null)
  const [busy, setBusy] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const t = useT()

  // клик мимо и Esc — «Отмена»
  useEffect(() => {
    if (!pending || busy) return
    const off = (e: MouseEvent): void => {
      if (!box.current?.contains(e.target as Node)) setPending(null)
    }
    const key = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setPending(null)
    }
    document.addEventListener('mousedown', off)
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('mousedown', off)
      document.removeEventListener('keydown', key)
    }
  }, [pending, busy])

  return (
    <div className="gs" ref={box}>
      <div className="ui-seg" role="group" aria-label={t('game.title')} title={t('game.title')}>
        {GAME_IDS.map((id) => (
          <button
            key={id}
            type="button"
            aria-pressed={id === game}
            onClick={() => setPending(id === game ? null : id)}
          >
            {GAMES[id].label}
          </button>
        ))}
      </div>
      {pending && (
        <div className="gs-pop ui-panel ui-panel--solid" role="dialog" aria-labelledby="gs-pop-title">
          <div className="ui-panel__head">
            <span className="ui-panel__title" id="gs-pop-title">
              {t('game.restart.title', { game: GAMES[pending].label })}
            </span>
          </div>
          <div className="gs-pop__b">
            <p>{t('game.restart.text')}</p>
            <div className="gs-pop__acts">
              <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm" disabled={busy} onClick={() => setPending(null)}>
                {t('game.restart.cancel')}
              </button>
              <button
                type="button"
                className="ui-btn ui-btn--primary ui-btn--sm"
                disabled={busy}
                autoFocus
                onClick={() => {
                  setBusy(true)
                  void window.overlayApi.app.switchGame(pending).finally(() => setBusy(false))
                }}
              >
                <ShellIcon name="refresh" />
                {t('game.restart.ok')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
