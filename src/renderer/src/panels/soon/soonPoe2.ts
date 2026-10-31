import type { IconName } from '../../overlay/Icon'

// «Скоро в PoE 2»: что есть в POETH для PoE 1 и когда будет для PoE 2 — статусы по §8.4 отчёта ресерчера (31.10).
// Это данные: статус меняется здесь, без правки разметки. Тексты — в i18n/dict/campaign.ts: soon2.<id>.t / soon2.<id>.d.

export type SoonStatus = 'work' | 'plan' | 'after' | 'never'

export interface SoonItem {
  id: string
  icon: IconName
  status: SoonStatus
}

/** Порядок групп на странице. */
export const SOON_GROUPS: readonly SoonStatus[] = ['work', 'plan', 'after', 'never']

export const SOON_POE2: readonly SoonItem[] = [
  // в работе — быстрые пункты до показа 7.11 (Б1–Б6)
  { id: 'exchange', icon: 'swap', status: 'work' },
  { id: 'filter', icon: 'shield', status: 'work' },
  { id: 'xp', icon: 'chart', status: 'work' },
  { id: 'selling', icon: 'coins', status: 'work' },
  { id: 'sites', icon: 'external', status: 'work' },
  { id: 'guide', icon: 'book', status: 'work' },
  // в планах — до 1.0 (11.12): С1, С3, С4, С2
  { id: 'regex', icon: 'search', status: 'plan' },
  { id: 'build', icon: 'export', status: 'plan' },
  { id: 'rumours', icon: 'expedition', status: 'plan' },
  { id: 'instill', icon: 'gem', status: 'plan' },
  // после 1.0: С5, С6, С7, К1, К6
  { id: 'live', icon: 'bolt', status: 'after' },
  { id: 'deals', icon: 'trade', status: 'after' },
  { id: 'itemEn', icon: 'copy', status: 'after' },
  { id: 'buildTab', icon: 'passive', status: 'after' },
  { id: 'acts', icon: 'compass', status: 'after' },
  // не будет: у GGG нет API тайника PoE 2
  { id: 'wealth', icon: 'coins', status: 'never' }
]
