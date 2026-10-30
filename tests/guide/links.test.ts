import { describe, expect, it } from 'vitest'
import type { AppTab } from '@shared/types'
import { resolveAppLink } from '@renderer/panels/guide/links'
import { tabsFor } from '@renderer/tabs'

// «Справочник» (S55): куда ведёт блок «app» статьи. Нет вкладки в игре или версии — блок не показывается.

const POE1: AppTab[] = tabsFor('poe1', false).map((t) => t.id)
const ARTICLES = ['league-start', 'glossary-basics']

describe('resolveAppLink', () => {
  it('вкладка игры', () => {
    expect(resolveAppLink('priceCheck', POE1, ARTICLES)).toEqual({ kind: 'tab', tab: 'priceCheck' })
    expect(resolveAppLink('campaign', POE1, ARTICLES)).toEqual({ kind: 'tab', tab: 'campaign' })
  })

  it('страница Regex', () => {
    expect(resolveAppLink('regex/vendor', POE1, ARTICLES)).toEqual({ kind: 'tab', tab: 'regex', regexPage: 'vendor' })
    expect(resolveAppLink('regex/nope', POE1, ARTICLES)).toBeNull()
    expect(resolveAppLink('deals/vendor', POE1, ARTICLES)).toBeNull()
  })

  it('другая статья — только если она загружена', () => {
    expect(resolveAppLink('guide/league-start', POE1, ARTICLES)).toEqual({ kind: 'article', id: 'league-start' })
    expect(resolveAppLink('guide/endgame', POE1, ARTICLES)).toBeNull()
    expect(resolveAppLink('guide', POE1, ARTICLES)).toBeNull()
  })

  it('настройки', () => {
    expect(resolveAppLink('settings', POE1, ARTICLES)).toEqual({ kind: 'settings' })
    expect(resolveAppLink('settings/hotkeys', POE1, ARTICLES)).toBeNull()
  })

  it('вкладки нет в игре (PoE 2) или в версии — null; неизвестная цель — null', () => {
    const poe2 = tabsFor('poe2', false).map((t) => t.id)
    expect(resolveAppLink('regex/vendor', poe2, ARTICLES)).toBeNull()
    expect(resolveAppLink('deals', poe2, ARTICLES)).toBeNull()
    const noAdvisor = POE1.filter((t) => t !== 'advisor' && t !== 'build')
    expect(resolveAppLink('advisor', noAdvisor, ARTICLES)).toBeNull()
    expect(resolveAppLink('build', noAdvisor, ARTICLES)).toBeNull()
    expect(resolveAppLink('lootFilter', POE1, ARTICLES)).toBeNull()
    expect(resolveAppLink('regex/vendor/x', POE1, ARTICLES)).toBeNull()
  })
})
