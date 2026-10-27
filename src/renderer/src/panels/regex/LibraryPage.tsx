import { useEffect, useMemo, useState } from 'react'
import type { HotkeyAction, PasteSlot, RegexEntry } from '@shared/types'
import { REGEX_LIMIT, REGEX_PRESETS, presetText } from '@shared/regex'
import { useT } from '../../i18n'
import { useAppStore } from '../../store/useAppStore'
import { useRegexStore } from '../../store/useRegexStore'
import { Box, CopyButton, Meter, useGameLang, useSimple } from './common'
import { Ico } from './Ico'

// Страница «Библиотека» (макет: 5 строк на горячих клавишах, свободный слот, «Как вставлять»).
// Плюс: остальные свои строки, экспорт/импорт, готовые строки для новичков с пояснениями.

const SLOTS: PasteSlot[] = [1, 2, 3, 4, 5]

type Editing = { id?: string; name: string; text: string }

export function LibraryPage() {
  const t = useT()
  const simple = useSimple()
  const lang = useGameLang()
  const game = useAppStore((s) => s.settings?.game ?? 'poe1')
  const hotkeys = useAppStore((s) => s.settings?.hotkeys)
  const library = useRegexStore((s) => s.library)
  const mapData = useRegexStore((s) => s.mapData)
  const ensureMapData = useRegexStore((s) => s.ensureMapData)
  const saveEntry = useRegexStore((s) => s.saveEntry)
  const exportLibrary = useRegexStore((s) => s.exportLibrary)
  const importLibrary = useRegexStore((s) => s.importLibrary)
  const [editing, setEditing] = useState<Editing | null>(null)
  const [notice, setNotice] = useState<{ text: string; bad?: boolean } | null>(null)
  const [added, setAdded] = useState<Set<string>>(new Set())

  useEffect(() => {
    void ensureMapData(lang)
  }, [lang, ensureMapData])

  const entries = (library?.entries ?? []).filter((e) => e.game === game)
  const bySlot = new Map(entries.filter((e) => e.slot).map((e) => [e.slot as PasteSlot, e]))
  const loose = entries.filter((e) => !e.slot)
  const data = mapData[lang] ?? null
  const presets = useMemo(
    () =>
      REGEX_PRESETS.map((p) => ({ preset: p, text: presetText(p, lang, data) })).filter(
        (x): x is { preset: (typeof REGEX_PRESETS)[number]; text: string } => !!x.text
      ),
    [lang, data]
  )

  const keysOf = (slot: PasteSlot): string[] | null => {
    const accel = hotkeys?.[`pasteSearch${slot}` as HotkeyAction]?.accel
    return accel ? accel.split('+').map((k) => (k === 'Control' ? 'Ctrl' : k)) : null
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

  const editText = editing?.text.trim() ?? ''

  return (
    <div className="rx-stack">
      <div className="ui-banner ui-banner--info rx-banner">
        <Ico name="keyboard" />
        <span>
          <b>{t('regex.lib.howTitle')}</b> {t('regex.lib.how')}
        </span>
        <span />
      </div>

      <div className="rx-toolbar">
        <span className="ui-label">{t('regex.lib.mine')}</span>
        <span className="ui-label__grow" />
        <button type="button" className="ui-btn ui-btn--sm" onClick={() => setEditing({ name: '', text: '' })}>
          <Ico name="plus" />
          {t('regex.lib.new')}
        </button>
        <button type="button" className="ui-btn ui-btn--sm" onClick={() => void onImport()}>
          <Ico name="import" />
          {t('regex.lib.import')}
        </button>
        <button type="button" className="ui-btn ui-btn--sm" onClick={() => void onExport()}>
          <Ico name="export" />
          {t('regex.lib.export')}
        </button>
      </div>
      {notice && (
        <div className={notice.bad ? 'ui-field__error' : 'rx-ok'}>
          {!notice.bad && <Ico name="check" size="sm" />}
          {notice.text}
        </div>
      )}

      {editing && (
        <Box title={editing.id ? t('regex.lib.edit') : t('regex.lib.new')}>
          <div className="ui-field">
            <label className="ui-field__label" htmlFor="rx-edit-name">
              {t('regex.lib.name')}
            </label>
            <input
              id="rx-edit-name"
              className="ui-input ui-input--lg"
              value={editing.name}
              maxLength={80}
              autoFocus
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            />
          </div>
          <div className="ui-field">
            <label className="ui-field__label" htmlFor="rx-edit-text">
              {t('regex.lib.text')}
            </label>
            <textarea
              id="rx-edit-text"
              className="ui-input ui-input--mono rx-textarea"
              value={editing.text}
              rows={3}
              aria-invalid={editText.length > REGEX_LIMIT}
              onChange={(e) => setEditing({ ...editing, text: e.target.value.replace(/\r?\n/g, ' ') })}
            />
          </div>
          <Meter length={editText.length} />
          {editText.length > REGEX_LIMIT && <div className="ui-field__error">{t('regex.lib.tooLong')}</div>}
          <div className="rx-btns">
            <button
              type="button"
              className="ui-btn ui-btn--primary"
              disabled={!editing.name.trim() || !editText || editText.length > REGEX_LIMIT}
              onClick={() => void save()}
            >
              {t('regex.saveDo')}
            </button>
            <button type="button" className="ui-btn ui-btn--ghost" onClick={() => setEditing(null)}>
              {t('regex.cancel')}
            </button>
          </div>
        </Box>
      )}

      <section className="rx-box">
        {SLOTS.map((slot) => {
          const e = bySlot.get(slot)
          return e ? (
            <EntryRow key={slot} entry={e} keys={keysOf(slot)} onEdit={() => setEditing({ ...e })} />
          ) : (
            <div key={slot} className="rx-lib-row">
              <SlotKeys slot={slot} keys={keysOf(slot)} />
              <span className="rx-lib-t is-empty">{t(loose.length ? 'regex.lib.freeSlotPick' : 'regex.lib.freeSlot')}</span>
              <span />
            </div>
          )
        })}
      </section>
      {!keysOf(1) && <div className="ui-field__help">{t('regex.lib.slotHint')}</div>}

      {loose.length > 0 && (
        <>
          <span className="ui-label">{t('regex.lib.other')}</span>
          <section className="rx-box">
            {loose.map((e) => (
              <EntryRow key={e.id} entry={e} keys={null} onEdit={() => setEditing({ ...e })} />
            ))}
          </section>
        </>
      )}

      <span className="ui-label">{t('regex.lib.presets')}</span>
      {simple && <div className="ui-field__help">{t('regex.lib.presetsHint', { lang: t(`regex.lang.${lang}`) })}</div>}
      <section className="rx-box">
        {presets.map(({ preset, text }) => (
          <div className="rx-lib-row rx-lib-row--preset" key={preset.id}>
            <span className="rx-lib-t">
              <b>
                {t(`regex.preset.${preset.id}.name`)}
                {preset.starter && simple && <span className="ui-tag ui-tag--good">{t('regex.lib.starter')}</span>}
              </b>
              <span className="rx-lib-desc">{t(`regex.preset.${preset.id}.desc`)}</span>
              <code title={text}>{text}</code>
            </span>
            <span className="rx-btns">
              <CopyButton text={text} small />
              <button
                type="button"
                className="ui-btn ui-btn--sm ui-btn--ghost"
                disabled={added.has(preset.id)}
                onClick={() => {
                  void saveEntry({ name: t(`regex.preset.${preset.id}.name`), text, game, presetId: preset.id })
                  setAdded(new Set(added).add(preset.id))
                }}
              >
                <Ico name={added.has(preset.id) ? 'check' : 'plus'} />
                {added.has(preset.id) ? t('regex.lib.added') : t('regex.lib.add')}
              </button>
            </span>
          </div>
        ))}
      </section>
    </div>
  )
}

function SlotKeys({ slot, keys }: { slot: PasteSlot; keys: string[] | null }) {
  const t = useT()
  if (!keys) return <span className="rx-lib-slot">{t('regex.lib.slotN', { n: slot })}</span>
  return (
    <span className="ui-kbd" title={t('regex.lib.slotN', { n: slot })}>
      {keys.map((k, i) => (
        <span key={i}>
          {i > 0 && '+'}
          <kbd>{k}</kbd>
        </span>
      ))}
    </span>
  )
}

function EntryRow({ entry, keys, onEdit }: { entry: RegexEntry; keys: string[] | null; onEdit: () => void }) {
  const t = useT()
  const setSlot = useRegexStore((s) => s.setSlot)
  const deleteEntry = useRegexStore((s) => s.deleteEntry)
  return (
    <div className="rx-lib-row">
      {entry.slot ? <SlotKeys slot={entry.slot} keys={keys} /> : <span className="rx-lib-slot">—</span>}
      <span className="rx-lib-t">
        <b>{entry.name}</b>
        <code title={entry.text}>{entry.text}</code>
      </span>
      <span className="rx-btns">
        <CopyButton text={entry.text} small />
        <select
          className="ui-select rx-slot-select"
          value={entry.slot ?? 0}
          aria-label={t('regex.lib.slot')}
          title={t('regex.lib.slot')}
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
        <button
          type="button"
          className="ui-btn ui-btn--sm ui-btn--ghost ui-btn--icon"
          aria-label={t('regex.lib.edit')}
          title={t('regex.lib.edit')}
          onClick={onEdit}
        >
          <Ico name="edit" />
        </button>
        <button
          type="button"
          className="ui-btn ui-btn--sm ui-btn--ghost ui-btn--icon"
          aria-label={t('regex.lib.delete')}
          title={t('regex.lib.delete')}
          onClick={() => {
            if (window.confirm(t('regex.lib.deleteConfirm', { name: entry.name }))) void deleteEntry(entry.id)
          }}
        >
          <Ico name="trash" />
        </button>
      </span>
    </div>
  )
}
