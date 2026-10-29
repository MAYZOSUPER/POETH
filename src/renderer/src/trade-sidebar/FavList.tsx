import { useState, type DragEvent } from 'react'
import type { FavData, FavFolder, FavLiveState, FavSearch } from '@shared/types'
import { UNSORTED_TITLE, folderSearches } from '@shared/favorites/model'
import { useT } from '../i18n'
import { useAppStore } from '../store/useAppStore'
import { Ico } from '../panels/regex/Ico'
import { MenuButton, type MenuItem } from './Menu'
import { useFavStore } from './useFavStore'

// Папки и поиски избранного (макет «трейд-окно с избранным»): клик по поиску — открыть на сайте,
// молния — live search (S6), «⋯» — переименовать, перенести, уведомления, архив, удалить.
// Перетаскивание: поиск — на поиск (встать перед ним) или на папку (в конец); папка — на папку.

const DND_SEARCH = 'text/x-poeth-search'
const DND_FOLDER = 'text/x-poeth-folder'

type T = (k: string, p?: Record<string, string | number>) => string

const fav = (): Window['overlayApi']['fav'] => window.overlayApi.fav

function folderTitle(f: FavFolder, t: T): string {
  return f.title === UNSORTED_TITLE ? t('fav.unsorted') : f.title
}

function matches(s: FavSearch, words: string[]): boolean {
  if (!words.length) return true
  const hay = `${s.title} ${s.notes ?? ''} ${s.league ?? ''}`.toLowerCase()
  return words.every((w) => hay.includes(w))
}

export function FavList({ filter }: { filter: string }) {
  const t = useT()
  const game = useAppStore((s) => s.settings?.game ?? 'poe1')
  const data = useFavStore((s) => s.data)
  const words = filter.toLowerCase().split(/\s+/).filter(Boolean)
  const folders = data.folders.filter((f) => f.game === game && !f.archivedAt).sort((a, b) => a.order - b.order)
  const archivedFolders = data.folders.filter((f) => f.game === game && f.archivedAt)
  const archivedSearches = data.searches.filter(
    (s) => s.game === game && s.archivedAt && !archivedFolders.some((f) => f.id === s.folderId)
  )

  if (!folders.length && !archivedFolders.length && !archivedSearches.length) {
    return (
      <div className="ui-empty ts-empty">
        <Ico name="star" size="lg" />
        <span className="ui-empty__title">{t('fav.empty.title')}</span>
        <span>{t('fav.empty')}</span>
      </div>
    )
  }

  const visible = folders.filter((f) => !words.length || folderSearches(data, f.id).some((s) => !s.archivedAt && matches(s, words)))
  return (
    <>
      {visible.length === 0 && words.length > 0 && <div className="ts-nothing">{t('fav.nothing')}</div>}
      {visible.map((f) => (
        <Folder key={f.id} folder={f} folders={folders} data={data} words={words} />
      ))}
      {(archivedFolders.length > 0 || archivedSearches.length > 0) && !words.length && (
        <Archive folders={archivedFolders} searches={archivedSearches} data={data} />
      )}
    </>
  )
}

