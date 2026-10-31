import type { Act, Reward, RewardKind } from '@shared/types'
import { useAppStore, getRoute, stepIndexOfZone } from '../store/useAppStore'
import { useT, useLang, useName, layoutLabel } from '../i18n'
import { tKey } from '../i18n/hotkey'
import { QuestRow } from '../components/QuestRow'
import { RewardBadge } from '../components/RewardBadge'
import { ShellIcon } from '../components/ShellIcon'

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

/** «Что дальше»: одна зона маршрута карточкой (.cp-zone) — куда идти, что взять, квесты, следующая зона. */
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
  const simple = useAppStore((s) => s.settings?.ui.simpleMode ?? true)
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
  const hasSteps = !!hint && !!(hint.objective || hint.exit || hint.cues?.length)

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
  const actLabel = (a: Act): string =>
    a.kind === 'interlude' ? t('int.title', { n: a.actNumber - 4 }) : t('act.short', { n: a.actNumber })

  return (
    <section className="ui-box cp-zone" aria-label={t('vt.whatsnext')}>
      <div className="ui-box__head">
        <span className="cp-eyebrow">
          {actLabel(act)} · {t('wn.head', { i: idx + 1, n: route.length })}
        </span>
        <span className="ui-label__grow" />
        <button
          type="button"
          className="ui-btn ui-btn--ghost ui-btn--icon ui-btn--sm"
          title={tKey(t, 'wn.prev', prevKey)}
          aria-label={t('wn.prev.nokey')}
          onClick={stepPrev}
        >
          <span style={{ display: 'inline-flex', transform: 'scaleX(-1)' }}>
            <ShellIcon name="chev-r" />
          </span>
        </button>
        <button
          type="button"
          className="ui-btn ui-btn--ghost ui-btn--icon ui-btn--sm"
          title={tKey(t, 'wn.next', nextKey)}
          aria-label={t('wn.next.nokey')}
          onClick={stepNext}
        >
          <ShellIcon name="chev-r" />
        </button>
      </div>

      <div className="ui-box__body">
        <div className="cp-zname">
          <h3>{localName(step.zoneName)}</h3>
          {step.isTown && (
            <span title={t('wn.town')}>
              <ShellIcon name="home" />
            </span>
          )}
          {hint?.layoutType && <span className="ui-tag">{layoutLabel(lang, hint.layoutType)}</span>}
          {youAreHere && (
            <span className="cp-here">
              <span className="ui-dot" />
              {t('wn.here')}
            </span>
          )}
          <span className="ui-label__grow" style={{ flex: 1 }} />
          {hasLayout && (
            <button type="button" className="ui-btn ui-btn--sm" onClick={() => selectZone(step.areaId)}>
              <ShellIcon name="map" />
              {t('q.map')}
            </button>
          )}
        </div>

        {offTrack && (
          <div>
            <button type="button" className="ui-btn ui-btn--sm" onClick={() => goToStep(detectedStep)}>
              <ShellIcon name="compass" />
              {t('wn.backtrack')}
            </button>
          </div>
        )}

        {/* S64: строка «штраф опыта в зоне» — отдельный компонент сюда, между названием зоны и шагами
            (обёртка .cp-xp в panels/campaign/campaign.css) */}

        {hasSteps && hint && (
          <div className="cp-steps">
            {hint.objective && (
              <div className="cp-step">
                <ShellIcon name="map" />
                <span>{hint.objective}</span>
              </div>
            )}
            {hint.exit && (
              <div className="cp-step">
                <ShellIcon name="step" />
                <span>{hint.exit}</span>
              </div>
            )}
            {hint.cues?.map((c, i) => (
              <div key={i} className="cp-step">
                <ShellIcon name="compass" />
                <span>
                  {c.cue}
                  {c.leadsTo ? ` → ${c.leadsTo}` : ''}
                </span>
              </div>
            ))}
          </div>
        )}
        {simple && hint?.tips && hint.tips.length > 0 && (
          <ul className="cp-tips">
            {hint.tips.map((tip, i) => (
              <li key={i}>{tip}</li>
            ))}
          </ul>
        )}
      </div>

      {mandatory.length === 0 && optional.length === 0 ? (
        <p className="cp-empty">{t('wn.passthrough')}</p>
      ) : (
        <div className="cp-rows">
          {mandatory.map(renderRow)}
          {optional.map(renderRow)}
        </div>
      )}

      {next && nextAct && (
        <div className="ui-box__foot cp-next">
          <span>
            {t('wn.nextLabel')}{' '}
            <b>
              {nextAct.id !== act.id ? `${actLabel(nextAct)} · ` : ''}
              {localName(next.zoneName)}
            </b>
            {nextTeaser && <RewardBadge reward={nextTeaser} />}
          </span>
          <button type="button" className="ui-btn ui-btn--sm" onClick={stepNext}>
            {t('wn.go')}
            <ShellIcon name="chev-r" />
          </button>
        </div>
      )}
    </section>
  )
}
