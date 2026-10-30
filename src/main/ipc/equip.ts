import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc'
import type { GameDef } from '@shared/games'
import { buildDevFlag, buildOn } from '@shared/build/flag'
import { cleanChar } from '@shared/build/equipCompareStore'
import type { EquipState } from '@shared/types/equip'
import { forgetEquipSlot, getEquipState, saveEquip, setEquipMine } from '../build/equipped'
import { onTaken, startTaken, takenCharacter } from '../build/buildTaken'
import { sendToOverlay } from '../windows/gameOverlay'
import type { IpcDomain } from './types'

// Домен «Против надетого» (main, S41 — B4): запомненные надетые вещи для окна цены Ctrl+D, userData/equipped.json,
// набор на персонажа текущего входа. Персонаж — из журнала игры (buildTaken.ts S39): журнал начинает читаться при
// первом запросе окна цены, не при запуске приложения. Скрыто флагом вкладки «Билд» (GameFeatures.build или
// POETH_BUILD=1 в разработке): без него каналы отвечают пустым состоянием и ничего не пишут. Сети нет.

let game: GameDef | null = null

const enabled = (): boolean => !!game && buildOn(game, buildDevFlag(process.env))

const EMPTY: EquipState = { on: false, character: null, level: null, items: [], mine: null }

/** Персонаж текущего входа (null — неизвестен: общий набор «без персонажа»). */
async function who(): Promise<{ char: string | null; level: number | null }> {
  if (game) await startTaken(game).catch(() => undefined)
  const c = takenCharacter()
  // имя — той же проверкой, что в файле (иначе набор не прочитается после перезапуска): чужая форма — общий набор
  return { char: cleanChar(c?.name ?? null), level: c?.level ?? null }
}

let last = ''

function push(state: EquipState): EquipState {
  sendToOverlay(IPC.events.equipState, state)
  return state
}

function register(): void {
  // вход другим персонажем или новый уровень (требование уровня) — окну новый набор
  onTaken(() => {
    if (!enabled()) return
    const c = takenCharacter()
    const key = c ? `${c.name}:${c.level}` : ''
    if (key === last) return
    last = key
    void getEquipState(cleanChar(c?.name ?? null), c?.level ?? null).then(push)
  })

  ipcMain.handle(IPC.equip.state, async () => {
    if (!enabled()) return EMPTY
    const { char, level } = await who()
    return getEquipState(char, level)
  })
  ipcMain.handle(IPC.equip.save, async (_e, slot: unknown, item: unknown) => {
    if (!enabled()) return EMPTY
    const { char, level } = await who()
    return push(await saveEquip(char, level, slot, item))
  })
  ipcMain.handle(IPC.equip.forget, async (_e, slot: unknown) => {
    if (!enabled()) return EMPTY
    const { char, level } = await who()
    return push(await forgetEquipSlot(char, level, slot))
  })
  ipcMain.handle(IPC.equip.setMine, async (_e, res: unknown) => {
    if (!enabled()) return EMPTY
    const { char, level } = await who()
    return push(await setEquipMine(char, level, res === null ? null : { res }))
  })
}

function setupForGame(def: GameDef): void {
  game = def
  last = ''
}

export const equipDomain: IpcDomain = { register, setupForGame }
