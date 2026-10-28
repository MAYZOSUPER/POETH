// Shared domain types — imported by main, preload and renderer.
// Агрегатор: сами типы лежат по доменам в src/shared/types/*.ts — новый код
// может импортировать и отсюда, и из доменного файла.

export * from './types/app'
export * from './types/settings'
export * from './types/campaign'
export * from './types/trade'
export * from './types/overlay'
export * from './types/live'
export * from './types/fav'
export * from './types/regex'
export * from './types/auth'
export * from './types/deals'
export * from './types/updates'
export * from './types/wealth'
