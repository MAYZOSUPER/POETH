import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'
import {
  HOTKEY_ACTIONS,
  SETTINGS_VERSION,
  applySettingsPatch,
  defaultHotkeys,
  defaultSettings,
  migrateSettings
} from '@shared/settings'
import { defaultChatCommands } from '@shared/chatCommands'

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(resolve(__dirname, 'fixtures/settings', name), 'utf8'))
}

describe('defaultSettings', () => {
  it('v2 со всеми полями и дефолтами из плана', () => {
    const s = defaultSettings()
    expect(s.schemaVersion).toBe(2)
    expect(s.game).toBe('poe1')
    expect(s.siteHost).toBe('www.pathofexile.com')
    expect(s.poe1).toEqual({ league: 'auto' })
    expect(s.poe2).toEqual({ league: 'Standard' })
    expect(s.sound).toEqual({ enabled: true, volume: 0.6 })
    expect(s.live).toEqual({ maxSearches: 10 })
    expect(s.deals).toEqual({ enabled: true, stashGrid: 'auto', calibration: null })
    expect(s.regex).toEqual({})
    expect(s.ui).toEqual({ simpleMode: true })
    expect(s.overlay).toEqual({ pricePosition: 'cursor' })
    expect(s.startup).toEqual({ withWindows: false, minimized: true, firstRunDone: false })
    expect(s.updates).toEqual({ check: true })
    expect(s.chatCommands.find((c) => c.id === 'hideout')).toMatchObject({ text: '/hideout', hotkey: 'F5', send: true })
  })

  it('хоткеи v2: действия, сочетания и области', () => {
    const hk = defaultHotkeys()
    expect(Object.keys(hk).sort()).toEqual([...HOTKEY_ACTIONS].sort())
    expect(hk.priceCheck).toEqual({ accel: 'Control+D', scope: 'game' })
    expect(hk.overlayToggle).toEqual({ accel: 'Shift+Space', scope: 'game' })
    expect(hk.whisperLastHit).toEqual({ accel: '', scope: 'game' })
    for (const n of [1, 2, 3, 4, 5]) {
      expect(hk[`pasteSearch${n}` as 'pasteSearch1']).toEqual({ accel: '', scope: 'game' })
    }
    expect(hk.toggleCompanion).toEqual({ accel: 'Control+Shift+O', scope: 'always' })
    expect(hk.toggleLock).toEqual({ accel: 'Control+Shift+L', scope: 'always' })
    expect(hk.toggleTradeWindow).toEqual({ accel: 'Control+Shift+T', scope: 'always' })
    expect(hk.prevStep.scope).toBe('always')
    expect(hk.nextStep.scope).toBe('always')
  })

  it('непустые сочетания по умолчанию не конфликтуют', () => {
    const accels = Object.values(defaultHotkeys())
      .map((b) => b.accel)
      .filter(Boolean)
    expect(new Set(accels).size).toBe(accels.length)
  })
})

describe('migrateSettings v1 → v2', () => {
  it('settings.json Exile Companion (дефолтные хоткеи)', () => {
    const s = migrateSettings(fixture('v1-exile-companion.json'))
    expect(s.schemaVersion).toBe(SETTINGS_VERSION)
    // league → poe2.league, старого поля нет
    expect(s.poe2.league).toBe('Dawn of the Hunt')
    expect('league' in s).toBe(false)
    // Alt+D (старый дефолт) → Ctrl+D; toggleVisible → toggleCompanion
    expect(s.hotkeys.priceCheck).toEqual({ accel: 'Control+D', scope: 'game' })
    expect(s.hotkeys.toggleCompanion).toEqual({ accel: 'Control+Shift+O', scope: 'always' })
    expect('toggleVisible' in s.hotkeys).toBe(false)
    // новые действия получили дефолты
    expect(s.hotkeys.overlayToggle.accel).toBe('Shift+Space')
    expect(s.hotkeys.toggleTradeWindow.accel).toBe('Control+Shift+T')
    // пользовательские значения сохранены
    expect(s.activeProfileId).toBe('p-1719650000000')
    expect(s.nameLang).toBe('ru')
    expect(s.opacity).toBe(0.85)
    expect(s.showInTaskbar).toBe(false)
    expect(s.logPath).toContain('Path of Exile 2')
    expect(s.tailerEnabled).toBe(true)
    expect(s.autoCheckQuests).toBe(true)
    expect(s.lastAppTab).toBe('campaign')
    // новые разделы — дефолты
    expect(s.game).toBe('poe1')
    expect(s.poe1.league).toBe('auto')
    expect(s.sound).toEqual(defaultSettings().sound)
    expect(s.deals).toEqual(defaultSettings().deals)
  })

  it('пользовательские хоткеи v1 сохраняются (не только дефолты)', () => {
    const s = migrateSettings(fixture('v1-custom-hotkeys.json'))
    expect(s.hotkeys.priceCheck).toEqual({ accel: 'Control+Alt+P', scope: 'game' })
    expect(s.hotkeys.toggleCompanion).toEqual({ accel: 'Control+Alt+O', scope: 'always' })
    expect(s.hotkeys.toggleLock).toEqual({ accel: 'F7', scope: 'always' })
    expect(s.poe2.league).toBe('Standard')
    expect(s.locked).toBe(true)
    expect(s.uiLang).toBe('en')
    expect(s.lastAppTab).toBe('priceCheck')
  })

  it('v1 без schemaVersion считается v1', () => {
    const s = migrateSettings({ league: 'Hardcore', hotkeys: { priceCheck: 'Alt+D' } })
    expect(s.poe2.league).toBe('Hardcore')
    expect(s.hotkeys.priceCheck.accel).toBe('Control+D')
  })

  it('миграция идемпотентна: v2 → v2 без изменений', () => {
    const once = migrateSettings(fixture('v1-exile-companion.json'))
    const twice = migrateSettings(JSON.parse(JSON.stringify(once)))
    expect(twice).toEqual(once)
  })

  it('мусор и пустой файл → дефолты', () => {
    expect(migrateSettings(null)).toEqual(defaultSettings())
    expect(migrateSettings('oops')).toEqual(defaultSettings())
    expect(migrateSettings([])).toEqual(defaultSettings())
  })
})

