import { useState } from 'react'
import type { Poe2PriceResult, Poe2Profile, Poe2ProfileKind, Poe2RegexData, TabletQuery, WaystoneQuery } from '@shared/types'
import { PROFILE_NAME_MAX, profileRegex, profileTradeQuery } from '@shared/regex/poe2'
import { useT } from '../../../i18n'
import { Box, CopyButton, Hint, useSimple } from '../common'
import { Ico } from '../Ico'
import { usePoe2RegexStore } from './usePoe2RegexStore'

// Профили «что нужно» (S62, идея poe2pricer): текущий набор страницы → именованный профиль. У профиля — строка для
// тайника (копировать), «Открыть» (вернуть набор на страницу) и «Цена по профилю»: по клику ровно один поиск
// trade2 через шлюз (выкуп + онлайн), без опросов и без запросов при наведении.

export function ProfilesBox({
  kind,
  data,
  current,
  onApply
}: {
  kind: Poe2ProfileKind
  data: Poe2RegexData
  current: WaystoneQuery | TabletQuery
  onApply: (p: Poe2Profile) => void
}) {
  const t = useT()
  const simple = useSimple()
  const profiles = usePoe2RegexStore((s) => s.profiles).filter((p) => p.kind === kind)
  const saveProfile = usePoe2RegexStore((s) => s.saveProfile)
  const deleteProfile = usePoe2RegexStore((s) => s.deleteProfile)
  const [naming, setNaming] = useState<string | null>(null)

  const save = async (): Promise<void> => {
    const name = (naming ?? '').trim()
    if (!name) return
    await saveProfile(kind === 'waystone' ? { name, kind, waystone: current as WaystoneQuery } : { name, kind, tablet: current as TabletQuery })
    setNaming(null)
  }

  return (
    <Box title={t('regex.poe2.profiles.title')} tip={t('regex.poe2.profiles.tip')}>
      {naming === null ? (
        <div className="rx-btns">
          <button type="button" className="ui-btn ui-btn--sm" onClick={() => setNaming('')}>
            <Ico name="plus" />
            {t('regex.poe2.profiles.save')}
          </button>
        </div>
      ) : (
        <div className="rx-btns">
          <input
            className="ui-input rx-grow"
            value={naming}
            autoFocus
            maxLength={PROFILE_NAME_MAX}
            aria-label={t('regex.poe2.profiles.name')}
            placeholder={t('regex.poe2.profiles.name')}
            onChange={(e) => setNaming(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void save()
              if (e.key === 'Escape') setNaming(null)
            }}
          />
          <button type="button" className="ui-btn ui-btn--sm ui-btn--primary" disabled={!naming.trim()} onClick={() => void save()}>
            {t('regex.saveDo')}
          </button>
          <button type="button" className="ui-btn ui-btn--sm ui-btn--ghost" onClick={() => setNaming(null)}>
            {t('regex.cancel')}
          </button>
        </div>
      )}
      {profiles.length === 0 && <div className="ui-field__help">{t('regex.poe2.profiles.empty')}</div>}
      {profiles.map((p) => (
        <ProfileRow key={p.id} profile={p} data={data} onApply={() => onApply(p)} onDelete={() => void deleteProfile(p.id)} />
      ))}
      {simple && <Hint>{t('regex.poe2.profiles.hint')}</Hint>}
    </Box>
  )
}

function ProfileRow({
  profile,
  data,
  onApply,
  onDelete
}: {
  profile: Poe2Profile
  data: Poe2RegexData
  onApply: () => void
  onDelete: () => void
}) {
  const t = useT()
  const price = usePoe2RegexStore((s) => s.prices[profile.id])
  const runPrice = usePoe2RegexStore((s) => s.price)
  const r = profileRegex(data, profile)
  const query = profileTradeQuery(data, profile)
  return (
    <div className="rx-lib-row rx-p2-profile">
      <span className="rx-lib-t">
        <b>{profile.name}</b>
        <code title={r.text}>{r.text || '—'}</code>
        {!r.ok && <span className="ui-field__error">{t('regex.overflow.short')}</span>}
        {price?.result && <PriceLine result={price.result} skipped={query.skipped.length} />}
      </span>
      <span className="rx-btns">
        <CopyButton text={r.ok ? r.text : ''} small />
        <button type="button" className="ui-btn ui-btn--sm" onClick={onApply} title={t('regex.poe2.profiles.applyTitle')}>
          {t('regex.poe2.profiles.apply')}
        </button>
        <button
          type="button"
          className="ui-btn ui-btn--sm"
          disabled={price?.pending}
          title={t('regex.poe2.price.title')}
          onClick={() => void runPrice(profile.id, query.body)}
        >
          <Ico name="coins" />
          {price?.pending ? t('regex.poe2.price.pending') : t('regex.poe2.price.do')}
        </button>
        <button type="button" className="ui-btn ui-btn--sm ui-btn--ghost" onClick={onDelete} title={t('regex.poe2.profiles.delete')}>
          <Ico name="cross" />
        </button>
      </span>
    </div>
  )
}

/** Итог «Цены по профилю»: сколько лотов, самые дешёвые (вторая цена — отсекает приманки), ссылка на сайт. */
function PriceLine({ result, skipped }: { result: Poe2PriceResult; skipped: number }) {
  const t = useT()
  if (!result.ok) {
    const key = `regex.poe2.price.error.${result.error.code}`
    const text = t(key)
    return <span className="ui-field__error">{text === key ? t('regex.poe2.price.error', { code: result.error.code }) : text}</span>
  }
  const prices = result.listings.map((l) => `${fmt(l.amount)} ${l.currency}`)
  return (
    <span className="rx-p2-price">
      <span>
        {result.total === 0
          ? t('regex.poe2.price.none')
          : t('regex.poe2.price.found', { n: result.total, list: prices.slice(0, 5).join(' · ') || '—' })}
      </span>
      {result.listings.length >= 2 && (
        <span className="rx-lib-desc">{t('regex.poe2.price.second', { price: prices[1] })}</span>
      )}
      {skipped > 0 && <span className="rx-lib-desc">{t('regex.poe2.price.skipped', { n: skipped })}</span>}
      <button
        type="button"
        className="ui-btn ui-btn--sm ui-btn--ghost"
        onClick={() => void window.overlayApi.tradeWindow.open({ game: 'poe2', url: result.siteUrl })}
      >
        <Ico name="external" />
        {t('regex.poe2.price.open')}
      </button>
    </span>
  )
}

const fmt = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(1))
