import { describe, expect, it } from 'vitest'
import type { Deal } from '@shared/types'
import { CARD_ACTIONS, chatCommand, renderTemplate, replyLang } from '@shared/deals/commands'
import { applyDealsConfigPatch, defaultDealsConfig } from '@shared/deals/history'

const base: Deal = {
  id: '1',
  dir: 'in',
  player: 'Ведьма_Ладоги',
  item: 'Петля Рока',
  price: '2 divine',
  league: 'Поселенцы',
  bulk: false,
  lang: 'ru',
  ts: 0,
  status: 'new'
}

describe('chatCommand — одна команда на кнопку', () => {
  const cfg = defaultDealsConfig()
  it('слэш-команды одинаковы для RU и EN', () => {
    expect(chatCommand('invite', base, cfg)).toBe('/invite Ведьма_Ладоги')
    expect(chatCommand('trade', base, cfg)).toBe('/tradewith Ведьма_Ладоги')
    expect(chatCommand('kick', base, cfg)).toBe('/kick Ведьма_Ладоги')
    expect(chatCommand('whois', base, cfg)).toBe('/whois Ведьма_Ладоги')
    expect(chatCommand('hideout', { ...base, lang: 'en' }, cfg)).toBe('/hideout Ведьма_Ладоги')
    // «Выйти из группы» — без ника
    expect(chatCommand('leave', { ...base, dir: 'out' }, cfg)).toBe('/leave')
  })

  it('ответы — на языке сообщения собеседника', () => {
    expect(chatCommand('thanks', base, cfg)).toBe('@Ведьма_Ладоги Спасибо за сделку, удачи!')
    expect(chatCommand('sold', { ...base, lang: 'en', item: 'Doom Loop' }, cfg)).toBe('@Ведьма_Ладоги Sorry, Doom Loop is already sold.')
    expect(chatCommand('still', base, cfg)).toBe('@Ведьма_Ладоги Здравствуйте! Ещё продаёте Петля Рока за 2 divine?')
    expect(chatCommand('sold', base, cfg)).toBe('@Ведьма_Ладоги Извините, уже продано: Петля Рока.')
  })

  it('язык ответа из настройки', () => {
    const en = applyDealsConfigPatch(cfg, { replyLang: 'en' })
    expect(replyLang(base, en)).toBe('en')
    expect(chatCommand('wait', base, en)).toBe('@Ведьма_Ладоги One minute please, I will invite you soon.')
  })

  it('свои шаблоны', () => {
    const c = applyDealsConfigPatch(cfg, { templates: { ru: { thanks: 'спс, {player}!' } } })
    expect(chatCommand('thanks', base, c)).toBe('@Ведьма_Ладоги спс, Ведьма_Ладоги!')
  })

  it('кнопки карточек по макету', () => {
    expect(CARD_ACTIONS.in.slice(0, 5)).toEqual(['invite', 'trade', 'kick', 'thanks', 'sold'])
    // исходящая — как у PoE Overlay: убежище продавца, обмен, выйти из группы, кто это, «ещё актуально?»
    expect(CARD_ACTIONS.out).toEqual(['still', 'hideout', 'trade', 'thanks', 'leave', 'whois'])
  })
})

describe('renderTemplate', () => {
  it('подстановки, bulk с количеством, неизвестные остаются', () => {
    const bulk = { ...base, item: 'Chaos Orb', itemAmount: 150, price: '1 divine' }
    expect(renderTemplate('{item} за {price} в {league} {x}', bulk)).toBe('150 Chaos Orb за 1 divine в Поселенцы {x}')
    expect(renderTemplate('  a   {price}  ', { ...base, price: '' })).toBe('a')
  })
})
