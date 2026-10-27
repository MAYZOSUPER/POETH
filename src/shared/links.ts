// Внешние ссылки приложения и allowlist для window.openExternal.
// ЗАМОРОЖЕН после S0: новые хосты добавляет только лид (каждый хост — осознанное решение).

/** Поддержка проекта. Приложение бесплатное, без платных функций; донат — добровольный. */
export const BOOSTY_URL = 'https://boosty.to/twistedthreadstudios'

// Ссылку на репозиторий/issues в интерфейс не выводим: MAYZOSUPER/POETH пока приватный.
// Когда станет публичным — добавить сюда REPO_URL/ISSUES_URL и хост github.com в allowlist.

/** Хосты, которые renderer может открыть в системном браузере (только https). */
export const EXTERNAL_HOSTS: readonly string[] = [
  'www.pathofexile.com',
  'ru.pathofexile.com',
  'pathofexile.com',
  'boosty.to'
]

/** Можно ли открыть ссылку во внешнем браузере: https + хост из allowlist. */
export function isAllowedExternalUrl(url: unknown): url is string {
  if (typeof url !== 'string') return false
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' && EXTERNAL_HOSTS.includes(parsed.hostname)
  } catch {
    return false
  }
}
