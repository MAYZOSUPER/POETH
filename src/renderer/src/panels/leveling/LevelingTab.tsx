import { useEffect, useMemo, useState } from 'react'
import type { LevelingData, LevelingShow, LevelingState, LvBandit } from '@shared/types/leveling'
import { banditPassives, counters, currentIndex, stepPassives, stepTags, type FlatStep } from '@shared/leveling/route'
import { BASE_CLASSES, baseClass } from '@shared/leveling/classes'
import { areaName, nameOf, questName } from '@shared/leveling/render'
import { translate, useLang, useT } from '../../i18n'
import { useGameLang } from '../../gameLang'
import { useLevelingStore } from '../../store/useLevelingStore'
import { Ico, Switch, useSimple } from '../deals/common'
import { StepTags, StepText } from './StepText'
import { useBuildGemIds } from '../../overlay/leveling/buildLine'
import './leveling.css'

// Вкладка «Кампания» в PoE 1 (S14) по макету дизайнера «Прокачка PoE 1»: акты 1–10 со счётчиками, маршрут
// exile-leveling с галочками (сами по журналу игры и вручную), «вы здесь», теги «+1 пассив / испытание /
// флакон / камень»; справа — «Не пропустить за кампанию», награды акта и камни для класса. Персонажи,
// вариант маршрута (старт лиги, бандиты) и гид поверх игры — в шапке. S22: шаги, персонаж и «кампания пройдена»
// — сами по журналу игры; «Показывать гид: авто / всегда / никогда», почему гид сейчас скрыт, баннер «Кампания
// пройдена — гид скрыт» с «Показать всё равно» и «Начать заново (новый персонаж)».

const BANDITS: LvBandit[] = ['kill', 'alira', 'kraityn', 'oak']
const BANDIT_NPC: Record<Exclude<LvBandit, 'kill'>, string> = { alira: 'Alira', kraityn: 'Kraityn', oak: 'Oak' }
const SHOW: LevelingShow[] = ['auto', 'always', 'never']

/** Где гид сейчас: виден, показан хоткеем или почему скрыт; gameLang — язык клиента (имя зоны). */
function guideText(state: LevelingState, data: LevelingData, gameLang: 'ru' | 'en', t: (k: string) => string): string {
  if (state.guide.forced) return t('lev.guide.forced')
  if (state.guide.visible) return t('lev.guide.visible')
  const zone = state.zone && data.areas[state.zone.areaId] ? areaName(data, state.zone.areaId, gameLang) : null
  switch (state.guide.hidden) {
    case 'never':
      return t('lev.guide.never')
    case 'finished':
      return t('lev.guide.finished')
    case 'zone': {
      // хабы лиг и ограблений — тоже «город» у трекера карт, но не город актов
      const kind = state.zone?.kind === 'town' && !zone ? 'other' : (state.zone?.kind ?? 'other')
      return t(`lev.guide.zone.${kind}`).replace('{zone}', zone ?? '')
    }
    default:
      return t('lev.guide.noZone')
  }
}

