import { useEffect, useMemo, useState } from 'react'
import type { HotkeyAction, PasteSlot, RegexEntry } from '@shared/types'
import { REGEX_LIMIT, REGEX_PRESETS, presetText } from '@shared/regex'
import { useT } from '../../i18n'
import { useAppStore } from '../../store/useAppStore'
import { useRegexStore } from '../../store/useRegexStore'
import { CopyButton, Counter, useGameLang } from './common'

// Страница «Библиотека»: свои строки (название, строка, слот хоткея 1–5), экспорт/импорт,
// готовые строки для новичков с пояснением «что это ищет».

const SLOTS: PasteSlot[] = [1, 2, 3, 4, 5]

export function LibraryPage() {
  const t = useT()
  const lang = useGameLang()
  const game = useAppStore((s) => s.settings?.game ?? 'poe1')
  const hotkeys = useAppStore((s) => s.settings?.hotkeys)
  const library = useRegexStore((s) => s.library)
  const mapData = useRegexStore((s) => s.mapData)
  const ensureMapData = useRegexStore((s) => s.ensureMapData)
  const saveEntry = useRegexStore((s) => s.saveEntry)
  const exportLibrary = useRegexStore((s) => s.exportLibrary)
  const importLibrary = useRegexStore((s) => s.importLibrary)
  const [editing, setEditing] = useState<{ id?: string; name: string; text: string } | null>(null)
  const [notice, setNotice] = useState<{ text: string; bad?: boolean } | null>(null)
  const [added, setAdded] = useState<Set<string>>(new Set())

  useEffect(() => {
    void ensureMapData(lang)
  }, [lang, ensureMapData])

  const entries = (library?.entries ?? []).filter((e) => e.game === game)
  const data = mapData[lang] ?? null
  const presets = useMemo(
    () =>
      REGEX_PRESETS.map((p) => ({ preset: p, text: presetText(p, lang, data) })).filter(
        (x): x is { preset: (typeof REGEX_PRESETS)[number]; text: string } => !!x.text
      ),
    [lang, data]
  )

  const keyFor = (slot: PasteSlot): string => {
    const accel = hotkeys?.[`pasteSearch${slot}` as HotkeyAction]?.accel
    return accel ? t('regex.lib.key', { key: accel.replace('Control', 'Ctrl') }) : t('regex.lib.noKey')
  }

  const save = async (): Promise<void> => {
    if (!editing) return
    const text = editing.text.trim()
    const name = editing.name.trim()
    if (!text || !name || text.length > REGEX_LIMIT) return
    await saveEntry({ id: editing.id, name, text, game })
    setEditing(null)
  }

  const onExport = async (): Promise<void> => {
    const r = await exportLibrary()
    if (r.status === 'saved') setNotice({ text: t('regex.lib.exported', { path: r.path }) })
    else if (r.status === 'error') setNotice({ text: t('regex.lib.error'), bad: true })
  }
  const onImport = async (): Promise<void> => {
    const r = await importLibrary()
    if (r.status === 'imported') setNotice({ text: t('regex.lib.imported', { n: r.added }) })
    else if (r.status === 'invalid') setNotice({ text: t('regex.lib.invalid'), bad: true })
  }

  return (
    <div className="rx-page rx-library">
      <div className="rx-lib-head">
        <span className="block-title">{t('regex.lib.mine')}</span>
        <div className="rx-actions">
          <button className="btn small" onClick={() => setEditing({ name: '', text: '' })}>
            {t('regex.lib.new')}
          </button>
          <button className="btn small" onClick={() => void onExport()}>
            {t('regex.lib.export')}
          </button>
          <button className="btn small" onClick={() => void onImport()}>
            {t('regex.lib.import')}
          </button>
        </div>
      </div>
      {notice && <div className={notice.bad ? 'rx-error' : 'rx-ok-line'}>{notice.text}</div>}

      {editing && (
        <div className="rx-edit">
          <input
            className="pc-input"
            value={editing.name}
            maxLength={80}
            autoFocus
            placeholder={t('regex.lib.name')}
            onChange={(e) => setEditing({ ...editing, name: e.target.value })}
          />
          <textarea
            className="pc-textarea rx-edit-text"
            value={editing.text}
            rows={3}
            placeholder={t('regex.lib.text')}
            onChange={(e) => setEditing({ ...editing, text: e.target.value.replace(/\r?\n/g, ' ') })}
          />
          <div className="rx-actions">
            <Counter length={editing.text.trim().length} />
            {editing.text.trim().length > REGEX_LIMIT && <span className="rx-error-inline">{t('regex.lib.tooLong')}</span>}
            <span className="rx-spacer" />
            <button
              className="btn small"
              disabled={!editing.name.trim() || !editing.text.trim() || editing.text.trim().length > REGEX_LIMIT}
              onClick={() => void save()}
            >
              {t('regex.saveDo')}
            </button>
            <button className="btn small" onClick={() => setEditing(null)}>
              {t('regex.cancel')}
            </button>
          </div>
        </div>
      )}

      {entries.length === 0 && !editing && <p className="muted rx-empty">{t('regex.lib.empty')}</p>}
      <div className="rx-entries">
        {entries.map((e) => (
          <EntryRow key={e.id} entry={e} keyFor={keyFor} onEdit={() => setEditing({ ...e })} />
        ))}
      </div>
      {entries.length > 0 && <p className="muted small">{t('regex.lib.slotHint')}</p>}

      <div className="block">
        <div className="block-title">{t('regex.lib.presets')}</div>
        <p className="muted small">{t('regex.lib.presetsHint', { lang: t(`regex.lang.${lang}`) })}</p>
        <div className="rx-entries">
          {presets.map(({ preset, text }) => (
            <div className="rx-entry rx-preset" key={preset.id}>
              <div className="rx-entry-main">
                <div className="rx-entry-name">
                  {t(`regex.preset.${preset.id}.name`)}
                  {preset.starter && <span className="rx-tag starter">{t('regex.lib.starter')}</span>}
                </div>
                <div className="rx-entry-desc">{t(`regex.preset.${preset.id}.desc`)}</div>
                <code className="rx-entry-text">{text}</code>
              </div>
              <div className="rx-entry-side">
                <CopyButton text={text} />
                <button
                  className="btn small"
                  disabled={added.has(preset.id)}
                  onClick={() => {
                    void saveEntry({ name: t(`regex.preset.${preset.id}.name`), text, game, presetId: preset.id })
                    setAdded(new Set(added).add(preset.id))
                  }}
                >
                  {added.has(preset.id) ? t('regex.lib.added') : t('regex.lib.add')}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function EntryRow({
  entry,
  keyFor,
  onEdit
}: {
  entry: RegexEntry
  keyFor: (slot: PasteSlot) => string
  onEdit: () => void
}) {
  const t = useT()
  const setSlot = useRegexStore((s) => s.setSlot)
  const deleteEntry = useRegexStore((s) => s.deleteEntry)
  return (
    <div className="rx-entry">
      <div className="rx-entry-main">
        <div className="rx-entry-name">{entry.name}</div>
        {entry.presetId && <div className="rx-entry-desc">{t(`regex.preset.${entry.presetId}.desc`)}</div>}
        <code className="rx-entry-text">{entry.text}</code>
      </div>
      <div className="rx-entry-side">
        <CopyButton text={entry.text} />
        <label className="rx-slot" title={entry.slot ? keyFor(entry.slot) : t('regex.lib.slotHint')}>
          <span className="muted small">{t('regex.lib.slot')}</span>
          <select
            value={entry.slot ?? 0}
            onChange={(e) => {
              const v = Number(e.target.value)
              void setSlot(entry.id, v ? (v as PasteSlot) : null)
            }}
          >
            <option value={0}>{t('regex.lib.slotNone')}</option>
            {SLOTS.map((n) => (
              <option key={n} value={n}>
                {t('regex.lib.slotN', { n })}
              </option>
            ))}
          </select>
        </label>
        {entry.slot && <span className="muted small">{keyFor(entry.slot)}</span>}
        <div className="rx-actions">
          <button className="btn small" onClick={onEdit}>
            {t('regex.lib.edit')}
          </button>
          <button
            className="btn small rx-danger"
            onClick={() => {
              if (window.confirm(t('regex.lib.deleteConfirm', { name: entry.name }))) void deleteEntry(entry.id)
            }}
          >
            {t('regex.lib.delete')}
          </button>
        </div>
      </div>
    </div>
  )
}
