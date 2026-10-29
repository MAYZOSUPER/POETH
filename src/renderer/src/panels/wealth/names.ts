import { useCallback, useEffect, useState } from 'react'
import type { WealthItemNs } from '@shared/types'
import { getDefaultPoe1DataStore, type Poe1Data } from '@shared/poe1/data'
import { useGameLang } from '../../gameLang'

/**
 * Имя предмета на языке клиента игры (S26, как в игре; lang — язык интерфейса, пока язык игры не известен):
 * английское — как пришло с сайта, русское — по данным APT.
 */
export function useNameOf(lang: string): (l: { name: string; ns: WealthItemNs }) => string {
  const gameLang = useGameLang(lang === 'en' ? 'en' : 'ru')
  const [data, setData] = useState<Poe1Data | null>(null)
  useEffect(() => {
    if (gameLang !== 'ru') {
      setData(null)
      return
    }
    let alive = true
    getDefaultPoe1DataStore()
      .ensureLanguage('ru')
      .then((d) => alive && setData(d))
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [gameLang])
  return useCallback((l: { name: string; ns: WealthItemNs }) => data?.itemByRef(l.ns, l.name)?.[0]?.name ?? l.name, [data])
}
