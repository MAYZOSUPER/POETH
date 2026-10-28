import { useCallback, useEffect, useState } from 'react'
import type { WealthItemNs } from '@shared/types'
import { getDefaultPoe1DataStore, type Poe1Data } from '@shared/poe1/data'

/** Имя предмета на языке интерфейса: английское — как пришло с сайта, русское — по данным APT. */
export function useNameOf(lang: string): (l: { name: string; ns: WealthItemNs }) => string {
  const [data, setData] = useState<Poe1Data | null>(null)
  useEffect(() => {
    if (lang !== 'ru') {
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
  }, [lang])
  return useCallback((l: { name: string; ns: WealthItemNs }) => data?.itemByRef(l.ns, l.name)?.[0]?.name ?? l.name, [data])
}
