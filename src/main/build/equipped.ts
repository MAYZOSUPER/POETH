import { app } from 'electron'
import path from 'path'
import {
  EQUIPPED_FILE,
  emptyEquipFile,
  equipStateOf,
  forgetEquip,
  parseEquipFile,
  putEquip,
  setMine,
  type EquipFile
} from '@shared/build/equipCompareStore'
import type { EquipState } from '@shared/types/equip'
import { readJson, writeJsonAtomic } from '../services/atomicJson'

// Запомненные надетые вещи «Против надетого» (S41): userData/equipped.json — только на этом компьютере, атомарная
// запись по одной очереди, набор на персонажа текущего входа. Проверка файла и все изменения — чистые функции
// src/shared/build/equipCompareStore.ts. Текста предмета в файле нет — только числа и короткие поля.

let file: EquipFile | null = null
let loading: Promise<EquipFile> | null = null
let writing: Promise<void> = Promise.resolve()

const filePath = (): string => path.join(app.getPath('userData'), EQUIPPED_FILE)

async function load(): Promise<EquipFile> {
  if (file) return file
  loading ??= readJson<unknown>(filePath(), null).then((raw) => {
    file ??= raw ? parseEquipFile(raw) : emptyEquipFile()
    return file
  })
  return loading
}

function commit(next: EquipFile): void {
  if (next === file) return
  file = next
  writing = writing
    .catch(() => undefined)
    .then(() => writeJsonAtomic(filePath(), next))
    .catch((e) => console.warn('[equip] cannot save equipped.json', e))
}

export async function getEquipState(char: string | null, level: number | null): Promise<EquipState> {
  return equipStateOf(await load(), char, level)
}

export async function saveEquip(char: string | null, level: number | null, slot: unknown, item: unknown): Promise<EquipState> {
  commit(putEquip(await load(), char, slot, item, Date.now()))
  return equipStateOf(await load(), char, level)
}

export async function forgetEquipSlot(char: string | null, level: number | null, slot: unknown): Promise<EquipState> {
  commit(forgetEquip(await load(), char, slot, Date.now()))
  return equipStateOf(await load(), char, level)
}

export async function setEquipMine(char: string | null, level: number | null, mine: unknown): Promise<EquipState> {
  commit(setMine(await load(), char, mine, Date.now()))
  return equipStateOf(await load(), char, level)
}
