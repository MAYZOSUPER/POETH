// Строки домена «цены поверх окон» (S68): подписи цен у ячеек особой вкладки тайника, итог вкладки, тосты.
// Названия предметов на подписях не пишем — только цена (иконка предмета видна в самой игре).

import type { DomainDict } from '../types'

export const screen: DomainDict = {
  ru: {
    'set.hk.screenPrices': 'Цены поверх окон: особая вкладка тайника (одно нажатие — один снимок)',
    'scr.busy': 'Читаю окно игры…',
    'scr.icons': 'Готовлю эталоны иконок: {done} из {total} (только в первый раз)',
    'scr.title': 'Цены поверх окна',
    'scr.win.stash': 'Вкладка тайника',
    'scr.win.grid': 'Окно игры',
    'scr.priced': '{n} из {m} с ценой',
    'scr.src.poe2': 'цена за штуку — биржа GGG и poe.ninja',
    'scr.src.poe1': 'цена за штуку — рынок лиги',
    'scr.legend.rich': 'дороже 1 div',
    'scr.legend.doubt': 'цена неточная',
    'scr.keys': 'ещё раз — убрать',
    'scr.total.tip': 'Сумма «цена × число в стопке» по ячейкам, где число прочитано уверенно. Цена — за штуку, по рынку лиги.',
    'scr.unpriced': 'Без цены: {n} — наведите и нажмите',
    'scr.uncounted': 'Число не прочитано: {n} — эти ячейки не в итоге',
    'scr.uncounted.approx': 'Число не прочитано: {n} — эти ячейки не в итоге, итог может быть больше',
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
    'scr.title': 'On-screen prices',
    'scr.win.stash': 'Stash tab',
    'scr.win.grid': 'Game window',
    'scr.priced': '{n} of {m} priced',
    'scr.src.poe2': 'price per item — GGG exchange and poe.ninja',
    'scr.src.poe1': 'price per item — league market',
    'scr.legend.rich': 'over 1 div',
    'scr.legend.doubt': 'rough price',
    'scr.keys': 'again to hide',
    'scr.total.tip': 'Sum of "price × stack size" over cells where the stack size was read with confidence. Price per item, by the league market.',
    'scr.unpriced': 'No price: {n} — hover and press',
    'scr.uncounted': 'Stack size not read: {n} — left out of the total',
    'scr.uncounted.approx': 'Stack size not read: {n} — left out, the total may be higher',
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
