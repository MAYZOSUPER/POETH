// Типы для тестов (tests/data): data-channel.mjs — обычный JS для node без сборки.

export const DATA_GAMES: string[]
export function manifestName(game: string): string
export function ownerOf(entry: string): string | null
export function entriesToReplace(entries: string[], games: string[]): string[]
export const MAX_PREV: number
export function nonPriceChanges(baseFiles: Record<string, { sha256: string }>, files: Record<string, { sha256: string }>): string[]
export function prevVersions(history: string[], sha: string, max?: number): string[]
export function assertFullHistory(root: string): void
export function gitDataHistory(root: string, game: string): Map<string, string[]>
