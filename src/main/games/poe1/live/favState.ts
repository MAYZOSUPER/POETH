// Состояние live-поиска для молнии в избранном трейд-окна (S5). Чистый модуль
// (тесты — tests/live/favState.test.ts). Контракт адаптера — FavLiveAdapter в src/main/ipc/fav.ts (S5).

import type { LiveConnKind } from '@shared/types'

/** Состояние молнии: как в FavLiveState S5 + 'auth' («нужен вход»). */
export type FavLiveStateS6 = 'off' | 'connecting' | 'on' | 'paused' | 'error' | 'auth'

export function favLiveState(kind: LiveConnKind, masterOn: boolean): FavLiveStateS6 {
  if (!masterOn) return 'off'
  switch (kind) {
    case 'idle':
      return 'off'
    case 'connecting':
    case 'backoff':
      return 'connecting'
    case 'open':
      return 'on'
    case 'ratelimited':
      return 'paused'
    case 'auth':
      return 'auth'
    case 'invalid':
      return 'error'
  }
}
