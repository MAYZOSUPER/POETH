import { contextBridge } from 'electron'
import type { OverlayApi } from '@shared/ipc'
import { campaignBridge } from './domains/campaign'
import { tradeBridge } from './domains/trade'
import { appBridge } from './domains/app'
import { overlayBridge } from './domains/overlay'
import { liveBridge } from './domains/live'
import { favBridge } from './domains/fav'
import { regexBridge } from './domains/regex'
import { authBridge } from './domains/auth'
import { dealsBridge } from './domains/deals'
import { updatesBridge } from './domains/updates'
import { farmBridge } from './domains/farm'
import { wealthBridge } from './domains/wealth'
import { flipBridge } from './domains/flip'

// window.overlayApi — мост contextBridge. Куски по доменам: src/preload/domains/*.ts
// (этап меняет только свой файл). Этот файл ЗАМОРОЖЕН после S0.
const api: OverlayApi = {
  ...campaignBridge(),
  ...tradeBridge(),
  ...appBridge(),
  ...overlayBridge(),
  ...liveBridge(),
  ...favBridge(),
  ...regexBridge(),
  ...authBridge(),
  ...dealsBridge(),
  ...updatesBridge(),
  ...farmBridge(),
  ...wealthBridge(),
  ...flipBridge()
}

contextBridge.exposeInMainWorld('overlayApi', api)
