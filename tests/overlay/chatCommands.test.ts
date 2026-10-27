import { describe, expect, it } from 'vitest'
import {
  CHAT_PRESETS,
  ChatLogContext,
  MAX_CHAT_COMMANDS,
  MAX_CHAT_TEXT,
  chatHotkeyId,
  chatPlaceholders,
  defaultChatCommands,
  findHotkeyConflict,
  newChatCommandId,
  normalizeChatCommands,
  resolveChatText
} from '@shared/chatCommands'
import { defaultHotkeys } from '@shared/settings'
import { isReservedAccelerator } from '@shared/accelerators'

const P = '2026/10/28 21:40:00 123456 abcd [INFO Client 4242]'

describe('пресеты команд чата', () => {
  it('F5 → /hideout с отправкой; у остальных хоткея нет', () => {
    const hideout = CHAT_PRESETS.find((c) => c.id === 'hideout')!
    expect(hideout).toEqual({ id: 'hideout', text: '/hideout', hotkey: 'F5', send: true, enabled: true })
    for (const c of CHAT_PRESETS.filter((x) => x.id !== 'hideout')) expect(c.hotkey, c.id).toBe('')
  })

  it('набор команд, id уникальны, тексты — команды или whisper', () => {
    expect(CHAT_PRESETS.map((c) => c.text)).toEqual([
      '/hideout',
      '/exit',
      '@last ty',
      '/invite @last',
      '/tradewith @last',
      '/hideout @last',
      '/leave',
      '/remaining',
      '/menagerie',
      '/delve',
      '/afk',
      '/dnd'
    ])
    expect(new Set(CHAT_PRESETS.map((c) => c.id)).size).toBe(CHAT_PRESETS.length)
    for (const c of CHAT_PRESETS) expect(c.text).toMatch(/^[/@]/)
  })

  it('пресеты не занимают зарезервированных сочетаний и проходят нормализацию без изменений', () => {
    for (const c of CHAT_PRESETS) if (c.hotkey) expect(isReservedAccelerator(c.hotkey)).toBe(false)
    expect(normalizeChatCommands(defaultChatCommands())).toEqual(CHAT_PRESETS)
  })

  it('defaultChatCommands — копия (правка не портит пресеты)', () => {
    const d = defaultChatCommands()
    d[0].text = '/exit'
    expect(CHAT_PRESETS[0].text).toBe('/hideout')
  })
})

describe('normalizeChatCommands', () => {
  it('не массив — null (тогда пресеты), пустой массив остаётся пустым', () => {
    expect(normalizeChatCommands(undefined)).toBeNull()
    expect(normalizeChatCommands({})).toBeNull()
    expect(normalizeChatCommands('x')).toBeNull()
    expect(normalizeChatCommands([])).toEqual([])
  })

  it('мусор отбрасывается, поля чинятся', () => {
    const out = normalizeChatCommands([
      null,
      'text',
      [],
      { text: '' },
      { text: '   ' },
      { id: 'a b!', text: '  /hideout\r\n', hotkey: 'f6', send: 'yes', enabled: 0 },
      { id: 'x', text: '/afk', hotkey: 'Control+Bogus' },
      { id: 'x', text: '/dnd', hotkey: 'shift+f1', send: false, enabled: false }
    ])
    expect(out).toEqual([
      { id: 'custom-1', text: '/hideout', hotkey: 'F6', send: true, enabled: true },
      { id: 'x', text: '/afk', hotkey: '', send: true, enabled: true },
      { id: 'custom-2', text: '/dnd', hotkey: 'Shift+F1', send: false, enabled: false }
    ])
  })

  it('длина текста и число команд ограничены', () => {
    const long = normalizeChatCommands([{ id: 'l', text: '/' + 'a'.repeat(400) }])!
    expect(long[0].text).toHaveLength(MAX_CHAT_TEXT)
    const many = normalizeChatCommands(Array.from({ length: 100 }, (_, i) => ({ id: `c${i}`, text: `/c${i}` })))!
    expect(many).toHaveLength(MAX_CHAT_COMMANDS)
  })

  it('newChatCommandId — первый свободный', () => {
    expect(newChatCommandId(['custom-1', 'custom-3'])).toBe('custom-2')
    expect(newChatCommandId([])).toBe('custom-1')
  })
})

