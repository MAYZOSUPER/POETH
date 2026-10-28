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

/**
 * Стратегии игроков (S17): страница стратегии на сайте — код после `#` (браузер не отправляет эту часть на
 * сервер, страница раскрывает код сама). Ссылку игрок только копирует; в EXTERNAL_HOSTS хоста нет.
 */
export const STRATEGY_VIEW_URL = 'https://mayzosuper.github.io/POETH/strategies/view'

/**
 * Форма «Предложить стратегию» (GitHub Issue, шаблон .github/ISSUE_TEMPLATE/strategy.yml). Открывает только
 * main отдельной функцией с точным адресом (advisor:submit); github.com для renderer не добавлен.
 */
export const STRATEGY_ISSUE_URL = 'https://github.com/MAYZOSUPER/POETH/issues/new'

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

/**
 * Steam (решение лида, вход через Steam): ссылки страницы входа Steam, кроме самого входа
 * (профиль, магазин, «Не могу войти»), main открывает в системном браузере. Только для
 * переходов из окна сайта; renderer эти хосты открыть не может.
 */
export const STEAM_EXTERNAL_HOSTS: readonly string[] = [
  'steamcommunity.com',
  'store.steampowered.com',
  'help.steampowered.com'
]

/** Переход из окна сайта, который main откроет в системном браузере: allowlist + Steam. */
export function isSiteExternalUrl(url: unknown): url is string {
  if (isAllowedExternalUrl(url)) return true
  try {
    const parsed = new URL(url as string)
    return parsed.protocol === 'https:' && STEAM_EXTERNAL_HOSTS.includes(parsed.hostname)
  } catch {
    return false
  }
}
