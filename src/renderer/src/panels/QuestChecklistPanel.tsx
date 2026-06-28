import type { Quest } from '@shared/types'
import { useAppStore } from '../store/useAppStore'
import { useT, useName } from '../i18n'
import { QuestRow } from '../components/QuestRow'

export function QuestChecklistPanel() {
  const t = useT()
  const localName = useName()
  const dataset = useAppStore((s) => s.dataset)
  const selectedActId = useAppStore((s) => s.selectedActId)
  const selectedZoneAreaId = useAppStore((s) => s.selectedZoneAreaId)
  const detectedZoneAreaId = useAppStore((s) => s.detectedZoneAreaId)
  const progress = useAppStore((s) => s.progress)
  const toggleQuest = useAppStore((s) => s.toggleQuest)
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

  const total = act.quests.length
  const doneCount = act.quests.filter((q) => completed[q.id]).length

  return (
    <section className="panel checklist">
      <div className="panel-head">
        <span>{t('cl.head', { act: act.actName })}</span>
        <span className="muted">
          {doneCount}/{total}
        </span>
      </div>
      <ul className="zones">
        {act.zones.map((zone) => {
          const quests = byZone.get(zone.areaId) ?? []
          const hasLayout = !!zone.layout && !!dataset?.layouts[zone.layout]
          if (quests.length === 0 && !hasLayout) return null
          return (
            <li key={zone.areaId} className="zone-group">
              <div
                className={`zone-head ${selectedZoneAreaId === zone.areaId ? 'active' : ''} ${
                  detectedZoneAreaId === zone.areaId ? 'current' : ''
                }`}
              >
                <span className="zone-name">
                  {detectedZoneAreaId === zone.areaId ? '📍 ' : ''}
                  {localName(zone.name)}
                  {zone.isTown ? ' 🏠' : ''}
                </span>
                {hasLayout && (
                  <button className="map-btn" onClick={() => selectZone(zone.areaId)}>
                    {t('q.map')}
                  </button>
                )}
              </div>
              {quests.length > 0 && (
                <ul className="quest-list">
                  {quests.map((q) => (
                    <QuestRow
                      key={q.id}
                      quest={q}
                      done={!!completed[q.id]}
                      auto={!!auto[q.id]}
                      onToggle={(d) => void toggleQuest(q.id, d)}
                    />
                  ))}
                </ul>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
