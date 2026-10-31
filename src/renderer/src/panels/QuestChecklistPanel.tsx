import { Fragment } from 'react'
import type { Quest } from '@shared/types'
import { useAppStore } from '../store/useAppStore'
import { useT, useName } from '../i18n'
import { QuestRow } from '../components/QuestRow'
import { ShellIcon } from '../components/ShellIcon'

/** Чек-лист: все квесты акта по зонам (.cp-zgrp — зона строкой-заголовком), «Отметить весь акт». */
export function QuestChecklistPanel() {
  const t = useT()
  const localName = useName()
  const dataset = useAppStore((s) => s.dataset)
  const selectedActId = useAppStore((s) => s.selectedActId)
  const selectedZoneAreaId = useAppStore((s) => s.selectedZoneAreaId)
  const detectedZoneAreaId = useAppStore((s) => s.detectedZoneAreaId)
  const progress = useAppStore((s) => s.progress)
  const toggleQuest = useAppStore((s) => s.toggleQuest)
  const markActQuests = useAppStore((s) => s.markActQuests)
  const selectZone = useAppStore((s) => s.selectZone)

  const act = dataset?.acts.find((a) => a.id === selectedActId)
  if (!act) return null

  const completed = progress?.completedQuestIds ?? {}
  const auto = progress?.autoCompletedQuestIds ?? {}
  const byZone = new Map<string, Quest[]>()
  for (const q of act.quests) {
    const list = byZone.get(q.zone) ?? []
    list.push(q)
    byZone.set(q.zone, list)
  }

  // название акта в данных — английское («Act 1 — Ogham»); в заголовке — наш «Акт 1» / «Интерлюдия 1»
  const actLabel =
    act.kind === 'interlude' ? t('int.title', { n: act.actNumber - 4 }) : t('act.short', { n: act.actNumber })
  const total = act.quests.length
  const doneCount = act.quests.filter((q) => completed[q.id]).length
  const allDone = total > 0 && doneCount === total

  return (
    <section className="ui-box" aria-label={t('cl.head', { act: actLabel })}>
      <div className="ui-box__head">
        <span className="ui-label">
          <ShellIcon name="check" />
          {t('cl.head', { act: actLabel })}
        </span>
        <span className="cp-count">
          {doneCount}/{total}
        </span>
        <span className="ui-label__grow" />
        <button
          type="button"
          className="ui-btn ui-btn--ghost ui-btn--sm"
          title={t('cl.markAll.title')}
          onClick={() => void markActQuests(act.id, !allDone)}
        >
          <ShellIcon name={allDone ? 'close' : 'check'} />
          {allDone ? t('cl.clearAll') : t('cl.markAll')}
        </button>
      </div>
      <div className="cp-rows">
        {act.zones.map((zone) => {
          const quests = byZone.get(zone.areaId) ?? []
          const hasLayout = !!zone.layout && !!dataset?.layouts[zone.layout]
          if (quests.length === 0 && !hasLayout) return null
          const here = detectedZoneAreaId === zone.areaId
          const zoneDone = quests.filter((q) => completed[q.id]).length
          const name = localName(zone.name)
          return (
            <Fragment key={zone.areaId}>
              <div
                className={`cp-zgrp${here ? ' is-cur' : ''}${selectedZoneAreaId === zone.areaId ? ' is-open' : ''}`}
              >
                <b>{name}</b>
                {zone.isTown && (
                  <span title={t('wn.town')}>
                    <ShellIcon name="home" size="sm" />
                  </span>
                )}
                {here && (
                  <span className="cp-here">
                    <span className="ui-dot" />
                    {t('cl.here')}
                  </span>
                )}
                {quests.length > 0 && (
                  <span className="cp-count">
                    {zoneDone}/{quests.length}
                  </span>
                )}
                {hasLayout && (
                  <button
                    type="button"
                    className="ui-btn ui-btn--ghost ui-btn--icon ui-btn--sm"
                    title={`${t('q.map')}: ${name}`}
                    aria-label={`${t('q.map')}: ${name}`}
                    aria-pressed={selectedZoneAreaId === zone.areaId}
                    onClick={() => selectZone(selectedZoneAreaId === zone.areaId ? null : zone.areaId)}
                  >
                    <ShellIcon name="map" />
                  </button>
                )}
              </div>
              {quests.map((q) => (
                <QuestRow
                  key={q.id}
                  quest={q}
                  done={!!completed[q.id]}
                  auto={!!auto[q.id]}
                  onToggle={(d) => void toggleQuest(q.id, d)}
                />
              ))}
            </Fragment>
          )
        })}
      </div>
    </section>
  )
}