/** «Кампания пройдена — гид скрыт» (или «показан всё равно»); в этом входе — эндгейм неузнанного персонажа. */
function FinishedBanner() {
  const t = useT()
  const state = useLevelingStore((s) => s.state)!
  const { act, createProfile } = useLevelingStore.getState()
  const fin = state.progress.finished
  if (!fin) {
    if (state.guide.hidden !== 'finished') return null
    return (
      <div className="ui-banner ui-banner--info">
        <Ico name="info" />
        <span>{t('lev.finished.session')}</span>
      </div>
    )
  }
  const why = t(`lev.finished.why.${fin.reason}`).replace('{n}', String(fin.level ?? ''))
  const fresh = (): void => void createProfile(t('lev.profile.newName').replace('{n}', String(state.profiles.length + 1)))
  if (state.progress.showAnyway) {
    return (
      <div className="ui-banner ui-banner--info">
        <Ico name="check" />
        <span>
          <b>{t('lev.finished.shown')}</b> {why}
        </span>
        <button type="button" className="ui-btn ui-btn--sm" onClick={() => void act({ type: 'showAnyway', on: false })}>
          {t('lev.finished.hide')}
        </button>
      </div>
    )
  }
  return (
    <div className="ui-banner ui-banner--info">
      <Ico name="check" />
      <span>
        <b>{t('lev.finished.title')}</b> {why}
      </span>
      <span className="lv-banner-btns">
        <button type="button" className="ui-btn ui-btn--sm" onClick={() => void act({ type: 'showAnyway', on: true })}>
          {t('lev.finished.show')}
        </button>
        <button type="button" className="ui-btn ui-btn--sm" onClick={fresh}>
          {t('lev.finished.new')}
        </button>
      </span>
    </div>
  )
}

function zoneLevel(data: LevelingData, f: FlatStep): number | null {
  const a = data.areas[f.to ?? f.after]
  return a ? a.level : null
}

function Header() {
  const t = useT()
  const lang = useLang()
  // имена из игры (классы, бандиты, зона) — на языке клиента игры (S31)
  const gameLang = useGameLang(lang)
  const simple = useSimple()
  const state = useLevelingStore((s) => s.state)!
  const data = useLevelingStore((s) => s.data)!
  const { createProfile, selectProfile, removeProfile, updateProfile, setVariant, setConfig, act } = useLevelingStore.getState()
  const profile = state.profiles.find((p) => p.id === state.activeId)!
  const cls = baseClass(profile.className, data.classes)
  // «помочь Алире» — RU-имя в RU-тексте; иначе имя как в игре, без падежа: «помочь Alira», «help Алира»
  const banditLabel = (b: LvBandit): string =>
    b === 'kill' || gameLang === lang ? t(`lev.bandit.${b}`) : t('lev.bandit.help').replace('{name}', nameOf(data, BANDIT_NPC[b], gameLang))
  const onRemove = (): void => {
    if (window.confirm(t('lev.profile.removeConfirm').replace('{name}', profile.name))) void removeProfile(profile.id)
  }
  const onReset = (): void => {
    if (window.confirm(t('lev.resetConfirm'))) void act({ type: 'reset' })
  }
  return (
    <div className="lv-top">
      <label className="lv-field">
        <span className="ui-label">{t('lev.profile')}</span>
        <select className="ui-select" value={state.activeId} onChange={(e) => void selectProfile(e.target.value)}>
          {state.profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.character && p.character !== p.name ? ` (${p.character})` : ''}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className="ui-btn ui-btn--sm"
        onClick={() => void createProfile(t('lev.profile.newName').replace('{n}', String(state.profiles.length + 1)))}
      >
        {t('lev.profile.new')}
      </button>
      {state.profiles.length > 1 && (
        <button type="button" className="ui-btn ui-btn--ghost ui-btn--icon ui-btn--sm" title={t('lev.profile.remove')} aria-label={t('lev.profile.remove')} onClick={onRemove}>
          <Ico name="trash" />
        </button>
      )}
      <label className="lv-field">
        <span className="ui-label">{t('lev.class')}</span>
        <select
          className="ui-select"
          value={cls ?? ''}
          onChange={(e) => void updateProfile(profile.id, { className: e.target.value || null })}
          title={profile.className && !cls ? profile.className : undefined}
        >
          <option value="">{profile.className && !cls ? profile.className : '—'}</option>
          {BASE_CLASSES.map((c) => (
            <option key={c} value={c}>
              {translate(gameLang, `lev.cls.${c}`)}
            </option>
          ))}
        </select>
      </label>
      <span title={t('lev.variant.league.hint')}>
        <Switch on={state.progress.variant.leagueStart} onChange={(v) => void setVariant({ leagueStart: v })}>
          {t('lev.variant.league')}
        </Switch>
      </span>
      <label className="lv-field">
        <span className="ui-label">{t('lev.bandit')}</span>
        <select className="ui-select" value={state.progress.variant.bandit} onChange={(e) => void setVariant({ bandit: e.target.value as LvBandit })}>
          {BANDITS.map((b) => (
            <option key={b} value={b}>
              {banditLabel(b)}
            </option>
          ))}
        </select>
      </label>
      <span className="lv-grow" />
      <div className="lv-field" title={t('lev.show.hint')}>
        <span className="ui-label">{t('lev.show')}</span>
        <div className="ui-seg" role="group" aria-label={t('lev.show')}>
          {SHOW.map((m) => (
            <button key={m} type="button" aria-pressed={state.config.show === m} onClick={() => void setConfig({ show: m })}>
              {t(`lev.show.${m}`)}
            </button>
          ))}
        </div>
      </div>
      <span className="lv-log" role="status">
        {guideText(state, data, gameLang, t)}
      </span>
      {state.log.connected && (
        <span className="lv-log" title={state.log.logPath ?? undefined}>
          <span className="ui-dot" />
          {t('lev.log.ok')}
          {!simple && state.log.logPath && <span className="lv-path">{state.log.logPath}</span>}
        </span>
      )}
      <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm" onClick={onReset}>
        {t('lev.reset')}
      </button>
    </div>
  )
}

