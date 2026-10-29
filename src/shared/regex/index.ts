// Regex-строки для поиска в игре (S7): чистый TS без electron — main, renderer и тесты.

export { atLeast, type AtLeastOptions } from './atLeast'
export { compileSearch, matchesSearch, parseSearch, type EmulatorOptions, type SearchTerm } from './emulator'
export { REGEX_LIMIT, escapeRegex, foldYo, formatTerm, joinTerms, type Term } from './format'
export { coverMods, getModIndex, type CoverResult, type ModIndex } from './cover'
export { MAP_LABEL_KEYS, buildMapRegex, emptyMapQuery, thresholdTerm } from './maps'
export {
  RGB_PATTERN,
  SIX_SOCKETS_PATTERN,
  VENDOR_ITEM_CLASSES,
  VENDOR_MOD_KEYS,
  VENDOR_PRESETS,
  VENDOR_RARITIES,
  VENDOR_TEXTS,
  buildVendorRegex,
  colorLinkPattern,
  emptyVendorQuery,
  isPresetQuery,
  isThresholdMod,
  linkPattern,
  presetQuery,
  selectedMods,
  vendorModPattern,
  vendorModText,
  vendorParts,
  type VendorBuildResult,
  type VendorPreset
} from './vendor'
export { VENDOR_DATA, VENDOR_DATA_META } from './vendorData'
export type { VendorData, VendorLangData, VendorModPattern, VendorSideReason } from './vendorTypes'
export { REGEX_PRESETS, presetText, type RegexPreset } from './presets'
export {
  LIBRARY_EXPORT_FORMAT,
  NAME_MAX,
  assignSlot,
  defaultRegexPrefs,
  emptyLibrary,
  exportPayload,
  importEntries,
  normalizeLibrary,
  pasteText,
  patchPrefs,
  removeEntry,
  sanitizeEntry,
  upsertEntry
} from './library'
