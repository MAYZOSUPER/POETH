import { useEffect, useMemo, useRef, useState } from 'react'
import type { PobStagePlan } from '@shared/pob/stages'
import { mainSkill, sourceHost } from '@shared/build/library'
import {
  buildChecks,
  stageChecklist,
  stageChips,
  stageGems,
  stageLinks,
  stageTree,
  vendorSearch,
  type CheckRow,
  type GemRow,
  type NodeRow,
  type StageGems
} from '@shared/build/view'
import type { GameLang } from '@shared/types/settings'
import type { StoredBuild } from '@shared/types/build'
import { useLang, useT } from '../../i18n'
import { useGameLang } from '../../gameLang'
import { useAppStore } from '../../store/useAppStore'
import { useBuildStore } from '../../store/useBuildStore'
import { useLevelingStore } from '../../store/useLevelingStore'
import type { IconName } from '../../overlay/Icon'
import { formatAccel } from '../../overlay/useOverlayT'
import { ascOrClass, buildTitle, mainSkillName } from './names'
import { StagesDialog } from './StagesDialog'
import { useProgress, useStage } from './useStage'
import { BIco, classLine, CopyLine, slotLabel, Sock, stageLabels } from './ui'

// Открытый билд (макет v0.2, раздел 1): шапка с этапами, «Камни сейчас», «Связки», «Дерево: следующие ноды»,
// «Проверка», «Заметки автора». До 760 px содержимого — одна колонка в порядке пользы, шире — две.
// «Предметы этапа» (S40) встают в левую колонку после «Связок».

type T = ReturnType<typeof useT>

// ---------------------------------------------------------------------------- шапка

function Menu({ build, onStages }: { build: StoredBuild; onStages: () => void }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLSpanElement>(null)
  const btn = useRef<HTMLButtonElement>(null)
  const { open: openBuild, remove, reload } = useBuildStore.getState()
  const busy = useBuildStore((s) => s.busy)
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
      <BIco name={icon} />
      <span>{label}</span>
      <span />
    </button>
  )
  return (
    <span className="bd-menu" ref={box}>
      <button
        ref={btn}
        type="button"
        className="ui-btn ui-btn--ghost ui-btn--icon ui-btn--sm"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('bd.menu')}
        title={t('bd.menu')}
        onClick={() => setOpen(!open)}
      >
        <BIco name="dots" />
      </button>
      {open && (
        <div className="ui-menu" role="menu" aria-label={t('bd.menu')}>
          {item('layers', t('bd.menu.stages'), onStages)}
          {build.source.kind === 'link' && item('refresh', t('bd.menu.reload'), () => void reload(), false, !!busy)}
          {item('import', t('bd.menu.another'), () => void openBuild(null))}
          <div className="ui-menu__sep" />
          {item('trash', t('bd.menu.remove'), () => void remove(build.id), true)}
        </div>
      )}
    </span>
  )
}

function SourceLink({ build }: { build: StoredBuild }) {
  const t = useT()
  const [done, setDone] = useState(false)
  useEffect(() => {
    if (!done) return
    const id = setTimeout(() => setDone(false), 2000)
    return () => clearTimeout(id)
  }, [done])
  const host = sourceHost(build.source)
  if (!host || !build.source.pageUrl) return <span>{t('bd.source.code')}</span>
  const url = build.source.pageUrl
  return (
    <button type="button" className="bd-src" title={t('bd.source.copy')} onClick={() => void navigator.clipboard.writeText(url).then(() => setDone(true))}>
      {host}
      <BIco name={done ? 'check' : 'copy'} />
      {done && <span className="bd-src__ok">{t('bd.copied')}</span>}
    </button>
  )
}

