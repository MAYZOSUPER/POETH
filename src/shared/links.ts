// Внешние ссылки приложения и allowlist для window.openExternal.
// ЗАМОРОЖЕН после S0: новые хосты добавляет только лид (каждый хост — осознанное решение).

/** Поддержка проекта. Приложение бесплатное, без платных функций; донат — добровольный. */
export const BOOSTY_URL = 'https://boosty.to/twistedthreadstudios'

/**
 * Релизы на GitHub (репозиторий открыт). Открывает только main — «Скачать новую версию» у
 * portable (S10b); github.com в EXTERNAL_HOSTS для renderer не добавлен.
 */
export const RELEASES_URL = 'https://github.com/MAYZOSUPER/POETH/releases'

/**
 * Манифест пакета данных (обновление данных без переустановки, S10a): ветка data публичного
 * репозитория. Рядом лежат файлы: <game>/<путь> относительно этого адреса.
 */
export const DATA_MANIFEST_URL = 'https://raw.githubusercontent.com/MAYZOSUPER/POETH/data/manifest.json'

/** Хосты, с которых main качает публичные данные (сессия без cookies, только https). */
export const PUBLIC_DATA_HOSTS: readonly string[] = ['raw.githubusercontent.com']

/** Можно ли качать данные с этого адреса: https + хост из PUBLIC_DATA_HOSTS. */
export function isAllowedDataUrl(url: unknown): url is string {
  if (typeof url !== 'string') return false
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' && PUBLIC_DATA_HOSTS.includes(parsed.hostname)
  } catch {
    return false
  }
}

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
