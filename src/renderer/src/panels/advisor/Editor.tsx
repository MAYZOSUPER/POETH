import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { AdvisorItemHit } from '@shared/ipc/advisor'
import type { AdvisorLevel, AdvisorMapEstimate, AdvisorState, AdvisorStrategy, AdvisorText } from '@shared/types'
import type { FarmSessionSummary, FarmState } from '@shared/types/farm'
import {
  MECHANICS,
  OWN_MAP_LABEL,
  draftToStrategy,
  lineKey,
  measureSessions,
  stepHasErrors,
  type AdvisorDraft,
  type DraftError,
  type DraftLang,
  type DraftLine
} from '@shared/advisor/draft'
import { LIMITS } from '@shared/advisor/validate'
import { today } from '@shared/advisor/library'
import { useT } from '../../i18n'
import { useAdvisorStore } from '../../store/useAdvisorStore'
import { clock } from '../flip/format'
import { AIco, type AIcoName } from './ui'
import { ItemPicker } from './ItemPicker'
import { StrategyCard } from './StrategyCard'
import { DEFAULT_ADVISOR_VIEW, buildRows, chaosText, hm, itemNs, minutesText, tx } from './view'

// Редактор стратегии (S17, макет): мастер из шести шагов — описание, что вложить, что получаешь (вручную или из
// своих сессий фарма), шаги и атлас, сложность и билд, предпросмотр. Справа всё время «как увидят другие».
// По любому шагу можно перейти сразу; «Далее» не блокирует — ошибки видны на шаге мастера и списком на
// предпросмотре. Черновик сохраняется сам (main). Цены у каждого игрока свои — живые, в стратегию не идут.

type T = ReturnType<typeof useT>
type NameOf = (l: { name: string; ns: ReturnType<typeof itemNs> }) => string

const STEPS = ['desc', 'in', 'out', 'steps', 'diff', 'preview'] as const
const MECH_LABEL: Record<(typeof MECHANICS)[number], AIcoName> = {
  essence: 'essence',
  strongbox: 'strongbox',
  expedition: 'expedition',
  harvest: 'harvest',
  delirium: 'delirium',
  abyss: 'abyss'
}

type Update = (patch: Partial<AdvisorDraft> | ((cur: AdvisorDraft) => Partial<AdvisorDraft>)) => void

interface StepProps {
  d: AdvisorDraft
  update: Update
  err: (field: string) => string | null
  t: T
  lang: string
  expert: boolean
  estimate: AdvisorMapEstimate | null
}

/** Сообщение ошибки поля на языке интерфейса. */
function errText(e: DraftError, t: T): string {
  return t(`advisor.ed.err.${e.code}`, { max: e.max ?? 0, detail: e.detail ?? '' })
}

function Field({ label, count, countBad, error, help, children }: { label: string; count?: string; countBad?: boolean; error?: string | null; help?: string; children: ReactNode }) {
  return (
    <div className="ui-field">
      <div className="ad-flabel">
        <span className="ui-field__label">{label}</span>
        <span className="grow" />
        {count && <span className={`ad-cnt${countBad ? ' ad-cnt--bad' : ''}`}>{count}</span>}
      </div>
      {children}
      {error ? <span className="ui-field__error">{error}</span> : help ? <span className="ui-field__help">{help}</span> : null}
    </div>
  )
}

