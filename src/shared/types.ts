// Shared domain types — imported by main, preload and renderer.
// The dataset (acts/quests/layouts/gems/route) is READ-ONLY at runtime.
// Per-user progress and settings are mutable and live in %APPDATA%.

// ---------------------------------------------------------------------------
// Dataset (read-only, shipped in the app bundle)
// ---------------------------------------------------------------------------

export type RewardKind =
  | 'skill_point'
  | 'passive_point'
  | 'spirit'
  | 'resistance'
  | 'attribute'
  | 'life'
  | 'mana'
  | 'charm_slot'
  | 'weapon_set_point'
  | 'skill_gem'
  | 'support_gem'
  | 'uncut_gem'
  | 'crafting'
  | 'unique_item'
  | 'currency'
  | 'ring_or_amulet'
  | 'other'

export interface Reward {
  kind: RewardKind
  /** Human-readable value, e.g. "+30 Spirit" */
  value: string
  /** Numeric part for validation/summing, e.g. 30 */
  numeric?: number
  /** True when the player must choose between mutually-exclusive options */
  swappable?: boolean
  options?: string[]
}

export type QuestType = 'mandatory' | 'optional'

export interface Quest {
  /** STABLE, patch-independent id — the persistence key. Never renumbered. e.g. "a1q-beira" */
  id: string
  name: string
  type: QuestType
  /** true when this quest entry is a boss encounter */
  boss?: boolean
  /** areaId of the zone this quest is associated with */
  zone: string
  rewards: Reward[]
  /** areaId override for the layout to show; falls back to `zone` */
  layout?: string | null
  /** gem ids (FK into GemCatalog.gems) suggested around this quest */
  gems?: string[]
  notes?: string
  /** Russian translation of `notes` (falls back to `notes` when absent) */
  notesRu?: string
  /** Advisory auto-detection: areaId whose entry hints this quest is active. null = manual only. */
  autoComplete?: { onZoneEnter: string | null } | null
}

export interface Zone {
  /** OUR stable area id, e.g. "a1-clearfell" — primary layout key */
  areaId: string
  name: string
  levelRange?: [number, number]
  isTown?: boolean
  /** areaId key into the layout manifest; defaults to this zone's areaId */
  layout?: string | null
  notes?: string
  /** upstream cross-reference keys, for the build pipeline only */
  xref?: {
    exileUiAreaId?: string
    exileLevelingAreaId?: string
    domistaeZoneSlug?: string
  }
}

export type ActKind = 'act' | 'interlude'

export interface Act {
  id: string
  actNumber: number
  actName: string
  kind: ActKind
  zones: Zone[]
  quests: Quest[]
}

export interface LayoutRef {
  areaId: string
  /** Exile-UI image filenames for this area */
  files: string[]
  /** When true, the layout orientation is fixed (do not offer rotation) */
  rotationLocked?: boolean
  attribution?: string
}

export type LayoutManifest = Record<string, LayoutRef>

export interface Gem {
  id: string
  name: string
  kind: 'active' | 'support' | 'spirit' | 'meta'
  primaryAttribute?: 'str' | 'dex' | 'int' | null
  requiredLevel?: number
  colour?: 'red' | 'green' | 'blue' | 'white'
}

export interface GemRecommendation {
  class?: string
  buildTag?: string
  actId: string
  primaryGemIds: string[]
  supportGemIds: string[]
  /** English editorial note */
  note?: string
  /** Russian editorial note (falls back to `note` when absent) */
  noteRu?: string
}

export interface GemCatalog {
  gems: Record<string, Gem>
  recommendations: GemRecommendation[]
}

export interface RouteStep {
  order: number
  actId: string
  areaId?: string
  questId?: string
  text: string
  optional?: boolean
  rewardSummary?: string
}

export interface Route {
  patch: string
  steps: RouteStep[]
}

export interface DatasetSource {
  name: string
  url: string
  license: string
  commit?: string
}

export interface DatasetMeta {
  /** OUR schema version (semver) */
  schemaVersion: string
  /** Game patch the data targets, e.g. "0.5" */
  gamePatch: string
  gameVersionLabel: string
  generatedAt: string
  sources: DatasetSource[]
  actCount: number
  /** Base URL (incl. trailing slash) to fetch layout images from when not cached */
  layoutRemoteBaseUrl?: string
}

export interface Trial {
  id: string
  name: string
  nameRu?: string
  /** act this trial first becomes available in */
  actId: string
  /** ascendancy points granted on first completion */
  points: number
  phase: 'campaign' | 'endgame'
  note?: string
  noteRu?: string
}

export interface AscendancyOption {
  id: string
  name: string
  nameRu?: string
}

export interface AscendancyClass {
  /** base class name, matches ProfileMeta.className */
  base: string
  options: AscendancyOption[]
}

export interface AscendancyData {
  trials: Trial[]
  classes: AscendancyClass[]
}

export interface ZoneCue {
  icon?: string
  cue: string
  leadsTo?: string
}

export interface ZoneHint {
  layoutType?: string
  objective?: string
  exit?: string
  tips?: string[]
  cues?: ZoneCue[]
}

