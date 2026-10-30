import type { Act, Reward, RewardKind } from '@shared/types'
import { useAppStore, getRoute, stepIndexOfZone } from '../store/useAppStore'
import { useT, useLang, useName, layoutLabel, formatReward } from '../i18n'
import { tKey } from '../i18n/hotkey'
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

/** Best reward to tease for a zone — prefer a permanent reward, else the first. */
function rewardTeaser(act: Act, zoneAreaId: string): Reward | null {
  const qs = act.quests.filter((q) => q.zone === zoneAreaId)
  for (const q of qs) for (const r of q.rewards) if (PERMANENT.has(r.kind)) return r
  for (const q of qs) if (q.rewards[0]) return q.rewards[0]
  return null
}

export function WhatsNextPanel() {
  const dataset = useAppStore((s) => s.dataset)
  const currentStepIndex = useAppStore((s) => s.currentStepIndex)
  const detectedZoneAreaId = useAppStore((s) => s.detectedZoneAreaId)
  const progress = useAppStore((s) => s.progress)
  const stepNext = useAppStore((s) => s.stepNext)
  const stepPrev = useAppStore((s) => s.stepPrev)
  const goToStep = useAppStore((s) => s.goToStep)
  const selectZone = useAppStore((s) => s.selectZone)
  const toggleQuest = useAppStore((s) => s.toggleQuest)
  const t = useT()
  const lang = useLang()
  const localName = useName()
  // шаги ◀ ▶ переназначаются в настройках (prevStep / nextStep)
  const prevKey = useAppStore((s) => s.settings?.hotkeys.prevStep.accel)
  const nextKey = useAppStore((s) => s.settings?.hotkeys.nextStep.accel)

  const route = getRoute()
  if (!dataset || route.length === 0) return null

  const idx = Math.max(0, Math.min(route.length - 1, currentStepIndex))
  const step = route[idx]
  const act = dataset.acts.find((a) => a.id === step.actId)
  const zone = act?.zones.find((z) => z.areaId === step.areaId)
  if (!act || !zone) return null

  const completed = progress?.completedQuestIds ?? {}
  const auto = progress?.autoCompletedQuestIds ?? {}
  const quests = act.quests.filter((q) => q.zone === step.areaId)
  const mandatory = quests.filter((q) => q.type === 'mandatory')
  const optional = quests.filter((q) => q.type === 'optional')
  const hasLayout = !!zone.layout && !!dataset.layouts[zone.layout]
  const hintKey = step.zoneName.toLowerCase()
  const hint =
    (lang === 'ru' ? dataset.hintsRu?.[hintKey] : undefined) ?? dataset.hints?.[hintKey]
  const hasHint = !!hint && !!(hint.objective || hint.exit || hint.cues?.length || hint.tips?.length)

  const youAreHere = detectedZoneAreaId === step.areaId
  const detectedStep = detectedZoneAreaId ? stepIndexOfZone(detectedZoneAreaId) : -1
  const offTrack = !youAreHere && detectedStep >= 0

  const renderRow = (q: (typeof quests)[number]) => (
    <QuestRow
      key={q.id}
      quest={q}
      done={!!completed[q.id]}
      auto={!!auto[q.id]}
      onToggle={(d) => void toggleQuest(q.id, d)}
    />
  )
  const next = idx + 1 < route.length ? route[idx + 1] : null
  const nextAct = next ? dataset.acts.find((a) => a.id === next.actId) : null
  const nextTeaser = next && nextAct ? rewardTeaser(nextAct, next.areaId) : null

  return (
    <section className="panel whatsnext">
      <div className="panel-head">
        <span>{t('wn.head', { i: idx + 1, n: route.length })}</span>
        <span className="wn-nav">
          <button className="icon" title={tKey(t, 'wn.prev', prevKey)} onClick={stepPrev}>
            ◀
          </button>
          <button className="icon" title={tKey(t, 'wn.next', nextKey)} onClick={stepNext}>
            ▶
          </button>
        </span>
      </div>

      <div className="wn-current">
        <div className="wn-act">{act.actName}</div>
        <div className="wn-zone-row">
          <span className="wn-zone">
            {localName(step.zoneName)}
            {step.isTown ? ' 🏠' : ''}
          </span>
          {hasLayout && (
            <button className="map-btn" onClick={() => selectZone(step.areaId)}>
              {t('q.map')}
            </button>
          )}
        </div>

        {youAreHere && <div className="wn-here">{t('wn.here')}</div>}
        {offTrack && (
          <button className="wn-backtrack" onClick={() => goToStep(detectedStep)}>
            {t('wn.backtrack')}
          </button>
        )}

        {hasHint && hint && (
          <div className="wn-nav-hint">
            {hint.layoutType && <span className="wn-layout">{layoutLabel(lang, hint.layoutType)}</span>}
            {hint.objective && <div className="wn-hint">🎯 {hint.objective}</div>}
            {hint.exit && <div className="wn-hint">➡️ {hint.exit}</div>}
            {hint.cues?.map((c, i) => (
              <div key={i} className="wn-cue">
                {c.icon ? `${c.icon} ` : ''}
                {c.cue}
                {c.leadsTo ? ` → ${c.leadsTo}` : ''}
              </div>
            ))}
            {hint.tips?.map((tip, i) => (
              <div key={i} className="wn-tip">
                • {tip}
              </div>
            ))}
          </div>
        )}

        {mandatory.length === 0 && optional.length === 0 ? (
          <div className="wn-empty small muted">{t('wn.passthrough')}</div>
        ) : (
          <>
            {mandatory.length > 0 && (
              <div className="wn-group">
                <div className="wn-group-head req">{t('wn.mandatory')}</div>
                <ul className="quest-list">{mandatory.map(renderRow)}</ul>
              </div>
            )}
            {optional.length > 0 && (
              <div className="wn-group">
                <div className="wn-group-head opt">{t('wn.optional')}</div>
                <ul className="quest-list">{optional.map(renderRow)}</ul>
              </div>
            )}
          </>
        )}
      </div>

      {next && nextAct && (
        <div className="wn-next" onClick={stepNext}>
          <div className="wn-next-label">{t('wn.nextLabel')}</div>
          <div className="wn-next-zone">
            {nextAct.kind === 'interlude'
              ? t('int.short', { n: nextAct.actNumber - 4 })
              : t('act.short', { n: nextAct.actNumber })}{' '}
            · {localName(next.zoneName)}
            {next.isTown ? ' 🏠' : ''}
          </div>
          {nextTeaser && (
            <div className="wn-next-reward small muted">🎁 {formatReward(nextTeaser, lang)}</div>
          )}
          <span className="wn-next-go">{t('wn.go')}</span>
        </div>
      )}
    </section>
  )
}
