// Строки домена «игровой оверлей» (S1): подсказки оверлея, демо-виджет «текст предмета»,
// причины запрета хоткеев (для экрана настроек: reservedReason → 'overlay.hotkey.reserved.<причина>').

import type { DomainDict } from '../types'

export const overlay: DomainDict = {
  ru: {
    'overlay.hint.active': 'POETH активен — Esc или клик по пустому месту вернёт вас в игру',
    'overlay.item.title': 'Текст предмета',
    'overlay.item.client': 'Клиент {lang}',
    'overlay.item.lines': 'Строк: {n}',
    'overlay.item.close': 'Закрыть',
    'overlay.item.demo': 'Здесь появится прайс-чек. Пока — сырой текст, как его скопировала игра.',
    'overlay.item.keys': '{toggle} — работать с окном · Esc — вернуться в игру',
    'overlay.hotkey.reserved.game':
      'Это сочетание нужно игре или самому POETH (копирование предмета, чат, поиск в стэше) — выберите другое.',
    'overlay.hotkey.reserved.typing':
      'Обычная клавиша помешает печатать в чате игры — добавьте Ctrl или Alt.',
    'overlay.hotkey.reserved.system': 'Это системное сочетание Windows — выберите другое.',
    'overlay.status.admin':
      'Игра запущена от имени администратора — запустите POETH тоже от администратора, иначе Ctrl+D не сработает.'
  },
  en: {
    'overlay.hint.active': 'POETH is active — Esc or a click on empty space returns you to the game',
    'overlay.item.title': 'Item text',
    'overlay.item.client': '{lang} client',
    'overlay.item.lines': 'Lines: {n}',
    'overlay.item.close': 'Close',
    'overlay.item.demo': 'The price check will appear here. For now — the raw text as the game copied it.',
    'overlay.item.keys': '{toggle} — use the window · Esc — back to the game',
    'overlay.hotkey.reserved.game':
      'The game or POETH itself needs this combination (item copy, chat, stash search) — choose another one.',
    'overlay.hotkey.reserved.typing':
      'A plain key would get in the way of typing in the game chat — add Ctrl or Alt.',
    'overlay.hotkey.reserved.system': 'This is a Windows system shortcut — choose another one.',
    'overlay.status.admin':
      'The game is running as administrator — run POETH as administrator too, otherwise Ctrl+D will not work.'
  }
}
