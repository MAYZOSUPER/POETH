import type { UiLang } from '@shared/types'

export type Dict = Record<string, string>

/** Строки одного домена на всех языках интерфейса. */
export type DomainDict = Record<UiLang, Dict>
