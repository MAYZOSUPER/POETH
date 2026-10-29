import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { LvTag } from '@shared/types/leveling'
import { currentIndex, stepPassives, stepTags } from '@shared/leveling/route'
import { areaName } from '@shared/leveling/render'
import { useOverlayStore } from '../../store/useOverlayStore'
import { useLevelingStore } from '../../store/useLevelingStore'
import { StepTags, StepText } from '../../panels/leveling/StepText'
import { Icon } from '../Icon'
import { scheduleRectsFlush, useInteractive } from '../interactive'
import { useOverlayT } from '../useOverlayT'
import type { OverlayWidgetDef } from '../registry'
import '../../panels/leveling/leveling.css'
import './leveling-overlay.css'

// Гид прокачки поверх игры (S14) по макету «Прокачка PoE 1»: слева сверху под баффами, тянется за шапку
// (позиция — LevelingConfig.pos). Один следующий шаг крупно; «Сейчас: …», если награда в этом шаге; «Не
// пропустите» — до двух пунктов впереди в акте; вернулся назад за квестом — «Вернуться к шагу» прогресса;
// свёрнуто — полоса .ui-hud. Мышь ловят только шапка и кнопки — остальное проходит в игру. Только PoE 1.
// Виден, когда main решил (S22, LevelingState.guide): режим «авто» — только в зонах кампании, пока она не
// пройдена; хоткей — до входа в другую зону.

const DEFAULT_POS = { left: 16, top: 112 }
const MAX_MISS = 2

/** Игра и простой режим из настроек (перечитываем, когда игрок вернулся в игру). */
function useSettingsSlice(): { poe1: boolean; simple: boolean } {
  const [slice, setSlice] = useState({ poe1: false, simple: true })
  useEffect(() => {
    const read = (): void => {
      void window.overlayApi.settings.get().then((s) => setSlice({ poe1: s.game === 'poe1', simple: s.ui.simpleMode }))
    }
    read()
    return window.overlayApi.onOverlayFocus(read)
  }, [])
  return slice
}

