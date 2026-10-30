// IPC домена «избранное и трейд-окно» (S5).
// Соглашение: каналы '<домен>:<метод>' (вложенный объект с ключом домена),
// события 'event:<домен>.<имя>'. Новые ключи не должны совпадать с другими доменами
// (проверяет tests/ipc.test.ts).

import type {
  CurrentSearchResult,
  FavData,
  FavFolderInput,
  FavImportResult,
  FavLiveSnapshot,
  FavSearch,
  FavSearchInput,
  TradeSiteState,
  TradeWindowTarget
} from '../types'
import type { GameId } from '../games'
import type { BookmarkError, SitesState, SitesTarget, SiteTabId } from '../sites'
import type { RailPref } from '../rail'

export const favChannels = {
  fav: {
    list: 'fav:list',
    saveFolder: 'fav:saveFolder',
    deleteFolder: 'fav:deleteFolder',
    archiveFolder: 'fav:archiveFolder',
    reorderFolders: 'fav:reorderFolders',
    saveSearch: 'fav:saveSearch',
    add: 'fav:add',
    deleteSearch: 'fav:deleteSearch',
    archiveSearch: 'fav:archiveSearch',
    moveSearch: 'fav:moveSearch',
    open: 'fav:open',
    current: 'fav:current',
    importBt: 'fav:importBt',
    exportBt: 'fav:exportBt',
    setLive: 'fav:setLive',
    setNotify: 'fav:setNotify',
    live: 'fav:live',
    copy: 'fav:copy'
  },
  tradeWindow: {
    open: 'tradeWindow:open',
    toggle: 'tradeWindow:toggle',
    hide: 'tradeWindow:hide',
    nav: 'tradeWindow:nav',
    setPinned: 'tradeWindow:setPinned',
    setSidebar: 'tradeWindow:setSidebar',
    state: 'tradeWindow:state',
    openInBrowser: 'tradeWindow:openInBrowser',
    // S58: шапка обычного окна и рельс сайтов — только сайдбар трейд-окна (policy.ts TRADE_WINDOW_CHANNELS
    // + проверка, что звал именно сайдбар этого окна)
    minimize: 'tradeWindow:minimize',
    toggleMaximize: 'tradeWindow:toggleMaximize',
    setRail: 'tradeWindow:setRail',
    railDrawer: 'tradeWindow:railDrawer'
  },
  // вкладки сайтов трейд-окна (S43)
  sites: {
    state: 'sites:state',
    select: 'sites:select',
    open: 'sites:open',
    ackNote: 'sites:ackNote',
    addBookmark: 'sites:addBookmark',
    removeBookmark: 'sites:removeBookmark',
    clearData: 'sites:clearData'
  }
} as const

export const favEvents = {
  favChanged: 'event:fav.changed',
  favSite: 'event:fav.site',
  favLive: 'event:fav.live',
  favBlocked: 'event:fav.blocked',
  favSites: 'event:fav.sites',
  favSitesBlocked: 'event:fav.sitesBlocked'
} as const

export interface FavIpcApi {
  fav: {
    list(): Promise<FavData>
    /** создать (нет id) или переименовать папку; возвращает id */
    saveFolder(input: FavFolderInput): Promise<string>
    /** удалить папку вместе с поисками */
    deleteFolder(id: string): Promise<void>
    archiveFolder(id: string, archived: boolean): Promise<void>
    reorderFolders(game: GameId, ids: string[]): Promise<void>
    /** создать (нет id) или изменить поиск */
    saveSearch(input: FavSearchInput): Promise<FavSearch | null>
    /** «В избранное» из прайс-чека/live: в указанную папку или «без папки» */
    add(input: FavSearchInput): Promise<FavSearch | null>
    deleteSearch(id: string): Promise<void>
    archiveSearch(id: string, archived: boolean): Promise<void>
    /** перенести поиск в папку на позицию (по умолчанию — в конец) */
    moveSearch(id: string, folderId: string, index?: number): Promise<void>
    /** открыть поиск в трейд-окне */
    open(id: string): Promise<void>
    /** текущий поиск на странице сайта (для «Сохранить текущий поиск») */
    current(): Promise<CurrentSearchResult>
    /** импорт строк Better Trading "3:…" (одна строка — одна папка) */
    importBt(text: string): Promise<FavImportResult>
    /** экспорт: папка или все активные папки игры (по строке на папку) */
    exportBt(folderId: string | null, game: GameId): Promise<string>
    setLive(id: string, enabled: boolean): Promise<{ ok: boolean; reason?: string }>
    setNotify(id: string, notify: boolean): Promise<void>
    /** состояние live search по поискам (адаптер S6) */
    live(): Promise<FavLiveSnapshot>
    /** скопировать текст в буфер обмена */
    copy(text: string): Promise<void>
  }
  tradeWindow: {
    /** показать трейд-окно; target — адрес сайта или поиск (slug + тип) */
    open(target?: TradeWindowTarget): Promise<void>
    toggle(): Promise<void>
    hide(): Promise<void>
    nav(action: 'back' | 'forward' | 'reload' | 'stop' | 'home'): Promise<void>
    setPinned(pinned: boolean): Promise<void>
    /** свернуть/развернуть колонку избранного */
    setSidebar(collapsed: boolean): Promise<void>
    state(): Promise<TradeSiteState>
    /** текущую страницу сайта — в системный браузер */
    openInBrowser(): Promise<boolean>
    /** S58, шапка обычного окна: свернуть в панель задач (поверх игры — ничего) */
    minimize(): Promise<void>
    /** S58: развернуть на весь экран или восстановить (поверх игры — ничего) */
    toggleMaximize(): Promise<void>
    /** S58: рельс сайтов развёрнут или свёрнут — запоминается между запусками */
    setRail(pref: RailPref): Promise<void>
    /** S58: шторка рельса на узком окне открыта — сайдбар поднимается над вью сайта, закрыта — опускается */
    railDrawer(open: boolean): Promise<void>
  }
  /** вкладки сайтов трейд-окна (S43): poe.ninja, poedb, вики… и закладки игрока */
  sites: {
    state(): Promise<SitesState>
    /** переключить вкладку открытого окна */
    select(tab: SiteTabId): Promise<void>
    /** показать окно на вкладке сайта (по умолчанию — последней); url — страница этого сайта (глубокая ссылка) */
    open(target?: SitesTarget): Promise<void>
    /** «Понятно» в заметке о приватности */
    ackNote(): Promise<void>
    addBookmark(input: { title: string; url: string }): Promise<{ ok: true; tab: SiteTabId } | { ok: false; reason: BookmarkError }>
    removeBookmark(id: string): Promise<void>
    /** стереть cookies и кэш сессии сайтов (сессию аккаунта не трогает) */
    clearData(): Promise<void>
  }
  onFavChanged(cb: (data: FavData) => void): () => void
  onTradeSite(cb: (state: TradeSiteState) => void): () => void
  onFavLive(cb: (snapshot: FavLiveSnapshot) => void): () => void
  /** сайт попытался уйти с pathofexile.com (ссылка открыта в браузере или заблокирована) */
  onTradeBlocked(cb: (info: { host: string; external: boolean }) => void): () => void
  onSites(cb: (state: SitesState) => void): () => void
  /** вкладка сайта попыталась уйти со своего сайта (ссылка открыта в браузере или заблокирована) */
  onSitesBlocked(cb: (info: { host: string; external: boolean }) => void): () => void
}
