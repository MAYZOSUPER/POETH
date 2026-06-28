import { useState } from 'react'
import { useAppStore } from '../store/useAppStore'
import { useT } from '../i18n'

// PoE2 base classes — kept in sync with the gem-recommendation / ascendancy keys
// so that picking a class here filters those panels.
const CLASSES = [
  'Warrior',
  'Witch',
  'Ranger',
  'Monk',
  'Mercenary',
  'Sorceress',
  'Huntress',
  'Druid'
]

export function ProfileBar() {
  const profiles = useAppStore((s) => s.profiles)
  const activeProfileId = useAppStore((s) => s.activeProfileId)
  const switchProfile = useAppStore((s) => s.switchProfile)
  const createProfile = useAppStore((s) => s.createProfile)
  const renameProfile = useAppStore((s) => s.renameProfile)
  const setProfileClass = useAppStore((s) => s.setProfileClass)
  const deleteProfile = useAppStore((s) => s.deleteProfile)
  const exportActiveProfile = useAppStore((s) => s.exportActiveProfile)
  const importProfile = useAppStore((s) => s.importProfile)
  const t = useT()

  const [mode, setMode] = useState<'idle' | 'add' | 'rename' | 'confirm-del'>('idle')
  const [text, setText] = useState('')
  const [cls, setCls] = useState('')
  const [note, setNote] = useState<{ key: string; danger?: boolean } | null>(null)

  const active = profiles.find((p) => p.id === activeProfileId)

  function flash(key: string, danger?: boolean) {
    setNote({ key, danger })
    window.setTimeout(() => setNote((n) => (n?.key === key ? null : n)), 2600)
  }

  async function onExport() {
    const res = await exportActiveProfile()
    if (res.status === 'saved') flash('pf.exported')
  }

  async function onImport() {
    const res = await importProfile()
    if (res.status === 'created') flash('pf.imported')
    else if (res.status === 'invalid') flash('pf.importInvalid', true)
  }

  async function submit() {
    const name = text.trim()
    if (mode === 'add') {
      if (name) await createProfile(name, cls || undefined)
    } else if (mode === 'rename' && activeProfileId) {
      if (name && name !== active?.name) await renameProfile(activeProfileId, name)
      if (cls !== (active?.className ?? '')) await setProfileClass(activeProfileId, cls)
    }
    setText('')
    setCls('')
    setMode('idle')
  }

  if (mode === 'add' || mode === 'rename') {
    return (
      <div className="profile-bar">
        <input
          autoFocus
          className="profile-input"
          placeholder={mode === 'add' ? t('pf.addName') : t('pf.newName')}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submit()
            if (e.key === 'Escape') setMode('idle')
          }}
        />
        <select
          className="class-select"
          title={t('pf.class')}
          value={cls}
          onChange={(e) => setCls(e.target.value)}
        >
          <option value="">{t('pf.noClass')}</option>
          {CLASSES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <button className="icon" title={t('pf.ok')} onClick={() => void submit()}>
          ✓
        </button>
        <button className="icon" title={t('pf.cancel')} onClick={() => setMode('idle')}>
          ✕
        </button>
      </div>
    )
  }

  if (mode === 'confirm-del') {
    return (
      <div className="profile-bar">
        <span className="muted small">{t('pf.confirmDelete', { name: active?.name ?? '' })}</span>
        <button
          className="icon danger"
          title={t('pf.delete')}
          onClick={() => {
            if (activeProfileId) void deleteProfile(activeProfileId)
            setMode('idle')
          }}
        >
          🗑
        </button>
        <button className="icon" title={t('pf.cancel')} onClick={() => setMode('idle')}>
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
      <button
        className="icon"
        title={t('pf.add')}
        onClick={() => {
          setText('')
          setCls('')
          setMode('add')
        }}
      >
        ＋
      </button>
      <button
        className="icon"
        title={t('pf.rename')}
        onClick={() => {
          setText(active?.name ?? '')
          setCls(active?.className ?? '')
          setMode('rename')
        }}
      >
        ✎
      </button>
      <button className="icon" title={t('pf.delete')} onClick={() => setMode('confirm-del')}>
        🗑
      </button>
      <button
        className="icon"
        title={t('pf.export')}
        disabled={!active}
        onClick={() => void onExport()}
      >
        ⤓
      </button>
      <button className="icon" title={t('pf.import')} onClick={() => void onImport()}>
        ⤒
      </button>
      {note && <span className={note.danger ? 'small danger' : 'muted small'}>{t(note.key)}</span>}
    </div>
  )
}
