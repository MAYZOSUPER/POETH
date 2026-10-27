import { useState } from 'react'
import type { BlacklistHit } from '@shared/types'
import { BLACKLIST_URL } from '@shared/deals/blacklist'
import { useLang, useT } from '../../i18n'
import { useDealsStore } from '../../store/useDealsStore'
import { Box, Hint, Ico, blacklistWarning, formatDate } from './common'

// «Чёрный список»: состояние кэша списка PoE Hub, ручное обновление, проверка игрока по нику.

export function BlacklistPage() {
  const t = useT()
  const lang = useLang()
  const status = useDealsStore((s) => s.blacklist)
  const enabled = useDealsStore((s) => s.state?.config.checkBlacklist ?? true)
  const refresh = useDealsStore((s) => s.refreshBlacklist)
  const checkPlayer = useDealsStore((s) => s.checkPlayer)
  const [name, setName] = useState('')
  const [result, setResult] = useState<{ name: string; hit: BlacklistHit | null } | null>(null)

  const run = async (): Promise<void> => {
    const n = name.trim()
    if (!n) return
    setResult({ name: n, hit: await checkPlayer(n) })
  }

  return (
    <div className="dl-two">
      <div className="dl-stack">
        <Box
          title={t('deals.bl.title')}
          icon="shield"
          aside={
            <button
              type="button"
              className="ui-btn ui-btn--sm"
              disabled={status?.loading}
              onClick={() => void refresh()}
            >
              <Ico name="refresh" />
              {t('deals.bl.refresh')}
            </button>
          }
        >
          <p className="dl-p">{t('deals.bl.about')}</p>
          {!enabled && (
            <div className="ui-banner dl-banner">
              <Ico name="warn" />
              <span>{t('deals.bl.off')}</span>
              <span />
            </div>
          )}
          <div className="dl-row">
            <span className="ui-tag ui-tag--good">{t('deals.bl.count', { n: status?.count ?? 0 })}</span>
            <span className="dl-muted">
              {status?.loading
                ? t('deals.bl.loading')
                : status?.fetchedAt
                  ? t('deals.bl.updated', { date: formatDate(status.fetchedAt) })
                  : t('deals.bl.never')}
            </span>
          </div>
          {status?.error && (
            <div className="ui-banner ui-banner--bad dl-banner">
              <Ico name="warn" />
              <span>{t('deals.bl.error', { err: status.error })}</span>
              <span />
            </div>
          )}
          <span className="ui-field__help">
            {t('deals.bl.source')}: <span className="dl-path">{BLACKLIST_URL}</span>
          </span>
        </Box>
      </div>
      <div className="dl-stack">
        <Box title={t('deals.bl.check')} icon="search">
          <div className="dl-row">
            <input
              className="ui-input ui-input--lg dl-grow"
              value={name}
              maxLength={64}
              placeholder={t('deals.bl.checkPh')}
              aria-label={t('deals.bl.checkPh')}
              onChange={(e) => {
                setName(e.target.value)
                setResult(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void run()
              }}
            />
            <button type="button" className="ui-btn" disabled={!name.trim()} onClick={() => void run()}>
              {t('deals.bl.checkRun')}
            </button>
          </div>
          {result &&
            (result.hit ? (
              <div className="ui-banner ui-banner--bad dl-banner">
                <Ico name="warn" />
                <span>
                  <b>{result.name}</b> — {blacklistWarning(result.hit, lang)}
                  <br />
                  <span className="dl-muted">{t('deals.bl.since', { date: result.hit.since })}</span>
                </span>
                <span />
              </div>
            ) : (
              <div className="dl-ok">
                <Ico name="check" />
                <b>{result.name}</b> — {t('deals.bl.clean')}
              </div>
            ))}
          <Hint text={t('deals.bl.note')} />
        </Box>
      </div>
    </div>
  )
}
