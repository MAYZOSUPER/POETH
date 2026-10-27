import { useState } from 'react'
import { GAMES, GAME_IDS, type GameId } from '@shared/games'
import { useAppStore } from '../store/useAppStore'
import { useT } from '../i18n'

/**
 * Переключатель PoE 1 / PoE 2 в шапке. Смена игры = перезапуск приложения
 * (оверлей цепляется к окну игры один раз), поэтому сначала спрашиваем.
 */
export function GameSwitch() {
  const game = useAppStore((s) => s.settings?.game ?? 'poe1')
  const [pending, setPending] = useState<GameId | null>(null)
  const [busy, setBusy] = useState(false)
  const t = useT()

  return (
    <div className="game-switch-wrap">
      <div className="game-switch" title={t('game.title')}>
        {GAME_IDS.map((id) => (
          <button
            key={id}
            className={`game-switch-btn ${id === game ? 'active' : ''}`}
            onClick={() => setPending(id === game ? null : id)}
          >
            {GAMES[id].label}
          </button>
        ))}
      </div>
      {pending && (
        <div className="game-confirm">
          <span>{t('game.restart.ask', { game: GAMES[pending].label })}</span>
          <button
            className="btn small"
            disabled={busy}
            onClick={() => {
              setBusy(true)
              void window.overlayApi.app.switchGame(pending).finally(() => setBusy(false))
            }}
          >
            {t('game.restart.ok')}
          </button>
          <button className="btn small" disabled={busy} onClick={() => setPending(null)}>
            {t('game.restart.cancel')}
          </button>
        </div>
      )}
    </div>
  )
}
