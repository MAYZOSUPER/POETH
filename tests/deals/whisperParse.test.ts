import { describe, expect, it } from 'vitest'
import {
  parseChat,
  parseLogLine,
  parsePrice,
  parseSystemMessage,
  parseTradeMessage,
  splitLogLine,
  type WhisperEvent
} from '@shared/deals/whisperParse'

// Строки в формате настоящего Client.txt PoE1 (ники и вкладки изменены).
const P = '2026/07/26 04:16:22 74519921 cffb0658 [INFO Client 19012] '

function whisper(line: string): WhisperEvent {
  const ev = parseLogLine(line)
  expect(ev?.type).toBe('whisper')
  return ev as WhisperEvent
}

describe('splitLogLine — префикс строки', () => {
  it('дата, время, счётчик, хэш, [INFO Client N]', () => {
    const ll = splitLogLine(P + '@From Buyer: hi')!
    expect(ll.date).toBe('2026/07/26')
    expect(ll.time).toBe('04:16:22')
    expect(ll.uptimeMs).toBe(74519921)
    expect(ll.level).toBe('INFO')
    expect(ll.pid).toBe(19012)
    expect(ll.text).toBe('@From Buyer: hi')
    expect(ll.ts).toBe(new Date(2026, 6, 26, 4, 16, 22).getTime())
  })

  it('строки DEBUG и без хэша, CRLF', () => {
    const a = splitLogLine('2026/08/05 02:31:10 187352031 1186a8a3 [DEBUG Client 44116] Generating level 83\r')!
    expect(a.level).toBe('DEBUG')
    expect(a.text).toBe('Generating level 83')
    const b = splitLogLine('2019/12/16 22:13:41 1218703 [INFO Client 9472] : Trade accepted.')!
    expect(b.pid).toBe(9472)
    expect(b.text).toBe(': Trade accepted.')
  })

  it('незнакомый префикс — текст после первой «] », без времени', () => {
    const ll = splitLogLine('xx [INFO Client 1] @From A: b')!
    expect(ll.ts).toBeNull()
    expect(ll.text).toBe('@From A: b')
    expect(splitLogLine('просто текст')).toBeNull()
  })
})

describe('parseChat — каналы', () => {
  it('EN @From/@To и RU @От кого/@Кому', () => {
    expect(parseChat('@From Buyer: hi')).toMatchObject({ channel: 'whisper.from', clientLang: 'en', player: 'Buyer', body: 'hi' })
    expect(parseChat('@To Seller: hi')).toMatchObject({ channel: 'whisper.to', clientLang: 'en', player: 'Seller' })
    expect(parseChat('@От кого Покупатель: привет')).toMatchObject({
      channel: 'whisper.from',
      clientLang: 'ru',
      player: 'Покупатель',
      body: 'привет'
    })
    expect(parseChat('@Кому Продавец: привет')).toMatchObject({ channel: 'whisper.to', clientLang: 'ru', player: 'Продавец' })
  })

  it('тег гильдии <TAG> отделяется от ника', () => {
    expect(parseChat('@From <GG> Buyer_One: hi')).toMatchObject({ guild: 'GG', player: 'Buyer_One' })
    expect(parseChat('@От кого <Рус Гильд> Ведьма_Ладоги: да')).toMatchObject({ guild: 'Рус Гильд', player: 'Ведьма_Ладоги' })
    expect(parseChat('@From Buyer: hi')?.guild).toBeUndefined()
  })

  it('unicode-ники и двоеточие в тексте сообщения', () => {
    expect(parseChat('@To клозанебудет: 2 chaos: ок?')).toMatchObject({ player: 'клозанебудет', body: '2 chaos: ок?' })
    expect(parseChat('@From ÆthérŁord: ty')).toMatchObject({ player: 'ÆthérŁord' })
  })

  it('общий, торговый, группа, гильдия, система', () => {
    expect(parseChat('#<X> Name: wts')?.channel).toBe('global')
    expect(parseChat('$Name: wtb')?.channel).toBe('trade')
    expect(parseChat('%Name: go')?.channel).toBe('party')
    expect(parseChat('&Name: hi')?.channel).toBe('guild')
    expect(parseChat(': Trade accepted.')).toMatchObject({ channel: 'system', body: 'Trade accepted.' })
    expect(parseChat('Generating level 83 area "X"')).toBeNull()
  })
})

