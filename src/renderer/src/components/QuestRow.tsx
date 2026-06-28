import type { Quest } from '@shared/types'
import { RewardBadge } from './RewardBadge'

interface Props {
  quest: Quest
  done: boolean
  onToggle: (done: boolean) => void
}

export function QuestRow({ quest, done, onToggle }: Props) {
  return (
    <li className={`quest ${done ? 'done' : ''} ${quest.type}`}>
      <label className="quest-main">
        <input type="checkbox" checked={done} onChange={(e) => onToggle(e.target.checked)} />
        <span className="quest-name">
          {quest.boss ? '☠ ' : ''}
          {quest.name}
        </span>
        <span className={quest.type === 'mandatory' ? 'type-tag req' : 'type-tag opt'}>
          {quest.type === 'mandatory' ? 'обяз' : 'опц'}
        </span>
      </label>
      {quest.rewards.length > 0 && (
        <div className="rewards">
          {quest.rewards.map((r, i) => (
            <RewardBadge key={i} reward={r} />
          ))}
        </div>
      )}
      {quest.notes && <div className="quest-notes">{quest.notes}</div>}
    </li>
  )
}