function Folder({ folder, folders, data, words }: { folder: FavFolder; folders: FavFolder[]; data: FavData; words: string[] }) {
  const t = useT()
  const open = useFavStore((s) => s.open[folder.id] ?? true)
  const toggleFolder = useFavStore((s) => s.toggleFolder)
  const setNotice = useFavStore((s) => s.setNotice)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [dropping, setDropping] = useState(false)
  const all = folderSearches(data, folder.id).filter((s) => !s.archivedAt)
  const list = all.filter((s) => matches(s, words))
  const expanded = open || words.length > 0

  const onDragOver = (e: DragEvent): void => {
    if (e.dataTransfer.types.includes(DND_SEARCH) || e.dataTransfer.types.includes(DND_FOLDER)) {
      e.preventDefault()
      setDropping(true)
    }
  }
  const onDrop = (e: DragEvent): void => {
    setDropping(false)
    const sid = e.dataTransfer.getData(DND_SEARCH)
    const fid = e.dataTransfer.getData(DND_FOLDER)
    if (sid) {
      e.preventDefault()
      void fav().moveSearch(sid, folder.id)
    } else if (fid && fid !== folder.id) {
      e.preventDefault()
      const ids = folders.map((f) => f.id).filter((id) => id !== fid)
      ids.splice(ids.indexOf(folder.id), 0, fid)
      void fav().reorderFolders(folder.game, ids)
    }
  }

  const items: MenuItem[] = [
    { icon: 'edit', label: t('fav.menu.rename'), onClick: () => setRenaming(folder.title === UNSORTED_TITLE ? '' : folder.title) },
    {
      icon: 'export',
      label: t('fav.menu.export'),
      onClick: () =>
        void fav()
          .exportBt(folder.id, folder.game)
          .then(async (s) => {
            if (!s) return setNotice('fav.export.empty', undefined, 'warn')
            await fav().copy(s)
            setNotice('fav.export.done', { n: 1 })
          })
    },
    { icon: 'archive', label: t('fav.menu.archive'), onClick: () => void fav().archiveFolder(folder.id, true) },
    {
      icon: 'trash',
      label: t('fav.menu.delete'),
      danger: true,
      step: {
        title: t('fav.menu.deleteFolderConfirm', { name: folderTitle(folder, t), n: all.length }),
        items: [{ icon: 'trash', label: t('fav.menu.deleteYes'), danger: true, onClick: () => void fav().deleteFolder(folder.id) }]
      }
    }
  ]

  return (
    <div className={`ts-fold${dropping ? ' is-drop' : ''}`}>
      <div
        className="ts-fold-row"
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData(DND_FOLDER, folder.id)
          e.dataTransfer.effectAllowed = 'move'
        }}
        onDragOver={onDragOver}
        onDragLeave={() => setDropping(false)}
        onDrop={onDrop}
      >
        <button
          type="button"
          className="ts-fold-btn"
          aria-expanded={expanded}
          title={t('fav.folder.toggle')}
          onClick={() => toggleFolder(folder.id, !open)}
        >
          <Ico name={expanded ? 'chev-d' : 'chev-r'} size="sm" />
          <Ico name="folder" />
          {renaming === null && <span className="ts-fold-t">{folderTitle(folder, t)}</span>}
        </button>
        {renaming !== null && (
          <InlineEdit
            value={renaming}
            placeholder={t('fav.folder.newName')}
            onDone={(v) => {
              setRenaming(null)
              if (v.trim()) void fav().saveFolder({ id: folder.id, title: v, game: folder.game })
            }}
          />
        )}
        <span className="ui-count">{all.length}</span>
        <MenuButton items={items} />
      </div>
      {expanded && list.map((s) => <SearchRow key={s.id} search={s} folders={folders} data={data} />)}
    </div>
  )
}

const LIVE_TITLE: Record<FavLiveState, string> = {
  on: 'fav.live.on',
  connecting: 'fav.live.connecting',
  paused: 'fav.live.paused',
  auth: 'fav.live.needAuth',
  error: 'fav.live.error',
  off: 'fav.live.off'
}

