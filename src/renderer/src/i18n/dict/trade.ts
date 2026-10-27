// Строки прайс-чека PoE2 (trade2).
// TODO S4: строки прайс-чека PoE1 (оверлей) — сюда или в отдельный dict/pricecheck.ts.

import type { DomainDict } from '../types'

export const trade: DomainDict = {
  ru: {
    'soon.priceCheck':
      'Прайс-чек PoE 1 с модами: наведите курсор на предмет в игре и нажмите {key} — окно цены появится поверх игры. Работает с русским и английским клиентом.',
    'pc.soon': 'Прайс-чек скоро будет здесь…',
    'pc.session.title': 'Авторизация (POESESSID)',
    'pc.session.label': 'POESESSID',
    'pc.session.placeholder': 'вставьте значение cookie POESESSID',
    'pc.session.save': 'Сохранить',
    'pc.session.set': '✓ Сессия задана',
    'pc.session.clear': 'Очистить',
    'pc.session.hint':
      'Откройте pathofexile.com (вход выполнен) → F12 → Application/Хранилище → Cookies → скопируйте значение POESESSID. Хранится зашифрованно на вашем ПК.',
    'pc.league': 'Лига',
    'pc.league.placeholder': 'название лиги',
    'pc.howto': 'Наведите курсор на предмет в игре, нажмите Ctrl+C, затем хоткей {key}.',
    'pc.howto.nokey': 'Наведите курсор на предмет в игре, нажмите Ctrl+C, затем хоткей прайс-чека.',
    'pc.paste.label': 'Или вставьте текст предмета вручную',
    'pc.paste.placeholder': 'вставьте сюда скопированный предмет (Ctrl+V)…',
    'pc.paste.btn': 'Проверить цену',
    'pc.loading': 'Запрашиваю цены…',
    'pc.empty': 'Скопируйте предмет и запустите прайс-чек, чтобы увидеть цены.',
    'pc.status.noSession': 'Не задан POESESSID — укажите его выше, чтобы запрашивать цены.',
    'pc.status.notItem': 'Это не похоже на предмет PoE2. Скопируйте предмет в игре (Ctrl+C).',
    'pc.status.empty': 'Листингов не найдено для «{name}».',
    'pc.status.error': 'Ошибка: {message}',
    'pc.result.min': 'Мин.',
    'pc.result.median': 'Медиана',
    'pc.result.total': 'Всего листингов: {n}',
    'pc.result.listings': 'Листинги',
    'pc.result.open': 'Открыть на сайте торговли',
    'pc.result.anon': 'аноним'
  },
  en: {
    'soon.priceCheck':
      'PoE 1 price check with mods: hover an item in-game and press {key} — the price window pops up over the game. Works with the English and Russian client.',
    'pc.soon': 'Price check is coming here soon…',
    'pc.session.title': 'Authorization (POESESSID)',
    'pc.session.label': 'POESESSID',
    'pc.session.placeholder': 'paste your POESESSID cookie value',
    'pc.session.save': 'Save',
    'pc.session.set': '✓ Session set',
    'pc.session.clear': 'Clear',
    'pc.session.hint':
      'Open pathofexile.com (logged in) → F12 → Application/Storage → Cookies → copy the POESESSID value. Stored encrypted on your PC.',
    'pc.league': 'League',
    'pc.league.placeholder': 'league name',
    'pc.howto': 'Hover an item in-game, press Ctrl+C, then the {key} hotkey.',
    'pc.howto.nokey': 'Hover an item in-game, press Ctrl+C, then the price-check hotkey.',
    'pc.paste.label': 'Or paste item text manually',
    'pc.paste.placeholder': 'paste a copied item here (Ctrl+V)…',
    'pc.paste.btn': 'Check price',
    'pc.loading': 'Fetching prices…',
    'pc.empty': 'Copy an item and run a price-check to see prices.',
    'pc.status.noSession': 'No POESESSID set — add one above to query prices.',
    'pc.status.notItem': "That doesn't look like a PoE2 item. Copy an item in-game (Ctrl+C).",
    'pc.status.empty': 'No listings found for “{name}”.',
    'pc.status.error': 'Error: {message}',
    'pc.result.min': 'Min',
    'pc.result.median': 'Median',
    'pc.result.total': 'Total listings: {n}',
    'pc.result.listings': 'Listings',
    'pc.result.open': 'Open in trade site',
    'pc.result.anon': 'anonymous'
  }
}
