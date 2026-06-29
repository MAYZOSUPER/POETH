import { useState } from 'react'
import { useAppStore } from '../store/useAppStore'
import { useT } from '../i18n'
import type { PriceCheckResult, PriceResult, TradeListing } from '@shared/types'

/** Pretty-print an Electron accelerator for the how-to hint. */
function formatAccel(a?: string): string {
  if (!a) return ''
  return a
    .split('+')
    .map((p) => (p === 'Control' ? 'Ctrl' : p === 'Super' ? 'Win' : p))
    .join('+')
}

function priceLabel(amount: number, currency: string): string {
  const n = Math.round(amount * 100) / 100
  return `${n} ${currency}`
}

export function PriceCheckTab() {
  const t = useT()
  const settings = useAppStore((s) => s.settings)
  const leagues = useAppStore((s) => s.leagues)
  const sessionSet = useAppStore((s) => s.sessionSet)
  const priceResult = useAppStore((s) => s.priceResult)
  const priceLoading = useAppStore((s) => s.priceLoading)
  const setSession = useAppStore((s) => s.setSession)
  const runPriceCheck = useAppStore((s) => s.runPriceCheck)
  const patchSettings = useAppStore((s) => s.patchSettings)

  const [poeInput, setPoeInput] = useState('')
  const [pasteInput, setPasteInput] = useState('')

  const hotkey = formatAccel(settings?.hotkeys.priceCheck)

  return (
    <div className="price-check">
      {/* POESESSID */}
      <div className="pc-block">
        <div className="pc-block-title">{t('pc.session.title')}</div>
        <div className="pc-row">
          <input
            type="password"
            className="pc-input"
            placeholder={t('pc.session.placeholder')}
            value={poeInput}
            onChange={(e) => setPoeInput(e.target.value)}
          />
          <button
            className="btn"
            disabled={!poeInput.trim()}
            onClick={() => {
              void setSession(poeInput.trim())
              setPoeInput('')
            }}
          >
            {t('pc.session.save')}
          </button>
        </div>
        {sessionSet && (
          <div className="pc-row">
            <span className="pc-ok small">{t('pc.session.set')}</span>
            <button className="btn small" onClick={() => void setSession('')}>
              {t('pc.session.clear')}
            </button>
          </div>
        )}
        <div className="small muted">{t('pc.session.hint')}</div>
      </div>

      {/* League */}
      <div className="pc-block">
        <div className="pc-row">
          <label className="pc-label">{t('pc.league')}</label>
          {leagues.length > 0 ? (
            <select
              className="lang-select"
              value={settings?.league ?? ''}
              onChange={(e) => void patchSettings({ league: e.target.value })}
            >
              {!leagues.includes(settings?.league ?? '') && (
                <option value={settings?.league ?? ''}>{settings?.league ?? ''}</option>
              )}
              {leagues.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          ) : (
            <input
              className="pc-input"
              placeholder={t('pc.league.placeholder')}
              value={settings?.league ?? ''}
              onChange={(e) => void patchSettings({ league: e.target.value })}
            />
          )}
        </div>
      </div>

      {/* How-to + manual paste fallback */}
      <div className="pc-block">
        <div className="small muted">
          {hotkey ? t('pc.howto', { key: hotkey }) : t('pc.howto.nokey')}
        </div>
        <label className="pc-label small">{t('pc.paste.label')}</label>
        <textarea
          className="pc-textarea"
          placeholder={t('pc.paste.placeholder')}
          value={pasteInput}
          onChange={(e) => setPasteInput(e.target.value)}
          rows={4}
        />
        <button
          className="btn"
          disabled={!pasteInput.trim() || priceLoading}
          onClick={() => void runPriceCheck(pasteInput)}
        >
          {t('pc.paste.btn')}
        </button>
      </div>

      {/* Result */}
      <div className="pc-result">
        {priceLoading ? (
          <div className="pc-empty">{t('pc.loading')}</div>
        ) : (
          <PriceResultView result={priceResult} />
        )}
      </div>
    </div>
  )
}

function PriceResultView({ result }: { result: PriceCheckResult | null }) {
  const t = useT()
  if (!result) return <div className="pc-empty">{t('pc.empty')}</div>
  switch (result.status) {
    case 'no-session':
      return <div className="pc-note">{t('pc.status.noSession')}</div>
    case 'not-an-item':
      return <div className="pc-note">{t('pc.status.notItem')}</div>
    case 'empty':
      return <div className="pc-note">{t('pc.status.empty', { name: result.item.name })}</div>
    case 'error':
      return <div className="pc-note danger">{t('pc.status.error', { message: result.message })}</div>
    case 'ok':
      return <PriceOk result={result.result} item={result.item} />
  }
  return null
}

function PriceOk({
  result,
  item
}: {
  result: PriceResult
  item: { name: string; rarity: string }
}) {
  const t = useT()
  const url = result.searchUrl
  return (
    <div className="pc-ok-result">
      <div className="pc-item-head">
        <span className={`pc-rarity ${item.rarity.toLowerCase()}`}>{item.name}</span>
      </div>
      <div className="pc-summary">
        {result.min && (
          <span className="pc-stat">
            <b>{t('pc.result.min')}</b> {priceLabel(result.min.amount, result.min.currency)}
          </span>
        )}
        {result.median && (
          <span className="pc-stat">
            <b>{t('pc.result.median')}</b> {priceLabel(result.median.amount, result.median.currency)}
          </span>
        )}
      </div>
      <div className="small muted">{t('pc.result.total', { n: result.total })}</div>
      {result.note && <div className="small muted pc-approx">⚠ {result.note}</div>}
      <ul className="pc-listings">
        {result.listings.map((l, i) => (
          <ListingRow key={i} l={l} />
        ))}
      </ul>
      {url && (
        <button className="btn small" onClick={() => window.overlayApi.window.openExternal(url)}>
          {t('pc.result.open')}
        </button>
      )}
    </div>
  )
}

function ListingRow({ l }: { l: TradeListing }) {
  const t = useT()
  return (
    <li className="pc-listing">
      <span className="pc-price">{priceLabel(l.amount, l.currency)}</span>
      <span className="pc-account small muted">{l.account || t('pc.result.anon')}</span>
    </li>
  )
}