/** Текст на выбранных языках: по полю на язык (два языка — две колонки). */
function TextFields({
  d,
  value,
  onChange,
  field,
  label,
  max,
  area,
  ph,
  help,
  err,
  t
}: {
  d: AdvisorDraft
  value: AdvisorText
  onChange: (v: AdvisorText) => void
  field: string
  label: string
  max: number
  area?: boolean
  ph: string
  help?: string
  err: StepProps['err']
  t: T
}) {
  return (
    <div className={d.langs.length > 1 ? 'ad-grid2' : 'ad-form'}>
      {d.langs.map((l) => {
        const v = value[l] ?? ''
        const e = err(`${field}.${l}`)
        const common = {
          className: `ui-input${area ? ' ad-ta' : ' ui-input--lg'}`,
          value: v,
          placeholder: ph,
          'aria-invalid': !!e,
          lang: l,
          onChange: (ev: { target: { value: string } }) => onChange({ ...value, [l]: ev.target.value })
        }
        return (
          <Field
            key={l}
            label={d.langs.length > 1 ? `${label} · ${t(`advisor.ed.lang.${l}`)}` : label}
            count={`${v.length} / ${max}`}
            countBad={v.trim().length > max}
            error={e}
            help={help}
          >
            {area ? <textarea rows={3} {...common} /> : <input {...common} />}
          </Field>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------- шаг 1: описание

function StepDesc({ d, update, err, t }: StepProps) {
  const toggleLang = (l: DraftLang): void => {
    const on = d.langs.includes(l)
    if (on && d.langs.length === 1) return // хотя бы один язык
    update({ langs: on ? d.langs.filter((x) => x !== l) : (['ru', 'en'] as DraftLang[]).filter((x) => x === l || d.langs.includes(x)) })
  }
  return (
    <>
      <h4 className="ad-h4">{t('advisor.ed.desc.title')}</h4>
      <div className="ad-lang">
        <span className="ui-label">{t('advisor.ed.langs')}</span>
        {(['ru', 'en'] as DraftLang[]).map((l) => (
          <button key={l} type="button" className="ui-chip" aria-pressed={d.langs.includes(l)} onClick={() => toggleLang(l)}>
            {l.toUpperCase()}
          </button>
        ))}
        <span className="ui-field__help">{t('advisor.ed.langs.help')}</span>
      </div>
      <TextFields d={d} value={d.name} onChange={(name) => update({ name })} field="name" label={t('advisor.ed.name')} max={LIMITS.name} ph={t('advisor.ed.name.ph')} err={err} t={t} />
      <TextFields d={d} value={d.summary} onChange={(summary) => update({ summary })} field="summary" label={t('advisor.ed.summary')} max={LIMITS.summary} ph={t('advisor.ed.summary.ph')} help={t('advisor.ed.summary.help')} err={err} t={t} />
      <TextFields d={d} value={d.why} onChange={(why) => update({ why })} field="why" label={t('advisor.ed.why')} max={LIMITS.why} area ph={t('advisor.ed.why.ph')} help={t('advisor.ed.why.help')} err={err} t={t} />
      <div className="ui-chips">
        <span className="ui-label">{t('advisor.ed.mech')}</span>
        {MECHANICS.map((m) => (
          <button
            key={m}
            type="button"
            className="ui-chip"
            aria-pressed={d.tags.includes(m)}
            onClick={() => update({ tags: d.tags.includes(m) ? d.tags.filter((x) => x !== m) : [...d.tags, m] })}
          >
            <AIco name={MECH_LABEL[m]} size="sm" />
            {t(`advisor.mech.${m}`)}
          </button>
        ))}
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------- строки «вложить» / «получишь»

function LineRows({
  lines,
  priced,
  input,
  field,
  onChange,
  err,
  t,
  lang,
  nameOf
}: {
  lines: DraftLine[]
  priced: AdvisorMapEstimate['inputs'] | null
  input: boolean
  field: string
  onChange: (l: DraftLine[]) => void
  err: StepProps['err']
  t: T
  lang: string
  nameOf: NameOf
}) {
  const set = (i: number, patch: Partial<DraftLine>): void => onChange(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)))
  return (
    <div className="ad-irows">
      <div className="ad-irow ad-irow--head">
        <span>{t('advisor.ed.col.item')}</span>
        <span className="ad-right">{t('advisor.ed.col.qty')}</span>
        <span>{t('advisor.ed.col.unit')}</span>
        <span className="ad-right">{t('advisor.ed.col.sum')}</span>
        <span />
        <span />
      </div>
      {lines.map((l, i) => {
        const p = priced?.[i]
        const e = err(`${field}.${i}`)
        const name = l.label ? tx(l.label, lang) : lang === 'ru' && l.ru ? l.ru : l.ref ? nameOf({ name: l.ref, ns: itemNs({ kind: l.kind }) }) : ''
        const own = input && l.own
        return (
          <div key={l.key} className="ad-irow">
            {l.label && !l.ref ? (
              <input
                className="ui-input"
                value={tx(l.label, lang)}
                aria-label={t('advisor.ed.col.item')}
                onChange={(ev) => set(i, { label: { [lang === 'ru' ? 'ru' : 'en']: ev.target.value } })}
              />
            ) : (
              <span className="ui-item ui-item--currency" title={l.ref}>
                {name}
              </span>
            )}
            <input
              className="ui-input ui-input--num"
              value={l.qty}
              inputMode="decimal"
              aria-label={t('advisor.ed.col.qty')}
              aria-invalid={!!e}
              onChange={(ev) => set(i, { qty: ev.target.value })}
            />
            <span className="ad-irow__price">
              {own || !l.ref ? (
                <span className="ad-faint">—</span>
              ) : p?.unit != null ? (
                <>
                  {t('advisor.chaos', { v: chaosText(p.unit, lang) })} <span className="ad-faint">{t('advisor.ed.exchange')}</span>
                </>
              ) : (
                <span className="ad-faint">{t('advisor.noPrice')}</span>
              )}
            </span>
            <span className="ad-irow__sum">
              {own ? <span className="ad-faint">{t('advisor.own')}</span> : p?.total != null ? t('advisor.chaos', { v: chaosText(p.total, lang) }) : <span className="ad-faint">—</span>}
            </span>
            {input ? (
              <label className="ad-irow__own">
                <button type="button" className="ui-check" role="checkbox" aria-checked={!!l.own} aria-label={t('advisor.own')} onClick={() => set(i, { own: !l.own })}>
                  <AIco name="check" />
                </button>
                {t('advisor.own')}
              </label>
            ) : (
              <span />
            )}
            <button type="button" className="ui-btn ui-btn--ghost ui-btn--icon ui-btn--sm" aria-label={t('advisor.ed.remove')} title={t('advisor.ed.remove')} onClick={() => onChange(lines.filter((_, j) => j !== i))}>
              <AIco name="close" size="sm" />
            </button>
            {e && <span className="ad-irow__err ui-field__error">{e}</span>}
          </div>
        )
      })}
    </div>
  )
}

const fromHit = (h: AdvisorItemHit): DraftLine => {
  const l: DraftLine = { key: lineKey(), kind: h.kind, ref: h.ref, qty: '1' }
  if (h.ru) l.ru = h.ru
  return l
}

// ---------------------------------------------------------------------------- шаг 2: что вложить

function StepIn({ d, update, err, t, lang, expert, estimate, nameOf }: StepProps & { nameOf: NameOf }) {
  const hasOwn = d.inputs.some((l) => l.own && !l.ref)
  const cost = estimate?.cost
  return (
    <>
      <h4 className="ad-h4">{t('advisor.ed.in.title')}</h4>
      {!expert && (
        <div className="ui-hint ad-hint">
          <AIco name="help" />
          <span>{t('advisor.ed.in.hint')}</span>
        </div>
      )}
      <ItemPicker lang={lang} label={t('advisor.ed.add')} onPick={(h) => update({ inputs: [...d.inputs, fromHit(h)] })} />
      {!hasOwn && (
        <button type="button" className="ui-btn ui-btn--sm ad-self-start" onClick={() => update({ inputs: [{ key: lineKey(), kind: 'map', label: { ...OWN_MAP_LABEL }, own: true, qty: '1' }, ...d.inputs] })}>
          <AIco name="plus" size="sm" />
          {t('advisor.ed.in.ownMap')}
        </button>
      )}
      {d.inputs.length ? (
        <LineRows lines={d.inputs} priced={estimate?.inputs ?? null} input field="inputs" onChange={(inputs) => update({ inputs })} err={err} t={t} lang={lang} nameOf={nameOf} />
      ) : (
        <div className="ui-empty ad-empty-sm">
          <AIco name="coins" size="lg" />
          <span className="ui-empty__title">{t('advisor.ed.in.empty')}</span>
          <span>{t('advisor.ed.in.empty.text')}</span>
        </div>
      )}
      {d.inputs.length > 0 && (
        <div className="ad-total">
          <span className="ad-muted">{t('advisor.ed.in.total')}</span>
          <b>{cost == null ? t('advisor.noPrice') : cost === 0 ? t('advisor.ed.in.ownOnly') : t('advisor.chaos', { v: chaosText(cost, lang) })}</b>
          <span className="ad-xs ad-faint">{t('advisor.ed.in.others')}</span>
        </div>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------- шаг 3: что получаешь

function StepOut({ d, update, err, t, lang, estimate, nameOf, farm, patch }: StepProps & { nameOf: NameOf; farm: FarmState | null; patch: string }) {
  const sessions: FarmSessionSummary[] = (farm?.sessions ?? []).slice(0, 20)
  const pick = (ids: string[]): void => {
    const m = measureSessions(
      sessions.filter((s) => ids.includes(s.id)),
      { date: today(), patch }
    )
    update({ sessions: ids, measured: m?.measured ?? null, ...(m ? { minutes: String(m.minutes) } : {}) })
  }
  const date = (ms: number): string => new Date(ms).toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-US', { day: '2-digit', month: '2-digit' })
  const minutesErr = err('minutes')
  const outErr = err('outputs')
  return (
    <>
      <h4 className="ad-h4">{t('advisor.ed.out.title')}</h4>
      <div className="ad-lang">
        <span className="ui-label">{t('advisor.ed.out.from')}</span>
        <div className="ui-seg" role="group">
          {(['sessions', 'manual'] as const).map((k) => (
            <button key={k} type="button" aria-pressed={d.outFrom === k} onClick={() => update({ outFrom: k })}>
              {t(`advisor.ed.out.${k}`)}
            </button>
          ))}
        </div>
      </div>
      {d.outFrom === 'sessions' &&
        (!sessions.length ? (
          <div className="ui-box">
            <div className="ui-empty">
              <span className="ui-empty__title">{t('advisor.ed.sess.none')}</span>
              <span className="ad-measure">{t('advisor.ed.sess.none.text')}</span>
              <button type="button" className="ui-btn" onClick={() => update({ outFrom: 'manual' })}>
                <AIco name="edit" />
                {t('advisor.ed.sess.manual')}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="ui-hint ad-hint">
              <AIco name="help" />
              <span>{t('advisor.ed.sess.hint')}</span>
            </div>
            <div className="ad-irows">
              {sessions.map((s) => {
                const off = s.stats.profitChaos === null
                const on = d.sessions.includes(s.id)
                const time = hm(s.stats.durationMs)
                return (
                  <div key={s.id} className={`ad-sess${off ? ' ad-sess--off' : ''}`}>
                    <button
                      type="button"
                      className="ui-check"
                      role="checkbox"
                      aria-checked={on && !off}
                      disabled={off}
                      aria-label={date(s.startedAt)}
                      onClick={() => pick(on ? d.sessions.filter((x) => x !== s.id) : [...d.sessions, s.id])}
                    >
                      <AIco name="check" />
                    </button>
                    <span>
                      {date(s.startedAt)} · {t('advisor.ed.sess.session')}
                    </span>
                    <span>{t('advisor.ed.sess.maps', { n: s.stats.maps })}</span>
                    <span>{t('advisor.ed.sess.time', { h: time.h, m: time.m })}</span>
                    {off ? (
                      <span className="ad-xs" title={t('advisor.ed.sess.off.title')}>
                        {t('advisor.ed.sess.off')}
                      </span>
                    ) : (
                      <span className="ad-xs ad-good">
                        <AIco name="check" size="sm" /> {t('advisor.ed.sess.on')}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
            {d.measured ? (
              <div className="ad-total">
                <span className="ad-muted">{t('advisor.ed.sess.taken')}</span>
                <b>{t('advisor.ed.sess.takenV', { maps: d.measured.maps, hours: minutesText(d.measured.hours, lang) })}</b>
                <span className="ad-trust ad-trust--measured">
                  <AIco name="chart" size="sm" />
                  {t('advisor.ed.sess.tag', { maps: d.measured.maps, hours: minutesText(d.measured.hours, lang), v: chaosText(d.measured.perHour, lang) })}
                </span>
              </div>
            ) : (
              <p className="ad-muted">{t('advisor.ed.sess.pick')}</p>
            )}
            <p className="ad-xs ad-faint">{t('advisor.ed.sess.noBreakdown')}</p>
          </>
        ))}
      <ItemPicker lang={lang} label={t('advisor.ed.add')} onPick={(h) => update({ outputs: [...d.outputs, fromHit(h)] })} />
      {d.outputs.length ? (
        <LineRows lines={d.outputs} priced={estimate?.outputs ?? null} input={false} field="outputs" onChange={(outputs) => update({ outputs })} err={err} t={t} lang={lang} nameOf={nameOf} />
      ) : (
        <div className="ui-empty ad-empty-sm">
          <AIco name="coins" size="lg" />
          <span className="ui-empty__title">{t('advisor.ed.out.empty')}</span>
          <span>{t('advisor.ed.out.empty.text')}</span>
        </div>
      )}
      {outErr && <span className="ui-field__error">{outErr}</span>}
      <button
        type="button"
        className="ui-btn ui-btn--sm ui-btn--ghost ad-self-start"
        onClick={() => update({ outputs: [...d.outputs, { key: lineKey(), kind: 'stackable', label: { [lang === 'ru' ? 'ru' : 'en']: '' }, qty: '1' }] })}
      >
        <AIco name="plus" size="sm" />
        {t('advisor.ed.out.label')}
      </button>
      <div className="ad-grid2">
        <Field label={t('advisor.ed.minutes')} error={minutesErr} help={t('advisor.ed.minutes.help')}>
          <input className="ui-input ui-input--lg ui-input--num ad-w90" inputMode="decimal" value={d.minutes} aria-invalid={!!minutesErr} onChange={(e) => update({ minutes: e.target.value })} />
        </Field>
        <p className="ad-xs ad-faint ad-self-end">
          <AIco name={d.outFrom === 'sessions' && d.measured ? 'chart' : 'edit'} size="sm" />{' '}
          {t(d.outFrom === 'sessions' && d.measured ? 'advisor.ed.out.measured' : 'advisor.ed.out.estimate')}
        </p>
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------- шаг 4: шаги и атлас

function StepSteps({ d, update, err, t }: StepProps) {
  const [drag, setDrag] = useState<number | null>(null)
  const move = (from: number, to: number): void => {
    if (from === to || to < 0 || to >= d.steps.length) return
    const steps = [...d.steps]
    const [x] = steps.splice(from, 1)
    steps.splice(to, 0, x)
    update({ steps })
  }
  const filled = d.steps.filter((s) => s.ru?.trim() || s.en?.trim()).length
  const treeErr = err('atlasTree')
  let host = ''
  try {
    host = d.atlasTree.trim() ? new URL(d.atlasTree.trim()).hostname : ''
  } catch {
    host = ''
  }
  return (
    <>
      <h4 className="ad-h4">{t('advisor.ed.steps.title')}</h4>
      <div className="ad-sec">
        <div className="ad-flabel">
          <span className="ui-label">{t('advisor.steps')}</span>
          <span className="grow" />
          <span className="ad-cnt">
            {filled} / {LIMITS.steps}
          </span>
        </div>
        {d.steps.map((st, i) => (
          <div
            key={i}
            className={`ad-steprow${drag === i ? ' is-drag' : ''}`}
            onDragOver={(e) => drag !== null && e.preventDefault()}
            onDrop={() => {
              if (drag !== null) move(drag, i)
              setDrag(null)
            }}
          >
            <span className="ad-drag" draggable onDragStart={() => setDrag(i)} onDragEnd={() => setDrag(null)} title={t('advisor.ed.steps.drag')}>
              <AIco name="drag" />
            </span>
            <span className="ui-steps__n">{i + 1}</span>
            <div className={d.langs.length > 1 ? 'ad-grid2' : 'ad-form'}>
              {d.langs.map((l) => {
                const e = err(`steps.${i}.${l}`) ?? (i === 0 ? err('steps.0') : null)
                return (
                  <div key={l} className="ui-field">
                    <textarea
                      className="ui-input ad-ta ad-ta--step"
                      rows={1}
                      lang={l}
                      value={st[l] ?? ''}
                      placeholder={t('advisor.ed.steps.ph')}
                      aria-label={`${t('advisor.ed.steps.n', { n: i + 1 })} · ${t(`advisor.ed.lang.${l}`)}`}
                      aria-invalid={!!e}
                      onChange={(ev) => update({ steps: d.steps.map((x, j) => (j === i ? { ...x, [l]: ev.target.value } : x)) })}
                    />
                    {e && <span className="ui-field__error">{e}</span>}
                  </div>
                )
              })}
            </div>
            <span className="ad-steprow__act">
              <button type="button" className="ui-btn ui-btn--ghost ui-btn--icon ui-btn--sm" aria-label={t('advisor.ed.steps.up')} disabled={i === 0} onClick={() => move(i, i - 1)}>
                <AIco name="arrow-up" size="sm" />
              </button>
              <button type="button" className="ui-btn ui-btn--ghost ui-btn--icon ui-btn--sm" aria-label={t('advisor.ed.steps.remove')} onClick={() => update({ steps: d.steps.length > 1 ? d.steps.filter((_, j) => j !== i) : [{}] })}>
                <AIco name="close" size="sm" />
              </button>
            </span>
          </div>
        ))}
        <button type="button" className="ui-btn ui-btn--sm ad-self-start" disabled={d.steps.length >= LIMITS.steps} onClick={() => update({ steps: [...d.steps, {}] })}>
          <AIco name="plus" size="sm" />
          {t('advisor.ed.steps.add')}
        </button>
      </div>
      <div className="ad-sec">
        <span className="ui-label">{t('advisor.atlas')}</span>
        {d.atlas.map((a, i) => (
          <div key={i} className="ad-atlasrow">
            <TextFields
              d={d}
              value={a}
              onChange={(v) => update({ atlas: d.atlas.map((x, j) => (j === i ? v : x)) })}
              field={`atlas.${i}`}
              label={t('advisor.ed.atlas.n', { n: i + 1 })}
              max={LIMITS.atlas}
              ph={t('advisor.ed.atlas.ph')}
              err={err}
              t={t}
            />
            <button type="button" className="ui-btn ui-btn--ghost ui-btn--icon ui-btn--sm" aria-label={t('advisor.ed.remove')} onClick={() => update({ atlas: d.atlas.filter((_, j) => j !== i) })}>
              <AIco name="close" size="sm" />
            </button>
          </div>
        ))}
        <button type="button" className="ui-btn ui-btn--sm ad-self-start" disabled={d.atlas.length >= LIMITS.atlasItems} onClick={() => update({ atlas: [...d.atlas, {}] })}>
          <AIco name="plus" size="sm" />
          {t('advisor.ed.atlas.add')}
        </button>
        <span className="ui-field__help">{t('advisor.ed.atlas.help')}</span>
      </div>
      <Field label={t('advisor.ed.tree')} error={treeErr} help={host ? t('advisor.ed.tree.host', { host }) : t('advisor.ed.tree.help')}>
        <input
          className="ui-input ui-input--lg ui-input--mono"
          value={d.atlasTree}
          placeholder="https://www.pathofexile.com/fullscreen-atlas-skill-tree/…"
          aria-invalid={!!treeErr}
          onChange={(e) => update({ atlasTree: e.target.value })}
        />
      </Field>
      <TextFields d={d} value={d.warning} onChange={(warning) => update({ warning })} field="warning" label={t('advisor.warn')} max={LIMITS.warning} ph={t('advisor.ed.warn.ph')} err={err} t={t} />
    </>
  )
}

// ---------------------------------------------------------------------------- шаг 5: сложность и билд

function StepDiff({ d, update, err, t }: StepProps) {
  const de = err('difficulty')
  const be = err('build')
  return (
    <>
      <h4 className="ad-h4">{t('advisor.ed.diff.title')}</h4>
      <div className="ad-rcards" role="radiogroup" aria-label={t('advisor.diff')}>
        {([1, 2, 3] as AdvisorLevel[]).map((n) => (
          <button key={n} type="button" className="ad-rc" role="radio" aria-checked={d.difficulty === n} onClick={() => update({ difficulty: n })}>
            <b>
              <span className="ui-pips ui-pips--accent" aria-hidden="true">
                {[1, 2, 3].map((i) => (
                  <i key={i} className={i <= n ? 'on' : undefined} />
                ))}
              </span>{' '}
              {t(`advisor.ed.diff.${n}`)}
            </b>
            <span>{t(`advisor.ed.diff.${n}.text`)}</span>
          </button>
        ))}
      </div>
      {de && <span className="ui-field__error">{de}</span>}
      <span className="ui-label">{t('advisor.build')}</span>
      <div className="ad-need">
        {(['damage', 'survival', 'speed'] as const).map((k) => (
          <div key={k} className="ad-need__row">
            <span>{t(`advisor.build.${k}`)}</span>
            <div className="ui-seg" role="group" aria-label={t(`advisor.build.${k}`)}>
              {([1, 2, 3] as AdvisorLevel[]).map((n) => (
                <button key={n} type="button" aria-pressed={d.build[k] === n} onClick={() => update((cur) => ({ build: { ...cur.build, [k]: n } }))}>
                  {t(`advisor.level.${n}`)}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      {be && <span className="ui-field__error">{be}</span>}
      <TextFields d={d} value={d.build.note} onChange={(note) => update((cur) => ({ build: { ...cur.build, note } }))} field="build.note" label={t('advisor.ed.buildNote')} max={LIMITS.buildNote} ph={t('advisor.ed.buildNote.ph')} err={err} t={t} />
    </>
  )
}

// ---------------------------------------------------------------------------- предпросмотр

const STEP_KEY = ['', 'desc', 'in', 'out', 'steps', 'diff']

function Checklist({ d, errors, t, goto }: { d: AdvisorDraft; errors: DraftError[]; t: T; goto: (n: number) => void }) {
  const items = [1, 2, 3, 4, 5].map((n) => {
    const errs = errors.filter((e) => e.step === n)
    return { n, ok: !errs.length, note: errs.length ? errText(errs[0], t) : t(`advisor.ed.check.${STEP_KEY[n]}`, { n: n === 2 ? d.inputs.length : n === 3 ? d.outputs.length : n === 4 ? d.steps.filter((s) => s.ru || s.en).length : 0 }) }
  })
  return (
    <ul className="ad-check">
      {items.map((c) => (
        <li key={c.n}>
          <span className={c.ok ? 'ok' : 'bad'}>
            <AIco name={c.ok ? 'check' : 'warn'} size="sm" />
          </span>
          <span>
            {t(`advisor.ed.step.${STEPS[c.n - 1]}`)} <span className="ad-faint">· {c.note}</span>
          </span>
          {!c.ok && (
            <button type="button" className="ad-linkbtn" onClick={() => goto(c.n)}>
              {t('advisor.ed.fix')}
            </button>
          )}
        </li>
      ))}
      {d.langs.length === 1 && (
        <li>
          <span className="warn">
            <AIco name="info" size="sm" />
          </span>
          <span>
            {t(`advisor.ed.check.noLang.${d.langs[0] === 'ru' ? 'en' : 'ru'}`)} <span className="ad-faint">· {t('advisor.ed.optional')}</span>
          </span>
          <button type="button" className="ad-linkbtn" onClick={() => goto(1)}>
            {t('advisor.ed.addLang')}
          </button>
        </li>
      )}
    </ul>
  )
}

// ---------------------------------------------------------------------------- мастер

/** Оценка до ответа main: строки без цены. */
function blankEstimate(s: AdvisorStrategy): AdvisorMapEstimate {
  return {
    inputs: s.inputs.map((l) => ({ unit: null, total: l.own ? 0 : null })),
    outputs: s.outputs.map(() => ({ unit: null, total: null })),
    cost: null,
    income: null,
    incomePartial: false,
    profit: null,
    confidence: 1,
    reasons: ['noPrice']
  }
}

export function Editor({ state, lang, expert, farm, nameOf }: { state: AdvisorState; lang: string; expert: boolean; farm: FarmState | null; nameOf: NameOf }) {
  const t = useT()
  const d = useAdvisorStore((s) => s.draft) as AdvisorDraft
  const step = useAdvisorStore((s) => s.step)
  const setDraft = useAdvisorStore((s) => s.setDraft)
  const setStep = useAdvisorStore((s) => s.setStep)
  const closeEditor = useAdvisorStore((s) => s.closeEditor)
  const reveal = useAdvisorStore((s) => s.reveal)
  const openShare = useAdvisorStore((s) => s.openShare)
  const savedAt = useAdvisorStore((s) => s.draftSavedAt)
  const [tried, setTried] = useState(false)
  const [visited, setVisited] = useState<number[]>([1])
  const [estimate, setEstimate] = useState<AdvisorMapEstimate | null>(null)
  const [prevLang, setPrevLang] = useState(lang)
  const [prevOpen, setPrevOpen] = useState(false)
  const [saveErr, setSaveErr] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const patch = state.data?.patch ?? '3.29'

  const result = useMemo(() => draftToStrategy(d, { patch, date: today() }), [d, patch])
  const showErr = tried || step === 6
  const errors = showErr ? result.errors : []
  const err = (field: string): string | null => {
    const e = errors.find((x) => x.field === field)
    return e ? errText(e, t) : null
  }

  // цены строк черновика — по живым ценам (main), не чаще раза в 0,3 с
  const linesKey = JSON.stringify([result.raw.inputs, result.raw.outputs])
  useEffect(() => {
    let alive = true
    const id = setTimeout(() => {
      void window.overlayApi.advisor.estimate({ inputs: result.raw.inputs, outputs: result.raw.outputs }).then((e) => alive && setEstimate(e))
    }, 300)
    return () => {
      alive = false
      clearTimeout(id)
    }
    // строки — по содержимому
  }, [linesKey])

  const go = (n: number): void => {
    setStep(n)
    setVisited((v) => (v.includes(n) ? v : [...v, n]))
  }
  // правки — поверх последнего черновика из стора (несколько правок за один такт не затирают друг друга)
  const update = (p: Partial<AdvisorDraft> | ((cur: AdvisorDraft) => Partial<AdvisorDraft>)): void => {
    const cur = (useAdvisorStore.getState().draft ?? d) as AdvisorDraft
    setDraft({ ...cur, ...(typeof p === 'function' ? p(cur) : p) })
  }

  // карточка «как увидят другие»: время карты — из стратегии (у других нет ваших сессий), цены — ваши живые
  const previewStrategy: AdvisorStrategy = { ...result.raw, source: { ...result.raw.source, kind: 'imported' } }
  const est = estimate && estimate.inputs.length === previewStrategy.inputs.length && estimate.outputs.length === previewStrategy.outputs.length ? estimate : blankEstimate(previewStrategy)
  const row = buildRows([{ strategy: previewStrategy, estimate: est, addedAt: today() }], null, DEFAULT_ADVISOR_VIEW)[0]
  const card = (open: boolean, cardLang: string, onToggle?: () => void) =>
    row && (
      <StrategyCard
        row={row}
        lang={cardLang}
        expert={expert}
        open={open}
        onToggle={onToggle}
        preview
        farm={null}
        glossary={state.data?.glossary ?? {}}
        currentPatch={patch}
        nameOf={nameOf}
      />
    )

  const save = async (andShare: boolean): Promise<void> => {
    setTried(true)
    setSaveErr(null)
    if (!result.strategy) {
      go(6)
      return
    }
    setSaving(true)
    try {
      const r = await window.overlayApi.advisor.save(result.strategy, d.editId)
      if (!r.ok) {
        setSaveErr(r.error)
        return
      }
      closeEditor(true)
      reveal(r.id)
      if (andShare) openShare(r.id)
    } finally {
      setSaving(false)
    }
  }

  const props: StepProps = { d, update, err, t, lang, expert, estimate: est }
  const form =
    step === 1 ? (
      <StepDesc {...props} />
    ) : step === 2 ? (
      <StepIn {...props} nameOf={nameOf} />
    ) : step === 3 ? (
      <StepOut {...props} nameOf={nameOf} farm={farm} patch={patch} />
    ) : step === 4 ? (
      <StepSteps {...props} />
    ) : step === 5 ? (
      <StepDiff {...props} />
    ) : (
      <>
        <h4 className="ad-h4">{t('advisor.ed.prev.title')}</h4>
        {result.errors.length > 0 && (
          <div className="ui-banner ui-banner--bad ad-banner" role="alert">
            <AIco name="warn" />
            <span>
              <b>{t('advisor.ed.prev.fix', { n: new Set(result.errors.map((e) => e.step)).size })}</b> {t('advisor.ed.prev.saved')}
            </span>
            <span />
          </div>
        )}
        <div className="ad-frow">
          <span className="ad-ctl">
            {t('advisor.ed.prev.lang')}
            <div className="ui-seg" role="group">
              {(['ru', 'en'] as const).map((l) => (
                <button key={l} type="button" aria-pressed={prevLang === l} onClick={() => setPrevLang(l)}>
                  {l.toUpperCase()}
                </button>
              ))}
            </div>
          </span>
          <span className="ad-ctl">
            {t('advisor.ed.prev.view')}
            <div className="ui-seg" role="group">
              <button type="button" aria-pressed={!prevOpen} onClick={() => setPrevOpen(false)}>
                {t('advisor.ed.prev.list')}
              </button>
              <button type="button" aria-pressed={prevOpen} onClick={() => setPrevOpen(true)}>
                {t('advisor.ed.prev.open')}
              </button>
            </div>
          </span>
        </div>
        {card(prevOpen, prevLang, () => setPrevOpen(!prevOpen))}
        <p className="ad-xs ad-faint">{t('advisor.ed.prev.note')}</p>
        <span className="ui-label">{t('advisor.ed.prev.check')}</span>
        <Checklist d={d} errors={result.errors} t={t} goto={go} />
        <p className="ad-xs ad-muted ad-inline">
          <AIco name="shield" size="sm" />
          {t('advisor.ed.prev.privacy')}
        </p>
      </>
    )

  const next = STEPS[step] // следующий шаг (step — 1…6)
  return (
    <div className="ad-pad">
      <div className="ad-title">
        <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm ad-back" onClick={() => closeEditor(false)}>
          <AIco name="chev-r" size="sm" />
          {t('advisor.title')}
        </button>
        <h3>{t(d.editId ? 'advisor.ed.titleEdit' : 'advisor.ed.title')}</h3>
        {savedAt && <span className="ad-xs ad-faint">{t('advisor.ed.saved', { time: clock(savedAt, lang) })}</span>}
        <span className="grow" />
        <button type="button" className="ui-btn ui-btn--ghost" onClick={() => closeEditor(true)}>
          {t('advisor.cancel')}
        </button>
      </div>
      <ol className="ui-steps" aria-label={t('advisor.ed.steps.aria')}>
        {STEPS.map((k, i) => {
          const n = i + 1
          const bad = showErr && n < 6 && stepHasErrors(result.errors, n)
          const done = !bad && n !== step && n < 6 && visited.includes(n) && !stepHasErrors(result.errors, n)
          return (
            <li key={k}>
              <button
                type="button"
                aria-current={n === step ? 'step' : undefined}
                data-state={bad ? 'error' : done ? 'done' : undefined}
                title={bad ? t('advisor.ed.step.error') : undefined}
                onClick={() => go(n)}
              >
                <span className="ui-steps__n">{done ? <AIco name="check" /> : bad ? '!' : n}</span>
                <span className="ui-steps__t">{t(`advisor.ed.step.${k}`)}</span>
              </button>
            </li>
          )
        })}
      </ol>
      {step === 6 ? (
        <div className="ad-form ad-form--wide">{form}</div>
      ) : (
        <div className="ad-ed">
          <div className="ad-form">{form}</div>
          <aside className="ad-aside">
            <span className="ui-label">{t('advisor.ed.aside')}</span>
            {card(false, lang)}
            <p className="ad-xs ad-faint">{t('advisor.ed.aside.note')}</p>
          </aside>
        </div>
      )}
      <div className="ad-edfoot">
        {step > 1 && (
          <button type="button" className="ui-btn" onClick={() => go(step - 1)}>
            {t('advisor.ed.back')}
          </button>
        )}
        <span className="grow" />
        {saveErr && <span className="ui-field__error">{t('advisor.ed.saveErr', { detail: saveErr })}</span>}
        {step < 6 ? (
          <button type="button" className="ui-btn ui-btn--primary" onClick={() => go(step + 1)}>
            {t('advisor.ed.next', { step: t(`advisor.ed.step.${next}`).toLowerCase() })}
            <AIco name="chev-r" />
          </button>
        ) : (
          <>
            <button type="button" className="ui-btn" disabled={saving || result.errors.length > 0} onClick={() => void save(false)}>
              {t('advisor.ed.save')}
            </button>
            <button type="button" className="ui-btn ui-btn--primary" disabled={saving || result.errors.length > 0} onClick={() => void save(true)}>
              <AIco name="export" />
              {t('advisor.ed.saveShare')}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
