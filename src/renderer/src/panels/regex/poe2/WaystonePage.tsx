import { useMemo } from 'react'
import type { OverflowItem, Poe2RegexData, Poe2Rarity, TriState, WaystoneLabelKey, WaystoneQuery } from '@shared/types'
import {
  POE2_RARITIES,
  WAYSTONE_LABEL_KEYS,
  WAYSTONE_TIER_MAX,
  buildWaystoneRegex,
  emptyWaystoneQuery
} from '@shared/regex/poe2'
import { useT } from '../../../i18n'
import { Box, NumberRow, ResultBox, Seg, shortText, useSimple } from '../common'
import { ModList } from './ModList'
import { ProfilesBox } from './Profiles'
import { usePoe2RegexStore } from './usePoe2RegexStore'

// «Путевые камни» PoE 2 (S62): моды «хочу / не хочу» (все сразу или любой из), тир от–до, редкость, осквернён,
// опознан; пороги свойств камня ≥ % (простой режим — 4, экспертный — 7); живая строка со счётчиком 250;
// профили «что нужно» с ценой на trade2 по клику.

const SIMPLE_LABELS: WaystoneLabelKey[] = ['packSize', 'rareMonsters', 'itemRarity', 'dropChance']

export function WaystonePage({ data, other }: { data: Poe2RegexData; other: Poe2RegexData | null }) {
  const t = useT()
  const simple = useSimple()
  const q = usePoe2RegexStore((s) => s.prefs.waystone)
  const setPrefs = usePoe2RegexStore((s) => s.setPrefs)
  const setQuery = (patch: Partial<WaystoneQuery>): void => setPrefs({ waystone: { ...q, ...patch } })
  const ws = data.waystone
  const result = useMemo(() => buildWaystoneRegex(ws, q), [ws, q])
  const byId = useMemo(() => new Map(ws.mods.map((m) => [m.id, m])), [ws])
  const nameOf = (id: string): string => shortText(byId.get(id)?.display ?? id, 40)

  const optionName = (s: OverflowItem): string => {
    if (s.kind === 'mod') return nameOf(s.id)
    if (s.kind !== 'option') return ''
    if (s.key.startsWith('threshold.')) return t(`regex.poe2.label.${s.key.slice(10)}`)
    return t(`regex.poe2.opt.${s.key}`)
  }
  const overflowText = result.overflow
    ? t('regex.overflow', {
        n: result.overflow.by,
        list: result.overflow.suggest.map(optionName).join('; ')
      })
    : undefined
  const sideText = result.sideMatches.length
    ? t('regex.side', { list: result.sideMatches.map(nameOf).join('; ') })
    : undefined
  const labels = simple ? SIMPLE_LABELS : WAYSTONE_LABEL_KEYS
  const triOptions = (['any', 'only', 'exclude'] as TriState[]).map((v) => ({
    value: v,
    label: t(`regex.tri.${v}`)
  }))
  const idOptions = (['any', 'exclude', 'only'] as TriState[]).map((v) => ({
    value: v,
    label: t(`regex.poe2.identified.${v}`)
  }))

  return (
    <div className="rx-two">
      <div className="rx-stack">
        <ModList
          mods={ws.mods}
          other={other?.waystone.mods ?? null}
          want={q.want}
          avoid={q.avoid}
          onChange={(want, avoid) => setQuery({ want, avoid })}
          withScary
          kinds
        />
        {!simple && (
          <div className="ui-field__help">
            {t('regex.poe2.dataInfo', {
              patch: data.meta.patch,
              date: data.meta.date,
              n: ws.mods.length
            })}
          </div>
        )}
      </div>

      <div className="rx-stack rx-sticky">
        <Box title={t('regex.poe2.waystone.item')} tip={t('regex.poe2.waystone.itemTip')}>
          <div className="rx-row">
            <span>{t('regex.poe2.tier')}</span>
            <span className="rx-inline">
              <NumberRow
                id="rx-p2-tmin"
                label={t('regex.poe2.tierFrom')}
                value={q.tierMin}
                max={WAYSTONE_TIER_MAX}
                onChange={(n) => setQuery({ tierMin: n })}
              />
              <NumberRow
                id="rx-p2-tmax"
                label={t('regex.poe2.tierTo')}
                value={q.tierMax}
                max={WAYSTONE_TIER_MAX}
                onChange={(n) => setQuery({ tierMax: n })}
              />
            </span>
          </div>
          <RarityChips value={q.rarity} onChange={(rarity) => setQuery({ rarity })} />
          <div className="rx-row">
            <span>{t('regex.flag.corrupted')}</span>
            <Seg
              value={q.corrupted}
              label={t('regex.flag.corrupted')}
              onChange={(v) => setQuery({ corrupted: v })}
              options={triOptions}
            />
          </div>
          <div className="rx-row">
            <span>{t('regex.poe2.identified')}</span>
            <Seg
              value={q.unidentified}
              label={t('regex.poe2.identified')}
              onChange={(v) => setQuery({ unidentified: v })}
              options={idOptions}
            />
          </div>
          {simple && <div className="ui-field__help">{t('regex.poe2.waystone.unidHint')}</div>}
        </Box>
        <Box title={t('regex.maps.thresholds')} tip={t('regex.poe2.thresholdsTip')}>
          {labels.map((key) => (
            <NumberRow
              key={key}
              id={`rx-p2-thr-${key}`}
              label={t('regex.maps.atLeast', {
                label: t(`regex.poe2.label.${key}`)
              })}
              value={q.thresholds[key] ?? 0}
              max={999}
              onChange={(n) => setQuery({ thresholds: { ...q.thresholds, [key]: n } })}
            />
          ))}
          <div className="rx-row">
            <span>{t('regex.maps.wantMode')}</span>
            <Seg
              value={q.wantMode}
              label={t('regex.maps.wantMode')}
              onChange={(v) => setQuery({ wantMode: v })}
              options={[
                {
                  value: 'all',
                  label: t('regex.maps.wantAll'),
                  title: t('regex.maps.wantAllTip')
                },
                {
                  value: 'any',
                  label: t('regex.maps.wantAny'),
                  title: t('regex.maps.wantAnyTip')
                }
              ]}
            />
          </div>
        </Box>
        <ResultBox
          result={result}
          defaultName={t('regex.poe2.waystone.genName', {
            summary: summarize(t, q)
          })}
          onReset={() => setPrefs({ waystone: emptyWaystoneQuery() })}
          overflowText={overflowText}
          sideText={sideText}
          hint={t('regex.poe2.howto')}
        />
        <ProfilesBox
          kind="waystone"
          data={data}
          current={q}
          onApply={(p) => p.waystone && setPrefs({ waystone: p.waystone })}
        />
      </div>
    </div>
  )
}

