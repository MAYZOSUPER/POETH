import { app, shell } from 'electron'
import { bugReportUrl, isBugReportUrl } from '@shared/bugReport'
import { resolveGameLang } from '@shared/gameLang'
import { getSettings } from './settingsStore'
import { getRunningGame } from '../gameContext'

// «Сообщить об ошибке» (S56): «О программе» и меню значка в трее открывают форму GitHub «Ошибка / Bug»
// в браузере игрока с версией, игрой и языками (@shared/bugReport). Сеть приложение не трогает.

export async function openBugReport(): Promise<void> {
  const s = await getSettings()
  const game = getRunningGame()
  // язык клиента настраивается только для PoE 1; пока не узнан по игре — не подставляем
  const gl = resolveGameLang(s.gameLang, s.uiLang)
  const url = bugReportUrl({
    version: app.getVersion(),
    game,
    clientLang: game === 'poe1' && gl.by !== 'ui' ? gl.lang : null,
    uiLang: s.uiLang
  })
  if (!isBugReportUrl(url)) return
  try {
    await shell.openExternal(url)
  } catch (e) {
    console.warn('[bug] openExternal failed:', e)
  }
}
