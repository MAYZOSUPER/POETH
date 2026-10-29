import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { resolveStages, type PobStageEdit, type PobStageEdits, type PobStagePlan } from '@shared/pob/stages'
import type { StoredBuild } from '@shared/types/build'
import { Select } from '../../components/Select'
import { useT } from '../../i18n'
import { useBuildStore } from '../../store/useBuildStore'
import { BIco, stageLabels } from './ui'

// «Этапы…» (меню ⋯ шапки): этапы угаданы по названиям наборов PoB (S35) — игрок правит «с какого уровня» и
// «в прокачке» (эндгейм не показывать в прокачке и в гиде), выбирает этап сам или «по уровню персонажа».
// Правки хранятся отдельно от билда (StoredBuild.edits): у каждого этапа видно и автоматическое значение.

export function StagesDialog({
  build,
  plan,
  labels,
  expert,
  onClose
}: {
  build: StoredBuild
  plan: PobStagePlan
  labels: string[]
  expert: boolean
  onClose: () => void
}) {
  const t = useT()
  const id = useId()
  const box = useRef<HTMLDivElement>(null)
  const [draft, setDraft] = useState<PobStageEdits>(build.edits)
  const preview = useMemo(() => resolveStages(build.build, draft), [build, draft])
  const previewLabels = useMemo(() => stageLabels(preview.stages, t), [preview, t])

  useEffect(() => {
    const back = document.activeElement as HTMLElement | null
    box.current?.querySelector<HTMLElement>('input, button')?.focus()
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      back?.focus?.()
    }
    // фокус ставим один раз при открытии
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const patch = (key: string, p: PobStageEdit): void => {
    setDraft((d) => {
      const stages = { ...(d.stages ?? {}) }
      const next: PobStageEdit = { ...(stages[key] ?? {}), ...p }
      for (const k of Object.keys(next) as (keyof PobStageEdit)[]) if (next[k] === undefined) delete next[k]
      if (Object.keys(next).length) stages[key] = next
      else delete stages[key]
      return { ...d, stages }
    })
  }

  const auto = !draft.current
  const levelingOptions = preview.stages
    .map((s, i) => ({ s, i }))
    .filter((x) => x.s.leveling)
    .map((x) => ({ value: x.s.key, label: previewLabels[x.i], hint: x.s.title || undefined }))

  const save = (): void => {
    void useBuildStore.getState().setEdits(draft)
    onClose()
  }

  return (
    <div className="ui-dialog-scrim">
      <div ref={box} className="ui-dialog bd-dialog" role="dialog" aria-modal="true" aria-labelledby={id}>
        <div className="ui-dialog__head">
          <h3 className="ui-dialog__title" id={id}>
            {t('bd.dlg.title')}
          </h3>
          <button type="button" className="ui-btn ui-btn--ghost ui-btn--icon ui-btn--sm" aria-label={t('bd.dlg.close')} title={t('bd.dlg.close')} onClick={onClose}>
            <BIco name="close" />
          </button>
        </div>
        <div className="ui-dialog__body bd-dialog__body">
          {!expert && (
            <div className="ui-hint bd-hint">
              <BIco name="help" />
              <span>{t('bd.dlg.hint')}</span>
            </div>
          )}
          <div className="bd-map" role="table" aria-label={t('bd.dlg.title')}>
            <div className="bd-map__row is-head" role="row">
              <span role="columnheader">{t('bd.dlg.set')}</span>
              <span role="columnheader">{t('bd.dlg.stage')}</span>
              <span role="columnheader" className="bd-map__lv">
                {t('bd.dlg.from')}
              </span>
              <span role="columnheader">{t('bd.dlg.leveling')}</span>
            </div>
            {plan.stages.map((s) => {
              const p = preview.stages.find((x) => x.key === s.key) ?? s
              const pi = preview.stages.indexOf(p)
              const edit = draft.stages?.[s.key] ?? {}
              const fromId = `${id}-from-${s.key}`
              return (
                <div key={s.key} className={`bd-map__row${p.leveling ? '' : ' is-off'}`} role="row">
                  <code title={s.title} role="cell">
                    {s.title || labels[plan.stages.indexOf(s)]}
                  </code>
                  <span role="cell">{previewLabels[pi]}</span>
                  <span className="bd-map__lv" role="cell">
                    <label className="bd-sr" htmlFor={fromId}>
                      {t('bd.dlg.from.aria', { s: previewLabels[pi] })}
                    </label>
                    <input
                      id={fromId}
                      className="ui-input ui-input--num bd-map__from"
                      inputMode="numeric"
                      placeholder={s.auto.from !== null ? String(s.auto.from) : '—'}
                      value={edit.from ?? ''}
                      title={s.auto.from !== null ? t('bd.dlg.auto', { n: s.auto.from }) : t('bd.dlg.autoNone')}
                      onChange={(e) => {
                        const v = e.target.value.trim()
                        const n = Number(v)
                        patch(s.key, { from: v === '' ? undefined : Number.isInteger(n) && n >= 1 && n <= 100 ? n : edit.from })
                      }}
                    />
                  </span>
                  <span role="cell">
                    <button
                      type="button"
                      className="ui-switch"
                      role="switch"
                      aria-checked={p.leveling}
                      aria-label={t('bd.dlg.leveling.aria', { s: previewLabels[pi] })}
                      title={p.leveling ? t('bd.dlg.leveling.on') : t('bd.dlg.leveling.off')}
                      onClick={() => patch(s.key, { leveling: p.leveling === s.auto.leveling ? !p.leveling : undefined })}
                    >
                      <span className="ui-switch__track" />
                    </button>
                  </span>
                </div>
              )
            })}
          </div>
          <button
            type="button"
            className="ui-switch"
            role="switch"
            aria-checked={auto}
            onClick={() => setDraft((d) => ({ ...d, current: auto ? (levelingOptions[0]?.value ?? null) : null }))}
          >
            <span className="ui-switch__track" />
            {t('bd.dlg.auto.switch')}
          </button>
          {!auto && levelingOptions.length > 0 && (
            <div className="ui-field">
              <span className="ui-field__label">{t('bd.dlg.current')}</span>
              <Select
                value={draft.current ?? levelingOptions[0].value}
                options={levelingOptions}
                label={t('bd.dlg.current')}
                onChange={(v) => setDraft((d) => ({ ...d, current: v }))}
              />
            </div>
          )}
        </div>
        <div className="ui-dialog__foot">
          <button type="button" className="ui-btn ui-btn--ghost" onClick={() => setDraft({})}>
            {t('bd.dlg.reset')}
          </button>
          <span className="bd-grow" />
          <button type="button" className="ui-btn" onClick={onClose}>
            {t('bd.dlg.cancel')}
          </button>
          <button type="button" className="ui-btn ui-btn--primary" onClick={save}>
            {t('bd.dlg.done')}
          </button>
        </div>
      </div>
    </div>
  )
}
