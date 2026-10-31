import { useCallback, useEffect, useState } from 'react'
import type { UiLang } from '@shared/types'
import { getDefaultPoe2DataStore, type Poe2Data } from '@shared/poe2/data'
import { useGameLang } from '../../../gameLang'

// Имена и иконки предметов «Богатства PoE 2» (S70): строки снимка — английские имена (ключ цен), игроку — как в
// игре на языке клиента (данные EE2 RU/EN, S26) и с иконкой web.poecdn.com (кэш main, poeth://icon). Данные PoE 2 —
// общий кэш хранилища на окно (тот же, что у live и «по-английски»).

export interface Poe2ItemView {
  /** имя на языке клиента игры; нет в данных — как пришло (имя редкого предмета, новое имя лиги) */
  name: string
  icon?: string
}

type Ns = 'ITEM' | 'UNIQUE' | 'GEM'
const ORDER: Record<Ns, Ns[]> = { ITEM: ['ITEM', 'GEM', 'UNIQUE'], UNIQUE: ['UNIQUE', 'ITEM'], GEM: ['GEM', 'ITEM'] }

export function usePoe2Item(uiLang: UiLang): (name: string, ns?: Ns) => Poe2ItemView {
  const lang = useGameLang(uiLang)
  const [data, setData] = useState<Poe2Data | null>(null)
  useEffect(() => {
    let alive = true
    getDefaultPoe2DataStore()
      .ensureLanguage(lang)
      .then((d) => alive && setData(d))
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [lang])
  return useCallback(
    (name: string, ns: Ns = 'ITEM') => {
      for (const n of ORDER[ns]) {
        const it = data?.itemByRef(n, name)?.[0]
        if (it) return { name: it.name, icon: it.icon }
      }
      return { name }
    },
    [data]
  )
}