function Route({ act, flat, data }: { act: number; flat: FlatStep[]; data: LevelingData }) {
  const t = useT()
  const lang = useLang()
  const gameLang = useGameLang(lang)
  const simple = useSimple()
  const state = useLevelingStore((s) => s.state)!
  const toggle = (stepId: string): void => void useLevelingStore.getState().act({ type: 'toggle', stepId })
  const cur = currentIndex(flat, state.progress)
  const rows = flat.filter((f) => f.act === act)
  return (
    <section className="ui-box lv-route" aria-label={t('lev.act').replace('{n}', String(act))}>
      <div className="lv-rows ui-scroll">
        {rows.map((f) => {
          const done = !!state.progress.done[f.step.id]
          const now = f.index === cur
          const zl = zoneLevel(data, f)
          return (
            <div key={f.step.id} className={`lv-row${done ? ' is-done' : ''}${now ? ' is-now' : ''}`}>
              <button
                type="button"
                className="ui-check"
                role="checkbox"
                aria-checked={done}
                aria-label={String(f.actIndex)}
                onClick={() => toggle(f.step.id)}
              >
                <Ico name="check" />
              </button>
              <div className="lv-row__body">
                <div className="lv-row__text">
                  <span className="lv-row__n">{f.actIndex}</span>
                  <StepText parts={f.step.parts} data={data} lang={lang} gameLang={gameLang} />
                  <StepTags tags={stepTags(f.step)} t={t} icon={(n) => <Ico name={n} />} passives={stepPassives(f.step, data)} />
                  {now && <span className="lv-here">{t('lev.here')}</span>}
                  {!simple && zl !== null && <span className="lv-zl">{t('lev.zoneLevel').replace('{n}', String(zl))}</span>}
                </div>
                {f.step.lvl && <div className="lv-row__sub">{t('lev.recLevel').replace('{lvl}', f.step.lvl)}</div>}
                {simple &&
                  f.step.sub?.map((s, i) => (
                    <div key={i} className="lv-row__sub">
                      <StepText parts={lang === 'ru' ? s.ru : s.en} data={data} lang={lang} gameLang={gameLang} />
                    </div>
                  ))}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

/** Счётчик «Не пропустить за кампанию» — .ui-meter: строка «N / M» и полоса. */
function Meter({ label, done, total, hint }: { label: string; done: number; total: number; hint?: string }) {
  return (
    <div className="ui-meter" style={{ ['--v' as string]: `${total ? Math.round((done / total) * 100) : 0}%` }}>
      <div className="ui-meter__row">
        <span>{label}</span>
        <b>
          {done} / {total}
        </b>
      </div>
      <div className="ui-meter__bar" />
      {hint && <span className="lv-meter__hint">{hint}</span>}
    </div>
  )
}

function Side({ act, flat, data }: { act: number; flat: FlatStep[]; data: LevelingData }) {
  const t = useT()
  const lang = useLang()
  // камни (S26), квесты и NPC (S31) — названия как в игре
  const gameLang = useGameLang(lang)
  const state = useLevelingStore((s) => s.state)!
  const c = counters(flat, state.progress, data)
  // макет v3: «23 с квестов + 1 за бандитов = 24»; при помощи одному из бандитов очка нет
  const bonus = banditPassives(data)
  const kill = state.progress.variant.bandit === 'kill'
  const base = c.passives.total - (kill ? bonus : 0)
  const passivesHint = !bonus
    ? undefined
    : (kill ? t('lev.campaign.passives.kill') : t('lev.campaign.passives.help'))
        .replace('{base}', String(base))
        .replace('{bonus}', String(bonus))
        .replace('{all}', String(base + bonus))
  const profile = state.profiles.find((p) => p.id === state.activeId)!
  const cls = baseClass(profile.className, data.classes)
  const questsInAct = useMemo(() => {
    const ids = new Set<string>()
    for (const f of flat) if (f.act === act) for (const p of f.step.parts) if (typeof p === 'object' && 'k' in p && p.k === 'quest') ids.add(p.q)
    return [...ids].map((id) => ({ id, q: data.quests[id] })).filter((x) => x.q)
  }, [flat, act, data])
  const passiveQuests = questsInAct.filter((x) => x.q.passives && (!x.q.passivesIf || state.progress.variant.bandit === 'kill'))
  // S39: вставлен билд — только его камни (id предмета игры, как ключи gems в leveling.json)
  const buildIds = useBuildGemIds()
  const gems = useMemo(() => {
    if (!cls) return []
    const out: { gem: string; how: string }[] = []
    const seen = new Set<string>()
    for (const { q } of questsInAct) {
      const qn = gameLang === 'ru' ? q.ru : q.en
      for (const r of Object.values(q.rewards ?? {})) {
        for (const g of r.quest) {
          if (!g.classes.includes(cls) || seen.has(g.gem)) continue
          seen.add(g.gem)
          out.push({ gem: g.gem, how: t('lev.gems.quest').replace('{quest}', qn) })
        }
      }
      for (const r of Object.values(q.rewards ?? {})) {
        for (const g of r.vendor) {
          if (!g.classes.includes(cls) || seen.has(g.gem)) continue
          seen.add(g.gem)
          const npc = g.npc ? nameOf(data, g.npc, gameLang) : ''
          out.push({ gem: g.gem, how: t('lev.gems.vendor').replace('{npc}', npc).replace('{quest}', qn) })
        }
      }
    }
    return (buildIds ? out.filter((g) => buildIds.has(g.gem)) : out).slice(0, 12)
  }, [cls, questsInAct, gameLang, data, t, buildIds])

  return (
    <aside className="lv-side">
      <section className="ui-box">
        <div className="ui-box__head">
          <span className="ui-label">{t('lev.campaign.title')}</span>
        </div>
        <div className="ui-box__body">
          <Meter label={t('lev.campaign.passives')} done={c.passives.done} total={c.passives.total} hint={passivesHint} />
          <Meter label={t('lev.campaign.trials')} done={c.trials.done} total={c.trials.total} />
          <div className="ui-banner">
            <Ico name="warn" />
            <span>{t('lev.campaign.res')}</span>
          </div>
        </div>
      </section>
      <section className="ui-box">
        <div className="ui-box__head">
          <span className="ui-label">{t('lev.rewards.title').replace('{act}', String(act))}</span>
        </div>
        <div className="ui-box__body">
          {passiveQuests.length === 0 ? (
            <p className="lv-p">{t('lev.rewards.empty')}</p>
          ) : (
            passiveQuests.map(({ id, q }) => (
              <div key={id} className="lv-reward">
                <span className="ui-reward ui-reward--passive">
                  <Ico name="passive" />
                  {(q.passives ?? 1) > 1 ? t('lev.tag.passives').replace('{n}', String(q.passives)) : t('lev.tag.passive')}
                </span>
                {questName(data, id, gameLang)}
              </div>
            ))
          )}
        </div>
      </section>
      <section className="ui-box">
        <div className="ui-box__head">
          <span className="ui-label" title={buildIds ? t('bd.lev.gems.buildHint') : undefined}>
            {buildIds ? t('bd.lev.gems.build') : t('lev.gems.title')}
          </span>
        </div>
        <div className="ui-box__body">
          {!cls ? (
            <p className="lv-p">{t('lev.gems.pick').replace('{npc}', nameOf(data, 'Nessa', gameLang))}</p>
          ) : gems.length === 0 ? (
            <p className="lv-p">{buildIds ? t('bd.lev.gems.buildEmpty') : t('lev.gems.empty')}</p>
          ) : (
            gems.map((g) => {
              const gem = data.gems[g.gem]
              return (
                <div key={g.gem} className="lv-gem">
                  <span className={`lv-gem__name lv-attr--${gem?.attr ?? 'none'}`}>{gem ? (gameLang === 'ru' ? gem.ru : gem.en) : g.gem}</span>
                  <span className="lv-gem__how">{g.how}</span>
                </div>
              )
            })
          )}
        </div>
      </section>
    </aside>
  )
}

export function LevelingTab() {
  const t = useT()
  const ready = useLevelingStore((s) => s.ready)
  const data = useLevelingStore((s) => s.data)
  const state = useLevelingStore((s) => s.state)
  const flat = useLevelingStore((s) => s.flat)
  const init = useLevelingStore((s) => s.init)
  const [act, setAct] = useState<number | null>(null)

  useEffect(() => {
    let off: (() => void) | undefined
    let disposed = false
    void init().then((fn) => (disposed ? fn() : (off = fn)))
    return () => {
      disposed = true
      off?.()
    }
  }, [init])

  if (!ready || !data || !state || flat.length === 0) return <div className="ui-empty">{t('lev.loading')}</div>

  const cur = currentIndex(flat, state.progress)
  const curAct = cur >= 0 ? flat[cur].act : data.sections.length
  const shown = act ?? curAct
  const c = counters(flat, state.progress, data)

  return (
    <div className="lv">
      <Header />
      <FinishedBanner />
      {!state.log.connected && (
        <div className="ui-banner ui-banner--bad">
          <Ico name="warn" />
          <span>{t('lev.log.off')}</span>
        </div>
      )}
      <div className="ui-tabs lv-acts" role="tablist">
        {data.sections.map((s) => {
          const a = c.acts[s.act] ?? { done: 0, total: 0 }
          const complete = a.total > 0 && a.done === a.total
          return (
            <button key={s.act} type="button" className="ui-tab" role="tab" aria-selected={s.act === shown} onClick={() => setAct(s.act)}>
              {complete && <Ico name="check" size="sm" />}
              {t('lev.act').replace('{n}', String(s.act))}
              {s.act === curAct && !complete && (
                <span className="ui-count">
                  {a.done}/{a.total}
                </span>
              )}
            </button>
          )
        })}
      </div>
      {cur < 0 && !state.progress.finished && <div className="ui-banner ui-banner--info"><Ico name="check" /><span>{t('lev.done')}</span></div>}
      <div className="lv-body">
        <Route act={shown} flat={flat} data={data} />
        <Side act={shown} flat={flat} data={data} />
      </div>
    </div>
  )
}
