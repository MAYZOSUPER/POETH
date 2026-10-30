import { describe, expect, it } from 'vitest'
import type { HotkeyAction, UiLang } from '@shared/types'
import { HOTKEY_DEFAULTS } from '@shared/settings'
import { DOMAIN_DICTS } from '../src/renderer/src/i18n/dicts'
import { accelText, tKey } from '../src/renderer/src/i18n/hotkey'

// Строки с клавишей при переназначаемом хоткее (S42): вместо зашитых «Ctrl+D», «Ctrl+Shift+G»,
// «Ctrl+Shift+[ ]» — {key} из настроек. С клавишами по умолчанию текст прежний (слово в слово),
// с переназначенной — новая клавиша, без клавиши — вариант «.nokey» без сочетаний.

const dict = (lang: UiLang): Record<string, string> => Object.assign({}, ...Object.values(DOMAIN_DICTS).map((d) => d[lang]))
const DICT = { ru: dict('ru'), en: dict('en') }

/** Как translate() из i18n/index.ts (без стора компаньона). */
function tr(lang: UiLang) {
  return (key: string, params?: Record<string, string | number>): string => {
    let s = DICT[lang][key] ?? DICT.ru[key] ?? key
    for (const k of Object.keys(params ?? {})) s = s.replace(`{${k}}`, String(params![k]))
    return s
  }
}

interface Case {
  key: string
  action: HotkeyAction
  params?: Record<string, string | number>
  /** текст до S42 при клавише по умолчанию */
  was: Record<UiLang, string>
}

const CASES: Case[] = [
  {
    key: 'pc1.limit.cache',
    action: 'priceCheck',
    was: {
      ru: 'Повторный Ctrl+D по этому же предмету не тратит лимит: результат хранится 5 минут.',
      en: 'Pressing Ctrl+D on the same item again costs nothing: results are kept for 5 minutes.'
    }
  },
  {
    key: 'pc1.parse.error',
    action: 'priceCheck',
    was: {
      ru: 'Не похоже на предмет PoE 1. Наведите курсор на предмет и нажмите Ctrl+D ещё раз.',
      en: 'That does not look like a PoE 1 item. Hover an item and press Ctrl+D again.'
    }
  },
  {
    key: 'overlay.set.pricePosition.hint',
    action: 'priceCheck',
    was: {
      ru: 'Окно цены можно перетащить за шапку — следующий Ctrl+D откроет его там же.',
      en: 'Drag the price window by its header — the next Ctrl+D opens it in the same place.'
    }
  },
  {
    key: 'wiz.window.admin',
    action: 'priceCheck',
    was: {
      ru: 'Не запускайте игру от имени администратора — иначе Ctrl+D и оверлей не смогут до неё достучаться.',
      en: 'Do not run the game as administrator — otherwise Ctrl+D and the overlay cannot reach it.'
    }
  },
  {
    key: 'wealth.hint',
    action: 'priceCheck',
    params: { n: 15 },
    was: {
      ru: 'Раз в 15 минут POETH смотрит ваш тайник и оценивает предметы по ценам биржи. Рарки не оцениваются: их цену покажет прайс-чек по Ctrl+D.',
      en: 'Every 15 minutes POETH looks at your stash and values items at exchange prices. Rares are not valued: price check (Ctrl+D) shows their price.'
    }
  },
  {
    key: 'wealth.hint.manual',
    action: 'priceCheck',
    params: { n: 15 },
    was: {
      ru: 'POETH смотрит тайник по кнопке «Обновить» и оценивает предметы по ценам биржи. Рарки не оцениваются: их цену покажет прайс-чек по Ctrl+D.',
      en: 'POETH looks at your stash when you press Refresh and values items at exchange prices. Rares are not valued: price check (Ctrl+D) shows their price.'
    }
  },
  {
    key: 'wealth.unpriced.rare',
    action: 'priceCheck',
    was: { ru: 'Рарку оценит прайс-чек по Ctrl+D', en: 'Price check (Ctrl+D) can value a rare' }
  },
  {
    key: 'lev.show.hint',
    action: 'levelingToggle',
    was: {
      ru: 'Гид — один следующий шаг слева сверху, под баффами. «Авто» — только в зонах кампании, пока она не пройдена; в городе, убежище и картах скрыт. Ctrl+Shift+G показывает его вручную до следующей зоны.',
      en: 'The guide is one next step at the top left, below the buffs. “Auto” shows it only in campaign zones until the campaign is done; it hides in towns, the hideout and maps. Ctrl+Shift+G shows it by hand until the next zone.'
    }
  },
  { key: 'wn.prev', action: 'prevStep', was: { ru: 'Назад (Ctrl+Shift+[)', en: 'Back (Ctrl+Shift+[)' } },
  { key: 'wn.next', action: 'nextStep', was: { ru: 'Вперёд (Ctrl+Shift+])', en: 'Forward (Ctrl+Shift+])' } },
  // вторая волна S42: «Тиры уников» (POETH_ITEMFLIP), «Язык клиента игры», «Против надетого» (S41)
  {
    key: 'flip.items.tiers.hint',
    action: 'priceCheck',
    was: {
      ru: 'T0 — от 10 div, T1 — от 1 div, T2 — от 0,1 div: такие уники не продавай торговцу, а выстави на трейд (Ctrl+D покажет цену твоего). «?» — мало данных.',
      en: 'T0 — 10+ div, T1 — 1+ div, T2 — 0.1+ div: don’t vendor these, list them on trade (Ctrl+D shows the price of yours). “?” — little data.'
    }
  },
  {
    key: 'flip.items.tiers.foot',
    action: 'priceCheck',
    was: {
      ru: 'Цена — обычная форма уника (без связей, не нечестивый). Твой предмет может стоить иначе: проверь по Ctrl+D.',
      en: 'Price of the plain form (unlinked, not Foulborn). Your item may be worth something else: check it with Ctrl+D.'
    }
  },
  {
    key: 'flip.items.advice.check',
    action: 'priceCheck',
    was: { ru: 'проверь связи и вариант (Ctrl+D)', en: 'check links and variant (Ctrl+D)' }
  },
  {
    key: 'glang.unknown',
    action: 'priceCheck',
    params: { lang: 'English' },
    was: {
      ru: 'Пока не определено, поэтому как язык интерфейса (English). Наведите курсор на любой предмет в игре и нажмите Ctrl+D.',
      en: 'Not detected yet, so the interface language is used (English). Hover over any item in the game and press Ctrl+D.'
    }
  },
  {
    key: 'eq.fresh.old',
    action: 'priceCheck',
    was: {
      ru: 'Запомнено давно: Ctrl+D по надетой вещи в окне персонажа и «Запомнить как надетое» — обновит.',
      en: 'Saved long ago: press Ctrl+D on the equipped item in the character window and “Save as equipped” to update.'
    }
  },
  {
    key: 'eq.save.help',
    action: 'priceCheck',
    was: {
      ru: 'Если это окно открыто по надетой вещи (Ctrl+D в окне персонажа)',
      en: 'If this window is for an equipped item (Ctrl+D in the character window)'
    }
  },
  {
    key: 'eq.empty.how',
    action: 'priceCheck',
    was: {
      ru: 'Откройте окно персонажа (C), наведите на надетую вещь этого слота, нажмите Ctrl+D и «Запомнить как надетое».',
      en: 'Open the character window (C), hover the item equipped in this slot, press Ctrl+D, then “Save as equipped”.'
    }
  }
]

