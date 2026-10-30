import { useEffect, useState } from 'react'
import { getDefaultPoe1DataStore, type Poe1Data } from '@shared/poe1/data'
import { itemPrices, type ItemPrice } from '@shared/build/keyItems'
import type { GameLang } from '@shared/types/settings'
import { useAppStore } from '../../store/useAppStore'

// Данные для «Предметов этапа» (S40): данные APT (EN — парсер и запрос трейда; RU — имена и моды на языке клиента
// и имена для ru.pathofexile.com) и цены уников из снимка poe.ninja S33 — только если функция «Предметы» включена
// и снимок уже есть (свой запрос в сеть отсюда не делаем: flip.itemsState только читает состояние main).

export interface ItemsData {
  en: Poe1Data | null
  /** данные языка клиента игры (RU) или null, если клиент EN */
  game: Poe1Data | null
  /** данные языка сайта трейда, если он RU (ru.pathofexile.com не принимает английские имена) */
  site: Poe1Data | null
  prices: ReadonlyMap<string, ItemPrice> | null
  /** время снимка цен (мс) */
  pricesAt: number | null
}

let pricesOnce: Promise<{ prices: Map<string, ItemPrice>; at: number } | null> | null = null

function loadPrices(): Promise<{ prices: Map<string, ItemPrice>; at: number } | null> {
  pricesOnce ??= window.overlayApi.flip
    .itemsState()
    .then((s) => (s.supported && s.at && s.rows.length ? { prices: itemPrices(s.rows), at: s.at } : null))
    .catch(() => null)
  return pricesOnce
}

export function useItemsData(gameLang: GameLang): ItemsData {
  const siteRu = useAppStore((s) => s.settings?.siteHost === 'ru.pathofexile.com')
  const needRu = gameLang === 'ru' || siteRu
  const [en, setEn] = useState<Poe1Data | null>(null)
  const [ru, setRu] = useState<Poe1Data | null>(null)
  const [prices, setPrices] = useState<{ prices: Map<string, ItemPrice>; at: number } | null>(null)
  useEffect(() => {
    let alive = true
    const store = getDefaultPoe1DataStore()
    void store
      .ensureLanguage('en')
      .then((d) => alive && setEn(d))
      .catch(() => undefined)
    if (needRu)
      void store
        .ensureLanguage('ru')
        .then((d) => alive && setRu(d))
        .catch(() => undefined)
    void loadPrices().then((p) => alive && setPrices(p))
    return () => {
      alive = false
    }
  }, [needRu])
  return {
    en,
    game: gameLang === 'ru' ? ru : null,
    site: siteRu ? ru : null,
    prices: prices?.prices ?? null,
    pricesAt: prices?.at ?? null
  }
}