describe('подстановки @last и <char>', () => {
  const ctx = { lastWhisperFrom: 'TraderJoe', character: 'MyWitch' }

  it('@last в начале — whisper, в остальных местах — ник', () => {
    expect(resolveChatText('@last ty', ctx)).toEqual({ ok: true, text: '@TraderJoe ty' })
    expect(resolveChatText('/invite @last', ctx)).toEqual({ ok: true, text: '/invite TraderJoe' })
    expect(resolveChatText('/tradewith @last', ctx)).toEqual({ ok: true, text: '/tradewith TraderJoe' })
    expect(resolveChatText('/hideout @last', ctx)).toEqual({ ok: true, text: '/hideout TraderJoe' })
  })

  it('<char> — ваш персонаж', () => {
    expect(resolveChatText('/kick <char>', ctx)).toEqual({ ok: true, text: '/kick MyWitch' })
  })

  it('без подстановок — текст как есть', () => {
    expect(resolveChatText('/hideout', { lastWhisperFrom: null, character: null })).toEqual({ ok: true, text: '/hideout' })
  })

  it('неизвестный @last / <char> — отказ, команда не отправляется', () => {
    expect(resolveChatText('/invite @last', { lastWhisperFrom: null, character: 'Me' })).toEqual({ ok: false, missing: 'last' })
    expect(resolveChatText('/kick <char>', { lastWhisperFrom: 'X', character: null })).toEqual({ ok: false, missing: 'char' })
  })

  it('ник «Last» не превращается в новую подстановку; @lastname — не подстановка', () => {
    expect(resolveChatText('@last ty', { lastWhisperFrom: 'Last', character: null })).toEqual({ ok: true, text: '@Last ty' })
    expect(chatPlaceholders('@lastname hi')).toEqual({ last: false, char: false })
    expect(chatPlaceholders('/invite @LAST')).toEqual({ last: true, char: false })
  })
})

describe('ChatLogContext — контекст из Client.txt', () => {
  it('последний входящий whisper (EN и RU, с гильдией), исходящие не в счёт', () => {
    const c = new ChatLogContext()
    c.feed([`${P} @From <GLD> Buyer_One: Hi, I would like to buy your Chaos Orb`])
    expect(c.lastWhisperFrom).toBe('Buyer_One')
    c.feed([`${P} @To SomeoneElse: sold, sorry`])
    expect(c.lastWhisperFrom).toBe('Buyer_One')
    c.feed([`${P} @От кого Покупатель: Здравствуйте, хочу купить`])
    expect(c.lastWhisperFrom).toBe('Покупатель')
  })

  it('свой персонаж — по повышению уровня; прочее не мешает', () => {
    const c = new ChatLogContext()
    c.feed([
      `${P} : You have entered Lioneye's Watch.`,
      `${P} #Global: hello`,
      `${P} : MyWitch (Witch) is now level 42`,
      `${P} : Hero has been slain.`
    ])
    expect(c.character).toBe('MyWitch')
    c.feed([`${P} : Alt_Char (Spirit Walker) is now level 2`])
    expect(c.character).toBe('Alt_Char')
    c.reset()
    expect(c).toMatchObject({ lastWhisperFrom: null, character: null })
  })
})

describe('конфликты хоткеев', () => {
  const current = () => ({ hotkeys: defaultHotkeys(), chatCommands: defaultChatCommands() })

  it('занятые игрой и системой — reserved', () => {
    expect(findHotkeyConflict('Control+C', current())).toEqual({ kind: 'reserved', reason: 'game' })
    expect(findHotkeyConflict('Enter', current())).toEqual({ kind: 'reserved', reason: 'game' })
    expect(findHotkeyConflict('Shift+A', current())).toEqual({ kind: 'reserved', reason: 'typing' })
    expect(findHotkeyConflict('Alt+F4', current())).toEqual({ kind: 'reserved', reason: 'system' })
  })

  it('повтор обычного хоткея или другой команды', () => {
    expect(findHotkeyConflict('control+d', current(), { chatId: 'exit' })).toEqual({ kind: 'action', action: 'priceCheck' })
    expect(findHotkeyConflict('F5', current(), { chatId: 'exit' })).toEqual({ kind: 'chat', id: 'hideout' })
    expect(findHotkeyConflict('F5', current(), { action: 'whisperLastHit' })).toEqual({ kind: 'chat', id: 'hideout' })
  })

  it('с самим собой — не конфликт; свободное сочетание — можно', () => {
    expect(findHotkeyConflict('F5', current(), { chatId: 'hideout' })).toBeNull()
    expect(findHotkeyConflict('Control+D', current(), { action: 'priceCheck' })).toBeNull()
    expect(findHotkeyConflict('F9', current())).toBeNull()
  })

  it('id хоткея команды', () => {
    expect(chatHotkeyId('hideout')).toBe('chat:hideout')
  })
})
