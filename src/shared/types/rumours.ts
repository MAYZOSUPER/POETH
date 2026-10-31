// Типы домена «Слухи журнала» (S65, PoE 2). Данные и логика — src/shared/rumours/**.

import type { RumoursStatus } from '../rumours/load'
import type { RumourRecord } from '../rumours/schema'
import type { RumourMark, RumoursUserState } from '../rumours/marks'
import type { RumourPriceBook } from '../rumours/prices'

export type { RumourMark, RumoursUserState, RumourPriceBook, RumourRecord }

export interface RumoursData {
  /** слухи есть в этой игре (только PoE 2); false — данные не грузили */
  on: boolean
  status: RumoursStatus
  /** патч PoE 2, из которого строки игры */
  patch: string | null
  updatedAt: string | null
  rumours: RumourRecord[]
  /** записей, не прошедших проверку (для строки «скрыто: N») */
  failed: number
}

/**
 * Что показать поверх игры по хоткею:
 *  - show — открыть или закрыть короткий вид;
 *  - read — что дал разбор текста журнала: found — нашли слухи (count), none — предмет скопирован, но строк слухов в
 *    нём нет, null — курсор не над предметом (просто показали выбранные руками).
 */
export interface RumoursOverlayCmd {
  show: boolean
  read: 'found' | 'none' | null
  count: number
}
