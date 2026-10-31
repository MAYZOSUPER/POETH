import { useAppStore } from '../store/useAppStore'
import { useT } from '../i18n'

/** Акты чипами с прогрессом квестов; интерлюдии — отдельной группой «Интерлюдии 1 2 3». Уровень — в ProfileBar. */
export function ActTabs() {
  const dataset = useAppStore((s) => s.dataset)
  const selectedActId = useAppStore((s) => s.selectedActId)
  const selectAct = useAppStore((s) => s.selectAct)
  const progress = useAppStore((s) => s.progress)
  const t = useT()
  if (!dataset) return null
  const completed = progress?.completedQuestIds ?? {}

  const chip = (a: (typeof dataset.acts)[number]) => {
    const done = a.quests.filter((q) => completed[q.id]).length
    const all = a.quests.length > 0 && done === a.quests.length
    const interlude = a.kind === 'interlude'
    return (
      <button
        key={a.id}
        type="button"
        className={`ui-chip${all ? ' is-done' : ''}`}
        aria-pressed={a.id === selectedActId}
        title={interlude ? `${t('int.title', { n: a.actNumber - 4 })} · ${a.actName}` : a.actName}
        onClick={() => selectAct(a.id)}
      >
        {interlude ? a.actNumber - 4 : t('act.short', { n: a.actNumber })}
        <span className="ui-chip__n">
          {done}/{a.quests.length}
        </span>
      </button>
    )
  }
  const acts = dataset.acts.filter((a) => a.kind !== 'interlude')
  const interludes = dataset.acts.filter((a) => a.kind === 'interlude')

  return (
    <div className="cp-acts" role="group" aria-label={t('act.group')}>
      {acts.map(chip)}
      {interludes.length > 0 && (
        <>
          <span className="cp-acts__sep" />
          <span className="cp-acts__lbl" title={t('int.help')}>
            {t('int.group')}
          </span>
          {interludes.map(chip)}
        </>
      )}
    </div>
  )
}
