// Строки домена «цены поверх окон» (S68): подписи цен у ячеек особой вкладки тайника, итог вкладки, тосты.
// Названия предметов на подписях не пишем — только цена (иконка предмета видна в самой игре).

import type { DomainDict } from '../types'

export const screen: DomainDict = {
  ru: {
    'set.hk.screenPrices': 'Цены поверх окон: особая вкладка тайника (одно нажатие — один снимок)',
    'scr.busy': 'Читаю окно игры…',
    'scr.icons': 'Готовлю эталоны иконок: {done} из {total} (только в первый раз)',
    'scr.total': 'Вкладка',
    'scr.total.tip': 'Сумма «цена × число в стопке» по ячейкам, где число прочитано уверенно. Цена — за штуку, по рынку лиги.',
    'scr.approx': 'неуверенно прочитанные числа в итог не вошли — он может быть больше',
    'scr.unpriced': 'без цены: {n}',
    'scr.uncounted': 'число не прочитано: {n}',
    'scr.cells': 'ячеек: {n}',
    'scr.noPrices': 'Ячейки узнаны, но цен для этой игры пока нет.',
    'scr.close': 'Спрятать (повторное нажатие хоткея)',
    'scr.ms': 'за {ms} мс',
    'scr.fail.no-game': 'Окно игры не найдено.',
    'scr.fail.not-found': 'Ячеек не нашёл: откройте особую вкладку тайника (валюта, эссенции…) и нажмите ещё раз.',
    'scr.fail.no-icons': 'Не удалось загрузить иконки предметов (нет сети?). Попробуйте позже.',
    'scr.fail.error': 'Не получилось прочитать окно игры.',
    'scr.fail.unsupported': 'Для этой игры цены поверх окон пока не работают.'
  },
  en: {
    'set.hk.screenPrices': 'Prices over windows: special stash tab (one press — one snapshot)',
    'scr.busy': 'Reading the game window…',
    'scr.icons': 'Preparing item icons: {done} of {total} (first time only)',
    'scr.total': 'Tab',
    'scr.total.tip': 'Sum of "price × stack size" over cells where the stack size was read with confidence. Price per item, by the league market.',
    'scr.approx': 'uncertain stack sizes are left out — the total may be higher',
    'scr.unpriced': 'no price: {n}',
    'scr.uncounted': 'stack size not read: {n}',
    'scr.cells': 'cells: {n}',
    'scr.noPrices': 'Cells recognized, but there are no prices for this game yet.',
    'scr.close': 'Hide (press the hotkey again)',
    'scr.ms': 'in {ms} ms',
    'scr.fail.no-game': 'Game window not found.',
    'scr.fail.not-found': 'No cells found: open a special stash tab (currency, essences…) and press again.',
    'scr.fail.no-icons': 'Could not load item icons (offline?). Try again later.',
    'scr.fail.error': 'Could not read the game window.',
    'scr.fail.unsupported': 'Prices over windows do not work for this game yet.'
  }
}
