// Single source of truth for IPC channel names and the typed bridge contract.
// Imported by main (handlers), preload (bridge) and renderer (consumer) so the
// channel names and payload shapes can never drift apart.
//
// Агрегатор: каналы, события и куски API живут по доменам в src/shared/ipc/*.ts.
// Этап добавляет свои каналы ТОЛЬКО в свой доменный файл; этот файл ЗАМОРОЖЕН
// после S0 (новый домен подключает лид). Уникальность ключей/строк — tests/ipc.test.ts.

import { campaignChannels, campaignEvents, type CampaignIpcApi } from './ipc/campaign'
import { tradeChannels, tradeEvents, type TradeIpcApi } from './ipc/trade'
import { appChannels, appEvents, type AppIpcApi } from './ipc/app'
import { overlayChannels, overlayEvents, type OverlayIpcApi } from './ipc/overlay'
import { liveChannels, liveEvents, type LiveIpcApi } from './ipc/live'
import { favChannels, favEvents, type FavIpcApi } from './ipc/fav'
import { regexChannels, regexEvents, type RegexIpcApi } from './ipc/regex'
import { authChannels, authEvents, type AuthIpcApi } from './ipc/auth'
import { dealsChannels, dealsEvents, type DealsIpcApi } from './ipc/deals'
import { updatesChannels, updatesEvents, type UpdatesIpcApi } from './ipc/updates'
import { wealthChannels, wealthEvents, type WealthIpcApi } from './ipc/wealth'

/** Каналы и события по доменам — для проверки уникальности в тестах. */
export const IPC_DOMAINS = {
  campaign: { channels: campaignChannels, events: campaignEvents },
  trade: { channels: tradeChannels, events: tradeEvents },
  app: { channels: appChannels, events: appEvents },
  overlay: { channels: overlayChannels, events: overlayEvents },
  live: { channels: liveChannels, events: liveEvents },
  fav: { channels: favChannels, events: favEvents },
  regex: { channels: regexChannels, events: regexEvents },
  auth: { channels: authChannels, events: authEvents },
  deals: { channels: dealsChannels, events: dealsEvents },
  updates: { channels: updatesChannels, events: updatesEvents },
  wealth: { channels: wealthChannels, events: wealthEvents }
} as const

export const IPC = {
  ...campaignChannels,
  ...tradeChannels,
  ...appChannels,
  ...overlayChannels,
  ...liveChannels,
  ...favChannels,
  ...regexChannels,
  ...authChannels,
  ...dealsChannels,
  ...updatesChannels,
  ...wealthChannels,
  events: {
    ...campaignEvents,
    ...tradeEvents,
    ...appEvents,
    ...overlayEvents,
    ...liveEvents,
    ...favEvents,
    ...regexEvents,
    ...authEvents,
    ...dealsEvents,
    ...updatesEvents,
    ...wealthEvents
  }
} as const

/** The API surface exposed on `window.overlayApi` by the preload bridge. */
export interface OverlayApi
  extends CampaignIpcApi,
    TradeIpcApi,
    AppIpcApi,
    OverlayIpcApi,
    LiveIpcApi,
    FavIpcApi,
    RegexIpcApi,
    AuthIpcApi,
    DealsIpcApi,
    UpdatesIpcApi,
    WealthIpcApi {}

export type {
  CampaignIpcApi,
  TradeIpcApi,
  AppIpcApi,
  OverlayIpcApi,
  LiveIpcApi,
  FavIpcApi,
  RegexIpcApi,
  AuthIpcApi,
  DealsIpcApi,
  UpdatesIpcApi,
  WealthIpcApi
}
