import { useEffect, useMemo, useState } from 'react'
import type { LiveHit, UiLang } from '@shared/types'
import { getDefaultPoe1DataStore } from '@shared/poe1/data'
import { getDefaultPoe2DataStore } from '@shared/poe2/data'
import { hitNameIn, hitNeedsTranslation, type NameData } from '@shared/live/names'
import { hitModsIn, hitModsNeedTranslation } from '@shared/live/mods'
import type { Poe2Data } from '@shared/poe2/data'
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

/**
 * Моды находки PoE 2 на языке клиента (S63): trade2 отдаёт их по-английски — у RU-клиента переводим по статам EE2
 * (@shared/live/mods), строки без перевода — английские. Данные EN и RU грузятся, только если перевод нужен.
 */
export function useHitMods(hit: LiveHit, uiLang: UiLang): string[] {
  const gameLang = useGameLang(uiLang)
  const need = hitModsNeedTranslation(hit, gameLang)
  const [data, setData] = useState<{ en: Poe2Data; ru: Poe2Data } | null>(null)
  useEffect(() => {
    if (!need || data) return
    let alive = true
    const store = getDefaultPoe2DataStore()
    Promise.all([store.ensureLanguage('en'), store.ensureLanguage('ru')])
      .then(([en, ru]) => alive && setData({ en, ru }))
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [need, data])
  // перевод — один раз на находку и язык (тост перерисовывается по таймеру и наведению)
  return useMemo(() => (need && data ? hitModsIn(hit, gameLang, data.en, data.ru) : hit.mods), [hit, gameLang, need, data])
}
