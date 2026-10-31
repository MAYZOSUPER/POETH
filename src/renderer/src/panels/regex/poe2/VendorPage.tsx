import { useMemo } from 'react'
import type { OverflowItem, Poe2ItemClass, Poe2RegexData, Poe2VendorKey, Poe2VendorQuery } from '@shared/types'
import {
  POE2_ITEM_CLASSES,
  POE2_SOCKETS_MAX,
  POE2_VENDOR_GROUPS,
  buildPoe2VendorRegex,
  emptyPoe2VendorQuery,
  poe2HasThreshold
} from '@shared/regex/poe2'
import { Select } from '../../../components/Select'
import { useT } from '../../../i18n'
import { Box, Hint, NumberRow, ResultBox, Seg, useSimple } from '../common'
import { RarityChips } from './WaystonePage'
import { usePoe2RegexStore } from './usePoe2RegexStore'
import '../vendor.css'

// «Торговец» PoE 2 (S62): свойства снаряжения (жизнь, дух, сопротивления, уровни умений, урон, скорость,
// характеристики), класс и редкость — условия «И», гнёзда под руны («Sockets: S S»), качество. Простой режим —
// главное на прокачке; экспертный — все группы. Пороги — «подпись ≥ число», без порога — чипы.

const SIMPLE_GROUPS = new Set(['defence', 'res', 'gems', 'speed'])

export function Poe2VendorPage({ data }: { data: Poe2RegexData }) {
  const t = useT()
  const simple = useSimple()
  const q = usePoe2RegexStore((s) => s.prefs.vendor)
  const setPrefs = usePoe2RegexStore((s) => s.setPrefs)
  const setQuery = (patch: Partial<Poe2VendorQuery>): void => setPrefs({ vendor: { ...q, ...patch } })
  const v = data.vendor
  const result = useMemo(() => buildPoe2VendorRegex(v, q), [v, q])
  const className = (c: Poe2ItemClass): string => v.classNames[c]
  const setMod = (k: Poe2VendorKey, n: number): void => {
    const mods = { ...q.mods }
    if (n > 0) mods[k] = n
    else delete mods[k]
    setQuery({ mods })
  }
  const optionName = (s: OverflowItem): string => {
    if (s.kind !== 'option') return ''
    if (s.key.startsWith('mod.')) return t(`regex.poe2.prop.${s.key.slice(4)}`)
    return t(`regex.poe2.opt.${s.key}`)
  }
  const overflowText = result.overflow
    ? t('regex.overflow', { n: result.overflow.by, list: result.overflow.suggest.map(optionName).join('; ') })
    : undefined
  const classOptions = [
    { value: '' as const, label: t('regex.vendor.class.any') },
    ...POE2_ITEM_CLASSES.map((c) => ({ value: c, label: v.classNames[c] }))
  ]
  const groups = POE2_VENDOR_GROUPS.filter((g) => !simple || SIMPLE_GROUPS.has(g.id))
  const hidden = simple
    ? POE2_VENDOR_GROUPS.filter((g) => !SIMPLE_GROUPS.has(g.id)).flatMap((g) => g.keys.filter((k) => (q.mods[k] ?? 0) > 0))
    : []

  return (
    <div className="rx-two">
      <div className="rx-stack">
        <Box title={t('regex.vendor.mods.title')} tip={t('regex.poe2.vendor.tip')}>
          <div className="rx-row">
            <span>{t('regex.vendor.class')}</span>
            <Select<Poe2ItemClass | ''>
              className="rx-v-class"
              value={q.itemClass}
              label={t('regex.vendor.class')}
              options={classOptions}
              onChange={(c) => setQuery({ itemClass: c })}
            />
          </div>
          <RarityChips value={q.rarity} onChange={(rarity) => setQuery({ rarity })} />
          {groups.map((g) => (
            <div className="rx-v-group" key={g.id}>
              <span className="ui-label">{t(`regex.poe2.group.${g.id}`)}</span>
              <div className="rx-v-nums">
                {g.keys
                  .filter((k) => poe2HasThreshold(v, k))
                  .map((k) => (
                    <span key={k} title={v.props[k].text.join('\n')}>
                      <NumberRow
                        id={`rx-p2v-${k}`}
                        label={t('regex.maps.atLeast', { label: t(`regex.poe2.prop.${k}`) })}
                        value={q.mods[k] ?? 0}
                        max={999}
                        onChange={(n) => setMod(k, n)}
                      />
                    </span>
                  ))}
              </div>
              <span className="ui-chips">
                {g.keys
                  .filter((k) => !poe2HasThreshold(v, k))
                  .map((k) => (
                    <button
                      key={k}
                      type="button"
                      className="ui-chip"
                      aria-pressed={(q.mods[k] ?? 0) > 0}
                      title={v.props[k].text.join('\n')}
                      onClick={() => setMod(k, (q.mods[k] ?? 0) > 0 ? 0 : 1)}
                    >
                      {t(`regex.poe2.prop.${k}`)}
                    </button>
                  ))}
              </span>
            </div>
          ))}
          {hidden.length > 0 && (
            <div className="ui-field__help">{t('regex.poe2.vendor.hidden', { list: hidden.map((k) => t(`regex.poe2.prop.${k}`)).join(', ') })}</div>
          )}
          {simple && <Hint>{t('regex.poe2.vendor.hint')}</Hint>}
        </Box>
        <Box title={t('regex.poe2.vendor.sockets')} tip={t('regex.poe2.vendor.socketsTip')}>
          <NumberRow id="rx-p2-sockets" label={t('regex.poe2.vendor.socketsAtLeast')} value={q.sockets} max={POE2_SOCKETS_MAX} onChange={(n) => setQuery({ sockets: n })} />
          {!simple && <NumberRow id="rx-p2-quality" label={t('regex.vendor.qualityAtLeast')} value={q.quality} max={30} onChange={(n) => setQuery({ quality: n })} />}
          <div className="rx-row">
            <span>{t('regex.vendor.mode')}</span>
            <Seg
              value={q.mode}
              label={t('regex.vendor.mode')}
              onChange={(m) => setQuery({ mode: m })}
              options={[
                { value: 'any', label: t('regex.vendor.any') },
                { value: 'all', label: t('regex.vendor.all') }
              ]}
            />
          </div>
        </Box>
      </div>
      <div className="rx-stack rx-sticky">
        <ResultBox
          result={result}
          defaultName={t('regex.poe2.vendor.genName', { summary: summarize(t, q, className) })}
          onReset={() => setPrefs({ vendor: emptyPoe2VendorQuery() })}
          overflowText={overflowText}
          hint={t('regex.poe2.vendor.howto')}
        />
      </div>
    </div>
  )
}

function summarize(t: ReturnType<typeof useT>, q: Poe2VendorQuery, className: (c: Poe2ItemClass) => string): string {
  const parts: string[] = []
  if (q.itemClass) parts.push(className(q.itemClass))
  for (const [k, n] of Object.entries(q.mods)) if (n) parts.push(`${t(`regex.poe2.prop.${k}`)}${n > 1 ? ` ${n}+` : ''}`)
  if (q.sockets) parts.push(`${q.sockets}S`)
  if (q.quality) parts.push(`Q${q.quality}%+`)
  return parts.join(', ') || '—'
}
