import type { OverlayFocusState } from '@shared/types'

// Кто в фокусе: игра / активированный оверлей. Источник событий — OverlayController
// (focus/blur окна игры, см. windows/gameOverlay.ts); подписчики — гейтинг хоткеев
// (hotkeys.ts), опрос курсора (focus/interactiveAreas.ts), renderer оверлея.
// Чистый модуль без electron — тесты в tests/overlay/gameFocus.test.ts.

interface FocusInternal extends OverlayFocusState {
  /**
   * Нативный модуль следит за окном игры. Если он не загрузился (запасной режим),
   * отследить фокус нельзя — считаем игру «в фокусе», чтобы хоткеи работали как до S1.
   */
  tracking: boolean
}

type Listener = (next: OverlayFocusState, prev: OverlayFocusState) => void

let state: FocusInternal = { game: false, overlay: false, usingHotkey: false, tracking: true }
const listeners = new Set<Listener>()

function publicState(s: FocusInternal): OverlayFocusState {
  return { game: s.game, overlay: s.overlay, usingHotkey: s.usingHotkey }
}

export function getGameFocus(): OverlayFocusState {
  return publicState(state)
}

/** Игра на переднем плане (или фокус не отслеживается — запасной режим). */
export function isGameFocused(): boolean {
  return state.game || !state.tracking
}

/** Оверлей активирован (Shift+Space / клик) и принимает ввод. */
export function isOverlayActive(): boolean {
  return state.overlay
}

export function isFocusTracking(): boolean {
  return state.tracking
}

/** Обновить состояние; подписчики вызываются, только если что-то изменилось. */
export function setGameFocus(patch: Partial<FocusInternal>): void {
  const prev = state
  const next: FocusInternal = { ...state, ...patch }
  // игра снова в фокусе → оверлей уже не активен (как в APT: handlePoeWindowActiveChange)
  if (patch.game === true && patch.overlay === undefined) next.overlay = false
  if (
    next.game === prev.game &&
    next.overlay === prev.overlay &&
    next.usingHotkey === prev.usingHotkey &&
    next.tracking === prev.tracking
  ) {
    return
  }
  state = next
  const pub = publicState(next)
  const pubPrev = publicState(prev)
  for (const cb of [...listeners]) {
    try {
      cb(pub, pubPrev)
    } catch (e) {
      console.error('[gameFocus] listener failed:', e)
    }
  }
}

/** Подписка на смену фокуса; возвращает функцию отписки. */
export function onGameFocusChange(cb: Listener): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}
