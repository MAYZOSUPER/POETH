import { create } from 'zustand'
import type { GameLang, GameLangDetected, GameLangSettings, UiLang } from '@shared/types'
import { newerDetected, resolveGameLang, type GameLangBy } from '@shared/gameLang'
import { useAppStore } from './store/useAppStore'

// Язык клиента игры (S26) в renderer'ах: названия предметов, валют и баз — на нём, пояснения — на языке интерфейса.
// Настройка — Settings.gameLang (ручной выбор и то, что main узнал по игре). Компаньон видит её в useAppStore;
// оверлей и другие страницы useAppStore не загружают — для них свой settings.get(). Язык предмета по Ctrl+D берём
// сразу (main запишет его в настройки сам), а то, что main узнал по журналу игры, перечитываем при фокусе окна.

type Choice = GameLangSettings['choice']

interface Own {
  /** выбор из settings.get() — для страниц без useAppStore */
  choice: Choice | null
  detected: GameLangDetected | null
}

const useOwn = create<Own>(() => ({ choice: null, detected: null }))

function take(gl: GameLangSettings | undefined): void {
  if (gl) useOwn.setState((s) => ({ choice: gl.choice, detected: newerDetected(s.detected, gl.detected) }))
}

function start(): void {
  const api = typeof window === 'undefined' ? undefined : window.overlayApi
  if (!api?.settings || typeof api.onItemCaptured !== 'function') return
  const refresh = (): void => {
    void api.settings
      .get()
      .then((s) => take(s.gameLang))
      .catch(() => undefined)
  }
  api.onItemCaptured((item) => {
    const found: GameLangDetected = { lang: item.lang, by: 'item', at: Date.now() }
    useOwn.setState((s) => ({ detected: newerDetected(s.detected, found) }))
  })
  window.addEventListener('focus', refresh)
  refresh()
}

// сразу при загрузке страницы: к первому окну цены язык уже известен
start()

export interface GameLangInfo {
  /** язык названий */
  lang: GameLang
  /** откуда он: выбран вручную, узнан по предмету / журналу игры или (пока не узнан) как интерфейс */
  by: GameLangBy
  choice: Choice
  /** что узнали по игре (и при ручном выборе — для подсказки «похоже, игра на другом языке») */
  detected: GameLangDetected | null
}

/** Язык клиента игры со всеми подробностями (строка в настройках). uiLang — запасной, пока игра не узнана. */
export function useGameLangInfo(uiLang: UiLang): GameLangInfo {
  const app = useAppStore((s) => s.settings?.gameLang)
  const own = useOwn()
  const choice = app?.choice ?? own.choice ?? 'auto'
  const detected = newerDetected(own.detected, app?.detected)
  return { ...resolveGameLang({ choice, detected }, uiLang), choice, detected }
}

/** Язык названий предметов, валют и баз — язык клиента игры (uiLang — пока он не известен). */
export function useGameLang(uiLang: UiLang): GameLang {
  return useGameLangInfo(uiLang).lang
}

/** Выбрать язык клиента вручную или вернуть «авто» (компаньон: через useAppStore — обновятся все вкладки). */
export async function setGameLangChoice(choice: Choice): Promise<void> {
  await useAppStore.getState().patchSettings({ gameLang: { choice } })
  useOwn.setState({ choice })
}
