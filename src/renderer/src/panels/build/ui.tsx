import { Fragment, useEffect, useState } from 'react'
import type { PobStage } from '@shared/pob/stages'
import type { GemColor, TreeData } from '@shared/build/types'
import type { GameLang } from '@shared/types/settings'
import { ShellIcon } from '../../components/ShellIcon'
import type { IconName } from '../../overlay/Icon'
import { useT } from '../../i18n'

// Мелкие части вкладки «Билд» (S39): иконка, строка с копированием, гнёзда связки, подписи этапов, классов и слотов.

type T = ReturnType<typeof useT>

export function BIco({ name, size }: { name: IconName; size?: 'sm' | 'lg' }) {
  return <ShellIcon name={name} size={size} />
}

/** Строка для поиска в игре (.ui-code--line) и «Скопировать» → «Скопировано» на 2 с. */
export function CopyLine({ text, label }: { text: string; label: string }) {
  const t = useT()
  const [done, setDone] = useState(false)
  useEffect(() => {
    if (!done) return
    const id = setTimeout(() => setDone(false), 2000)
    return () => clearTimeout(id)
  }, [done])
  return (
    <div className="ui-code ui-code--line">
      <p className="ui-code__text" tabIndex={0} title={text} aria-label={label}>
        {text}
      </p>
      <button type="button" className="ui-btn ui-btn--sm" onClick={() => void navigator.clipboard.writeText(text).then(() => setDone(true))}>
        <BIco name={done ? 'check' : 'copy'} />
        {done ? t('bd.copied') : t('bd.copy')}
      </button>
    </div>
  )
}

/** Гнёзда связки по цветам камней (.ui-sock): R — сила, G — ловкость, B — интеллект, W — белое. */
export function Sock({ colors }: { colors: (GemColor | null)[] }) {
  const t = useT()
  return (
    <span className="ui-sock" title={t('bd.links.sockets')}>
      {colors.map((c, i) => (
        <Fragment key={i}>
          {i > 0 && <em />}
          <i className={c && c !== 'b' ? c : undefined} />
        </Fragment>
      ))}
    </span>
  )
}

/** Подпись этапа на языке интерфейса по догадке S35 («Акт 3», «Ур. 12–22», «Ранние карты»); не узнан — название из PoB. */
export function stageLabel(stage: PobStage, index: number, t: T): string {
  const g = stage.guess
  let s: string
  if (g.kind === 'act' && g.campaign) s = t('bd.stage.campaign')
  else if (g.kind === 'act' && g.actFrom !== undefined)
    s = g.actTo !== undefined && g.actTo !== g.actFrom ? t('bd.stage.acts', { a: g.actFrom, b: g.actTo }) : t('bd.stage.act', { n: g.actFrom })
  else if (g.kind === 'level' && g.levelFrom !== undefined)
    s = g.levelTo !== undefined ? t('bd.stage.levels', { a: g.levelFrom, b: g.levelTo }) : t('bd.stage.levelFrom', { n: g.levelFrom })
  else if (g.kind === 'maps') s = g.early ? t('bd.stage.earlyMaps') : t('bd.stage.maps')
  else if (g.kind === 'endgame') s = t('bd.stage.endgame')
  else s = stage.title || t('bd.stage.n', { n: index + 1 })
  return g.swap && g.kind !== 'unknown' ? `${s} · ${t('bd.stage.swap')}` : s
}

/** Подписи всех этапов; одинаковые (варианты «Act 3») — названием из PoB. */
export function stageLabels(stages: PobStage[], t: T): string[] {
  const raw = stages.map((s, i) => stageLabel(s, i, t))
  return raw.map((l, i) => (raw.indexOf(l) !== raw.lastIndexOf(l) && stages[i].title ? stages[i].title : l))
}

/** «Ведьма → Маг стихий» на языке клиента игры (данные дерева S36); без данных — как в PoB. */
export function classLine(
  tree: TreeData | null,
  lang: GameLang,
  classId: number,
  ascendClassId: number,
  fallback: { className: string; ascendClassName: string | null }
): string {
  const cls = tree?.classes[classId]
  const asc = cls && ascendClassId > 0 ? cls.asc[ascendClassId - 1] : undefined
  const c = cls ? (lang === 'ru' ? cls.ru : cls.en) : fallback.className
  const a = asc ? (lang === 'ru' ? asc.ru : asc.en) : fallback.ascendClassName
  return a ? `${c} → ${a}` : c
}

/** Слот PoB на языке интерфейса («Body Armour» → «Тело»); незнакомый — как есть. */
export function slotLabel(slot: string | null, t: T): string {
  if (!slot) return t('bd.slot.none')
  const key = `bd.slot.${slot.replace(/\s+/g, '')}`
  const s = t(key)
  return s === key ? slot : s
}