describe('normalize (v2)', () => {
  it('неверные значения заменяются дефолтами, диапазоны зажимаются', () => {
    const s = migrateSettings({
      schemaVersion: 2,
      game: 'poe3',
      siteHost: 'evil.example.com',
      uiLang: 'de',
      opacity: 5,
      lastAppTab: 'nope',
      sound: { enabled: 'yes', volume: 3 },
      live: { maxSearches: 500 },
      deals: { stashGrid: 'huge', calibration: 7 },
      hotkeys: { priceCheck: { accel: 'Alt+Q', scope: 'sometimes' }, toggleLock: 42 },
      unknownField: true
    })
    expect(s.game).toBe('poe1')
    expect(s.siteHost).toBe('www.pathofexile.com')
    expect(s.uiLang).toBe('ru')
    expect(s.opacity).toBe(1)
    expect(s.lastAppTab).toBe('priceCheck')
    expect(s.sound).toEqual({ enabled: true, volume: 1 })
    expect(s.live.maxSearches).toBe(20)
    expect(s.deals.stashGrid).toBe('auto')
    expect(s.deals.calibration).toBeNull()
    expect(s.hotkeys.priceCheck).toEqual({ accel: 'Alt+Q', scope: 'game' })
    expect(s.hotkeys.toggleLock).toEqual(defaultHotkeys().toggleLock)
    expect('unknownField' in s).toBe(false)
  })

  it('ru-хост и PoE2 сохраняются', () => {
    const s = migrateSettings({ schemaVersion: 2, game: 'poe2', siteHost: 'ru.pathofexile.com' })
    expect(s.game).toBe('poe2')
    expect(s.siteHost).toBe('ru.pathofexile.com')
  })
})

describe('applySettingsPatch', () => {
  it('разделы сливаются на один уровень вглубь', () => {
    const cur = defaultSettings()
    const next = applySettingsPatch(cur, { poe2: { league: 'Hardcore' }, sound: { volume: 0.2 } })
    expect(next.poe2).toEqual({ league: 'Hardcore' })
    expect(next.sound).toEqual({ enabled: true, volume: 0.2 })
    expect(next.poe1).toEqual(cur.poe1)
  })

  it('патч одного хоткея не трогает остальные', () => {
    const cur = defaultSettings()
    const next = applySettingsPatch(cur, {
      hotkeys: { priceCheck: { accel: 'Alt+D', scope: 'game' } }
    })
    expect(next.hotkeys.priceCheck.accel).toBe('Alt+D')
    expect(next.hotkeys.toggleLock).toEqual(cur.hotkeys.toggleLock)
  })

  it('калибровку стэша можно задать и сбросить', () => {
    const cal = { left: 10, top: 20, width: 600, height: 600 }
    const a = applySettingsPatch(defaultSettings(), { deals: { calibration: cal } })
    expect(a.deals.calibration).toEqual(cal)
    expect(a.deals.enabled).toBe(true)
    const b = applySettingsPatch(a, { deals: { calibration: null } })
    expect(b.deals.calibration).toBeNull()
  })

  it('не мутирует исходный объект', () => {
    const cur = defaultSettings()
    const copy = JSON.parse(JSON.stringify(cur))
    applySettingsPatch(cur, { poe2: { league: 'X' }, locked: true })
    expect(cur).toEqual(copy)
  })
})

