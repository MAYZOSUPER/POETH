/// <reference types="vite/client" />
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { AppTab } from '@shared/types'
import { useAppStore } from '../store/useAppStore'
import { useShellStore } from '../store/useShellStore'
import { useDealsStore } from '../store/useDealsStore'
import { useLiveStore } from './live/useLiveStore'
import { useT } from '../i18n'
import { ShellIcon } from '../components/ShellIcon'
import {
  badgeFor,
  badgeText,
  countTitle,
  dealsCount,
  itemLabel,
  liveCount,
  lockOffText,
  nextSeen,
  type RailBadgeKind
} from './railBadges'
import './rail.css'
import {
  RAIL_INLINE_MIN,
  railStep,
  railWide,
  readRailPref,
  sectionsFor,
  tabHintKey,
  writeRailPref,
  type RailPref
} from '../tabs'

/**
 * Рельс слева (S20, макет навигации — вариант Б): вкладки столбиком, сгруппированные по разделам (tabs.ts).
 * Свёрнут — 52 px, только иконки, название и описание — в подсказке при наведении или фокусе.
 * Развёрнут — 188 px с названиями: на окне от 820 px рядом с содержимым (выбор запоминается),
 * на окне уже — поверх содержимого на затемнении, закрывается кликом мимо, Esc или выбором вкладки.
 * В сквозном режиме (замок) подсказки не появляются: мышь проходит в игру, но наведение до страницы доходит.
 * S32: счётчики на иконках — Live (активные поиски) и «Сделки» (новые предложения, railBadges.ts), а при замке
 * внизу окна плашка «Сквозной режим» с тем, как его снять (кнопка замка в это время не нажимается).
 */

const TIP_ID = 'ui-rail-tip'
const FLASH_MS = 1100

const storage = (): Storage | undefined => {
  try {
    return window.localStorage
  } catch {
    return undefined
  }
}

/** Окно на экране — не скрыто и не свёрнуто: только тогда открытая вкладка «Сделки» считается просмотренной. */
function usePageVisible(): boolean {
  const [visible, setVisible] = useState(() => document.visibilityState === 'visible')
  useEffect(() => {
    const sync = (): void => setVisible(document.visibilityState === 'visible')
    document.addEventListener('visibilitychange', sync)
    return () => document.removeEventListener('visibilitychange', sync)
  }, [])
  return visible
}

/**
 * Только `npm run dev`: счётчики для снимков без игры — localStorage `poeth.dev.railCounts` = `{"live":3,"deals":2}`
 * и перезагрузка окна. В сборке этой ветки нет (import.meta.env.DEV = false, код вырезается).
 */
function devCounts(): Partial<Record<RailBadgeKind, number>> | null {
  if (!import.meta.env.DEV) return null
  try {
    const v = JSON.parse(storage()?.getItem('poeth.dev.railCounts') ?? 'null') as unknown
    return v && typeof v === 'object' ? (v as Partial<Record<RailBadgeKind, number>>) : null
  } catch {
    return null
  }
}

/**
 * Числа на значках из сторов Live и «Сделок» (без новых IPC; сторы подписываются на события main при init()).
 * «Сделки»: пока вкладка на экране, всё в ней просмотрено; первое состояние после запуска — тоже.
 */
function useRailCounts(hasLive: boolean, hasDeals: boolean, viewingDeals: boolean): Record<RailBadgeKind, number> {
  const snap = useLiveStore((s) => s.snap)
  const deals = useDealsStore((s) => s.state?.deals)
  const [seen, setSeen] = useState<ReadonlySet<string> | null>(null)

  useEffect(() => {
    if (hasLive) useLiveStore.getState().init()
  }, [hasLive])
  useEffect(() => {
    if (hasDeals) useDealsStore.getState().init().catch(() => undefined)
  }, [hasDeals])
  useEffect(() => setSeen((prev) => nextSeen(prev, deals, viewingDeals)), [deals, viewingDeals])

  const dev = devCounts()
  return {
    live: dev?.live ?? (hasLive ? liveCount(snap) : 0),
    // на открытой вкладке всё уже видно — без мигания «1», пока эффект не отметил новое просмотренным
    deals: viewingDeals ? 0 : (dev?.deals ?? (hasDeals ? dealsCount(deals, seen) : 0))
  }
}

/** Окно не уже 820 px — развёрнутый рельс помещается рядом с содержимым. */
function useWideWindow(): boolean {
  const query = `(min-width: ${RAIL_INLINE_MIN}px)`
  const [wide, setWide] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const sync = (): void => setWide(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [query])
  return wide
}

