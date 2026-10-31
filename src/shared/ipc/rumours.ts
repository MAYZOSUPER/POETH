// IPC домена «Слухи журнала» (S65, PoE 2): данные слухов, выбранные видимые слухи и пометки игрока (хранит main
// в userData/rumours.json), цены главных наград (источники — в main). Окна передают только id слухов и пометку;
// путей, адресов и текста буфера не передают. Каналы нужны и компаньону, и оверлею (короткий вид поверх игры).

import type { RumourMark, RumourPriceBook, RumoursData, RumoursOverlayCmd, RumoursUserState } from '../types/rumours'

export const rumoursChannels = {
  rumours: {
    data: 'rumours:data',
    state: 'rumours:state',
    setPicked: 'rumours:setPicked',
    setMark: 'rumours:setMark',
    prices: 'rumours:prices'
  }
} as const

export const rumoursEvents = {
  rumoursState: 'event:rumours.state',
  rumoursOverlay: 'event:rumours.overlay'
} as const

export interface RumoursIpcApi {
  rumours: {
    /** слухи из данных (пакет данных или встроенные) */
    data(): Promise<RumoursData>
    /** выбранные слухи и пометки */
    state(): Promise<RumoursUserState>
    /** выбрать видимые слухи руками (до 6 id); пустой список — сбросить */
    setPicked(ids: string[]): Promise<RumoursUserState>
    /** поставить или снять свою пометку (null — снять) */
    setMark(id: string, mark: RumourMark | null): Promise<RumoursUserState>
    /** цены главных наград (кэш main; refresh — спросить источники заново) */
    prices(refresh?: boolean): Promise<RumourPriceBook>
  }
  onRumoursState(cb: (state: RumoursUserState) => void): () => void
  onRumoursOverlay(cb: (cmd: RumoursOverlayCmd) => void): () => void
}
