import type { Act, RewardKind } from '@shared/types'
import { useAppStore, getRoute } from '../store/useAppStore'
import { QuestRow } from '../components/QuestRow'

const PERMANENT = new Set<RewardKind>([
  'passive_point',
  'skill_point',
  'weapon_set_point',
  'spirit',
  'resistance',
  'attribute',
  'life',
  'mana',
  'charm_slot'
])

/** Short reward teaser for a zone — prefer a permanent reward, else the first. */
function rewardTeaser(act: Act, zoneAreaId: string): string | null {
  const qs = act.quests.filter((q) => q.zone === zoneAreaId)
  for (const q of qs) for (const r of q.rewards) if (PERMANENT.has(r.kind)) return r.value
  for (const q of qs) if (q.rewards[0]) return q.rewards[0].value
  return null
}

export function WhatsNextPanel() {
  const dataset = useAppStore((s) => s.dataset)
  const currentStepIndex = useAppStore((s) => s.currentStepIndex)
  const detectedZoneAreaId = useAppStore((s) => s.detectedZoneAreaId)
  const progress = useAppStore((s) => s.progress)
  const stepNext = useAppStore((s) => s.stepNext)
  const stepPrev = useAppStore((s) => s.stepPrev)
  const selectZone = useAppStore((s) => s.selectZone)
  const toggleQuest = useAppStore((s) => s.toggleQuest)

  const route = getRoute()
  if (!dataset || route.length === 0) return null

  const idx = Math.max(0, Math.min(route.length - 1, currentStepIndex))
  const step = route[idx]
  const act = dataset.acts.find((a) => a.id === step.actId)
  const zone = act?.zones.find((z) => z.areaId === step.areaId)
  if (!act || !zone) return null

  const completed = progress?.completedQuestIds ?? {}
  const quests = act.quests.filter((q) => q.zone === step.areaId)
  const ordered = [
    ...quests.filter((q) => q.type === 'mandatory'),
    ...quests.filter((q) => q.type === 'optional')
  ]
  const hasLayout = !!zone.layout && !!dataset.layouts[zone.layout]
  const next = idx + 1 < route.length ? route[idx + 1] : null
  const nextAct = next ? dataset.acts.find((a) => a.id === next.actId) : null
  const nextTeaser = next && nextAct ? rewardTeaser(nextAct, next.areaId) : null

  return (
    <section className="panel whatsnext">
      <div className="panel-head">
        <span>
          Что дальше? · {idx + 1}/{route.length}
        </span>
        <span className="wn-nav">
          <button className="icon" title="Назад (Ctrl+Shift+[)" onClick={stepPrev}>
            ◀
          </button>
          <button className="icon" title="Вперёд (Ctrl+Shift+])" onClick={stepNext}>
            ▶
          </button>
        </span>
      </div>

      <div className="wn-current">
        <div className="wn-act">{act.actName}</div>
        <div className="wn-zone-row">
          <span className="wn-zone">
            {detectedZoneAreaId === step.areaId ? '📍 ' : ''}
            {step.zoneName}
            {step.isTown ? ' 🏠' : ''}
          </span>
          {hasLayout && (
            <button className="map-btn" onClick={() => selectZone(step.areaId)}>
              🗺 карта
            </button>
          )}
        </div>

        {ordered.length === 0 ? (
          <div className="wn-empty small muted">Проходная зона — просто двигайся дальше.</div>
        ) : (
          <ul className="quest-list">
            {ordered.map((q) => (
              <QuestRow
                key={q.id}
                quest={q}
                done={!!completed[q.id]}
                onToggle={(d) => void toggleQuest(q.id, d)}
              />
            ))}
          </ul>
        )}
      </div>

      {next && nextAct && (
        <div className="wn-next" onClick={stepNext}>
          <div className="wn-next-label">Дальше</div>
          <div className="wn-next-zone">
            {nextAct.kind === 'interlude' ? `ИНТ ${nextAct.actNumber - 4}` : `А${nextAct.actNumber}`} ·{' '}
            {next.zoneName}
            {next.isTown ? ' 🏠' : ''}
          </div>
          {nextTeaser && <div className="wn-next-reward small muted">🎁 {nextTeaser}</div>}
          <span className="wn-next-go">Перейти →</span>
        </div>
      )}
    </section>
  )
}