function SearchRow({ search, folders, data }: { search: FavSearch; folders: FavFolder[]; data: FavData }) {
  const t = useT()
  const active = useFavStore((s) => s.site?.activeSearchId === search.id)
  const live = useFavStore((s) => s.live)
  const setNotice = useFavStore((s) => s.setNotice)
  const [editing, setEditing] = useState<'title' | 'notes' | null>(null)
  const [dropping, setDropping] = useState<'before' | 'after' | null>(null)
  const state: FavLiveState = live.states[search.id] ?? 'off'
  const liveOn = !!search.live?.enabled

  const meta = [
    search.type === 'exchange' ? t('fav.type.exchange') : '',
    search.league ?? t('fav.league.current'),
    liveOn && live.available ? t(LIVE_TITLE[state]) : ''
  ]
    .filter(Boolean)
    .join(' · ')

  const toggleLive = async (): Promise<void> => {
    const r = await fav().setLive(search.id, !liveOn)
    if (!r.ok) {
      if (r.reason === 'limit') setNotice('fav.live.limit', { max: live.max }, 'warn')
      else if (r.reason === 'auth') setNotice('fav.live.auth', undefined, 'warn')
      else if (r.reason === 'unsupported') setNotice('fav.live.unsupported', undefined, 'warn')
    }
  }

  const onDragOver = (e: DragEvent): void => {
    if (!e.dataTransfer.types.includes(DND_SEARCH)) return
    e.preventDefault()
    e.stopPropagation()
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setDropping(e.clientY > r.top + r.height / 2 ? 'after' : 'before')
  }
  const onDrop = (e: DragEvent): void => {
    const where = dropping
    setDropping(null)
    const sid = e.dataTransfer.getData(DND_SEARCH)
    if (!sid) return
    e.preventDefault()
    e.stopPropagation()
    if (sid === search.id) return
    const siblings = folderSearches(data, search.folderId).filter((s) => s.id !== sid)
    const idx = siblings.findIndex((s) => s.id === search.id)
    void fav().moveSearch(sid, search.folderId, where === 'after' ? idx + 1 : idx)
  }

  const items: MenuItem[] = [
    { icon: 'edit', label: t('fav.menu.rename'), onClick: () => setEditing('title') },
    { icon: 'book', label: t('fav.menu.notes'), onClick: () => setEditing('notes') },
    {
      icon: 'folder',
      label: t('fav.menu.move'),
      step: {
        title: t('fav.menu.move'),
        items: folders
          .filter((f) => f.id !== search.folderId)
          .map((f) => ({ icon: 'folder' as const, label: folderTitle(f, t), onClick: () => void fav().moveSearch(search.id, f.id) }))
      }
    },
    {
      icon: 'bolt',
      label: t('fav.menu.notify'),
      checked: search.live?.notify ?? true,
      disabled: !live.available,
      onClick: () => void fav().setNotify(search.id, !(search.live?.notify ?? true))
    },
    { icon: 'archive', label: t('fav.menu.archive'), onClick: () => void fav().archiveSearch(search.id, true) },
    {
      icon: 'trash',
      label: t('fav.menu.delete'),
      danger: true,
      step: {
        title: t('fav.menu.deleteConfirm', { name: search.title }),
        items: [{ icon: 'trash', label: t('fav.menu.deleteYes'), danger: true, onClick: () => void fav().deleteSearch(search.id) }]
      }
    }
  ]

  const save = (patch: { title?: string; notes?: string }): void => {
    void fav().saveSearch({
      id: search.id,
      folderId: search.folderId,
      title: patch.title ?? search.title,
      game: search.game,
      type: search.type,
      slug: search.slug,
      league: search.league,
      notes: patch.notes ?? search.notes ?? ''
    })
  }

  return (
    <div
      className={`ts-srch${active ? ' is-active' : ''}${dropping ? ` is-drop-${dropping}` : ''}`}
      draggable={!editing}
      title={search.notes || undefined}
      onDragStart={(e) => {
        e.dataTransfer.setData(DND_SEARCH, search.id)
        e.dataTransfer.effectAllowed = 'move'
      }}
      onDragOver={onDragOver}
      onDragLeave={() => setDropping(null)}
      onDrop={onDrop}
    >
      <Ico name={search.type === 'exchange' ? 'coins' : 'search'} />
      {editing ? (
        <InlineEdit
          value={editing === 'title' ? search.title : (search.notes ?? '')}
          placeholder={editing === 'title' ? t('fav.save.title') : t('fav.menu.notes')}
          onDone={(v) => {
            const field = editing
            setEditing(null)
            if (field === 'title' && v.trim()) save({ title: v })
            if (field === 'notes') save({ notes: v })
          }}
        />
      ) : (
        <button type="button" className="ts-srch-t" onClick={() => void fav().open(search.id)}>
          <b>{search.title}</b>
          <span>{meta}</span>
        </button>
      )}
      <button
        type="button"
        className="ui-btn ui-btn--ghost ui-btn--icon ui-btn--sm ts-live"
        aria-pressed={liveOn}
        data-state={liveOn ? state : 'off'}
        aria-label={t('fav.live')}
        title={live.available ? t(liveOn ? LIVE_TITLE[state] : 'fav.live.off') : t('fav.live.unsupported')}
        aria-disabled={!live.available}
        onClick={() => void toggleLive()}
      >
        <Ico name="bolt" />
      </button>
      <MenuButton items={items} />
    </div>
  )
}

