import { useEffect, useRef, useState } from 'react'
import type { ChatCommand } from '@shared/types'
import { keyPressToAccelerator } from '@shared/accelerators'
import {
  CHAT_PRESET_IDS,
  cleanChatText,
  defaultChatCommands,
  findHotkeyConflict,
  newChatCommandId
} from '@shared/chatCommands'
import { useAppStore } from '../../store/useAppStore'
import { useT } from '../../i18n'
import { Kbd } from '../../overlay/Kbd'
import './chat.css'

// Раздел настроек «Команды чата» (Settings.chatCommands): текст, хоткей с переназначением,
// «Отправить сразу», вкл/выкл, свои команды, «Вернуть по умолчанию». Хоткеи проверяются тем же
// валидатором, что и остальные (занятые игрой сочетания и повторы нельзя).

function CommandText({ cmd, onCommit }: { cmd: ChatCommand; onCommit: (text: string) => void }) {
  const t = useT()
  const [draft, setDraft] = useState(cmd.text)
  useEffect(() => setDraft(cmd.text), [cmd.text])
  const commit = (): void => {
    const text = cleanChatText(draft)
    if (text && text !== cmd.text) onCommit(text)
    else setDraft(cmd.text)
  }
  return (
    <input
      className="ui-input ui-input--mono chat-cmd__text"
      value={draft}
      aria-label={t('overlay.chat.text')}
      spellCheck={false}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') {
          setDraft(cmd.text)
          e.currentTarget.blur()
        }
      }}
    />
  )
}

export function ChatCommandsPanel() {
  const settings = useAppStore((s) => s.settings)
  const patchSettings = useAppStore((s) => s.patchSettings)
  const t = useT()
  const cmds = settings?.chatCommands ?? []
  const [capturing, setCapturing] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const settingsRef = useRef(settings)
  settingsRef.current = settings

  const save = (next: ChatCommand[]): void => void patchSettings({ chatCommands: next })
  const update = (id: string, patch: Partial<ChatCommand>): void =>
    save((settingsRef.current?.chatCommands ?? []).map((c) => (c.id === id ? { ...c, ...patch } : c)))

  // запись сочетания: глобальные хоткеи на это время сняты (как в разделе «Горячие клавиши»)
  useEffect(() => {
    if (!capturing) return
    const api = window.overlayApi
    api.hotkeys.suspend()
    const onKey = (e: KeyboardEvent): void => {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') {
        setCapturing(null)
        return
      }
      const accel = keyPressToAccelerator({
        code: e.code,
        key: e.key,
        control: e.ctrlKey,
        alt: e.altKey,
        shift: e.shiftKey,
        meta: e.metaKey
      })
      const s = settingsRef.current
      if (!accel || !s) return
      const conflict = findHotkeyConflict(accel, s, { chatId: capturing })
      if (conflict) {
        setNote(conflict.kind === 'reserved' ? `overlay.hotkey.reserved.${conflict.reason}` : 'set.hk.conflict')
        return
      }
      update(capturing, { hotkey: accel })
      setNote(null)
      setCapturing(null)
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      api.hotkeys.resume()
    }
    // update берёт актуальный список из settingsRef — зависимость только от capturing
  }, [capturing])

  const label = (c: ChatCommand): string =>
    CHAT_PRESET_IDS.has(c.id) ? t(`overlay.chat.preset.${c.id}`) : t('overlay.chat.custom')

  return (
    <div className="block chat-cmds">
      <div className="block-title">{t('overlay.chat.title')}</div>
      <div className="ui-hint chat-cmds__hint">
        <span className="chat-cmds__i" aria-hidden="true">
          i
        </span>
        <span>
          {t('overlay.chat.hint')}
          <br />
          <span className="chat-cmds__vars">{t('overlay.chat.vars')}</span>
        </span>
      </div>

      {cmds.length === 0 && <div className="small muted">{t('overlay.chat.empty')}</div>}
      <ul className="chat-cmds__list">
        {cmds.map((c) => (
          <li key={c.id} className={`chat-cmd${c.enabled ? '' : ' is-off'}`}>
            <button
              type="button"
              className="ui-check chat-cmd__on"
              role="checkbox"
              aria-checked={c.enabled}
              title={t('overlay.chat.enabled')}
              aria-label={t('overlay.chat.enabled')}
              onClick={() => update(c.id, { enabled: !c.enabled })}
            >
              <span aria-hidden="true">✓</span>
            </button>
            <div className="chat-cmd__main">
              <span className="chat-cmd__label">{label(c)}</span>
              <CommandText cmd={c} onCommit={(text) => update(c.id, { text })} />
            </div>
            <span className="chat-cmd__hk">
              <button
                type="button"
                className={`ui-btn ui-btn--sm chat-cmd__key${capturing === c.id ? ' is-capturing' : ''}`}
                title={t('overlay.chat.hotkey')}
                onClick={() => {
                  setNote(null)
                  setCapturing((cur) => (cur === c.id ? null : c.id))
                }}
              >
                {capturing === c.id ? t('overlay.chat.press') : c.hotkey ? <Kbd accel={c.hotkey} /> : '—'}
              </button>
              <button
                type="button"
                className="ui-btn ui-btn--ghost ui-btn--icon ui-btn--sm"
                title={t('overlay.chat.clear')}
                aria-label={t('overlay.chat.clear')}
                style={{ visibility: c.hotkey && capturing !== c.id ? 'visible' : 'hidden' }}
                onClick={() => update(c.id, { hotkey: '' })}
              >
                ✕
              </button>
            </span>
            <button
              type="button"
              className="ui-switch"
              role="switch"
              aria-checked={c.send}
              onClick={() => update(c.id, { send: !c.send })}
            >
              <span className="ui-switch__track" />
              {t('overlay.chat.send')}
            </button>
            <button
              type="button"
              className="ui-btn ui-btn--ghost ui-btn--sm"
              onClick={() => save(cmds.filter((x) => x.id !== c.id))}
            >
              {t('overlay.chat.delete')}
            </button>
          </li>
        ))}
      </ul>
      {note && <div className="small danger">{t(note)}</div>}
      <div className="chat-cmds__foot">
        <button
          type="button"
          className="ui-btn ui-btn--sm"
          onClick={() =>
            save([...cmds, { id: newChatCommandId(cmds.map((c) => c.id)), text: '/', hotkey: '', send: true, enabled: true }])
          }
        >
          + {t('overlay.chat.add')}
        </button>
        <button
          type="button"
          className="ui-btn ui-btn--ghost ui-btn--sm"
          onClick={() => {
            if (window.confirm(t('overlay.chat.reset.confirm'))) {
              setCapturing(null)
              setNote(null)
              save(defaultChatCommands())
            }
          }}
        >
          {t('overlay.chat.reset')}
        </button>
      </div>
    </div>
  )
}
