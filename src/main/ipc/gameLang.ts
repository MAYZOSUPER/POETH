import type { GameDef } from '@shared/games'
import type { GameLangDetected } from '@shared/types'
import { detectedFromItem, detectedFromLog, legacyRegexChoice, nextDetected } from '@shared/gameLang'
import { getSettings, updateSettings } from '../services/settingsStore'
import { readLogTail, subscribeGameLog } from '../services/gameLog'
import { dropLegacyGameLang, getLegacyGameLang } from '../services/regexLibraryStore'
import { onItemCaptured } from './overlay'
import type { IpcDomain } from './types'

// Язык клиента игры (S26). main узнаёт его по игре и хранит в Settings.gameLang.detected: по тексту предмета
// (Ctrl+D) и по строкам Client.txt (шёпот, вход в зону…; при запуске — по хвосту лога). Своих каналов нет —
// renderer'ы читают настройки (src/renderer/src/gameLang.ts). Здесь же — перенос старой настройки вкладки Regex.
// Только PoE 1: названия предметов и строки regex — его; у PoE 2 свой язык имён (nameLang).

let unsubs: (() => void)[] = []
/** записи по очереди: два определения подряд сравниваются с уже записанным, а не с одним и тем же «до» */
let queue: Promise<void> = Promise.resolve()

function remember(found: GameLangDetected | null): void {
  if (!found) return
  queue = queue
    .then(async () => {
      const next = nextDetected((await getSettings()).gameLang.detected, found)
      if (next) await updateSettings({ gameLang: { detected: next } })
    })
    .catch((e) => console.error('[gameLang] не удалось запомнить язык клиента:', e))
}

/** prefs.gameLang вкладки Regex (до S26) → Settings.gameLang.choice, один раз. */
async function migrateRegexPref(): Promise<void> {
  const legacy = await getLegacyGameLang()
  if (!legacy) return
  const s = await getSettings()
  const choice = legacyRegexChoice(legacy, s.gameLang, s.uiLang)
  if (choice) await updateSettings({ gameLang: { choice } })
  await dropLegacyGameLang()
}

function register(): void {
  void migrateRegexPref().catch((e) => console.error('[gameLang] перенос языка из вкладки Regex не удался:', e))
}

async function setupForGame(def: GameDef): Promise<void> {
  for (const off of unsubs) off()
  unsubs = []
  if (def.id !== 'poe1') return
  unsubs.push(onItemCaptured((item) => remember(detectedFromItem(item.text, Date.now()))))
  const sub = await subscribeGameLog(def, (lines) => remember(detectedFromLog(lines, Date.now())))
  unsubs.push(sub.off)
  // язык прошлой игры — до первого предмета и строки (хоткеи не ждут чтения); старое не перебивает свежее
  if (sub.logPath) {
    void readLogTail(sub.logPath)
      .then((lines) => remember(detectedFromLog(lines, 0)))
      .catch(() => undefined)
  }
}

export const gameLangDomain: IpcDomain = { register, setupForGame }
