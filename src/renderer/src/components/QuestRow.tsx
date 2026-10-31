import type { Quest } from '@shared/types'
import { RewardBadge } from './RewardBadge'
import { ShellIcon } from './ShellIcon'
import { useT, useName, useLang } from '../i18n'
import { useAppStore } from '../store/useAppStore'

interface Props {
  quest: Quest
  done: boolean
  /** quest was auto-checked by progression detection (shows a «по журналу» mark) */
  auto?: boolean
  onToggle: (done: boolean) => void
}

/** Строка квеста компаса PoE 2 (.cp-q): галочка, имя (босс — значком), обязательность, награды, заметка. */
export function QuestRow({ quest, done, auto, onToggle }: Props) {
  const t = useT()
  const localName = useName()
  const lang = useLang()
  const simple = useAppStore((s) => s.settings?.ui.simpleMode ?? true)
  const notes = lang === 'ru' ? (quest.notesRu ?? quest.notes) : quest.notes
  const name = localName(quest.name)
  return (
    <div className={`cp-q${done ? ' is-done' : ''}`}>
      <button
        type="button"
        className="ui-check"
        role="checkbox"
        aria-checked={done}
        aria-label={name}
        onClick={() => onToggle(!done)}
      >
        <ShellIcon name="check" />
      </button>
      <span className="cp-q__t">
        <span className="cp-q__name">
          {quest.boss && <ShellIcon name="death" />}
          <span className="cp-q__nm">{name}</span>
          <span className={`ui-tag${quest.type === 'mandatory' ? ' ui-tag--warn' : ''}`}>
            {quest.type === 'mandatory' ? t('q.req') : t('q.opt')}
          </span>
        </span>
        {quest.rewards.length > 0 && (
          <span className="cp-q__rw">
            {quest.rewards.map((r, i) => (
              <RewardBadge key={i} reward={r} />
            ))}
          </span>
        )}
        {simple && notes && <span className="cp-q__note">{notes}</span>}
      </span>
      <span className="cp-q__end">
        {auto && done && (
          <span className="cp-auto" title={t('q.auto.title')}>
            {t('q.auto')}
          </span>
        )}
      </span>
    </div>
  )
}