function Guide({ simple }: { simple: boolean }) {
  const t = useOverlayT()
  const lang = useOverlayStore((s) => s.lang)
  const data = useLevelingStore((s) => s.data)!
  const state = useLevelingStore((s) => s.state)!
  const flat = useLevelingStore((s) => s.flat)
  const { act, setConfig } = useLevelingStore.getState()
  const headRef = useRef<HTMLDivElement>(null)
  const btnsRef = useRef<HTMLSpanElement>(null)
  const bodyBtnRef = useRef<HTMLButtonElement>(null)
  const shieldRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<{ dx: number; dy: number; left: number; top: number } | null>(null)

  const collapsed = state.config.collapsed
  useInteractive(headRef)
  useInteractive(btnsRef)
  useInteractive(bodyBtnRef, state.offRoute !== null && !collapsed)
  useInteractive(shieldRef, !!drag)

  const base = state.config.pos
    ? { left: state.config.pos.x * window.innerWidth, top: state.config.pos.y * window.innerHeight }
    : DEFAULT_POS
  const left = drag ? drag.left : base.left
  const top = drag ? drag.top : base.top

  useLayoutEffect(() => {
    scheduleRectsFlush()
  }, [left, top, collapsed, state.offRoute])

  const done = (): void => window.overlayApi.overlay.focusGame()

  const onDown = (e: ReactPointerEvent): void => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button')) return
    e.preventDefault()
    setDrag({ dx: e.clientX - left, dy: e.clientY - top, left, top })
  }
  useEffect(() => {
    if (!drag) return
    const { dx, dy } = drag
    const move = (e: PointerEvent): void => {
      const w = panelRef.current?.offsetWidth ?? 0
      const h = panelRef.current?.offsetHeight ?? 0
      setDrag((d) =>
        d
          ? {
              ...d,
              left: Math.min(window.innerWidth - w, Math.max(0, e.clientX - dx)),
              top: Math.min(window.innerHeight - Math.min(h, 60), Math.max(0, e.clientY - dy))
            }
          : d
      )
    }
    const up = (): void => {
      setDrag((d) => {
        if (d) void setConfig({ pos: { x: d.left / window.innerWidth, y: d.top / window.innerHeight } })
        return null
      })
      done()
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    // смещение курсора от шапки фиксируется в начале перетаскивания
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag?.dx, drag?.dy])

  const cur = currentIndex(flat, state.progress)
  const f = cur >= 0 ? flat[cur] : null
  // где игрок: зона из журнала, если она в данных маршрута (убежище, карта — нет), иначе — по маршруту
  const zoneId = state.zone && data.areas[state.zone.areaId] ? state.zone.areaId : (f?.after ?? null)
  const zone = zoneId ? areaName(data, zoneId, lang) : ''
  const zl = state.zone && state.zone.areaId === zoneId ? state.zone.level : undefined
  const nextZone = f ? flat.slice(cur).find((x) => x.to && x.to !== zoneId)?.to ?? null : null
  const miss: { tag: LvTag; index: number }[] = []
  if (f) {
    for (const x of flat.slice(cur + 1)) {
      if (x.act !== f.act || miss.length >= MAX_MISS) break
      const tags = stepTags(x.step)
      if (tags.length) miss.push({ tag: tags[0], index: x.index })
    }
  }
  const nowTags = f ? stepTags(f.step) : []
  const off = state.offRoute !== null ? flat[state.offRoute] : null
  const btn = (name: 'prev' | 'next' | 'collapse'): JSX.Element => {
    const label = t(name === 'prev' ? 'lev.prev' : name === 'next' ? 'lev.next' : collapsed ? 'lev.expand' : 'lev.collapse')
    const icon = name === 'prev' ? 'chev-r' : name === 'next' ? 'chev-r' : collapsed ? 'max' : 'min'
    return (
      <button
        type="button"
        className={`ui-btn ui-btn--ghost ui-btn--icon ui-btn--sm${name === 'prev' ? ' lv-flip' : ''}`}
        aria-label={label}
        title={label}
        onClick={() => {
          const p = name === 'collapse' ? setConfig({ collapsed: !collapsed }) : act({ type: name })
          void p.finally(done)
        }}
      >
        <Icon name={icon} />
      </button>
    )
  }

  return (
    <>
      {drag && <div ref={shieldRef} className="lv-ov-shield" />}
      {collapsed ? (
        <div ref={panelRef} className="ui-panel ui-hud lv-ov lv-ov--hud" style={{ left: Math.round(left), top: Math.round(top) }} role="status">
          <div ref={headRef} className="ui-hud__grip lv-ov__grip" title={t('lev.drag')} onPointerDown={onDown}>
            <Icon name="drag" />
          </div>
          <span className="ui-hud__seg">
            <Icon name="map" />
            <span className="ui-hud__name">{zone}</span>
            {nextZone && (
              <>
                <span className="ui-hud__lbl">➞</span>
                <span className="ui-hud__name">{areaName(data, nextZone, lang)}</span>
              </>
            )}
          </span>
          <span className="ui-hud__sep" />
          <span className="ui-hud__seg">
            <b>{t('lev.level').replace('{n}', String(state.progress.level))}</b>
          </span>
          {miss.length > 0 && (
            <>
              <span className="ui-hud__sep" />
              <span className="ui-hud__seg ui-hud__lbl">{t('lev.hud.items').replace('{n}', String(miss.length))}</span>
            </>
          )}
          <span ref={btnsRef} className="lv-ov__btns">
            {btn('collapse')}
          </span>
        </div>
      ) : (
        <div ref={panelRef} className="ui-panel lv-ov" style={{ left: Math.round(left), top: Math.round(top) }} role="status">
          <div ref={headRef} className="ui-panel__head lv-ov__head" onPointerDown={onDown} title={t('lev.drag')}>
            <div className="lv-ov__title">
              <span className="lv-ov__step">
                {f ? t('lev.stepOf').replace('{act}', String(f.act)).replace('{i}', String(f.actIndex)).replace('{n}', String(f.actTotal)) : t('lev.done')}
              </span>
              <span className="ui-panel__title">{zone}</span>
            </div>
            <span className="lv-ov__lvl">
              {t('lev.level').replace('{n}', String(state.progress.level))}
              {!simple && zl !== undefined && <span className="lv-ov__zl"> · {t('lev.zoneLevel').replace('{n}', String(zl))}</span>}
            </span>
            <span ref={btnsRef} className="lv-ov__btns">
              {btn('prev')}
              {btn('next')}
              {btn('collapse')}
            </span>
          </div>
          <div className="lv-ov__body">
            {off && (
              <div className="ui-banner lv-ov__off">
                <Icon name="warn" />
                <span>
                  {t('lev.back')
                    .replace('{zone}', zone)
                    .replace('{act}', String(off.act))
                    .replace('{n}', String(off.actIndex))}
                </span>
                <button ref={bodyBtnRef} type="button" className="ui-btn ui-btn--sm" onClick={() => void act({ type: 'jump', index: off.index }).finally(done)}>
                  {t('lev.back.go').replace('{n}', String(off.actIndex))}
                </button>
              </div>
            )}
            {f && nowTags.length > 0 && (
              <div className={`lv-ov__now lv-ov__now--${nowTags[0]}`}>
                <Icon name={nowTags[0]} />
                <span>{t('lev.now').replace('{what}', t(`lev.tag.${nowTags[0]}.long`))}</span>
              </div>
            )}
            {f && (
              <div className="lv-ov__text">
                <Icon name="step" />
                <span>
                  <StepText parts={f.step.parts} data={data} lang={lang} />
                </span>
              </div>
            )}
            {f && simple && f.step.sub?.[0] && (
              <div className="lv-ov__sub">
                <StepText parts={lang === 'ru' ? f.step.sub[0].ru : f.step.sub[0].en} data={data} lang={lang} />
              </div>
            )}
            {f?.step.lvl && <div className="lv-ov__sub">{t('lev.recLevel').replace('{lvl}', f.step.lvl)}</div>}
            {miss.length > 0 && (
              <div className="lv-ov__miss">
                <span className="ui-label">{t('lev.dontMiss')}</span>
                {miss.map((m) => (
                  <div key={m.index} className="lv-ov__missrow">
                    <StepTags tags={[m.tag]} t={t} icon={(n) => <Icon name={n} />} passives={stepPassives(flat[m.index].step, data)} />
                    <span className="lv-ov__misstext">
                      <StepText parts={flat[m.index].step.parts} data={data} lang={lang} />
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}

function LevelingWidget() {
  const init = useLevelingStore((s) => s.init)
  const ready = useLevelingStore((s) => s.ready)
  const state = useLevelingStore((s) => s.state)
  const { poe1, simple } = useSettingsSlice()

  useEffect(() => {
    let off: (() => void) | undefined
    let disposed = false
    void init().then((fn) => (disposed ? fn() : (off = fn)))
    return () => {
      disposed = true
      off?.()
    }
  }, [init])

  if (!poe1 || !ready || !state?.guide.visible) return null
  return <Guide simple={simple} />
}

// своё место (слева сверху, перетаскивается) — слой popup, без стопок
const widget: OverlayWidgetDef = { id: 'leveling', layer: 'popup', order: -20, Component: LevelingWidget }
export default widget