describe('overlay.pricePosition («Позиция окна цены»)', () => {
  it('v1 компаса и v2 без раздела overlay → «у курсора»', () => {
    expect(migrateSettings(fixture('v1-exile-companion.json')).overlay).toEqual({ pricePosition: 'cursor' })
    const v2old: Record<string, unknown> = { ...defaultSettings() }
    delete v2old.overlay
    expect(migrateSettings(v2old).overlay).toEqual({ pricePosition: 'cursor' })
  })

  it('сохранённое значение переживает миграцию', () => {
    for (const p of ['cursor', 'left', 'right'] as const) {
      expect(migrateSettings({ ...defaultSettings(), overlay: { pricePosition: p } }).overlay.pricePosition).toBe(p)
    }
  })

  it('мусор → «у курсора»', () => {
    for (const bad of [{ pricePosition: 'top' }, { pricePosition: 3 }, 'left', null, []]) {
      expect(migrateSettings({ ...defaultSettings(), overlay: bad }).overlay).toEqual({ pricePosition: 'cursor' })
    }
  })

  it('патч меняет позицию, неизвестное значение откатывается к дефолту', () => {
    const a = applySettingsPatch(defaultSettings(), { overlay: { pricePosition: 'left' } })
    expect(a.overlay.pricePosition).toBe('left')
    const b = applySettingsPatch(a, { overlay: { pricePosition: 'middle' as 'left' } })
    expect(b.overlay.pricePosition).toBe('cursor')
  })
})

describe('chatCommands («Команды чата»)', () => {
  it('v1 компаса и v2 без поля → пресеты (F5 → /hideout)', () => {
    expect(migrateSettings(fixture('v1-exile-companion.json')).chatCommands).toEqual(defaultChatCommands())
    const v2old: Record<string, unknown> = { ...defaultSettings() }
    delete v2old.chatCommands
    expect(migrateSettings(v2old).chatCommands).toEqual(defaultChatCommands())
  })

  it('пустой список сохраняется (игрок удалил всё сам), мусор чинится', () => {
    expect(migrateSettings({ ...defaultSettings(), chatCommands: [] }).chatCommands).toEqual([])
    expect(migrateSettings({ ...defaultSettings(), chatCommands: 'x' }).chatCommands).toEqual(defaultChatCommands())
    const s = migrateSettings({ ...defaultSettings(), chatCommands: [{ id: 'my', text: ' /afk ', hotkey: 'f7' }, { text: '' }] })
    expect(s.chatCommands).toEqual([{ id: 'my', text: '/afk', hotkey: 'F7', send: true, enabled: true }])
  })

  it('патч заменяет список целиком', () => {
    const next = applySettingsPatch(defaultSettings(), {
      chatCommands: [{ id: 'hideout', text: '/hideout', hotkey: 'F6', send: false, enabled: true }]
    })
    expect(next.chatCommands).toEqual([{ id: 'hideout', text: '/hideout', hotkey: 'F6', send: false, enabled: true }])
    expect(next.hotkeys).toEqual(defaultSettings().hotkeys)
  })
})

describe('startup / updates (S10a)', () => {
  it('файл настроек уже был (компас, ранний POETH) — это не первый запуск', () => {
    expect(migrateSettings(fixture('v1-exile-companion.json')).startup.firstRunDone).toBe(true)
    const v2old: Record<string, unknown> = { ...defaultSettings() }
    delete v2old.startup
    expect(migrateSettings(v2old).startup).toEqual({ withWindows: false, minimized: true, firstRunDone: true })
  })

  it('настроек нет — первый запуск', () => {
    expect(migrateSettings(null).startup.firstRunDone).toBe(false)
  })

  it('сохранённые значения переживают миграцию, мусор — к дефолту', () => {
    const s = migrateSettings({
      ...defaultSettings(),
      startup: { withWindows: true, minimized: false, firstRunDone: true },
      updates: { check: false }
    })
    expect(s.startup).toEqual({ withWindows: true, minimized: false, firstRunDone: true })
    expect(s.updates).toEqual({ check: false })
    const bad = migrateSettings({ ...defaultSettings(), startup: { withWindows: 'yes' }, updates: 1 })
    expect(bad.startup.withWindows).toBe(false)
    expect(bad.updates).toEqual({ check: true })
  })

  it('патч раздела не трогает остальные поля', () => {
    const a = applySettingsPatch(defaultSettings(), { startup: { withWindows: true } })
    expect(a.startup).toEqual({ withWindows: true, minimized: true, firstRunDone: false })
  })
})
