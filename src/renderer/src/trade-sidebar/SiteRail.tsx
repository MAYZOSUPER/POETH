import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { SITES, bookmarkTab, type SiteTabId } from '@shared/sites'
import { useT } from '../i18n'
import { Ico } from '../panels/regex/Ico'
import { RailDrawer, RailToggle } from '../components/RailParts'
import { railStep } from '../tabs'
import { useFavStore } from './useFavStore'

// Рельс вкладок трейд-окна (S43): «Трейд» (официальный сайт, вход в аккаунт), сайты реестра, свои закладки,
// внизу — страница «Сайты» (закладки, данные сайтов). Значки — буквы, чужие favicon не грузим. Сами сайты —
// вью main правее рельса; здесь только кнопки.
// S58: раскрывается как рельс компаньона (.ui-rail, RailToggle / RailDrawer, @shared/rail): развёрнут — с названиями
// рядом с сайтом (сайт сдвигает main: выбор и ширину окна он знает сам, state.rail), на узком окне — шторкой
// поверх. Подсказки — системные (title): своя подсказка правее рельса легла бы под нативную вью сайта.

const api = (): Window['overlayApi'] => window.overlayApi

/** Две буквы закладки: первые буквы двух слов названия или первые две буквы. */
export function bookmarkMark(title: string): string {
  const words = title.replace(/^www\./i, '').split(/[\s.\-_]+/).filter(Boolean)
  const s = words.length > 1 ? `${words[0][0]}${words[1][0]}` : (words[0] ?? '?').slice(0, 2)
  return s.toUpperCase()
}

function RailTab({
  tab,
  name,
  title,
  focusTab,
  onChoose,
  children
}: {
  tab: SiteTabId
  name: string
  title: string
  focusTab: SiteTabId
  onChoose: (tab: SiteTabId) => void
  children: ReactNode
}) {
  const active = useFavStore((s) => s.sites?.active === tab)
  const live = useFavStore((s) => !!s.sites?.live.includes(tab))
  return (
    <button
      type="button"
      data-tab={tab}
      className={`ui-rail__item ts-rail__item${active ? ' is-current' : ''}${live ? ' is-live' : ''}`}
      aria-current={active ? 'page' : undefined}
      aria-label={name}
      title={title}
      tabIndex={tab === focusTab ? 0 : -1}
      onClick={() => onChoose(tab)}
    >
      {children}
      <span className="ui-rail__label">{name}</span>
    </button>
  )
}

/** Шторка открыта: сайдбар — над вью сайтов (main), место сайта у страницы прозрачное — сайт виден под затемнением. */
function useDrawerOverSite(drawer: boolean): void {
  const open = useRef(false)
  useEffect(() => {
    open.current = drawer
    if (!drawer) return
    // сначала прозрачность, потом подъём: иначе на кадр мелькнёт непрозрачная страница поверх сайта
    document.documentElement.classList.add('ts-drawer')
    void api().tradeWindow.railDrawer(true)
    return () => {
      open.current = false
      // наоборот: сперва опустить сайдбар под сайты, потом вернуть фон
      void api()
        .tradeWindow.railDrawer(false)
        .finally(() => {
          if (!open.current) document.documentElement.classList.remove('ts-drawer')
        })
    }
  }, [drawer])
}

export function SiteRail() {
  const t = useT()
  const bookmarks = useFavStore((s) => s.sites?.bookmarks ?? [])
  const active = useFavStore((s) => s.sites?.active ?? 'trade')
  const wide = useFavStore((s) => !!s.site?.rail.wide)
  const room = useFavStore((s) => !!s.site?.rail.room)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const toggleRef = useRef<HTMLButtonElement>(null)
  const drawer = drawerOpen && !room

  // окно растянули — шторка не нужна, развёрнутый рельс встаёт рядом (как у рельса компаньона)
  useEffect(() => {
    if (room) setDrawerOpen(false)
  }, [room])
  // ушли из окна (другое приложение, окно спрятали) — шторка закрывается, как от клика мимо
  useEffect(() => {
    if (!drawer) return
    const onBlur = (): void => setDrawerOpen(false)
    window.addEventListener('blur', onBlur)
    return () => window.removeEventListener('blur', onBlur)
  }, [drawer])
  useDrawerOverSite(drawer)

  const tabs: SiteTabId[] = ['trade', ...SITES.map((s) => s.id), ...bookmarks.map((b) => bookmarkTab(b.id)), 'manage']
  const focusTab = tabs.includes(active) ? active : 'trade'

  const choose = (tab: SiteTabId): void => {
    setDrawerOpen(false)
    void api().sites.select(tab)
  }

  const toggle = (): void => {
    if (!room) {
      setDrawerOpen((v) => !v)
      return
    }
    void api().tradeWindow.setRail(wide ? 'narrow' : 'wide')
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

  const item = { focusTab, onChoose: choose }
  const list = (
    <>
      <div className="ui-rail__list">
        <div className="ui-rail__group">
          <RailTab tab="trade" name={t('sites.trade')} title={t('sites.trade.title')} {...item}>
            <Ico name="trade" />
            <span className="ts-rail__cap" aria-hidden="true">
              {t('sites.trade')}
            </span>
          </RailTab>
        </div>
        <div className="ui-rail__group" role="group" aria-label={t('sites.group.sites')}>
          <div className="ui-rail__head" aria-hidden="true">
            <span>{t('sites.group.sites')}</span>
          </div>
          {SITES.map((s) => (
            <RailTab key={s.id} tab={s.id} name={s.name} title={`${s.name} — ${t(s.aboutKey)}`} {...item}>
              <span className="ts-rail__mark" data-site={s.id}>
                {s.mark}
              </span>
            </RailTab>
          ))}
        </div>
        {bookmarks.length > 0 && (
          <div className="ui-rail__group" role="group" aria-label={t('sites.group.own')}>
            <div className="ui-rail__head" aria-hidden="true">
              <span>{t('sites.group.own')}</span>
            </div>
            {bookmarks.map((b) => (
              <RailTab key={b.id} tab={bookmarkTab(b.id)} name={b.title} title={b.title} {...item}>
                <span className="ts-rail__mark ts-rail__mark--own">{bookmarkMark(b.title)}</span>
              </RailTab>
            ))}
          </div>
        )}
      </div>
      <RailTab tab="manage" name={t('sites.manage')} title={t('sites.manage.title')} {...item}>
        <Ico name="gear" />
      </RailTab>
    </>
  )

  return (
    <>
      <nav className={`ui-rail ts-rail${wide ? ' ui-rail--wide' : ''}`} aria-label={t('sites.rail')} onKeyDown={onKeys}>
        {list}
        <RailToggle ref={toggleRef} open={wide || drawer} onClick={toggle} />
      </nav>
      {drawer && (
        <RailDrawer label={t('sites.rail')} toggleRef={toggleRef} onClose={() => setDrawerOpen(false)} className="ts-rail">
          {/* display: contents — обёртка только ловит стрелки, разметку шторки не меняет */}
          <div className="ts-rail__keys" onKeyDown={onKeys}>
            {list}
          </div>
        </RailDrawer>
      )}
    </>
  )
}
