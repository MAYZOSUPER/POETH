import { useEffect, useState } from 'react'
import type { LiveHit, UiLang } from '@shared/types'
import { getDefaultPoe1DataStore } from '@shared/poe1/data'
import { getDefaultPoe2DataStore } from '@shared/poe2/data'
import { hitNameIn, hitNeedsTranslation, type NameData } from '@shared/live/names'
import { useGameLang } from '../../gameLang'

/**
 * Имя находки как в игре (S31) — вкладка Live и тосты оверлея; правило — @shared/live/names. RU-данные APT
 * грузятся, только если сайт и клиент на разных языках (общий кэш хранилища данных — один раз на окно).
 * S63: находка PoE 2 (hit.game) — по RU-данным EE2 (сайт trade2 для PoE 2 — www, имена английские).
 */
export function useHitName(hit: LiveHit, uiLang: UiLang): string {
  const gameLang = useGameLang(uiLang)
  const need = hitNeedsTranslation(hit, gameLang)
  const poe2 = hit.game === 'poe2'
  const [ru, setRu] = useState<{ poe2: boolean; data: NameData } | null>(null)
  const ready = ru && ru.poe2 === poe2 ? ru.data : null
  useEffect(() => {
    if (!need || ready) return
    let alive = true
    const load: Promise<NameData> = poe2
      ? getDefaultPoe2DataStore().ensureLanguage('ru')
      : getDefaultPoe1DataStore().ensureLanguage('ru')
    load.then((data) => alive && setRu({ poe2, data })).catch(() => undefined)
    return () => {
      alive = false
    }
  }, [need, ready, poe2])
  return hitNameIn(hit, gameLang, need ? ready : null)
}