describe('parseTradeMessage — EN', () => {
  it('обычный предмет: цена, лига, вкладка, позиция', () => {
    const t = parseTradeMessage(
      'Hi, I would like to buy your Concentrated Divine Life Flask listed for 2 chaos in Settlers (stash tab "~b/o 2 chaos"; position: left 6, top 5)'
    )!
    expect(t).toEqual({
      kind: 'item',
      lang: 'en',
      item: 'Concentrated Divine Life Flask',
      price: '2 chaos',
      priceValue: { amount: 2, currency: 'chaos' },
      league: 'Settlers',
      tab: '~b/o 2 chaos',
      pos: { left: 6, top: 5 }
    })
  })

  it('камень «level N Q% Name» и сообщение после цены', () => {
    const t = parseTradeMessage(
      'Hi, I would like to buy your level 21 23% Vaal Grace listed for 1.5 divine in Standard (stash tab "Gems"; position: left 11, top 17) can you do 1 div?'
    )!
    expect(t.item).toBe('Vaal Grace')
    expect(t.gem).toEqual({ level: 21, quality: 23 })
    expect(t.priceValue).toEqual({ amount: 1.5, currency: 'divine' })
    expect(t.pos).toEqual({ left: 11, top: 17 })
    expect(t.message).toBe('can you do 1 div?')
  })

  it('пустое имя вкладки', () => {
    const t = parseTradeMessage(
      'Hi, I would like to buy your Tabula Rasa Simple Robe listed for 10 chaos in Standard (stash tab ""; position: left 1, top 1)'
    )!
    expect(t.tab).toBe('')
    expect(t.item).toBe('Tabula Rasa Simple Robe')
  })

  it('лига с « in » и скобками (приватная)', () => {
    const t = parseTradeMessage(
      'Hi, I would like to buy your Headhunter Leather Belt listed for 30 divine in Fun in the Sun (PL12345) (stash tab "1"; position: left 3, top 4)'
    )!
    expect(t.price).toBe('30 divine')
    expect(t.league).toBe('Fun in the Sun (PL12345)')
    expect(t.tab).toBe('1')
  })

  it('без цены и без «Hi, »', () => {
    const t = parseTradeMessage(
      'I would like to buy your Rare Ring in Settlers (stash tab "sale"; position: left 2, top 9)'
    )!
    expect(t).toMatchObject({ kind: 'item', item: 'Rare Ring', price: '', league: 'Settlers', pos: { left: 2, top: 9 } })
    expect(t.priceValue).toBeUndefined()
  })

  it('bulk: количество предмета, цена, приписка после точки', () => {
    const t = parseTradeMessage("Hi, I'd like to buy your 150 Chaos Orb for my 1 Divine Orb in Settlers. ty")!
    expect(t).toMatchObject({
      kind: 'bulk',
      lang: 'en',
      item: 'Chaos Orb',
      itemAmount: 150,
      price: '1 Divine Orb',
      priceValue: { amount: 1, currency: 'Divine Orb' },
      league: 'Settlers',
      message: 'ty'
    })
    expect(t.pos).toBeUndefined()
  })

  it('обычный разговор — не сделка', () => {
    expect(parseTradeMessage('ty')).toBeNull()
    expect(parseTradeMessage('Hi, are you still selling?')).toBeNull()
  })
})

describe('parseTradeMessage — RU', () => {
  it('обычный предмет: «секция», «N столбец, M ряд»', () => {
    const t = parseTradeMessage(
      'Здравствуйте, хочу купить у вас Шаг Бури Двухцветные сапоги за 2 divine в лиге Поселенцы (секция "Продажа"; позиция: 7 столбец, 3 ряд)'
    )!
    expect(t).toEqual({
      kind: 'item',
      lang: 'ru',
      item: 'Шаг Бури Двухцветные сапоги',
      price: '2 divine',
      priceValue: { amount: 2, currency: 'divine' },
      league: 'Поселенцы',
      tab: 'Продажа',
      pos: { left: 7, top: 3 }
    })
  })

  it('камень «уровень N Q%» и сообщение после цены', () => {
    const t = parseTradeMessage(
      'Здравствуйте, хочу купить у вас уровень 20 20% Многократный удар за 15 chaos в лиге Standard (секция "камни"; позиция: 24 столбец, 12 ряд) 10 хаосов?'
    )!
    expect(t.gem).toEqual({ level: 20, quality: 20 })
    expect(t.item).toBe('Многократный удар')
    expect(t.pos).toEqual({ left: 24, top: 12 })
    expect(t.message).toBe('10 хаосов?')
  })

  it('пустая секция и дробная цена через запятую', () => {
    const t = parseTradeMessage(
      'Здравствуйте, хочу купить у вас Кольцо из ничего за 0,5 divine в лиге Поселенцы (секция ""; позиция: 1 столбец, 1 ряд)'
    )!
    expect(t.tab).toBe('')
    expect(t.priceValue).toEqual({ amount: 0.5, currency: 'divine' })
  })

  it('без цены', () => {
    const t = parseTradeMessage(
      'Здравствуйте, хочу купить у вас Редкое кольцо в лиге Поселенцы (секция "1"; позиция: 5 столбец, 6 ряд)'
    )!
    expect(t).toMatchObject({ kind: 'item', lang: 'ru', item: 'Редкое кольцо', price: '', pos: { left: 5, top: 6 } })
  })

  it('bulk RU (тот же зачин, без секции)', () => {
    const t = parseTradeMessage(
      'Здравствуйте, хочу купить у вас 20 Сфера хаоса за 1 Божественная сфера в лиге Поселенцы. Спасибо.'
    )!
    expect(t).toMatchObject({
      kind: 'bulk',
      lang: 'ru',
      item: 'Сфера хаоса',
      itemAmount: 20,
      price: '1 Божественная сфера',
      league: 'Поселенцы',
      message: 'Спасибо.'
    })
  })
})

