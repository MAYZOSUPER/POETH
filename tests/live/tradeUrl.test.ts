import { describe, expect, it } from 'vitest'
import { parseLiveInput } from '../../src/main/games/poe1/live/tradeUrl'

describe('разбор ссылки на поиск', () => {
  it('ссылка сайта трейда PoE1 (www/ru, с /live, с закодированной лигой)', () => {
    expect(parseLiveInput('https://www.pathofexile.com/trade/search/Standard/kE6YLz5Tw')).toEqual({
      ok: true,
      league: 'Standard',
      slug: 'kE6YLz5Tw',
      host: 'www.pathofexile.com'
    })
    expect(parseLiveInput(' https://ru.pathofexile.com/trade/search/Hardcore%20Allflame/Ab12Cd/live ')).toEqual({
      ok: true,
      league: 'Hardcore Allflame',
      slug: 'Ab12Cd',
      host: 'ru.pathofexile.com'
    })
    expect(parseLiveInput('www.pathofexile.com/trade/search/Standard/kE6YLz5Tw?q=1#x')).toMatchObject({
      ok: true,
      slug: 'kE6YLz5Tw'
    })
    expect(parseLiveInput('https://pathofexile.com/trade/search/Standard/kE6YLz5Tw')).toEqual({
      ok: true,
      league: 'Standard',
      slug: 'kE6YLz5Tw'
    })
  })

  it('длинный id поиска (H4sI…), который сейчас отдаёт API', () => {
    const id = 'H4sIAAAAAAAAA6tWKi5JLCktVrKqVsovKMnMz1OyUsrPy8nMS1Wq1VHKS8xNBQqEJCaV5iQqBCUWJyrpKJVUFoAEgzNzC3JSFYLyk4BKAWolA5lIAAAA'
    expect(parseLiveInput(`https://www.pathofexile.com/trade/search/Standard/${id}`)).toMatchObject({ ok: true, slug: id })
    expect(parseLiveInput('x'.repeat(513))).toEqual({ ok: false, error: 'bad-url' })
  })

  it('«лига/код» и просто код', () => {
    expect(parseLiveInput('Allflame/kE6YLz5Tw')).toEqual({ ok: true, league: 'Allflame', slug: 'kE6YLz5Tw' })
    expect(parseLiveInput('kE6YLz5Tw')).toEqual({ ok: true, slug: 'kE6YLz5Tw' })
  })

  it('PoE 2 и bulk-обмен — понятная ошибка', () => {
    expect(parseLiveInput('https://www.pathofexile.com/trade2/search/poe2/Standard/abc123')).toEqual({ ok: false, error: 'poe2' })
    expect(parseLiveInput('https://www.pathofexile.com/trade/exchange/Standard/abc123')).toEqual({ ok: false, error: 'exchange' })
  })

  it('чужие хосты и мусор — bad-url', () => {
    for (const s of [
      '',
      'https://pathofexile.com.evil.com/trade/search/Standard/kE6YLz5Tw',
      'https://poe.ninja/trade/search/Standard/kE6YLz5Tw',
      'https://www.pathofexile.com/trade/search/Standard',
      'https://www.pathofexile.com/trade/search/Standard/kE6YLz5Tw/extra',
      'https://www.pathofexile.com/forum/view-thread/1',
      'javascript:alert(1)',
      'a b c',
      'Standard/kE6/Y',
      'x'
    ]) {
      expect(parseLiveInput(s), s).toEqual({ ok: false, error: 'bad-url' })
    }
  })
})
