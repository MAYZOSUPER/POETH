// Строки домена «понятная валюта» (S18): подсказка при наведении на валюту и курс, изменение курса словами.
// Названия валют — не здесь: они из данных APT на языке клиента игры (src/shared/currency, S26), кроме золота.

import type { DomainDict } from '../types'

export const currency: DomainDict = {
  ru: {
    'cur.tip.chaos': 'Основная «мелкая» валюта игры: ей платят за большинство недорогих вещей, в ней удобно считать цены.',
    'cur.tip.divine': 'Крупная валюта: дорогие вещи обычно продают в divine. Сколько это в хаосах — показывает курс.',
    'cur.tip.exalted': 'Валюта для крафта; цены в ней редки — сверяйте их с хаосами по курсу рынка.',
    'cur.tip.mirror': 'Самая дорогая валюта игры: создаёт копию предмета.',
    'cur.tip.gold':
      'Игровое золото. Им платят комиссию: за покупку у торговца (мгновенный выкуп) и за обмен у Фаустуса. В цену предмета не входит.',
    'cur.tip.other': 'Валюта игры. Чтобы понять, дорого ли это, сравните с хаосами по курсу рынка.',
    'cur.slang': 'Как говорят в чате и на трейде: {words}.',
    'cur.slang.chaos': '«хаос», «хаосы», «c»',
    'cur.slang.divine': '«дивайн», «див», «div»',
    'cur.slang.exalted': '«экз», «ex»',
    'cur.slang.mirror': '«зеркало», «mirror»',
    'cur.client': 'В английском клиенте игры — {name}.',
    'cur.client.ru': 'В русском клиенте игры — {name}.',
    'cur.rate.what': 'Курс — сколько {chaos} дают за 1 {divine}.',
    'cur.rate.why': 'По нему сравнивают цены в div и в c: например, {div} div ≈ {chaos} c.',
    'cur.rate.now': 'Сейчас: 1 {divine} = {n} {chaos}.',
    'cur.delta.up.m': '{name} подорожал на {amount} {period}',
    'cur.delta.up.f': '{name} подорожала на {amount} {period}',
    'cur.delta.up.n': '{name} подорожало на {amount} {period}',
    'cur.delta.down.m': '{name} подешевел на {amount} {period}',
    'cur.delta.down.f': '{name} подешевела на {amount} {period}',
    'cur.delta.down.n': '{name} подешевело на {amount} {period}',
    'cur.delta.flat': 'Курс почти не изменился {period}'
  },
  en: {
    'cur.tip.chaos': 'The everyday currency: most cheap items are priced in it, and it is handy for comparing prices.',
    'cur.tip.divine': 'The big currency: expensive items are usually sold for divines. The rate shows what one is worth in chaos.',
    'cur.tip.exalted': 'A crafting currency; prices in it are rare, so compare them with chaos at the market rate.',
    'cur.tip.mirror': 'The most expensive currency in the game: it creates a copy of an item.',
    'cur.tip.gold': 'In-game gold. It pays the fees: buying from a merchant (instant buyout) and trading at Faustus. It is not part of the item price.',
    'cur.tip.other': 'An in-game currency. To see whether it is a lot, compare it with chaos at the market rate.',
    'cur.slang': 'What players call it in chat and on trade: {words}.',
    'cur.slang.chaos': '"chaos", "c"',
    'cur.slang.divine': '"div", "divine"',
    'cur.slang.exalted': '"ex", "exalt"',
    'cur.slang.mirror': '"mirror", "mirr"',
    'cur.client': 'In the English game client: {name}.',
    'cur.client.ru': 'In the Russian game client: {name}.',
    'cur.rate.what': 'The rate is how many {chaos} you get for 1 {divine}.',
    'cur.rate.why': 'Use it to compare prices in div and in c: for example, {div} div ≈ {chaos} c.',
    'cur.rate.now': 'Now: 1 {divine} = {n} {chaos}.',
    'cur.delta.up.m': '{name} went up by {amount} {period}',
    'cur.delta.up.f': '{name} went up by {amount} {period}',
    'cur.delta.up.n': '{name} went up by {amount} {period}',
    'cur.delta.down.m': '{name} went down by {amount} {period}',
    'cur.delta.down.f': '{name} went down by {amount} {period}',
    'cur.delta.down.n': '{name} went down by {amount} {period}',
    'cur.delta.flat': 'The rate barely changed {period}'
  }
}
