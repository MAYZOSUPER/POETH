import { describe, expect, it } from 'vitest'
import { DOMAIN_DICTS } from '../src/renderer/src/i18n/dicts'

// Строки интерфейса разнесены по доменам — проверяем, что RU/EN полные и что
// два домена не определяют один и тот же ключ (иначе один молча затрёт другой).

describe('i18n dictionaries', () => {
  it('у каждого домена одинаковые ключи в RU и EN', () => {
    for (const [domain, dict] of Object.entries(DOMAIN_DICTS)) {
      const ru = Object.keys(dict.ru).sort()
      const en = Object.keys(dict.en).sort()
      expect(en, `домен ${domain}`).toEqual(ru)
    }
  })

  it('ключи не повторяются между доменами', () => {
    const owner = new Map<string, string>()
    for (const [domain, dict] of Object.entries(DOMAIN_DICTS)) {
      for (const key of Object.keys(dict.ru)) {
        expect(owner.get(key), `ключ "${key}" в ${domain} и ${owner.get(key)}`).toBeUndefined()
        owner.set(key, domain)
      }
    }
  })

  it('плейсхолдеры {x} совпадают в RU и EN', () => {
    const ph = (s: string): string[] => (s.match(/\{\w+\}/g) ?? []).sort()
    for (const dict of Object.values(DOMAIN_DICTS)) {
      for (const key of Object.keys(dict.ru)) {
        expect(ph(dict.en[key] ?? ''), key).toEqual(ph(dict.ru[key]))
      }
    }
  })

  it('строки не пустые', () => {
    for (const dict of Object.values(DOMAIN_DICTS)) {
      for (const lang of ['ru', 'en'] as const) {
        for (const [key, value] of Object.entries(dict[lang])) expect(value.trim(), key).not.toBe('')
      }
    }
  })
})
