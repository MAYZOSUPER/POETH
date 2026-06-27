import { useState } from 'react'
import { useAppStore } from '../store/useAppStore'

export function ProfileBar() {
  const profiles = useAppStore((s) => s.profiles)
  const activeProfileId = useAppStore((s) => s.activeProfileId)
  const switchProfile = useAppStore((s) => s.switchProfile)
  const createProfile = useAppStore((s) => s.createProfile)
  const renameProfile = useAppStore((s) => s.renameProfile)
  const deleteProfile = useAppStore((s) => s.deleteProfile)

  const [mode, setMode] = useState<'idle' | 'add' | 'rename' | 'confirm-del'>('idle')
  const [text, setText] = useState('')

  const active = profiles.find((p) => p.id === activeProfileId)

  function submit() {
    const name = text.trim()
    if (mode === 'add' && name) void createProfile(name)
    if (mode === 'rename' && name && activeProfileId) void renameProfile(activeProfileId, name)
    setText('')
    setMode('idle')
  }

  if (mode === 'add' || mode === 'rename') {
    return (
      <div className="profile-bar">
        <input
          autoFocus
          className="profile-input"
          placeholder={mode === 'add' ? 'Имя нового персонажа' : 'Новое имя'}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
            if (e.key === 'Escape') setMode('idle')
          }}
        />
        <button className="icon" title="OK" onClick={submit}>
          ✓
        </button>
        <button className="icon" title="Отмена" onClick={() => setMode('idle')}>
          ✕
        </button>
      </div>
    )
  }

  if (mode === 'confirm-del') {
    return (
      <div className="profile-bar">
        <span className="muted small">Удалить «{active?.name}»?</span>
        <button
          className="icon danger"
          title="Удалить"
          onClick={() => {
            if (activeProfileId) void deleteProfile(activeProfileId)
            setMode('idle')
          }}
        >
          🗑
        </button>
        <button className="icon" title="Отмена" onClick={() => setMode('idle')}>
          ✕
        </button>
      </div>
    )
  }

  return (
    <div className="profile-bar">
      <select
        className="profile-select"
        value={activeProfileId ?? ''}
        onChange={(e) => void switchProfile(e.target.value)}
      >
        {profiles.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
            {p.className ? ` (${p.className})` : ''}
          </option>
        ))}
      </select>
      <button className="icon" title="Новый персонаж" onClick={() => setMode('add')}>
        ＋
      </button>
      <button
        className="icon"
        title="Переименовать"
        onClick={() => {
          setText(active?.name ?? '')
          setMode('rename')
        }}
      >
        ✎
      </button>
      <button className="icon" title="Удалить" onClick={() => setMode('confirm-del')}>
        🗑
      </button>
    </div>
  )
}
