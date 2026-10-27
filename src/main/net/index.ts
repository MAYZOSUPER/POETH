// Публичный вход в сетевой слой S3 для других этапов (только main):
//  S4 прайс-чек    — tradeRequest({kind:'search'|'fetch'|'exchange', priority:'interactive', req}),
//                    getEffectiveLeague()
//  S5 трейд-окно   — siteWebPreferences(), hardenSiteContents(), siteLoginUrl()
//  S6 live search  — tradeRequest({kind:'live-fetch', priority:'background'}), cookieHeaderFor(wssUrl),
//                    getAuthStatus()/onAuthStatus() (401 → ждать входа)
// Значения cookies отсюда наружу (в renderer, логи) не передавать.

export { initNetIdentity, getUserAgent, getAccountSession, getAnonSession, cookieHeaderFor } from './session'
export { httpRequest, HttpError, netLog, type HttpRequest, type HttpResponse } from './http'
export { tradeRequest, getTradeGateway } from './gateway'
export type { GatewayRequest, GatewayResult, TradeApiRequest } from './tradeGateway'
export type { PolicyKind, Priority } from './rateLimit'
export { siteWebPreferences, hardenSiteContents, siteLoginUrl } from './siteContents'
export { getAuthStatus, onAuthStatus } from './account'
export { getLeagueState, getEffectiveLeague, onLeaguesChanged, refreshLeagues } from './leagues'
