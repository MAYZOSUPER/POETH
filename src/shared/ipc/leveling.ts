// IPC домена «прокачка PoE1» (этап S14): данные маршрута, состояние персонажа, кнопки маршрута, персонажи,
// вариант маршрута, гид поверх игры. Соглашение: каналы '<домен>:<метод>' (вложенный объект с ключом домена),
// события 'event:<домен>.<имя>'. Новые ключи не должны совпадать с другими доменами (tests/ipc.test.ts).

import type {
  LevelingAction,
  LevelingConfig,
  LevelingData,
  LevelingState,
  LevelingVariant
} from '../types/leveling'

export const levelingChannels = {
  leveling: {
    data: 'leveling:data',
    state: 'leveling:state',
    act: 'leveling:act',
    setVariant: 'leveling:setVariant',
    setConfig: 'leveling:setConfig',
    profileCreate: 'leveling:profile.create',
    profileSelect: 'leveling:profile.select',
    profileUpdate: 'leveling:profile.update',
    profileRemove: 'leveling:profile.remove',
    simulate: 'leveling:simulate'
  }
} as const

export const levelingEvents = {
  levelingChanged: 'event:leveling.changed'
} as const

export interface LevelingIpcApi {
  leveling: {
    /** маршрут, зоны, квесты, камни, имена (один раз на окно) */
    data(): Promise<LevelingData>
    state(): Promise<LevelingState>
    /** ◀ ▶, галочка, «перейти к шагу», «начать заново» */
    act(action: LevelingAction): Promise<LevelingState>
    setVariant(v: Partial<LevelingVariant>): Promise<LevelingState>
    setConfig(patch: Partial<LevelingConfig>): Promise<LevelingState>
    profileCreate(name: string): Promise<LevelingState>
    profileSelect(id: string): Promise<LevelingState>
    profileUpdate(id: string, patch: { name?: string; className?: string | null; character?: string | null }): Promise<LevelingState>
    profileRemove(id: string): Promise<LevelingState>
    /** прогнать строки Client.txt (проверка, тесты) */
    simulate(lines: string[]): Promise<LevelingState>
  }
  onLevelingChanged(cb: (state: LevelingState) => void): () => void
}
