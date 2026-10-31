import type { IconName } from '../../overlay/Icon'

// «Скоро в PoE 2»: чего из POETH для PoE 1 ещё нет в режиме PoE 2 и когда будет (по состоянию main 9e025ce, 01.11:
// regex, live, сделки, слухи, «Билд», цены поверх окон уже есть). Это данные: статус меняется здесь, без правки
// разметки. Тексты — в i18n/dict/campaign.ts: soon2.<id>.t / soon2.<id>.d.

export type SoonStatus = 'work' | 'plan' | 'after' | 'never'

export interface SoonItem {
  id: string
  icon: IconName
  status: SoonStatus
}

/** Порядок групп на странице; группа без пунктов не показывается. */
export const SOON_GROUPS: readonly SoonStatus[] = ['work', 'plan', 'after', 'never']

export const SOON_POE2: readonly SoonItem[] = [
  // в работе: S69 «Богатство PoE 2» (снимок вкладки и ручной ввод — у GGG нет API тайника PoE 2)
  { id: 'wealth', icon: 'coins', status: 'work' },
  // после 1.0 (11.12)
  { id: 'flip', icon: 'swap', status: 'after' },
  { id: 'advisor', icon: 'map', status: 'after' },
  { id: 'acts', icon: 'compass', status: 'after' }
]
