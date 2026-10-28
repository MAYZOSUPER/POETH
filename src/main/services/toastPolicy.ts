// Когда POETH показывает уведомления Windows (тосты) — чистая функция, tests/notify/toastPolicy.test.ts.
// Electron 40 при первом тосте (и уже при Notification.isSupported) ставит в «Пуск» ярлык «<ProductName
// exe>.lnk» и COM-ключ активатора в реестр пользователя (windows_toast_activator.cc) — поэтому:
//  - установленная версия — да (ярлык «POE Trade Helper» совпадает с ярлыком установщика);
//  - portable — нет: ярлык вёл бы на распакованную копию во %TEMP%;
//  - dev (electron.exe из worktree) — нет: тосты всплывали у игрока «от Electron», а ярлык «Electron.lnk»
//    вёл на worktree; включить явно — POETH_DEV_TOASTS=1 (для автопроверки самих тостов);
//  - POETH_NO_WINDOWS_TOASTS=1 — нет всегда (автопроверки упакованной сборки).
// Без тоста сообщение остаётся поверх игры (оверлей) и в логе.

export interface ToastPolicyInput {
  /** app.isPackaged */
  packaged: boolean
  /** запущен portable-exe (PORTABLE_EXECUTABLE_FILE) */
  portable: boolean
  env: Record<string, string | undefined>
}

export function windowsToastsPolicy({ packaged, portable, env }: ToastPolicyInput): boolean {
  if (env.POETH_NO_WINDOWS_TOASTS === '1') return false
  if (portable) return false
  if (!packaged) return env.POETH_DEV_TOASTS === '1'
  return true
}
