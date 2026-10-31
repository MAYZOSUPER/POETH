import { useEffect, useState } from 'react'
import type { Poe2ValuableInput, Poe2ValuableKind } from '@shared/types'
import { ItemCategory, ItemRarity, type ParsedItem } from '@shared/poe2/parser'
import type { CapturedItem } from '@shared/types/overlay'
import { Icon } from '../../Icon'
import { useFarmStore } from '../../../store/useFarmStore'
import type { Pc2Result } from './store'

// «Богатство PoE 2» (S70) в подвале окна цены: «В богатство» — ценный предмет с ценой этого окна; «К забегу» — то же
// и находка текущего забега (только когда идёт сессия фарма). Одно нажатие — один предмет. Цена — в exalted: у Ange
// (валюта) или рекомендованная цена трейда по курсу; без цены в ex кнопки неактивны.

type T = (key: string, params?: Record<string, string | number>) => string

const GEMS = new Set([ItemCategory.Gem, ItemCategory.UncutGem])

function kindOf(item: ParsedItem): Poe2ValuableKind {
  if (item.category !== undefined && GEMS.has(item.category)) return 'gem'
  if (item.category === ItemCategory.Currency) return 'currency'
  switch (item.rarity) {
    case ItemRarity.Unique:
      return 'unique'
    case ItemRarity.Rare:
      return 'rare'
    case ItemRarity.Magic:
      return 'magic'
    case ItemRarity.Normal:
      return 'normal'
    default:
      return 'other'
  }
}

/** Предмет окна → ценный предмет «Богатства»: английское имя (у редкого — имя из игры), база, цена в ex. */
export function valuableInput(item: ParsedItem, captured: CapturedItem, result: Pc2Result | undefined): Poe2ValuableInput | null {
  if (!result) return null
  const kind = kindOf(item)
  let unit: number | undefined
  let qty = 1
  let low = false
  if (result.kind === 'ange') {
    unit = result.ange.exalted
    qty = Math.max(1, result.stack)
    low = result.ange.low
  } else {
    unit = result.verdict.exalted
    low = result.kind === 'trade' && (result.verdict.fairLots ?? 0) < 4
  }
  if (!unit || !(unit > 0)) return null
  const rareName = captured.text.split(/\r?\n/)[2]
  const name = kind === 'rare' && rareName && rareName !== '--------' ? rareName.trim() : item.info.refName
  const base = kind === 'unique' ? item.info.unique?.base : kind === 'rare' || kind === 'magic' ? item.info.refName : undefined
  const out: Poe2ValuableInput = { name, kind, qty, unit, source: result.kind === 'ange' ? 'ange' : 'trade' }
  if (base && base !== name) out.base = base
  if (low) out.low = true
  return out
}

/** Сессия фарма идёт (трекер карт): «К забегу» показываем только тогда. */
function useFarmRunning(): boolean {
  const init = useFarmStore((s) => s.init)
  const running = useFarmStore((s) => !!s.state?.session && s.state.session.endedAt === null)
  useEffect(() => {
    let off: (() => void) | null = null
    let disposed = false
    void init()
      .then((fn) => (disposed ? fn() : (off = fn)))
      .catch(() => undefined)
    return () => {
      disposed = true
      off?.()
    }
  }, [init])
  return running
}

export function WealthButtons({ input, t }: { input: Poe2ValuableInput | null; t: T }) {
  const running = useFarmRunning()
  const [st, setSt] = useState<'idle' | 'busy' | 'wealth' | 'run' | 'fail'>('idle')
  const key = input ? `${input.name}|${input.unit}|${input.qty}` : ''
  // новый предмет или цена — кнопки снова доступны
  useEffect(() => setSt('idle'), [key])
  const add = async (toRun: boolean): Promise<void> => {
    if (!input || st === 'busy') return
    setSt('busy')
    const r = await window.overlayApi.wealth.poe2AddItem(toRun ? { ...input, toRun: true } : input).catch(() => ({ ok: false as const }))
    setSt(r.ok ? (toRun ? 'run' : 'wealth') : 'fail')
  }
  const done = st === 'wealth' || st === 'run'
  return (
    <>
      <button
        type="button"
        className={`ui-btn${running ? '' : ' ui-btn--primary'}`}
        title={input ? t('wealth.p2.pc.add.help') : t('wealth.p2.pc.noPrice')}
        disabled={!input || st === 'busy' || done}
        onClick={() => void add(false)}
      >
        <Icon name={st === 'wealth' ? 'check' : 'coins'} />
        {t('wealth.p2.pc.add')}
      </button>
      {running && (
        <button
          type="button"
          className="ui-btn ui-btn--primary"
          title={t('wealth.p2.pc.run.help')}
          disabled={!input || st === 'busy' || done}
          onClick={() => void add(true)}
        >
          <Icon name={st === 'run' ? 'check' : 'plus'} />
          {t('wealth.p2.pc.run')}
        </button>
      )}
      {(done || st === 'fail') && (
        <div className={`w2-pc-ok${st === 'fail' ? ' is-fail' : ''}`} role="status">
          <Icon name={st === 'fail' ? 'warn' : 'check'} />
          {st === 'fail' ? t('wealth.p2.pc.fail') : t(st === 'run' ? 'wealth.p2.pc.doneRun' : 'wealth.p2.pc.done')}
        </div>
      )}
    </>
  )
}
