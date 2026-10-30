import { describe, expect, it } from 'vitest'
import { wealth } from '../../src/renderer/src/i18n/dict/wealth'

// «Богатство» в ручном режиме без сессии фарма (S42): авто-повтора нет (wealth/manager.ts schedule), поэтому
// у ошибок сайта свой текст — без «повторим позже», с кнопкой «Обновить».

const CODES = ['network', 'server', 'bad-response', 'rate-limited']

describe('wealth: ошибки в ручном режиме', () => {
  it.each(CODES)('%s.manual есть в RU и EN и ничего не обещает', (code) => {
    const ru = wealth.ru[`wealth.err.${code}.manual`]
    const en = wealth.en[`wealth.err.${code}.manual`]
    expect(ru).toBeTruthy()
    expect(en).toBeTruthy()
    expect(ru).not.toMatch(/повторим|продолжим/i)
    expect(en).not.toMatch(/will retry|resuming/i)
    expect(ru).toContain('«Обновить»')
    expect(en).toContain('Refresh')
  })

  it('в авто-режиме обещание остаётся (там повтор есть)', () => {
    expect(wealth.ru['wealth.err.network']).toContain('Повторим позже')
    expect(wealth.en['wealth.err.network']).toContain('Will retry later')
  })
})
