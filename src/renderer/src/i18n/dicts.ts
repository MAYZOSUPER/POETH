import type { DomainDict } from './types'
import { common } from './dict/common'
import { campaign } from './dict/campaign'
import { trade } from './dict/trade'
import { overlay } from './dict/overlay'
import { live } from './dict/live'
import { fav } from './dict/fav'
import { regex } from './dict/regex'
import { auth } from './dict/auth'
import { deals } from './dict/deals'
import { onboarding } from './dict/onboarding'
import { updates } from './dict/updates'
import { farm } from './dict/farm'
import { wealth } from './dict/wealth'
import { flip } from './dict/flip'
import { leveling } from './dict/leveling'
import { advisor } from './dict/advisor'
import { currency } from './dict/currency'
import { gameLang } from './dict/gameLang'
import { buildTree } from './dict/buildTree'
import { build } from './dict/build'
import { equip } from './dict/equip'

// Строки интерфейса по доменам: этап добавляет ключи только в свой ./dict/<домен>.ts.
// Этот список ЗАМОРОЖЕН после S0 (новый домен подключает лид; onboarding — S9). Полнота RU/EN и
// отсутствие дублей ключей между доменами проверяет tests/i18n.test.ts.
export const DOMAIN_DICTS: Record<string, DomainDict> = {
  common,
  campaign,
  trade,
  overlay,
  live,
  fav,
  regex,
  auth,
  deals,
  onboarding,
  updates,
  farm,
  wealth,
  flip,
  leveling,
  advisor,
  currency,
  gameLang,
  buildTree,
  build,
  equip
}
