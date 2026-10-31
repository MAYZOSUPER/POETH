import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '../store/useAppStore'
import { useT, useNameLang } from '../i18n'
import { Select } from '../components/Select'
import { ShellIcon } from '../components/ShellIcon'
import type { IconName } from '../overlay/Icon'

// PoE2 base classes — kept in sync with the gem-recommendation / ascendancy keys
// so that picking a class here filters those panels.
// RU-имён базовых классов в данных клиента нет — показываем как есть (EN).
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

/** Строка персонажа компаса (макет PoE 2 v1): список персонажей, класс → восхождение, уровень, меню «⋯». */
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
  const progress = useAppStore((s) => s.progress)
  const setLevel = useAppStore((s) => s.setLevel)
  const asc = useAppStore((s) => s.dataset?.ascendancy)
  const fromLog = useAppStore((s) => !!s.tailerStatus?.running)
  const simple = useAppStore((s) => s.settings?.ui.simpleMode ?? true)
  const nameLang = useNameLang()
  const t = useT()

  const [mode, setMode] = useState<'idle' | 'add' | 'rename' | 'confirm-del'>('idle')
  const [text, setText] = useState('')
  const [cls, setCls] = useState('')
  const [note, setNote] = useState<{ key: string; danger?: boolean } | null>(null)

  const active = profiles.find((p) => p.id === activeProfileId)
  const classOptions = [{ value: '', label: t('pf.noClass') }, ...CLASSES.map((c) => ({ value: c, label: c }))]

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
      <div className="cp-char">
        <input
          autoFocus
          className="ui-input"
          aria-label={mode === 'add' ? t('pf.addName') : t('pf.newName')}
          placeholder={mode === 'add' ? t('pf.addName') : t('pf.newName')}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submit()
            if (e.key === 'Escape') setMode('idle')
          }}
        />
        <Select value={cls} options={classOptions} onChange={setCls} label={t('pf.class')} title={t('pf.class')} />
        <button type="button" className="ui-btn ui-btn--primary ui-btn--sm" onClick={() => void submit()}>
          <ShellIcon name="check" />
          {t('pf.ok')}
        </button>
        <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm" onClick={() => setMode('idle')}>
          {t('pf.cancel')}
        </button>
      </div>
    )
  }

  if (mode === 'confirm-del') {
    return (
      <div className="cp-char" role="alert">
        <span className="cp-char__note">{t('pf.confirmDelete', { name: active?.name ?? '' })}</span>
        <button
          type="button"
          className="ui-btn ui-btn--danger ui-btn--sm"
          onClick={() => {
            if (activeProfileId) void deleteProfile(activeProfileId)
            setMode('idle')
          }}
        >
          <ShellIcon name="trash" />
          {t('pf.delete')}
        </button>
        <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm" onClick={() => setMode('idle')}>
          {t('pf.cancel')}
        </button>
      </div>
    )
  }

  const option = active?.className
    ? asc?.classes
        .find((c) => c.base.toLowerCase() === active.className?.toLowerCase())
        ?.options.find((o) => o.id === progress?.ascendancyId)
    : undefined
  const ascName = option ? (nameLang === 'ru' && option.nameRu ? option.nameRu : option.name) : null

  return (
    <div className="cp-char">
      {profiles.length > 0 && (
        <Select
          value={activeProfileId ?? ''}
          options={profiles.map((p) => ({ value: p.id, label: p.name }))}
          onChange={(id) => void switchProfile(id)}
          label={t('pf.select')}
        />
      )}
      {active?.className && (
        <span className="cp-tag">
          {active.className}
          {ascName && (
            <>
              {' '}
              <span>→</span> {ascName}
            </>
          )}
        </span>
      )}
      <label className="cp-lvl" title={fromLog ? t('act.level.logTitle') : t('act.levelTitle')}>
        {t('act.level')}
        <input
          type="number"
          min={1}
          max={100}
          aria-label={t('act.levelTitle')}
          value={progress?.level ?? 1}
          onChange={(e) => void setLevel(Number(e.target.value))}
        />
        {simple && <span>{fromLog ? t('act.level.log') : t('act.level.manual')}</span>}
      </label>
      {note && (
        <span className={`cp-char__note${note.danger ? ' is-bad' : ''}`} role="status">
          {t(note.key)}
        </span>
      )}
      <span className="cp-grow" />
      <ProfileMenu
        canExport={!!active}
        onAdd={() => {
          setText('')
          setCls('')
          setMode('add')
        }}
        onRename={() => {
          setText(active?.name ?? '')
          setCls(active?.className ?? '')
          setMode('rename')
        }}
        onExport={() => void onExport()}
        onImport={() => void onImport()}
        onDelete={() => setMode('confirm-del')}
      />
    </div>
  )
}

/** Меню «⋯» персонажа: закрывается кликом мимо и Esc (фокус возвращается на кнопку). */
function ProfileMenu(p: {
  canExport: boolean
  onAdd: () => void
  onRename: () => void
  onExport: () => void
  onImport: () => void
  onDelete: () => void
}) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLSpanElement>(null)
  const btn = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!open) return
    const off = (e: MouseEvent): void => {
      if (!box.current?.contains(e.target as Node)) setOpen(false)
    }
    const key = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        setOpen(false)
        btn.current?.focus()
      }
    }
    document.addEventListener('mousedown', off)
    document.addEventListener('keydown', key)
    box.current?.querySelector<HTMLElement>('.ui-menu__item')?.focus()
    return () => {
      document.removeEventListener('mousedown', off)
      document.removeEventListener('keydown', key)
    }
  }, [open])
  const item = (icon: IconName, label: string, fn: () => void, danger = false, disabled = false) => (
    <button
      type="button"
      role="menuitem"
      className={`ui-menu__item${danger ? ' ui-menu__item--danger' : ''}`}
      disabled={disabled}
      onClick={() => {
        setOpen(false)
        fn()
      }}
    >
      <ShellIcon name={icon} />
      <span>{label}</span>
      <span />
    </button>
  )
  return (
    <span className="cp-menu" ref={box}>
      <button
        ref={btn}
        type="button"
        className="ui-btn ui-btn--ghost ui-btn--icon ui-btn--sm"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('pf.menu')}
        title={t('pf.menu')}
        onClick={() => setOpen(!open)}
      >
        <ShellIcon name="dots" />
      </button>
      {open && (
        <div className="ui-menu" role="menu" aria-label={t('pf.menu')}>
          {item('plus', t('pf.add'), p.onAdd)}
          {item('edit', t('pf.rename'), p.onRename)}
          {item('export', t('pf.export'), p.onExport, false, !p.canExport)}
          {item('import', t('pf.import'), p.onImport)}
          <div className="ui-menu__sep" />
          {item('trash', t('pf.delete'), p.onDelete, true, !p.canExport)}
        </div>
      )}
    </span>
  )
}