function Head({
  build,
  plan,
  shown,
  current,
  manual,
  labels,
  expert,
  onStages
}: {
  build: StoredBuild
  plan: PobStagePlan
  shown: number
  current: number | null
  manual: boolean
  labels: string[]
  expert: boolean
  onStages: () => void
}) {
  const t = useT()
  const lang = useLang()
  const gameLang = useGameLang(lang)
  const tree = useBuildStore((s) => s.tree)
  const gems = useBuildStore((s) => s.gems)
  const viewStage = useBuildStore.getState().viewStage
  const progress = useProgress()
  const b = build.build
  const spec = b.specs[b.activeSpec] ?? b.specs[0]
  const main = mainSkill(b)
  const title = buildTitle(mainSkillName(gems, main.gemId, main.name, gameLang), ascOrClass(tree, gameLang, spec?.classId ?? 0, spec?.ascendClassId ?? 0, b))
  const chips = stageChips(plan, current)
  const firstOther = chips.findIndex((c) => !c.stage.leveling)
  const stage = plan.stages[shown]
  return (
    <>
      <div className="bd-title">
        <h3>{title}</h3>
        <Menu build={build} onStages={onStages} />
      </div>
      <div className="bd-meta">
        <span className="ui-tag">{classLine(tree, gameLang, spec?.classId ?? 0, spec?.ascendClassId ?? 0, b)}</span>
        <SourceLink build={build} />
        {progress.level !== null && (
          <span className="bd-lvl" title={t('bd.lvl.title')}>
            {t('bd.lvl', { n: progress.level })}
            {!expert && <span>{t('bd.lvl.log')}</span>}
          </span>
        )}
      </div>
      {plan.stages.length > 1 && (
        <div className={`bd-stages${expert ? ' bd-stages--scroll' : ''}`} role="group" aria-label={t('bd.stages')}>
          {chips.map((c, i) => (
            <span key={c.stage.key} className="bd-stages__item">
              {i === firstOther && i > 0 && <span className="bd-stages__sep" aria-hidden="true" />}
              <button
                type="button"
                className={`ui-chip${c.past ? ' is-past' : ''}${c.now ? ' is-now' : ''}${c.stage.leveling ? '' : ' is-other'}`}
                aria-pressed={c.index === shown}
                title={[c.stage.title, c.now ? t(manual ? 'bd.stage.nowManual' : 'bd.stage.now') : '', c.stage.leveling ? '' : t('bd.stage.notLeveling')]
                  .filter(Boolean)
                  .join(' · ')}
                onClick={() => viewStage(c.index === current ? null : c.index)}
              >
                {c.past && <BIco name="check" />}
                {labels[c.index]}
              </button>
            </span>
          ))}
        </div>
      )}
      {current !== null && shown !== current ? (
        <div className="ui-banner ui-banner--info bd-banner">
          <BIco name="info" />
          <span>
            {shown < current && plan.stages[shown].leveling
              ? t('bd.stage.behind', { s: labels[shown] })
              : t('bd.stage.ahead', { s: labels[shown], now: labels[current] })}
          </span>
          <button type="button" className="ui-btn ui-btn--sm" onClick={() => viewStage(null)}>
            {t('bd.stage.back')}
          </button>
        </div>
      ) : stage && !stage.leveling ? (
        <div className="ui-banner ui-banner--info bd-banner">
          <BIco name="info" />
          <span>{t('bd.stage.otherHint')}</span>
          <span />
        </div>
      ) : (
        !expert &&
        plan.stages.length > 1 && (
          <div className="ui-hint bd-hint">
            <BIco name="help" />
            <span>{manual ? t('bd.stage.hintManual') : progress.level === null ? t('bd.stage.hintNoLog') : t('bd.stage.hint')}</span>
          </div>
        )
      )}
    </>
  )
}

// ---------------------------------------------------------------------------- камни

function gemFrom(r: GemRow, lang: GameLang, t: T): string {
  const s = r.source
  const npc = s ? (lang === 'ru' ? s.npcRu : s.npcEn) : ''
  const quest = s ? (lang === 'ru' ? s.questRu : s.questEn) : ''
  if (r.status === 'have') return s ? t('bd.gems.from.have', { npc }) : t('bd.gems.have')
  if (r.status === 'none') return r.viaBase ? t('bd.gems.from.trans', { base: lang === 'ru' ? r.viaBase.ru : r.viaBase.en }) : t('bd.gems.from.none')
  if (r.status === 'quest') {
    const base = t('bd.gems.from.quest', { quest, npc })
    return s?.level ? `${base} · ${t('bd.lvl', { n: s.level })}` : base
  }
  if (r.have > 0) return t('bd.gems.from.buyMore', { n: r.need - r.have, npc })
  return t('bd.gems.from.buy', { npc, quest })
}

function gemWhy(r: GemRow, lang: GameLang, t: T): string | null {
  if (r.status === 'have') return null
  if (r.replaces.length) return t('bd.gems.why.replace', { old: r.replaces[0] })
  if (!r.usable) return t('bd.gems.why.level', { n: r.usableFrom })
  if (r.vendor) return t('bd.gems.why.copies', { n: r.need - r.have - 1, npc: lang === 'ru' ? r.vendor.npcRu : r.vendor.npcEn })
  if (r.viaBase && r.status !== 'none') return t('bd.gems.why.trans', { base: lang === 'ru' ? r.viaBase.ru : r.viaBase.en })
  return null
}

