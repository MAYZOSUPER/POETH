import { useAppStore } from '../store/useAppStore'

export function ActTabs() {
  const dataset = useAppStore((s) => s.dataset)
  const selectedActId = useAppStore((s) => s.selectedActId)
  const selectAct = useAppStore((s) => s.selectAct)
  const progress = useAppStore((s) => s.progress)
  const setLevel = useAppStore((s) => s.setLevel)
  if (!dataset) return null
  const completed = progress?.completedQuestIds ?? {}

  return (
    <div className="act-tabs">
      <div className="acts">
        {dataset.acts.map((a) => {
          const done = a.quests.filter((q) => completed[q.id]).length
          return (
            <button
              key={a.id}
              className={`act ${a.id === selectedActId ? 'active' : ''} ${a.kind}`}
              title={a.actName}
              onClick={() => selectAct(a.id)}
            >
              <span className="act-n">
                {a.kind === 'interlude' ? `ИНТ ${a.actNumber - 4}` : `АКТ ${a.actNumber}`}
              </span>
              <span className="act-prog">
                {done}/{a.quests.length}
              </span>
            </button>
          )
        })}
      </div>
      <label className="level" title="Уровень персонажа">
        Ур.
        <input
          type="number"
          min={1}
          max={100}
          value={progress?.level ?? 1}
          onChange={(e) => void setLevel(Number(e.target.value))}
        />
      </label>
    </div>
  )
}
