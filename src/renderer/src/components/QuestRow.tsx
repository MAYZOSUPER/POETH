import type { Quest } from '@shared/types'
import { RewardBadge } from './RewardBadge'
import { useT, useName, useLang } from '../i18n'

interface Props {
  quest: Quest
  done: boolean
  /** quest was auto-checked by progression detection (shows an "авто" badge) */
  auto?: boolean
  onToggle: (done: boolean) => void
}

export function QuestRow({ quest, done, auto, onToggle }: Props) {
  const t = useT()
  const localName = useName()
  const lang = useLang()
  const notes = lang === 'ru' ? (quest.notesRu ?? quest.notes) : quest.notes
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
        {auto && done && (
          <span className="type-tag auto" title={t('q.auto.title')}>
            {t('q.auto')}
          </span>
        )}
      </label>
      {quest.rewards.length > 0 && (
        <div className="rewards">
          {quest.rewards.map((r, i) => (
            <RewardBadge key={i} reward={r} />
          ))}
        </div>
      )}
      {notes && <div className="quest-notes">{notes}</div>}
    </li>
  )
}
