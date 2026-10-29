import { useEffect, useState } from 'react'
import type { LiveHit, UiLang } from '@shared/types'
import { getDefaultPoe1DataStore, type Poe1Data } from '@shared/poe1/data'
import { hitNameIn, hitNeedsTranslation } from '@shared/live/names'
import { useGameLang } from '../../gameLang'

/**
 * Имя находки как в игре (S31) — вкладка Live и тосты оверлея; правило — @shared/live/names. RU-данные APT
 * грузятся, только если сайт и клиент на разных языках (общий кэш хранилища данных — один раз на окно).
 */
export function useHitName(hit: LiveHit, uiLang: UiLang): string {
  const gameLang = useGameLang(uiLang)
  const need = hitNeedsTranslation(hit, gameLang)
  const [ru, setRu] = useState<Poe1Data | null>(null)
  useEffect(() => {
    if (!need || ru) return
    let alive = true
    getDefaultPoe1DataStore()
      .ensureLanguage('ru')
      .then((d) => alive && setRu(d))
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [need, ru])
  return hitNameIn(hit, gameLang, need ? ru : null)
}
