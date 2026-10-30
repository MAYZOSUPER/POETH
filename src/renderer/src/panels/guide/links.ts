import type { AppTab, RegexPage } from '@shared/types'

// Куда ведёт блок «app» статьи (S55; tests/guide/links.test.ts). Цель — строка из данных: вкладка («priceCheck»),
// страница Regex («regex/vendor»), другая статья («guide/league-start») или настройки («settings»).
// Вкладки нет в этой игре или версии (советник и «Билд» скрыты в релизе), неизвестная цель — null: блок не показываем.

export type AppTarget =
  | { kind: 'tab'; tab: AppTab; regexPage?: RegexPage }
  | { kind: 'article'; id: string }
  | { kind: 'settings' }

const REGEX_PAGES: readonly RegexPage[] = ['maps', 'vendor', 'items', 'library']

export function resolveAppLink(to: string, tabs: readonly AppTab[], articleIds: readonly string[]): AppTarget | null {
  const [head, sub, ...rest] = to.split('/')
  if (rest.length > 0) return null
  if (head === 'settings') return sub === undefined ? { kind: 'settings' } : null
  if (head === 'guide') return sub !== undefined && articleIds.includes(sub) ? { kind: 'article', id: sub } : null
  const tab = tabs.find((t) => t === head)
  if (!tab) return null
  if (sub === undefined) return { kind: 'tab', tab }
  if (tab === 'regex' && REGEX_PAGES.includes(sub as RegexPage)) return { kind: 'tab', tab, regexPage: sub as RegexPage }
  return null
}
