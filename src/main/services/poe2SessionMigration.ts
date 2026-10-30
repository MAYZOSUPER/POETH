import type { AuthStatus, PasteSessionResult, Poe2SessionNotice } from '@shared/types'

// S47: перенос старого POESESSID прайс-чека PoE2 (компас, `secret.json`) во вход аккаунта — один раз при старте.
// Ядро без electron (tests/security/poe2SessionMigration.test.ts); боевые зависимости подставляет ipc/auth.ts.
//
// Почему перенос, а не просто удаление: ключ — тот же cookie POESESSID сайта pathofexile.com (общий для trade и
// trade2), игрок его уже доверил POETH. Он не покидает main: из старого файла (DPAPI) — сразу в partition
// persist:poe-account и зашифрованную копию account-secret.json тем же путём, что и «вставить POESESSID» в
// настройках (auth.pasteSession: формат 32 hex, проверка /my-account, не узнан — убирается). Чужой рабочий вход
// не перебиваем: если в аккаунт уже вошли, старый ключ просто удаляем; если вход сейчас не проверить (нет сети,
// Cloudflare) — ничего не трогаем до следующего запуска. Иначе `secret.json` (и его .bak/.tmp) удаляется в любом
// исходе — второго хранилища ключа на диске не остаётся. Итог показываем игроку один раз
// (вкладка «Прайс-чек» PoE2), пока он не нажмёт «Понятно».

export interface Poe2MigrationDeps {
  /** есть ли файл старого ключа (в т.ч. пустой или битый) */
  hasLegacyFile(): Promise<boolean>
  /** расшифрованный старый ключ или null */
  readLegacy(): Promise<string | null>
  /** удалить файл старого ключа (+ .bak/.tmp) */
  removeLegacy(): Promise<void>
  /** статус входа после первой проверки при старте */
  authStatus(): Promise<AuthStatus>
  /** перенос во вход: как «вставить POESESSID» в настройках */
  pasteSession(value: string): Promise<PasteSessionResult>
  /** запомнить уведомление для игрока */
  saveNotice(notice: Poe2SessionNotice): Promise<void>
}

/** Перенести старый ключ PoE2 во вход аккаунта; null — переносить было нечего (уведомления нет). */
export async function migratePoe2Session(d: Poe2MigrationDeps): Promise<Poe2SessionNotice | null> {
  if (!(await d.hasLegacyFile())) return null
  const value = await d.readLegacy()
  let notice: Poe2SessionNotice | null = null
  const status = value ? await d.authStatus() : null
  // вход сейчас не проверить (нет сети, Cloudflare): в partition может лежать рабочая сессия — не трогаем
  // ничего и пробуем при следующем запуске
  if (status && !status.loggedIn && status.problem) return null
  try {
    if (value && status) {
      if (status.loggedIn) {
        notice = 'already'
      } else {
        const res = await d.pasteSession(value)
        // сайт не узнал ключ (или не тот формат) — pasteSession уже всё убрал; проблема сети/Cloudflare —
        // ключ остаётся во входе, его перепроверит обычная проверка входа
        notice = res.ok || (res.error !== 'not-logged-in' && res.error !== 'invalid-format') ? 'moved' : 'expired'
      }
    }
  } finally {
    // пустой, битый или чужой (DPAPI другого пользователя) файл тоже не держим
    await d.removeLegacy()
  }
  if (notice) await d.saveNotice(notice)
  return notice
}

/** Дождаться конца первой проверки входа (не дольше `timeoutMs`), затем вернуть статус. */
export function settledAuthStatus(
  get: () => AuthStatus,
  on: (cb: (s: AuthStatus) => void) => () => void,
  timeoutMs = 20_000
): Promise<AuthStatus> {
  const now = get()
  if (!now.checking) return Promise.resolve(now)
  return new Promise((resolve) => {
    const done = (s: AuthStatus): void => {
      clearTimeout(timer)
      off()
      resolve(s)
    }
    const off = on((s) => {
      if (!s.checking) done(s)
    })
    const timer = setTimeout(() => done(get()), timeoutMs)
  })
}