/** The fully-assembled dataset the renderer consumes. */
export interface Dataset {
  meta: DatasetMeta
  acts: Act[]
  layouts: LayoutManifest
  gems?: GemCatalog
  route?: Route
  /** full game areaId -> display name (incl. towns/trials not in the checklist) */
  areas?: Record<string, string>
  /** per-zone navigation hints (English), keyed by zone display name (lowercase) */
  hints?: Record<string, ZoneHint>
  /** Russian navigation hints, same keys */
  hintsRu?: Record<string, ZoneHint>
  /** EN->RU display names, keyed by normalized English name */
  namesRu?: Record<string, string>
  /** ascendancy classes + trials reference */
  ascendancy?: AscendancyData
}

// ---------------------------------------------------------------------------
// Mutable per-user state (%APPDATA%)
// ---------------------------------------------------------------------------

export interface ProfileMeta {
  id: string
  name: string
  className?: string
  createdAt: number
  updatedAt: number
}

/** Result of exporting the active profile to a user-chosen file. */
export type ProfileExportResult =
  | { status: 'saved'; path: string }
  | { status: 'canceled' }
  | { status: 'error' }

/** Result of importing a profile bundle from a user-chosen file. */
export type ProfileImportResult =
  | { status: 'created'; profile: ProfileMeta; profiles: ProfileMeta[] }
  | { status: 'canceled' }
  | { status: 'invalid' }

export interface ProgressState {
  profileId: string
  schemaVersion: number
  currentAct: number
  level: number
  /** completion keyed by STABLE quest id */
  completedQuestIds: Record<string, true>
  /** subset of completedQuestIds that was set by auto-progression (for the "авто" badge);
   * a manual toggle removes the id from here ("claims" the tick) */
  autoCompletedQuestIds: Record<string, true>
  /** chosen option index for swappable rewards, keyed by quest id */
  rewardChoices: Record<string, number>
  /** completed trials keyed by trial id (manual — completion isn't auto-detectable) */
  completedTrialIds: Record<string, true>
  /** chosen ascendancy option id, or null */
  ascendancyId: string | null
  updatedAt: number
}

export interface HotkeyMap {
  toggleVisible: string
  toggleLock: string
  prevStep: string
  nextStep: string
  /** price-check the item currently in the clipboard */
  priceCheck: string
}

export type UiLang = 'ru' | 'en'

/** top-level app view */
export type AppTab = 'campaign' | 'priceCheck'

export interface Settings {
  schemaVersion: number
  activeProfileId: string | null
  /** interface language */
  uiLang: UiLang
  /** language for game zone/boss names (independent of uiLang) */
  nameLang: UiLang
  /** 0.2 .. 1.0 */
  opacity: number
  /** force full click-through (overlay never steals clicks) */
  locked: boolean
  overlayVisible: boolean
  /** show the overlay window on the Windows taskbar */
  showInTaskbar: boolean
  /** cursor poll interval for selective click-through, ms */
  clickThroughPollMs: number
  /** path to Client.txt; null = not configured */
  logPath: string | null
  /** phase 3: enable the advisory log tailer */
  tailerEnabled: boolean
  autoAdvanceZone: boolean
  /** default OFF — quest completion can never be reliably auto-detected */
  autoCheckQuests: boolean
  hotkeys: HotkeyMap
  /** last opened top-level tab */
  lastAppTab: AppTab
  /** PoE2 trade league for price-check, e.g. "Standard" */
  league: string
}

// ---------------------------------------------------------------------------
// Price check (PoE2 trade API)
// ---------------------------------------------------------------------------

export interface TradeListing {
  amount: number
  currency: string
  account?: string
  /** ready-made @whisper string from the trade API */
  whisper?: string
  indexed?: string
}

export interface PriceResult {
  /** human label of what we searched (item/base name) */
  query: string
  league: string
  /** total listings the API reported */
  total: number
  /** top listings (cheapest first) */
  listings: TradeListing[]
  min?: { amount: number; currency: string }
  median?: { amount: number; currency: string }
  /** caveat, e.g. "rare matched by base only (approx)" */
  note?: string
  /** pathofexile.com/trade2 URL to open the search in a browser */
  searchUrl?: string
}

export type PriceCheckResult =
  | { status: 'ok'; item: { name: string; rarity: string }; result: PriceResult }
  | { status: 'no-session' }
  | { status: 'not-an-item' }
  | { status: 'empty'; item: { name: string; rarity: string } }
  | { status: 'error'; message: string }

// ---------------------------------------------------------------------------
// Events (main -> renderer)
// ---------------------------------------------------------------------------

export interface ZoneEvent {
  /** raw game areaId from the log (e.g. "g1_2"); matches Zone.xref.exileUiAreaId */
  areaId?: string
  /** display name fallback (from the [SCENE] log line) */
  areaName?: string
  at: number
}

export interface LevelEvent {
  character: string
  level: number
  at: number
}

/** A campaign boss was defeated (inferred from the log: boss-name dialogue + passive-point award). */
export interface BossDefeatEvent {
  /** the matched quest id to auto-check */
  questId: string
  /** the boss display name that matched (for logging) */
  name: string
  phase: 'defeated'
  at: number
}

export interface TailerStatus {
  running: boolean
  logPath: string | null
  found: boolean
  /** last detected zone (so the UI can sync current state on startup) */
  areaId?: string
  areaName?: string
  level?: number
}

export type HotkeyAction =
  | 'toggleVisible'
  | 'toggleLock'
  | 'prevStep'
  | 'nextStep'
  | 'priceCheck'

/** Window-space rectangle reported by the renderer for selective click-through. */
export interface InteractiveRect {
  x: number
  y: number
  width: number
  height: number
}
