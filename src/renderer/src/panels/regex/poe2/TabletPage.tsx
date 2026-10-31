import { useMemo } from 'react'
import type { OverflowItem, Poe2RegexData, TabletQuery } from '@shared/types'
import { TABLET_TYPES, TABLET_USES_MAX, buildTabletRegex, emptyTabletQuery, modsForTypes } from '@shared/regex/poe2'
import { useT } from '../../../i18n'
import { Box, NumberRow, ResultBox, Seg, shortText, useSimple } from '../common'
import { ModList } from './ModList'
import { ProfilesBox } from './Profiles'
import { RarityChips } from './WaystonePage'
import { usePoe2RegexStore } from './usePoe2RegexStore'

// «Плитки» PoE 2 (S62; в игре «Tablet» / «Плитка»): тип (любой из), использований ≥ N, редкость, моды
// «хочу / не хочу» — список сужается до модов выбранных типов; профили с ценой на trade2 по клику.

export function TabletPage({ data, other }: { data: Poe2RegexData; other: Poe2RegexData | null }) {
  const t = useT()
  const simple = useSimple()
  const q = usePoe2RegexStore((s) => s.prefs.tablet)
  const setPrefs = usePoe2RegexStore((s) => s.setPrefs)
  const setQuery = (patch: Partial<TabletQuery>): void => setPrefs({ tablet: { ...q, ...patch } })
  const tb = data.tablet
  const result = useMemo(() => buildTabletRegex(tb, q), [tb, q])
  const mods = useMemo(() => modsForTypes(tb, q.types), [tb, q.types])
  const byId = useMemo(() => new Map(tb.mods.map((m) => [m.id, m])), [tb])
  const nameOf = (id: string): string => shortText(byId.get(id)?.display ?? id, 40)
  const optionName = (s: OverflowItem): string =>
    s.kind === 'mod' ? nameOf(s.id) : s.kind === 'option' ? t(`regex.poe2.opt.${s.key}`) : ''
  const overflowText = result.overflow
    ? t('regex.overflow', {
        n: result.overflow.by,
        list: result.overflow.suggest.map(optionName).join('; ')
      })
    : undefined
  const sideText = result.sideMatches.length
    ? t('regex.side', { list: result.sideMatches.map(nameOf).join('; ') })
    : undefined

  return (
    <div className="rx-two rx-two--p2">
      <div className="rx-stack">
        <Box title={t('regex.poe2.tablet.types')} tip={t('regex.poe2.tablet.typesTip')}>
          <span className="ui-chips">
            {TABLET_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                className="ui-chip"
                aria-pressed={q.types.includes(type)}
                title={tb.types[type]}
                onClick={() =>
                  setQuery({
                    types: q.types.includes(type) ? q.types.filter((x) => x !== type) : [...q.types, type]
                  })
                }
              >
                {tb.names[type]}
              </button>
            ))}
          </span>
          {simple && <div className="ui-field__help">{t('regex.poe2.tablet.typesHint')}</div>}
        </Box>
        <ModList
          mods={mods}
          other={other?.tablet.mods ?? null}
          want={q.want}
          avoid={q.avoid}
          onChange={(want, avoid) => setQuery({ want, avoid })}
        />
        {!simple && (
          <div className="ui-field__help">
            {t('regex.poe2.dataInfo', {
              patch: data.meta.patch,
              date: data.meta.date,
              n: tb.mods.length
            })}
          </div>
        )}
      </div>

      <div className="rx-stack rx-sticky">
        <Box title={t('regex.poe2.tablet.item')}>
          <NumberRow
            id="rx-p2-uses"
            label={t('regex.poe2.tablet.uses')}
            value={q.usesMin}
            max={TABLET_USES_MAX}
            onChange={(n) => setQuery({ usesMin: n })}
          />
          <RarityChips value={q.rarity} onChange={(rarity) => setQuery({ rarity })} />
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
          defaultName={t('regex.poe2.tablet.genName', {
            summary:
              [
                ...q.types.map((x) => tb.names[x]),
                q.usesMin ? `≥ ${q.usesMin}` : '',
                q.want.length ? `✓${q.want.length}` : '',
                q.avoid.length ? `✕${q.avoid.length}` : ''
              ]
                .filter(Boolean)
                .join(', ') || '—'
          })}
          onReset={() => setPrefs({ tablet: emptyTabletQuery() })}
          overflowText={overflowText}
          sideText={sideText}
          hint={t('regex.poe2.howto')}
        />
        <ProfilesBox
          kind="tablet"
          data={data}
          current={q}
          onApply={(p) => p.tablet && setPrefs({ tablet: p.tablet })}
        />
      </div>
    </div>
  )
}
