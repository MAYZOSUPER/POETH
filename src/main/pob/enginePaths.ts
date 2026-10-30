import { app } from 'electron'
import { existsSync, readFileSync } from 'fs'
import path from 'path'
import { devEnv } from '../devEnv'
import { resourcesDir } from '../services/questDataset'
import type { EngineSpawn } from './engine'

// Где лежит движок PoB (S44). Установленный POETH: resources/pob-engine (electron-builder.yml → extraResources из
// vendor/pob-engine, собирает tools/pob/prepare.mjs) и resources/resources/pob/server.lua. Разработка:
// vendor/pob-engine в корне проекта или POETH_POB_ENGINE (только незапакованная сборка). Нет файлов — null
// (окно скажет «точный расчёт недоступен», упрощённое сравнение работает как раньше).

export function engineDir(): string {
  if (app.isPackaged) return path.join(process.resourcesPath, 'pob-engine')
  const env = devEnv('POETH_POB_ENGINE')
  return env && path.isAbsolute(env) ? env : path.join(app.getAppPath(), 'vendor', 'pob-engine')
}

export function engineSpawn(): EngineSpawn | null {
  const dir = engineDir()
  const exe = path.join(dir, 'bin', 'luajit.exe')
  const pob = path.join(dir, 'pob')
  const server = path.join(resourcesDir(), 'pob', 'server.lua')
  if (process.platform !== 'win32') return null
  if (!existsSync(exe) || !existsSync(path.join(pob, 'src', 'HeadlessWrapper.lua')) || !existsSync(server)) return null
  return { command: exe, args: [server, pob], cwd: path.join(pob, 'src') }
}

let tag: string | null = null

/** Версия PoB движка из engine.json (`v2.67.2`); не прочиталась — '?'. */
export function engineVersion(): string {
  if (tag !== null) return tag
  try {
    const meta = JSON.parse(readFileSync(path.join(engineDir(), 'engine.json'), 'utf8')) as { pob?: { tag?: unknown } }
    const t = meta.pob?.tag
    tag = typeof t === 'string' && /^v?[\d.]{1,16}$/.test(t) ? t : '?'
  } catch {
    tag = '?'
  }
  return tag
}
