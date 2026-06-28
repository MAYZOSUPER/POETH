import type { Quest } from '@shared/types'
import { RewardBadge } from './RewardBadge'
import { useT, useName } from '../i18n'

interface Props {
  quest: Quest
  done: boolean
  onToggle: (done: boolean) => void
}

export function QuestRow({ quest, done, onToggle }: Props) {
  const t = useT()
  const localName = useName()
  return (
    <li className={`quest ${done ? 'done' : ''} ${quest.type}`}>
      <label className="quest-main">
        <input type="checkbox" checked={done} onChange={(e) => onToggle(e.target.checked)} />
        <span className="quest-name">
          {quest.boss ? '☠ ' : ''}
          {localName(quest.name)}
        </span>
        <span className={quest.type === 'mandatory' ? 'type-tag req' : 'type-tag opt'}>
          {quest.type === 'mandatory' ? t('q.req') : t('q.opt')}
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