function Archive({ folders, searches, data }: { folders: FavFolder[]; searches: FavSearch[]; data: FavData }) {
  const t = useT()
  const open = useFavStore((s) => s.open['__archive'] ?? false)
  const toggleFolder = useFavStore((s) => s.toggleFolder)
  return (
    <div className="ts-fold ts-fold--archive">
      <div className="ts-fold-row">
        <button type="button" className="ts-fold-btn" aria-expanded={open} onClick={() => toggleFolder('__archive', !open)}>
          <Ico name={open ? 'chev-d' : 'chev-r'} size="sm" />
          <Ico name="archive" />
          <span className="ts-fold-t">{t('fav.archive')}</span>
        </button>
        <span className="ui-count">{folders.length + searches.length}</span>
      </div>
      {open && (
        <>
          {folders.map((f) => (
            <ArchivedRow
              key={f.id}
              icon="folder"
              title={folderTitle(f, t)}
              meta={String(folderSearches(data, f.id).length)}
              onRestore={() => void fav().archiveFolder(f.id, false)}
              onDelete={() => void fav().deleteFolder(f.id)}
            />
          ))}
          {searches.map((s) => (
            <ArchivedRow
              key={s.id}
              icon={s.type === 'exchange' ? 'coins' : 'search'}
              title={s.title}
              meta={s.league ?? t('fav.league.current')}
              onOpen={() => void fav().open(s.id)}
              onRestore={() => void fav().archiveSearch(s.id, false)}
              onDelete={() => void fav().deleteSearch(s.id)}
            />
          ))}
        </>
      )}
    </div>
  )
}

function ArchivedRow({
  icon,
  title,
  meta,
  onOpen,
  onRestore,
  onDelete
}: {
  icon: 'folder' | 'coins' | 'search'
  title: string
  meta: string
  onOpen?: () => void
  onRestore: () => void
  onDelete: () => void
}) {
  const t = useT()
  return (
    <div className="ts-srch is-archived">
      <Ico name={icon} />
      <button type="button" className="ts-srch-t" disabled={!onOpen} onClick={onOpen}>
        <b>{title}</b>
        <span>{meta}</span>
      </button>
      <span />
      <MenuButton
        items={[
          { icon: 'history', label: t('fav.menu.unarchive'), onClick: onRestore },
          {
            icon: 'trash',
            label: t('fav.menu.delete'),
            danger: true,
            step: {
              title: t('fav.menu.deleteConfirm', { name: title }),
              items: [{ icon: 'trash', label: t('fav.menu.deleteYes'), danger: true, onClick: onDelete }]
            }
          }
        ]}
      />
    </div>
  )
}

/** Поле правки по месту: Enter — сохранить, Esc — отмена, потеря фокуса — сохранить. */
export function InlineEdit({ value, placeholder, onDone }: { value: string; placeholder?: string; onDone: (v: string) => void }) {
  const [v, setV] = useState(value)
  const [done, setDone] = useState(false)
  const finish = (next: string): void => {
    if (done) return
    setDone(true)
    onDone(next)
  }
  return (
    <input
      className="ui-input ts-inline"
      value={v}
      autoFocus
      maxLength={120}
      placeholder={placeholder}
      onChange={(e) => setV(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Enter') finish(v)
        if (e.key === 'Escape') {
          e.preventDefault()
          finish(value)
        }
      }}
      onBlur={() => finish(v)}
    />
  )
}