export function NavRail() {
  const appTab = useAppStore((s) => s.appTab)
  const setAppTab = useAppStore((s) => s.setAppTab)
  const game = useAppStore((s) => s.settings?.game ?? 'poe1')
  const simple = useAppStore((s) => s.settings?.ui.simpleMode ?? true)
  const locked = useAppStore((s) => s.settings?.locked ?? false)
  const lockAccel = useAppStore((s) => s.settings?.hotkeys.toggleLock?.accel)
  const page = useShellStore((s) => s.page)
  const t = useT()

  const windowWide = useWideWindow()
  const pageVisible = usePageVisible()
  const [pref, setPref] = useState<RailPref | null>(() => readRailPref(storage()))
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [tip, setTip] = useState<{ id: AppTab; top: number } | null>(null)
  const [flash, setFlash] = useState<AppTab | null>(null)

  const railRef = useRef<HTMLElement>(null)
  const drawerRef = useRef<HTMLElement>(null)
  const toggleRef = useRef<HTMLButtonElement>(null)
  const tipRef = useRef<HTMLDivElement>(null)
  const chosen = useRef<AppTab | null>(null)
  const shownTab = useRef(appTab)

  const sections = sectionsFor(game)
  const has = (id: AppTab): boolean => sections.some((s) => s.tabs.some((x) => x.id === id))
  const counts = useRailCounts(has('live'), has('deals'), appTab === 'deals' && page === null && pageVisible)
  const wide = railWide(windowWide, pref, simple)
  const drawer = drawerOpen && !windowWide
  const tips = !wide && !locked
  const focusTab = sections.some((s) => s.tabs.some((x) => x.id === appTab)) ? appTab : sections[0]?.tabs[0]?.id

  // окно растянули до 820+ — шторка не нужна, развёрнутый рельс встаёт рядом
  useEffect(() => {
    if (windowWide) setDrawerOpen(false)
  }, [windowWide])

  useEffect(() => {
    if (!tips) setTip(null)
  }, [tips])

  // вкладку открыли не с рельса (прайс-чек по Ctrl+D и др.) — пункт на секунду подсвечивается, чтобы было видно, где вы
  useEffect(() => {
    if (shownTab.current === appTab) return
    shownTab.current = appTab
    const own = chosen.current === appTab
    chosen.current = null
    setFlash(own ? null : appTab)
    if (own) return
    const id = window.setTimeout(() => setFlash(null), FLASH_MS)
    return () => window.clearTimeout(id)
  }, [appTab])

  // шторка: фокус на открытую вкладку, Esc закрывает и возвращает фокус на кнопку
  useEffect(() => {
    if (!drawer) return
    drawerRef.current?.querySelector<HTMLElement>('[tabindex="0"]')?.focus()
    const onKey = (e: globalThis.KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      setDrawerOpen(false)
      toggleRef.current?.focus()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [drawer])

  // подсказка у нижнего края не уходит за окно: поднимаем её, стрелка остаётся у иконки
  useLayoutEffect(() => {
    const el = tipRef.current
    const rail = railRef.current
    if (!tip || !el || !rail) return
    const top = Math.max(0, Math.min(tip.top, rail.clientHeight - el.offsetHeight - 4))
    el.style.top = `${top}px`
    el.style.setProperty('--arrow', `${13 + tip.top - top}px`)
  }, [tip])

  const choose = (id: AppTab, fromDrawer: boolean): void => {
    useShellStore.getState().setPage(null)
    if (id !== appTab) {
      chosen.current = id
      setAppTab(id)
    }
    setTip(null)
    if (fromDrawer) {
      setDrawerOpen(false)
      // пункт шторки пропадёт — фокус на тот же пункт свёрнутого рельса
      requestAnimationFrame(() => railRef.current?.querySelector<HTMLElement>(`[data-tab="${id}"]`)?.focus())
    }
  }

  const toggle = (): void => {
    if (!windowWide) {
      setDrawerOpen((v) => !v)
      return
    }
    const next: RailPref = wide ? 'narrow' : 'wide'
    setPref(next)
    writeRailPref(storage(), next)
  }

  const showTip = (id: AppTab, el: HTMLElement): void => {
    const rail = railRef.current
    if (!tips || !rail) return
    setTip({ id, top: el.getBoundingClientRect().top - rail.getBoundingClientRect().top })
  }

  const onKeys = (e: KeyboardEvent<HTMLElement>): void => {
    const items = [...e.currentTarget.querySelectorAll<HTMLElement>('[data-tab]')]
    const i = items.indexOf(document.activeElement as HTMLElement)
    if (i < 0) return
    const next = railStep(i, e.key, items.length)
    if (next === null) return
    e.preventDefault()
    items[next].focus()
  }

  const list = (inDrawer: boolean) => (
    <div className="ui-rail__list" onKeyDown={onKeys} onScroll={() => setTip(null)}>
      {sections.map((s) => (
        <div key={s.id} className="ui-rail__group" role="group" aria-label={t(s.key)}>
          <div className="ui-rail__head" aria-hidden="true">
            <span>{t(s.key)}</span>
          </div>
          {s.tabs.map((tab) => {
            const current = tab.id === appTab
            const badge = badgeFor(tab.id, counts)
            return (
              <button
                key={tab.id}
                type="button"
                data-tab={tab.id}
                className={`ui-rail__item${current ? ' is-current' : ''}${flash === tab.id ? ' is-flash' : ''}`}
                aria-current={current && page === null ? 'page' : undefined}
                aria-label={itemLabel(t, t(tab.key), badge)}
                aria-describedby={!inDrawer && tip?.id === tab.id ? TIP_ID : undefined}
                tabIndex={tab.id === focusTab ? 0 : -1}
                onClick={() => choose(tab.id, inDrawer)}
                onMouseEnter={inDrawer ? undefined : (e) => showTip(tab.id, e.currentTarget)}
                onFocus={inDrawer ? undefined : (e) => showTip(tab.id, e.currentTarget)}
                onMouseLeave={inDrawer ? undefined : () => setTip(null)}
                onBlur={inDrawer ? undefined : () => setTip(null)}
              >
                <ShellIcon name={tab.icon} />
                <span className="ui-rail__label">{t(tab.key)}</span>
                {badge && (
                  // число — в aria-label кнопки; на свёрнутом рельсе пояснение — в подсказке, на развёрнутом — в title
                  <span
                    className={`ui-count${badge.kind === 'live' ? ' ui-count--live' : ''}`}
                    aria-hidden="true"
                    title={!locked && (wide || inDrawer) ? countTitle(t, badge) : undefined}
                  >
                    {badgeText(badge.n)}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )

  const open = wide || drawer
  const tipTab = tip && sections.flatMap((s) => s.tabs.map((x) => ({ ...x, section: s.key }))).find((x) => x.id === tip.id)
  const tipBadge = tipTab ? badgeFor(tipTab.id, counts) : null

  return (
    <>
      <nav ref={railRef} className={`ui-rail${wide ? ' ui-rail--wide' : ''}`} aria-label={t('nav.label')}>
        {list(false)}
        <button
          ref={toggleRef}
          type="button"
          className="ui-rail__item ui-rail__toggle"
          aria-expanded={open}
          aria-label={t(open ? 'nav.collapse' : 'nav.expand')}
          title={locked ? undefined : t(open ? 'nav.collapse' : 'nav.expand')}
          onClick={toggle}
        >
          <ShellIcon name="chev-r" />
          <span className="ui-rail__label">{t('nav.collapse.short')}</span>
        </button>
        {tips && tipTab && (
          <div ref={tipRef} className="ui-rail__tip" style={{ top: tip.top }}>
            <div className="ui-tip" id={TIP_ID} role="tooltip">
              <b>{t(tipTab.key)}</b>
              <span>
                {t(tipTab.section)} · {t(tabHintKey(tipTab.id, game))}
              </span>
              {tipBadge && (
                // уже есть в aria-label кнопки — второй раз не читаем
                <span className={`rail-tip-count rail-tip-count--${tipBadge.kind}`} aria-hidden="true">
                  {countTitle(t, tipBadge)}
                </span>
              )}
            </div>
          </div>
        )}
      </nav>
      {drawer && (
        <>
          <button type="button" className="ui-rail-scrim" aria-label={t('nav.close')} tabIndex={-1} onClick={() => setDrawerOpen(false)} />
          <nav
            ref={drawerRef}
            className="ui-rail ui-rail--drawer"
            aria-label={t('nav.label')}
            onBlur={(e) => {
              // фокус ушёл из шторки (Tab дальше) — закрываем, чтобы он не оказался под затемнением
              const to = e.relatedTarget as Node | null
              if (to && !e.currentTarget.contains(to)) setDrawerOpen(false)
            }}
          >
            {list(true)}
            <button
              type="button"
              className="ui-rail__item ui-rail__toggle"
              aria-expanded="true"
              aria-label={t('nav.collapse')}
              onClick={() => {
                setDrawerOpen(false)
                toggleRef.current?.focus()
              }}
            >
              <ShellIcon name="chev-r" />
              <span className="ui-rail__label">{t('nav.collapse.short')}</span>
            </button>
          </nav>
        </>
      )}
      {locked && (
        // мышь проходит сквозь окно — снять замок можно только хоткеем или из трея; наведение делает плашку прозрачной
        <div className="rail-lock" role="status">
          <div className="ui-banner">
            <ShellIcon name="lock" />
            <span>
              <b>{t('nav.lock.title')}</b> {t('nav.lock.text')} {lockOffText(t, lockAccel)}
            </span>
            <span />
          </div>
        </div>
      )}
    </>
  )
}