const LANGS: UiLang[] = ['ru', 'en']

describe('accelText', () => {
  it('сочетание как в подсказках: Control → Ctrl, Super → Win, без пробелов', () => {
    expect(accelText('Control+D')).toBe('Ctrl+D')
    expect(accelText('Control+Shift+[')).toBe('Ctrl+Shift+[')
    expect(accelText('CommandOrControl+Alt+Q')).toBe('Ctrl+Alt+Q')
    expect(accelText('Super+F2')).toBe('Win+F2')
    expect(accelText('')).toBe('')
    expect(accelText(undefined)).toBe('')
  })
})

describe('строки с клавишей из настроек (S42)', () => {
  it.each(CASES.flatMap((c) => LANGS.map((lang) => [c.key, lang, c] as const)))(
    '%s (%s): по умолчанию — прежний текст слово в слово',
    (_k, lang, c) => {
      expect(tKey(tr(lang), c.key, HOTKEY_DEFAULTS[c.action].accel, c.params)).toBe(c.was[lang])
    }
  )

  it.each(CASES.flatMap((c) => LANGS.map((lang) => [c.key, lang, c] as const)))(
    '%s (%s): переназначенная клавиша — в тексте новая, старой нет',
    (_k, lang, c) => {
      const old = accelText(HOTKEY_DEFAULTS[c.action].accel)
      const s = tKey(tr(lang), c.key, 'Alt+Shift+Q', c.params)
      expect(s).toContain('Alt+Shift+Q')
      expect(s).not.toContain(old)
      expect(s).not.toContain('{')
    }
  )

  it.each(CASES.flatMap((c) => LANGS.map((lang) => [c.key, lang, c] as const)))(
    '%s (%s): клавиша не назначена — вариант .nokey без сочетаний',
    (_k, lang, c) => {
      expect(DICT[lang][`${c.key}.nokey`], `${c.key}.nokey`).toBeTruthy()
      const s = tKey(tr(lang), c.key, '', c.params)
      expect(s).toBe(tr(lang)(`${c.key}.nokey`, c.params))
      expect(s).not.toMatch(/Ctrl\+|\{key\}/)
    }
  )

  it('в самих строках словаря зашитых сочетаний больше нет', () => {
    for (const lang of LANGS)
      for (const c of CASES) {
        expect(DICT[lang][c.key], `${lang} ${c.key}`).toContain('{key}')
        expect(DICT[lang][c.key], `${lang} ${c.key}`).not.toMatch(/Ctrl\+/)
      }
  })

  it('ни в одной строке словарей нет сочетания POETH по умолчанию (Ctrl+F и Ctrl+V игры — можно)', () => {
    const defaults = Object.values(HOTKEY_DEFAULTS)
      .map((h) => accelText(h.accel))
      .filter(Boolean)
    for (const lang of LANGS)
      for (const [key, s] of Object.entries(DICT[lang]))
        for (const k of defaults) expect(s.includes(k), `${lang} ${key}: «${k}»`).toBe(false)
  })
})