export function RarityChips({ value, onChange }: { value: Poe2Rarity[]; onChange: (v: Poe2Rarity[]) => void }) {
  const t = useT()
  return (
    <div className="rx-row">
      <span>{t('regex.vendor.rarity')}</span>
      <span className="ui-chips">
        {POE2_RARITIES.map((r) => (
          <button
            key={r}
            type="button"
            className="ui-chip"
            aria-pressed={value.includes(r)}
            onClick={() => onChange(value.includes(r) ? value.filter((x) => x !== r) : [...value, r])}
          >
            {t(`regex.poe2.rarity.${r}`)}
          </button>
        ))}
      </span>
    </div>
  )
}

/** Короткое описание набора для названия в библиотеке. */
function summarize(t: ReturnType<typeof useT>, q: WaystoneQuery): string {
  const parts: string[] = []
  if (q.tierMin || q.tierMax) parts.push(`T${q.tierMin || 1}–${q.tierMax || WAYSTONE_TIER_MAX}`)
  if (q.avoid.length) parts.push(`✕${q.avoid.length}`)
  if (q.want.length) parts.push(`✓${q.want.length}`)
  for (const key of WAYSTONE_LABEL_KEYS) {
    const n = q.thresholds[key] ?? 0
    if (n > 0) parts.push(`${t(`regex.poe2.label.${key}`)} ≥ ${n}%`)
  }
  return parts.join(', ') || '—'
}