describe('parseLogLine — строка лога целиком', () => {
  it('входящая EN с гильд-тегом', () => {
    const ev = whisper(
      P +
        '@From <TAG> MarshWitch: Hi, I would like to buy your Storm Stride Two-Toned Boots listed for 2 divine in Settlers (stash tab "Sale"; position: left 7, top 3)'
    )
    expect(ev).toMatchObject({ dir: 'in', player: 'MarshWitch', guild: 'TAG', clientLang: 'en' })
    expect(ev.trade).toMatchObject({ item: 'Storm Stride Two-Toned Boots', lang: 'en', tab: 'Sale' })
    expect(ev.ts).toBe(new Date(2026, 6, 26, 4, 16, 22).getTime())
  })

  it('RU-клиент получает EN-сообщение с www-сайта (язык сделки — по шаблону)', () => {
    const ev = whisper(
      P +
        '@От кого Buyer: Hi, I would like to buy your Ring listed for 1 chaos in Settlers (stash tab "x"; position: left 1, top 2)'
    )
    expect(ev.clientLang).toBe('ru')
    expect(ev.trade?.lang).toBe('en')
  })

  it('исходящая RU и обычный ответ без сделки', () => {
    const out = whisper(
      P + '@Кому Продавец_1: Здравствуйте, хочу купить у вас Пояс за 3 chaos в лиге Поселенцы (секция "a"; позиция: 2 столбец, 2 ряд)'
    )
    expect(out.dir).toBe('out')
    expect(out.trade?.lang).toBe('ru')
    const chat = whisper(P + '@From Slaveress: ty')
    expect(chat.trade).toBeNull()
    expect(chat.body).toBe('ty')
  })

  it('системные строки и мусор', () => {
    expect(parseLogLine(P + ': Trade accepted.')).toMatchObject({ type: 'system', event: { kind: 'tradeAccepted', lang: 'en' } })
    expect(parseLogLine(P + ': You have entered Celestial Hideout.')).toBeNull()
    expect(parseLogLine(P + '#Name: wts')).toBeNull()
    expect(parseLogLine('')).toBeNull()
  })
})

describe('parseSystemMessage', () => {
  it('EN: вошёл/вышел из области, обмен, AFK/DND', () => {
    expect(parseSystemMessage('Slaveress has joined the area.')).toEqual({ kind: 'joined', player: 'Slaveress', lang: 'en' })
    expect(parseSystemMessage('Some_Body has left the area.')).toEqual({ kind: 'left', player: 'Some_Body', lang: 'en' })
    expect(parseSystemMessage('Trade accepted.')).toEqual({ kind: 'tradeAccepted', lang: 'en' })
    expect(parseSystemMessage('Trade cancelled.')).toEqual({ kind: 'tradeCancelled', lang: 'en' })
    expect(parseSystemMessage('AFK mode is now ON. Autoreply "brb"')).toEqual({ kind: 'afk', on: true, lang: 'en' })
    expect(parseSystemMessage('AFK mode is now OFF.')).toEqual({ kind: 'afk', on: false, lang: 'en' })
    expect(parseSystemMessage('DND mode is now ON. Autoreply "busy"')).toEqual({ kind: 'dnd', on: true, lang: 'en' })
  })

  it('RU: присоединился / покинул область / режим «отошёл»', () => {
    expect(parseSystemMessage('Ведьма_Ладоги присоединился.')).toEqual({ kind: 'joined', player: 'Ведьма_Ладоги', lang: 'ru' })
    expect(parseSystemMessage('Ведьма_Ладоги покинул область.')).toEqual({ kind: 'left', player: 'Ведьма_Ладоги', lang: 'ru' })
    expect(parseSystemMessage('Режим "отошёл" включён. Автоответ: "щас"')).toEqual({ kind: 'afk', on: true, lang: 'ru' })
    expect(parseSystemMessage('Режим "отошел" выключен.')).toEqual({ kind: 'afk', on: false, lang: 'ru' })
  })

  it('прочее — null', () => {
    expect(parseSystemMessage('You have entered Highgate.')).toBeNull()
    expect(parseSystemMessage('X has been slain.')).toBeNull()
  })
})

describe('parsePrice', () => {
  it('число и валюта', () => {
    expect(parsePrice('5 chaos')).toEqual({ amount: 5, currency: 'chaos' })
    expect(parsePrice('1,25 divine')).toEqual({ amount: 1.25, currency: 'divine' })
    expect(parsePrice('Divine Orb')).toBeUndefined()
  })
})
