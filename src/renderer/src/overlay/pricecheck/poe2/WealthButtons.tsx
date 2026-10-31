import { useEffect, useState } from 'react'
import type { Poe2ValuableInput, Poe2ValuableKind } from '@shared/types'
import type { FarmFindInput, FarmFindRarity } from '@shared/types/farm'
import { ItemCategory, ItemRarity, type ParsedItem } from '@shared/poe2/parser'
import type { CapturedItem } from '@shared/types/overlay'
import { Icon } from '../../Icon'
import { useFarmStore } from '../../../store/useFarmStore'
import type { Pc2Result } from './store'

// «Богатство PoE 2» (S70) в подвале окна цены по макету: «В богатство» — ценный предмет с ценой этого окна (валюту и
// стопки не предлагаем: их считают быстрый ввод и снимок вкладки, иначе предмет посчитался бы дважды); «К забегу» —
// находка текущего забега трекера карт (S69, «+ находка»), только во время сессии фарма. Одно нажатие — один предмет.

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

/** Валюта и прочие стопки (цена у Ange, обмен): в «Богатство» — быстрым вводом или снимком вкладки. */
function isStack(item: ParsedItem, result: Pc2Result | undefined): boolean {
  return kindOf(item) === 'currency' || result?.kind === 'ange' || result?.kind === 'bulk'
}

/** Цена всего предмета (стопки) в exalted из результата окна; нет курса или цены — null. */
function priceOf(result: Pc2Result | undefined): { unit: number; qty: number; low: boolean; source: 'ange' | 'trade' } | null {
  if (!result) return null
  if (result.kind === 'ange') {
    return result.ange.exalted > 0
      ? { unit: result.ange.exalted, qty: Math.max(1, result.stack), low: result.ange.low, source: 'ange' }
      : null
  }
  const unit = result.verdict.exalted
  if (!unit || !(unit > 0)) return null
  return { unit, qty: 1, low: result.kind === 'trade' && (result.verdict.fairLots ?? 0) < 4, source: 'trade' }
}

function names(item: ParsedItem, captured: CapturedItem): { ref: string; name: string; base?: string } {
  const kind = kindOf(item)
  const rareName = captured.text.split(/\r?\n/)[2]
  const name = kind === 'rare' && rareName && rareName !== '--------' ? rareName.trim() : item.info.refName
  const base = kind === 'unique' ? item.info.unique?.base : kind === 'rare' || kind === 'magic' ? item.info.refName : undefined
  // ключ цены: у редкого и волшебного — база, у остальных — имя
  return { ref: kind === 'rare' || kind === 'magic' ? item.info.refName : name, name, ...(base && base !== name ? { base } : {}) }
}

/** Предмет окна → ценный предмет «Богатства»; валюта, стопки и предмет без цены в ex — null. */
export function valuableInput(item: ParsedItem, captured: CapturedItem, result: Pc2Result | undefined): Poe2ValuableInput | null {
  const p = priceOf(result)
  if (!p || isStack(item, result)) return null
  const n = names(item, captured)
  const out: Poe2ValuableInput = { name: n.name, kind: kindOf(item), qty: p.qty, unit: p.unit, source: p.source }
  if (n.base) out.base = n.base
  if (p.low) out.low = true
  return out
}

/** Предмет окна → находка забега (S69): цена всей находки в ex или null (нет цены). */
export function findInput(item: ParsedItem, captured: CapturedItem, result: Pc2Result | undefined): FarmFindInput {
  const p = priceOf(result)
  const n = names(item, captured)
  const kind = kindOf(item)
  const rarity: FarmFindRarity | undefined = kind === 'other' ? undefined : kind
  const find: FarmFindInput = {
    ref: n.ref,
    name: n.name,
    qty: p?.qty ?? 1,
    valueEx: p ? Math.round(p.unit * p.qty * 100) / 100 : null,
    source: 'ctrlD'
  }
  if (rarity) find.rarity = rarity
  return find
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

export function WealthButtons({
  item,
  captured,
  result,
  t
}: {
  item: ParsedItem | null
  captured: CapturedItem
  result: Pc2Result | undefined
  t: T
}) {
  const running = useFarmRunning()
  const [st, setSt] = useState<'idle' | 'busy' | 'wealth' | 'run' | 'fail' | 'noRun'>('idle')
  const wealth = item ? valuableInput(item, captured, result) : null
  const stack = !!item && isStack(item, result)
  const key = item ? `${item.info.refName}|${wealth?.unit ?? ''}|${captured.text.length}` : ''
  // новый предмет или цена — кнопки снова доступны
  useEffect(() => setSt('idle'), [key])
  if (!item) return null
  const toWealth = async (): Promise<void> => {
    if (!wealth || st === 'busy') return
    setSt('busy')
    const r = await window.overlayApi.wealth.poe2AddItem(wealth).catch(() => ({ ok: false as const }))
    setSt(r.ok ? 'wealth' : 'fail')
  }
  const toRun = async (): Promise<void> => {
    if (st === 'busy') return
    setSt('busy')
    const r = await window.overlayApi.farm.addFind(findInput(item, captured, result)).catch(() => null)
    setSt(r?.ok ? 'run' : r && !r.ok && r.reason === 'noRun' ? 'noRun' : 'fail')
  }
  const done = st === 'wealth' || st === 'run'
  return (
    <>
      {!stack && (
        <button
          type="button"
          className={`ui-btn${running ? '' : ' ui-btn--primary'}`}
          title={wealth ? t('wealth.p2.pc.add.help') : t('wealth.p2.pc.noPrice')}
          disabled={!wealth || st === 'busy' || done}
          onClick={() => void toWealth()}
        >
          <Icon name={st === 'wealth' ? 'check' : 'coins'} />
          {t('wealth.p2.pc.add')}
        </button>
      )}
      {running && (
        <button
          type="button"
          className="ui-btn ui-btn--primary"
          title={t('wealth.p2.pc.run.help')}
          disabled={st === 'busy' || done}
          onClick={() => void toRun()}
        >
          <Icon name={st === 'run' ? 'check' : 'plus'} />
          {t('wealth.p2.pc.run')}
        </button>
      )}
      {stack && !running && <div className="w2-pc-note">{t('wealth.p2.pc.stack')}</div>}
      {st !== 'idle' && st !== 'busy' && (
        <div className={`w2-pc-ok${done ? '' : ' is-fail'}`} role="status">
          <Icon name={done ? 'check' : 'warn'} />
          {t(
            st === 'wealth'
              ? 'wealth.p2.pc.done'
              : st === 'run'
                ? 'wealth.p2.pc.doneRun'
                : st === 'noRun'
                  ? 'wealth.p2.pc.noRun'
                  : 'wealth.p2.pc.fail'
          )}
        </div>
      )}
    </>
  )
}
