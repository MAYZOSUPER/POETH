import { app, ipcMain } from 'electron'
import { IPC } from '@shared/ipc'
import type { EquipState } from '@shared/types/equip'
import type { PobCompareResponse } from '@shared/types/pobCompare'
import { getActiveBuild } from '../build/buildLibrary'
import { getEquipState, setEquipPob } from '../build/equipped'
import { pobCompare } from '../pob/compare'
import { PobEngine } from '../pob/engine'
import { engineSpawn, engineVersion } from '../pob/enginePaths'

// Каналы «Точного расчёта (PoB)» (S44, бета) в домене equip — только оверлей (OVERLAY_CHANNELS берёт все каналы
// IPC.equip). Регистрирует src/main/ipc/equip.ts (ipcGuard оборачивает только src/main/ipc/**): флаг вкладки
// «Билд» и персонаж входа — оттуда.
// Движок стартует лениво по первому сравнению и останавливается после простоя или при выходе из приложения.

interface Ctx {
  enabled: () => boolean
  who: () => Promise<{ char: string | null; level: number | null }>
  push: (state: EquipState) => EquipState
  empty: EquipState
}

let engine: PobEngine | null = null

function getEngine(): PobEngine {
  engine ??= new PobEngine(engineSpawn)
  return engine
}

export function registerPobHandlers(ctx: Ctx): void {
  ipcMain.handle(IPC.equip.setPob, async (_e, on: unknown) => {
    if (!ctx.enabled()) return ctx.empty
    const { char, level } = await ctx.who()
    if (on === false) engine?.stop()
    return ctx.push(await setEquipPob(char, level, on))
  })

  ipcMain.handle(IPC.equip.pobCompare, async (_e, req: unknown): Promise<PobCompareResponse> => {
    if (!ctx.enabled()) return { ok: false, error: 'off' }
    return pobCompare(req, {
      engine: getEngine(),
      build: getActiveBuild,
      equip: async () => {
        const { char, level } = await ctx.who()
        const s = await getEquipState(char, level)
        return { ...s, pob: !!s.pob }
      },
      version: engineVersion
    })
  })

  app.on('will-quit', () => engine?.stop())
}
