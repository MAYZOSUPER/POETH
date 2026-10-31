import { useEffect, useState, type ReactNode } from 'react'
import type { GameId } from '@shared/games'
import type { FarmRun, FarmState } from '@shared/types/farm'
import { useLang, useT } from '../../i18n'
import { useFarmStore } from '../../store/useFarmStore'
import { Ico, Switch } from '../deals/common'
import { chaos, clock, runName, when } from './format'

// Общие куски раздела «Сессия фарма»: PoE 1 (FarmPanel.tsx, S11b) и PoE 2 (FarmPanelPoe2.tsx, S69).

/** Текущее время, тикает раз в секунду, пока `active`. */
export function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    setNow(Date.now())
    if (!active) return
    const t = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [active])
  return now
}

/** Ярус: PoE 1 — T1–T17 по уровню области, PoE 2 — T1–T16 путевого камня (считает трекер). */
export function tierText(run: Pick<FarmRun, 'kind' | 'tier' | 'areaLevel'>, t: ReturnType<typeof useT>): string {
  if (run.kind === 'map' && run.tier !== null) return `T${run.tier}`
  return run.kind === 'other' ? t('farm.kind.other') : t('farm.level', { level: run.areaLevel })
}

/** «Виджет поверх игры» — в шапке раздела (по макету); «Скрыть» на виджете выключает его же. */
export function WidgetSwitch({ state }: { state: FarmState }) {
  const t = useT()
  const setConfig = useFarmStore((s) => s.setConfig)
  return (
    <span title={t('farm.widget.hint')}>
      <Switch on={state.config.overlayWidget} onChange={(v) => void setConfig({ overlayWidget: v })}>
        {t('farm.widget.toggle')}
      </Switch>
    </span>
  )
}

export function Deaths({ n }: { n: number }) {
  return n > 0 ? (
    <span className="ui-tally ui-tally--bad">
      <Ico name="death" />
      {n}
    </span>
  ) : (
    <span className="ui-tally ui-tally--zero">0</span>
  )
}

// ---------------------------------------------------------------- все забеги

/**
 * «Все забеги» под разделом: у PoE 1 колонка «Прибыль» (S11a), у PoE 2 — своя ячейка (`profitCell`, находки) и имена
 * карт без префикса Map.
 */
export function AllRuns({
  runs,
  game = 'poe1',
  profitCell,
  profitLabel
}: {
  runs: FarmRun[]
  game?: GameId
  profitCell?: (run: FarmRun) => ReactNode
  profitLabel?: string
}) {
  const t = useT()
  const lang = useLang()
  const removeRun = useFarmStore((s) => s.removeRun)
  const clear = useFarmStore((s) => s.clear)
  const [open, setOpen] = useState(false)
  if (runs.length === 0) return null
  const onClear = (): void => {
    if (window.confirm(t('farm.runs.clearConfirm'))) void clear()
  }
  // по макету — кнопка под таблицей, как «Все изменения» у тайника
  const toggle = (
    <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm fm-all__btn" aria-expanded={open} onClick={() => setOpen(!open)}>
      {t('farm.runs.all', { n: runs.length })}
      <Ico name={open ? 'chev-d' : 'chev-r'} />
    </button>
  )
  if (!open) return toggle
  return (
    <div className="fm-all">
      {toggle}
      <div className="fm-all__bar">
        <span className="fm-p fm-faint">{t('farm.how')}</span>
        <span className="fm-grow" />
        <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm" onClick={onClear}>
          <Ico name="trash" />
          {t('farm.runs.clear')}
        </button>
      </div>
      <div className="ui-box fm-tablewrap">
        <table className="ui-table">
          <thead>
            <tr>
              <th>{t('farm.col.when')}</th>
              <th>{t('farm.col.map')}</th>
              <th className="is-num">{t('farm.col.time')}</th>
              <th className="is-num" title={t('farm.col.entries.title')}>
                {t('farm.col.entries')}
              </th>
              <th className="is-num">{profitLabel ?? t('farm.col.profit')}</th>
              <th className="is-num">{t('farm.col.deaths')}</th>
              <th aria-label={t('farm.runs.remove')} />
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id}>
                <td className="fm-nowrap fm-faint">{when(r.startTs, lang)}</td>
                <td>
                  {runName(r, game)}
                  <span className="ui-table__aside">{tierText(r, t)}</span>
                </td>
                <td className="is-num">{clock(r.activeMs)}</td>
                <td className="is-num">{r.entries}</td>
                {profitCell ? (
                  profitCell(r)
                ) : (
                  <td className={`is-num ${!r.profit ? 'is-faint' : r.profit.chaos < 0 ? 'is-bad' : 'is-good'}`}>
                    {r.profit ? t('farm.chaos', { n: chaos(r.profit.chaos, lang, true) }) : '—'}
                  </td>
                )}
                <td className="is-num">
                  <Deaths n={r.deaths} />
                </td>
                <td>
                  <button
                    type="button"
                    className="ui-btn ui-btn--ghost ui-btn--icon ui-btn--sm"
                    title={t('farm.runs.remove')}
                    aria-label={t('farm.runs.remove')}
                    onClick={() => void removeRun(r.id)}
                  >
                    <Ico name="trash" size="sm" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}


/** Иконка спрайта, которой нет в наборе Ico сделок («плюс» у «+ находка»); спрайт грузит Ico рядом. */
export function SpriteIco({ name }: { name: 'plus' }) {
  return (
    <svg className="ui-ico" aria-hidden="true">
      <use href={`#i-${name}`} />
    </svg>
  )
}
