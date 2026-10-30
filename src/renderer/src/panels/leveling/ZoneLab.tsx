import type { ReactNode, Ref } from 'react'
import type { LevelingState, LvLab } from '@shared/types/leveling'
import { zoneXp, type ZoneXp } from '@shared/leveling/zoneXp'
import { labReminder, type LabReminder } from '@shared/leveling/labs'
import { labRouteAt, type FlatStep } from '@shared/leveling/route'
import { SITES } from '@shared/sites'

// Строки гида прокачки S52 — общие для гида поверх игры и вкладки «Кампания»: «Зона 45 · вы 52 · опыт −38 % —
// зона слишком лёгкая, идите дальше по маршруту» (штраф опыта, shared/leveling/zoneXp.ts) и «Пора пройти
// лабиринт (обычный): +2 очка восхождения» с «Раскладка на poelab» (вкладка poelab трейд-окна, S43),
// «Пройден» и «Скрыть» (shared/leveling/labs.ts). Иконку рисует вызывающий: в оверлее — Icon, в компаньоне — Ico.

type T = (k: string) => string
export type ZoneLabIcon = 'warn' | 'info' | 'trial' | 'external' | 'check'

/** Ключ по числу: RU — 1 / 2–4 / 5+ (уровень, уровня, уровней), EN — 1 / прочие. */
export function pluralKey(base: string, n: number, lang: 'ru' | 'en'): string {
  const a = Math.abs(n)
  if (lang === 'en') return `${base}.${a === 1 ? 1 : 5}`
  const d = a % 10
  const h = a % 100
  if (d === 1 && h !== 11) return `${base}.1`
  if (d >= 2 && d <= 4 && (h < 12 || h > 14)) return `${base}.2`
  return `${base}.5`
}

/** Число с запятой в RU («77,54»). */
const num = (v: number, lang: 'ru' | 'en'): string => {
  const s = String(Math.round(v * 100) / 100)
  return lang === 'ru' ? s.replace('.', ',') : s
}

/** Строка опыта для зоны, где игрок сейчас (по журналу); null — штрафа нет или не та зона. */
export function stateZoneXp(state: LevelingState, simple: boolean): ZoneXp | null {
  return state.zone ? zoneXp(state.zone.areaId, state.zone.level, state.progress.level, simple, !!state.progress.finished) : null
}

/** Напоминание о лабиринте активного персонажа. */
export function stateLab(state: LevelingState, flat: FlatStep[]): LabReminder | null {
  return labReminder(state.progress.level, state.progress.labs, labRouteAt(flat, state.progress))
}

/** «Зона 45 · вы 52 · опыт −38 % — …»; extra — подробности экспертного режима. */
export function zoneXpText(x: ZoneXp, t: T, lang: 'ru' | 'en'): { main: string; extra: string } {
  const head = t('lev.xp.zone').replace('{z}', String(x.areaLevel)).replace('{p}', String(x.playerLevel))
  const loss = t('lev.xp.loss').replace('{n}', String(x.loss))
  const why = x.kind === 'high' ? t(pluralKey('lev.xp.high', x.gap, lang)).replace('{n}', String(x.gap)) : t(`lev.xp.low.${x.where}`)
  const extra = [t('lev.xp.expert').replace('{safe}', String(x.safe))]
  if (x.effective !== x.areaLevel) extra.push(t('lev.xp.expert.eff').replace('{eff}', num(x.effective, lang)))
  if (x.divisor > 1) extra.push(t('lev.xp.expert.hi').replace('{f}', num(x.divisor, lang)))
  return { main: `${head} · ${loss} — ${why}`, extra: extra.join(' · ') }
}

export function ZoneXpLine({
  x,
  t,
  lang,
  simple,
  icon,
  className = ''
}: {
  x: ZoneXp
  t: T
  lang: 'ru' | 'en'
  simple: boolean
  icon: (n: ZoneLabIcon) => ReactNode
  className?: string
}) {
  const { main, extra } = zoneXpText(x, t, lang)
  return (
    <div className={`lv-xp lv-xp--${x.kind} ${className}`.trim()} role="status" title={t('lev.xp.hint')}>
      {icon(x.kind === 'high' ? 'warn' : 'info')}
      <span>
        {main}
        {!simple && <span className="lv-xp__extra"> ({extra})</span>}
      </span>
    </div>
  )
}

/** Вкладка poelab трейд-окна на главной (раскладки всех лабиринтов на сегодня; глубоких ссылок нет — S43). */
export function openPoelab(): Promise<void> {
  const site = SITES.find((s) => s.id === 'poelab')
  return window.overlayApi.sites.open({ tab: 'poelab', url: site?.home('en') })
}

export function labText(r: LabReminder, t: T): string {
  return t('lev.lab.due').replace('{tier}', t(`lev.lab.tier.${r.lab}`)).replace('{n}', String(r.points))
}

/**
 * «Пора пройти лабиринт (обычный): +2 очка восхождения» и кнопки: «Раскладка на poelab», «Пройден», «Скрыть»
 * (на шаге маршрута «Лабиринт» — без «Скрыть»). btnsRef — область кнопок (в оверлее ловит мышь).
 */
export function LabLine({
  r,
  t,
  simple,
  icon,
  onDone,
  onHide,
  after,
  btnsRef,
  className = ''
}: {
  r: LabReminder
  t: T
  simple: boolean
  icon: (n: ZoneLabIcon) => ReactNode
  onDone: (lab: LvLab) => void
  onHide: () => void
  /** после нажатия (оверлей — вернуть фокус игре) */
  after?: () => void
  btnsRef?: Ref<HTMLSpanElement>
  className?: string
}) {
  const hint = [t('lev.lab.hint'), r.lab === 'eternal' ? t('lev.lab.eternal') : ''].filter(Boolean).join(' ')
  return (
    <div className={`lv-lab ${className}`.trim()} role="status">
      {icon('trial')}
      <span className="lv-lab__text" title={hint}>
        {labText(r, t)}
        {!simple && (
          <span className="lv-lab__extra">
            {' '}
            ({t('lev.lab.points').replace('{have}', String(r.have)).replace('{need}', String(r.expected))})
          </span>
        )}
      </span>
      <span ref={btnsRef} className="lv-lab__btns">
        <button type="button" className="ui-btn ui-btn--sm" title={t('lev.lab.poelab.hint')} onClick={() => void openPoelab()}>
          {icon('external')}
          {t('lev.lab.poelab')}
        </button>
        <button
          type="button"
          className="ui-btn ui-btn--ghost ui-btn--sm"
          title={t('lev.lab.done.hint')}
          onClick={() => {
            onDone(r.lab)
            after?.()
          }}
        >
          {icon('check')}
          {t('lev.lab.done')}
        </button>
        {!r.onStep && (
          <button
            type="button"
            className="ui-btn ui-btn--ghost ui-btn--sm"
            title={t('lev.lab.hide.hint')}
            onClick={() => {
              onHide()
              after?.()
            }}
          >
            {t('lev.lab.hide')}
          </button>
        )}
      </span>
    </div>
  )
}