const GEM_TAG: Record<GemRow['status'], [string, string]> = {
  buy: ['ui-tag--merchant', 'bd.gems.tag.buy'],
  quest: ['ui-tag--person', 'bd.gems.tag.quest'],
  have: ['ui-tag--good', 'bd.gems.tag.have'],
  none: ['ui-tag--warn', 'bd.gems.tag.none']
}

function GemsBox({ gems, expert }: { gems: StageGems; expert: boolean }) {
  const t = useT()
  const lang = useLang()
  const gameLang = useGameLang(lang)
  const data = useBuildStore((s) => s.gems)
  const [rx, setRx] = useState(false)
  const buyRows = gems.rows.filter((r) => r.status === 'buy' || r.vendor)
  const search = useMemo(
    () => (data ? vendorSearch(buyRows.map((r) => r.name), data, gameLang) : { text: '', dropped: [] }),
    // строка зависит только от имён к покупке
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, gameLang, buyRows.map((r) => r.name).join('|')]
  )
  const npcs = [...new Set(buyRows.map((r) => (r.status === 'buy' ? r.source : r.vendor)).map((s) => (s ? (gameLang === 'ru' ? s.npcRu : s.npcEn) : '')).filter(Boolean))]
  return (
    <section className="ui-box">
      <div className="ui-box__head">
        <span className="ui-label">
          <BIco name="gem" />
          {t('bd.gems.title')}
        </span>
        <span className="bd-count">{t('bd.gems.count', { buy: gems.buy, quest: gems.quest })}</span>
        <span className="ui-label__grow" />
        <button type="button" className="ui-btn ui-btn--sm" aria-expanded={rx} disabled={!search.text} onClick={() => setRx(!rx)}>
          <BIco name="search" />
          {t('bd.gems.vendor')}
        </button>
      </div>
      {gems.rows.length === 0 ? (
        <p className="bd-none">{t('bd.gems.empty')}</p>
      ) : (
        <div className="bd-rows">
          {gems.rows.map((r) => {
            const why = expert ? null : gemWhy(r, gameLang, t)
            const tag = GEM_TAG[r.status]
            return (
              <div key={r.key} className={`bd-row is-gem${r.status === 'have' ? ' is-done' : ''}${r.next ? ' is-next' : ''}`}>
                <BIco name={r.status === 'have' ? 'check' : 'gem'} />
                <span className="bd-row__t">
                  <b className="ui-item ui-item--gem">{r.name}</b>
                  <span>
                    {gemFrom(r, gameLang, t)}
                    {why ? ` — ${why}` : ''}
                  </span>
                </span>
                <span className="bd-row__end">
                  {r.need > 1 && <span className="bd-copies">{t('bd.gems.copies', { have: r.have, need: r.need })}</span>}
                  <span className={`ui-tag ${tag[0]}`}>{t(tag[1])}</span>
                </span>
              </div>
            )
          })}
        </div>
      )}
      {rx && search.text && (
        <div className="bd-str">
          <CopyLine text={search.text} label={t('bd.gems.vendor')} />
          {!expert && <p className="ui-field__help">{t('bd.gems.vendor.help', { npc: npcs.join(', ') || t('bd.gems.vendor.npc') })}</p>}
          {search.dropped.length > 0 && <p className="ui-field__help">{t('bd.gems.vendor.dropped', { names: search.dropped.join(', ') })}</p>}
        </div>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------- связки

function LinksBox({ build, plan, shown, expert }: { build: StoredBuild; plan: PobStagePlan; shown: number; expert: boolean }) {
  const t = useT()
  const lang = useLang()
  const gameLang = useGameLang(lang)
  const data = useBuildStore((s) => s.gems)
  const links = useMemo(() => stageLinks(build.build, plan, shown, data, gameLang, mainSkill(build.build).gemId), [build, plan, shown, data, gameLang])
  return (
    <section className="ui-box">
      <div className="ui-box__head">
        <span className="ui-label">
          <BIco name="link" />
          {t('bd.links.title')}
        </span>
        <span className="ui-label__grow" />
        {!expert && (
          <span className="ui-q" title={t('bd.links.q')} aria-label={t('bd.links.q')}>
            ?
          </span>
        )}
      </div>
      {links.length === 0 ? (
        <p className="bd-none">{t('bd.gems.empty')}</p>
      ) : (
        <div className="bd-rows">
          {links.map((l, i) => (
            <div key={i} className={`bd-link${l.main ? ' is-main' : ''}`}>
              <span className="bd-link__slot">
                <b>
                  {slotLabel(l.slot, t)}
                  {l.main && !expert ? ` · ${t('bd.links.main')}` : ''}
                </b>
                <Sock colors={l.gems.map((g) => g.color)} />
              </span>
              <span className="bd-link__gems">
                {l.gems.map((g, k) => (
                  <span key={k} className="bd-link__gem">
                    {k > 0 && <span className="sep">—</span>}
                    <span className="ui-item ui-item--gem">{g.name}</span>
                    {g.from !== null && !expert && <span className="bd-tip"> ({t('bd.links.from', { n: g.from })})</span>}
                  </span>
                ))}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------- дерево

const NODE_ICON: Record<NodeRow['kind'], IconName> = {
  notable: 'passive',
  keystone: 'seal',
  mastery: 'star',
  jewel: 'gem',
  asc: 'compass',
  small: 'dash'
}

function TreeBox({
  build,
  plan,
  shown,
  labels,
  expert
}: {
  build: StoredBuild
  plan: PobStagePlan
  shown: number
  labels: string[]
  expert: boolean
}) {
  const t = useT()
  const lang = useLang()
  const gameLang = useGameLang(lang)
  const tree = useBuildStore((s) => s.tree)
  const taken = useBuildStore((s) => s.taken)
  const accel = useAppStore((s) => (s.settings?.hotkeys as Record<string, { accel?: string } | undefined> | undefined)?.buildTree?.accel ?? 'Alt+P')
  const [tx, setTx] = useState(false)
  const [overlay, setOverlay] = useState<'idle' | 'sent' | 'none'>('idle')
  const log = useMemo(() => (taken ? { taken: new Set(taken.taken), removed: new Set(taken.removed) } : null), [taken])
  const view = useMemo(() => stageTree(build.build, plan, shown, tree, gameLang, log), [build, plan, shown, tree, gameLang, log])
  const stage = plan.stages[shown]
  const show = (): void => {
    void window.overlayApi.build
      .showTree(shown)
      .then((r) => setOverlay(r.available ? 'sent' : 'none'))
      .catch(() => setOverlay('none'))
  }
  const rows = view.rows
  return (
    <section className="ui-box">
      <div className="ui-box__head">
        <span className="ui-label">
          <BIco name="passive" />
          {t('bd.tree.title')}
        </span>
        <span className="bd-count">{view.log ? t('bd.tree.count.log', { k: view.taken, n: view.add }) : t('bd.tree.count', { n: view.add })}</span>
        <span className="ui-label__grow" />
        <button type="button" className="ui-btn ui-btn--sm" aria-expanded={tx} disabled={!view.search.text} onClick={() => setTx(!tx)}>
          <BIco name="search" />
          {t('bd.tree.search')}
        </button>
      </div>
      {!stage || stage.spec === null ? (
        <p className="bd-none">{t('bd.tree.noSpec')}</p>
      ) : rows.length === 0 ? (
        <p className="bd-none">{t('bd.tree.same')}</p>
      ) : (
        <div className="bd-rows">
          {rows.map((n, i) => {
            const drop = n.state === 'drop'
            const name = n.kind === 'small' ? t(drop ? 'bd.tree.smallDrop' : 'bd.tree.small', { n: n.count ?? 0 }) : n.name
            const sub =
              n.kind === 'small' && !drop && view.log
                ? t('bd.tree.smallDone', { k: n.done ?? 0 })
                : drop
                  ? view.prev !== null
                    ? t('bd.tree.dropWhy', { s: labels[shown] })
                    : null
                  : n.detail
            return (
              <div
                key={`${n.hash ?? n.kind}-${n.state}-${i}`}
                className={`bd-row bd-node is-${n.kind}${n.state === 'done' ? ' is-done' : ''}${drop ? ' is-drop' : ''}${n.state === 'next' ? ' is-next' : ''}`}
              >
                <BIco name={drop ? 'warn' : NODE_ICON[n.kind]} />
                <span className="bd-row__t">
                  <b>{name}</b>
                  {sub && (!expert || drop || n.kind === 'mastery') && <span>{sub}</span>}
                </span>
                <span className="bd-row__end">
                  {n.kind !== 'small' && <span className="ui-tag">{t(`bd.tree.kind.${n.kind}`)}</span>}
                  {n.state === 'done' && <span className="ui-tag ui-tag--good">{t('bd.tree.taken')}</span>}
                  {drop && <span className="ui-tag ui-tag--warn">{t('bd.tree.drop')}</span>}
                </span>
              </div>
            )
          })}
        </div>
      )}
      {view.remove > 0 && (
        <p className="bd-respec">
          <BIco name="warn" />
          <span>{t('bd.tree.respec', { n: view.respec })}</span>
        </p>
      )}
      {tx && view.search.text && (
        <div className="bd-str">
          <CopyLine text={view.search.text} label={t('bd.tree.search')} />
          {view.search.parts.length > 1 && (
            <p className="ui-field__help">{t('bd.tree.searchMore', { names: view.search.parts.slice(1).join(' · ') })}</p>
          )}
          {!expert && <p className="ui-field__help">{t('bd.tree.searchHelp')}</p>}
        </div>
      )}
      <div className="ui-box__foot">
        <button
          type="button"
          className="ui-btn ui-btn--sm ui-btn--primary"
          disabled={!stage || stage.spec === null}
          title={t('bd.tree.show.title', { key: formatAccel(accel) })}
          onClick={show}
        >
          <BIco name="passive" />
          {t('bd.tree.show')}
        </button>
        <span className="ui-kbd" aria-label={formatAccel(accel)}>
          {formatAccel(accel)
            .split(' + ')
            .map((k, i) => (
              <span key={i}>
                {i > 0 && '+'}
                <kbd>{k}</kbd>
              </span>
            ))}
        </span>
        {overlay === 'sent' && <span className="bd-tip">{t('bd.tree.show.sent', { key: formatAccel(accel) })}</span>}
        {overlay === 'none' && <span className="bd-tip">{t('bd.tree.show.none')}</span>}
        {!expert && overlay === 'idle' && !view.log && <span className="bd-tip">{t('bd.tree.logHint')}</span>}
        {view.log && taken?.character && <span className="bd-tip">{t('bd.tree.logChar', { name: taken.character })}</span>}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------- проверка

function checkText(r: CheckRow, t: T): { label: string; value: string; note: string | null } {
  switch (r.id) {
    case 'fire':
    case 'cold':
    case 'lightning':
      return { label: t(`bd.check.${r.id}`), value: `${r.value}%`, note: r.gap ? t('bd.check.res.gap', { n: r.gap }) : t('bd.check.res.cap') }
    case 'chaos':
      return { label: t('bd.check.chaos'), value: `${r.value}%`, note: r.value < 0 ? t('bd.check.chaos.note') : null }
    case 'life':
      return { label: t('bd.check.life'), value: `${r.value} · ${r.value2 ?? 0}`, note: null }
    case 'maxHit':
      return { label: t('bd.check.maxHit'), value: `≈ ${r.value}`, note: t('bd.check.maxHit.note') }
    case 'str':
    case 'dex':
    case 'int':
      return { label: t(`bd.check.${r.id}`), value: String(r.value), note: t('bd.check.attr.gap', { n: r.gap ?? 0 }) }
    case 'mana':
      return { label: t('bd.check.mana'), value: String(r.value), note: t('bd.check.mana.note') }
  }
}

function CheckBox({ build, plan, shown, expert }: { build: StoredBuild; plan: PobStagePlan; shown: number; expert: boolean }) {
  const t = useT()
  const lang = useLang()
  const gameLang = useGameLang(lang)
  const lv = useLevelingStore((s) => s.data)
  const checks = useMemo(() => buildChecks(build.build), [build])
  const list = useMemo(() => stageChecklist(build.build, plan, shown), [build, plan, shown])
  const name = (en: string): string => (gameLang === 'ru' ? (lv?.names[en] ?? en) : en)
  return (
    <section className="ui-box">
      <div className="ui-box__head">
        <span className="ui-label">
          <BIco name="shield" />
          {t('bd.check.title')}
        </span>
        <span className="ui-label__grow" />
        {checks && <span className="bd-count">{t('bd.check.targets')}</span>}
      </div>
      {!checks ? (
        <div className="ui-empty bd-nostats">
          <BIco name="info" size="lg" />
          <span className="ui-empty__title">{t('bd.check.none')}</span>
          <span>{t('bd.check.none.d')}</span>
        </div>
      ) : (
        <div className="bd-rows">
          {checks.rows.map((r) => {
            const x = checkText(r, t)
            return (
              <div key={r.id} className={`ui-light${r.level === 'good' ? '' : ` ui-light--${r.level}`}`}>
                <i aria-hidden="true" />
                <span>{x.label}</span>
                <span className="ui-light__v">{x.value}</span>
                {x.note && (!expert || r.level !== 'good') && <span className="ui-light__note">{x.note}</span>}
                <span className="bd-sr">{t(`bd.check.level.${r.level}`)}</span>
              </div>
            )
          })}
        </div>
      )}
      {list.length > 0 && (
        <div className="bd-check">
          <span className="ui-label">{t('bd.check.list')}</span>
          <ul>
            {list.map((x, i) => (
              <li key={i}>
                <BIco name="dash" />
                <span>
                  {x.id === 'bandit'
                    ? x.bandit === 'None'
                      ? t('bd.check.bandit.kill')
                      : t('bd.check.bandit.help', { name: name(x.bandit) })
                    : x.id === 'lab'
                      ? t('bd.check.lab', { lab: lv?.labs?.[x.lab]?.[gameLang] ?? t(`bd.check.lab.${x.lab}`), n: x.level })
                      : t('bd.check.pantheon', { major: x.major ?? '—', minor: x.minor ?? '—' })}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {checks && (
        <div className="ui-box__foot bd-foot">
          <BIco name="info" size="sm" />
          <span>
            {t('bd.check.by')}
            {checks.specTitle ? ` · ${t('bd.check.set', { s: checks.specTitle })}` : ''}
            {checks.penalty ? ` · ${t('bd.check.penalty', { n: String(checks.penalty).replace('-', '−') })}` : ''}
          </span>
        </div>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------- заметки

function NotesBox({ notes, expert }: { notes: string; expert: boolean }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  if (!notes.trim()) return null
  const long = notes.split('\n').length > 5 || notes.length > 400
  return (
    <section className="ui-box">
      <div className="ui-box__head">
        <span className="ui-label">
          <BIco name="book" />
          {t('bd.notes.title')}
        </span>
        {!expert && <span className="bd-count">{t('bd.notes.asIs')}</span>}
      </div>
      {/* текст автора как есть: обычный текст React, без разметки и ссылок */}
      <p className={`bd-notes${open || !long ? ' is-open' : ''}`}>{notes}</p>
      {long && (
        <div className="ui-box__foot">
          <button type="button" className="ui-btn ui-btn--ghost ui-btn--sm" aria-expanded={open} onClick={() => setOpen(!open)}>
            <BIco name={open ? 'chev-d' : 'chev-r'} />
            {open ? t('bd.notes.less') : t('bd.notes.more')}
          </button>
        </div>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------- вид билда

export function BuildView({ build, expert }: { build: StoredBuild; expert: boolean }) {
  const t = useT()
  const lang = useLang()
  const gameLang = useGameLang(lang)
  const data = useBuildStore((s) => s.gems)
  const [dialog, setDialog] = useState(false)
  const { plan, current: cur, manual, shown, level } = useStage(build)
  const labels = useMemo(() => stageLabels(plan.stages, t), [plan, t])
  const gems = useMemo(() => stageGems(build.build, plan, shown, data, gameLang, level), [build, plan, shown, data, gameLang, level])

  return (
    <div className="bd">
      <Head
        build={build}
        plan={plan}
        shown={shown}
        current={cur}
        manual={manual}
        labels={labels}
        expert={expert}
        onStages={() => setDialog(true)}
      />
      {plan.stages.length === 0 ? (
        <div className="ui-banner ui-banner--info bd-banner">
          <BIco name="info" />
          <span>{t('bd.stage.none')}</span>
          <span />
        </div>
      ) : (
        <div className="bd-cols">
          <div className="bd-col">
            <GemsBox gems={gems} expert={expert} />
            <LinksBox build={build} plan={plan} shown={shown} expert={expert} />
            {/* S40: «Предметы этапа» — сюда, после «Связок» */}
          </div>
          <div className="bd-col">
            <TreeBox build={build} plan={plan} shown={shown} labels={labels} expert={expert} />
            <CheckBox build={build} plan={plan} shown={shown} expert={expert} />
            <NotesBox notes={build.build.notes} expert={expert} />
          </div>
        </div>
      )}
      {dialog && <StagesDialog build={build} plan={plan} labels={labels} expert={expert} onClose={() => setDialog(false)} />}
    </div>
  )
}
