import { apiUrl, getGameDef, type SiteHost } from '@shared/games'
import { getSettings } from '../services/settingsStore'
import { isAccountUrl } from './guards'
import { httpRequest, netLog } from './http'
import { TradeGateway, type GatewayRequest, type GatewayResult, type TradeApiRequest } from './tradeGateway'

// Боевой экземпляр шлюза: транспорт — http.ts (сессия аккаунта, Chromium), URL —
// games.ts apiUrl, хост — настройка siteHost (PoE2 — www, как в прайс-чеке компаса).

let gateway: TradeGateway | null = null

async function hostFor(req: TradeApiRequest): Promise<SiteHost> {
  if (req.host) return req.host
  if ((req.game ?? 'poe1') === 'poe2') return 'www.pathofexile.com'
  return (await getSettings()).siteHost
}

export function getTradeGateway(): TradeGateway {
  if (gateway) return gateway
  gateway = new TradeGateway({
    transport: async (r) => {
      const res = await httpRequest({ url: r.url, method: r.method, body: r.body })
      return { status: res.status, headers: res.headers, body: res.body }
    },
    resolveUrl: async (req) => {
      const url = apiUrl(getGameDef(req.game ?? 'poe1'), await hostFor(req), req.endpoint, req.rest)
      if (!isAccountUrl(url)) throw new Error('not a trade API url')
      return url
    },
    log: (msg) => netLog('debug', msg)
  })
  return gateway
}

/** Запрос к трейд-API через шлюз (лимиты, очередь, fail-fast, кэш). */
export function tradeRequest<T = unknown>(r: GatewayRequest): Promise<GatewayResult<T>> {
  return getTradeGateway().request<T>(r)
}
