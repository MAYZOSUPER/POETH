import { useEffect, useRef, useState } from 'react'
import type { HotkeyAction, PricePopupPosition, UiLang } from '@shared/types'
import { PRICE_POPUP_POSITIONS } from '@shared/types'
import { findHotkeyConflict } from '@shared/chatCommands'
import { GAMES, type GameId } from '@shared/games'
import { HOTKEY_ACTIONS, defaultHotkeys } from '@shared/settings'
import { BOOSTY_URL } from '@shared/links'
import { useAppStore } from '../store/useAppStore'
import { useShellStore } from '../store/useShellStore'
import { Ico } from './regex/Ico'
import { useT } from '../i18n'
import { AccountPanel } from './account/AccountPanel'
import { ChatCommandsPanel } from './chat/ChatCommandsPanel'
import { UpdatesSettings } from '../updates/UpdatesSettings'

const BOTH: GameId[] = ['poe1', 'poe2']

/** Подпись действия и в каких играх оно показывается в настройках. */
const HK_META: Record<HotkeyAction, { labelKey: string; n?: number; games: GameId[] }> = {
  priceCheck: { labelKey: 'set.hk.priceCheck', games: BOTH },
  overlayToggle: { labelKey: 'set.hk.overlayToggle', games: ['poe1'] },
  whisperLastHit: { labelKey: 'set.hk.whisperLastHit', games: ['poe1'] },
  pasteSearch1: { labelKey: 'set.hk.pasteSearch', n: 1, games: ['poe1'] },
  pasteSearch2: { labelKey: 'set.hk.pasteSearch', n: 2, games: ['poe1'] },
  pasteSearch3: { labelKey: 'set.hk.pasteSearch', n: 3, games: ['poe1'] },
  pasteSearch4: { labelKey: 'set.hk.pasteSearch', n: 4, games: ['poe1'] },
  pasteSearch5: { labelKey: 'set.hk.pasteSearch', n: 5, games: ['poe1'] },
  toggleCompanion: { labelKey: 'set.hk.toggle', games: BOTH },
  toggleLock: { labelKey: 'set.hk.lock', games: BOTH },
  dealInvite: { labelKey: 'set.hk.dealInvite', games: ['poe1'] },
  dealTrade: { labelKey: 'set.hk.dealTrade', games: ['poe1'] },
  dealDismiss: { labelKey: 'set.hk.dealDismiss', games: ['poe1'] },
  toggleTradeWindow: { labelKey: 'set.hk.tradeWindow', games: ['poe1'] },
  prevStep: { labelKey: 'set.hk.prev', games: ['poe2'] },
  nextStep: { labelKey: 'set.hk.next', games: ['poe2'] }
}

const CODE_KEY_MAP: Record<string, string> = {
  BracketLeft: '[',
  BracketRight: ']',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
  Backslash: '\\',
  Minus: '-',
  Equal: '=',
  Backquote: '`',
  Space: 'Space',
  Tab: 'Tab',
  Enter: 'Return',
  Backspace: 'Backspace',
  Delete: 'Delete',
  Insert: 'Insert',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right'
}

/** Map a physical key (KeyboardEvent.code) to an Electron accelerator key; null for a bare modifier. */
function codeToKey(code: string, key: string): string | null {
  if (/^(Control|Alt|Shift|Meta|OS)(Left|Right)?$/.test(code)) return null
  if (code.startsWith('Key')) return code.slice(3)
  if (code.startsWith('Digit')) return code.slice(5)
  if (/^F\d{1,2}$/.test(key)) return key
  if (code in CODE_KEY_MAP) return CODE_KEY_MAP[code]
  if (code.startsWith('Numpad')) {
    const n = code.slice(6)
    if (/^\d$/.test(n)) return `num${n}`
  }
  return null
}

/** Build an Electron accelerator from a keydown, or null if it isn't a complete combo yet. */
function eventToAccelerator(e: KeyboardEvent): string | null {
  const key = codeToKey(e.code, e.key)
  if (!key) return null
  const mods: string[] = []
  if (e.ctrlKey) mods.push('Control')
  if (e.altKey) mods.push('Alt')
  if (e.shiftKey) mods.push('Shift')
  if (e.metaKey) mods.push('Super')
  const isFn = /^F\d{1,2}$/.test(key)
  // Require a modifier for ordinary keys so we never bind a bare letter/digit.
  if (mods.length === 0 && !isFn) return null
  return [...mods, key].join('+')
}

/** Pretty-print an accelerator for display. */
function formatAccel(a?: string): string {
  if (!a) return '—'
  return a
    .split('+')
    .map((p) => (p === 'Control' ? 'Ctrl' : p === 'Super' ? 'Win' : p))
    .join(' + ')
}

export function SettingsPanel() {
  const dataset = useAppStore((s) => s.dataset)
  const settings = useAppStore((s) => s.settings)
  const tailerStatus = useAppStore((s) => s.tailerStatus)
  const patchSettings = useAppStore((s) => s.patchSettings)
  const tailerStart = useAppStore((s) => s.tailerStart)
  const tailerStop = useAppStore((s) => s.tailerStop)
  const tailerPickFile = useAppStore((s) => s.tailerPickFile)
  const t = useT()
  const meta = dataset?.meta
  const game = settings?.game ?? 'poe1'
  const hkActions = HOTKEY_ACTIONS.filter((a) => HK_META[a].games.includes(game))
  const hasCampaign = GAMES[game].features.campaign

  const [capturing, setCapturing] = useState<HotkeyAction | null>(null)
  const [hkNote, setHkNote] = useState<string | null>(null)
  const settingsRef = useRef(settings)
  settingsRef.current = settings

  // While capturing a new combo, suspend global shortcuts (so pressing the
  // existing one doesn't fire its action) and grab the next keydown.
  useEffect(() => {
    if (!capturing) return
    const api = window.overlayApi
    api.hotkeys.suspend()
    const onKey = (e: KeyboardEvent): void => {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') {
        setCapturing(null)
        return
      }
      const accel = eventToAccelerator(e)
      if (!accel) return
      const s = settingsRef.current
      if (!s) return
      const hk = s.hotkeys
      // занятые игрой и нашим вводом в игру сочетания (Ctrl+C/V/F/A, Enter, стрелки…) и повторы
      // (в т.ч. с командами чата) — нельзя
      const conflict = findHotkeyConflict(accel, s, { action: capturing })
      if (conflict) {
        setHkNote(conflict.kind === 'reserved' ? `overlay.hotkey.reserved.${conflict.reason}` : 'set.hk.conflict')
        return
      }
      void patchSettings({ hotkeys: { [capturing]: { ...hk[capturing], accel } } })
      setHkNote(null)
      setCapturing(null)
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      api.hotkeys.resume()
    }
  }, [capturing, patchSettings])

  return (
    <section className="panel settings">
      <div className="panel-head">
        <span>{t('set.title')}</span>
      </div>

      <div className="setting">
        <label>{t('set.lang')}</label>
        <select
          className="lang-select"
          value={settings?.uiLang ?? 'ru'}
          onChange={(e) => void patchSettings({ uiLang: e.target.value as UiLang })}
        >
          <option value="ru">Русский</option>
          <option value="en">English</option>
        </select>
      </div>

      {hasCampaign && (
        <>
          <div className="setting">
            <label>{t('set.nameLang')}</label>
            <select
              className="lang-select"
              value={settings?.nameLang ?? 'en'}
              onChange={(e) => void patchSettings({ nameLang: e.target.value as UiLang })}
            >
              <option value="en">English</option>
              <option value="ru">Русский</option>
            </select>
          </div>
          <div className="hint small muted">{t('set.nameLang.note')}</div>
        </>
      )}

      <div className="setting">
        <label>{t('set.opacity')}</label>
        <input
          type="range"
          min={0.3}
          max={1}
          step={0.05}
          value={settings?.opacity ?? 0.95}
          onChange={(e) => void patchSettings({ opacity: Number(e.target.value) })}
        />
      </div>

      <label className="row-toggle">
        <input
          type="checkbox"
          checked={settings?.showInTaskbar ?? true}
          onChange={(e) => void patchSettings({ showInTaskbar: e.target.checked })}
        />
        {t('set.taskbar')}
      </label>

      <div className="hint small muted">{t('set.windowedHint')}</div>

      {game === 'poe1' && (
        <div className="setting">
          <label>{t('overlay.set.pricePosition')}</label>
          <select
            className="lang-select"
            value={settings?.overlay?.pricePosition ?? 'cursor'}
            onChange={(e) =>
              void patchSettings({ overlay: { pricePosition: e.target.value as PricePopupPosition } })
            }
          >
            {PRICE_POPUP_POSITIONS.map((p) => (
              <option key={p} value={p}>
                {t(`overlay.set.pricePosition.${p}`)}
              </option>
            ))}
          </select>
        </div>
      )}
      {game === 'poe1' && <div className="hint small muted">{t('overlay.set.pricePosition.hint')}</div>}

      {game === 'poe1' && (
        <>
          <label className="row-toggle">
            <input
              type="checkbox"
              checked={settings?.priceCheck?.sendWhisper ?? false}
              onChange={(e) => void patchSettings({ priceCheck: { sendWhisper: e.target.checked } })}
            />
            {t('pc1.set.sendWhisper')}
          </label>
          <div className="hint small muted">{t('pc1.set.sendWhisper.hint')}</div>
        </>
      )}

      {game === 'poe1' && <AccountPanel />}

      <div className="block">
        <div className="block-title">{t('set.hotkeys')}</div>
        <ul className="kv">
          {hkActions.map((action) => {
            const { labelKey, n } = HK_META[action]
            const binding = settings?.hotkeys[action]
            return (
              <li key={action}>
                <span>
                  {t(labelKey, n ? { n } : undefined)}{' '}
                  <span className="small muted">
                    · {t(binding?.scope === 'game' ? 'set.hk.scope.game' : 'set.hk.scope.always')}
                  </span>
                </span>
                <span className="hk-cell">
                  <button
                    className={'hotkey' + (capturing === action ? ' capturing' : '')}
                    title={t('set.hk.hint')}
                    onClick={() => {
                      setHkNote(null)
                      setCapturing((cur) => (cur === action ? null : action))
                    }}
                  >
                    {capturing === action ? t('set.hk.press') : formatAccel(binding?.accel)}
                  </button>
                  <button
                    className="icon hk-clear"
                    title={t('set.hk.clear')}
                    style={{ visibility: binding?.accel && capturing !== action ? 'visible' : 'hidden' }}
                    onClick={() => {
                      if (!binding) return
                      void patchSettings({ hotkeys: { [action]: { ...binding, accel: '' } } })
                    }}
                  >
                    ✕
                  </button>
                </span>
              </li>
            )
          })}
        </ul>
        {hkNote && <div className="small danger">{t(hkNote)}</div>}
        <div className="hk-foot">
          <span className="small muted">{t('set.hk.hint')}</span>
          <button
            className="btn small"
            onClick={() => {
              setCapturing(null)
              setHkNote(null)
              void patchSettings({ hotkeys: defaultHotkeys() })
            }}
          >
            {t('set.hk.reset')}
          </button>
        </div>
      </div>

      {game === 'poe1' && <ChatCommandsPanel />}

      {hasCampaign && (
        <>
          <div className="block">
            <div className="block-title">{t('set.auto')}</div>
            <label className="row-toggle">
              <input
                type="checkbox"
                checked={settings?.tailerEnabled ?? false}
                onChange={(e) => void (e.target.checked ? tailerStart() : tailerStop())}
              />
              {t('set.auto.read')}
            </label>
            <div className="small muted">
              {tailerStatus?.running
                ? tailerStatus.found
                  ? t('set.auto.found', { path: tailerStatus.logPath ?? '' })
                  : t('set.auto.notfound')
                : t('set.auto.off')}
            </div>
            <button className="btn" onClick={() => void tailerPickFile()}>
              {t('set.auto.pick')}
            </button>
            <label className="row-toggle">
              <input
                type="checkbox"
                checked={settings?.autoAdvanceZone ?? true}
                onChange={(e) => void patchSettings({ autoAdvanceZone: e.target.checked })}
              />
              {t('set.auto.advance')}
            </label>
            <label className="row-toggle">
              <input
                type="checkbox"
                checked={settings?.autoCheckQuests ?? false}
                onChange={(e) => void patchSettings({ autoCheckQuests: e.target.checked })}
              />
              {t('set.auto.check')}
            </label>
            <div className="small muted">{t('set.auto.check.note')}</div>
            <div className="small muted">{t('set.auto.note')}</div>
          </div>

          <div className="block">
            <div className="block-title">{t('set.data')}</div>
            <div className="small muted">{t('set.data.version', { label: meta?.gameVersionLabel ?? '' })}</div>
            <div className="small muted">
              {t('set.data.schema', { schema: meta?.schemaVersion ?? '', acts: meta?.actCount ?? 0 })}
            </div>
            <ul className="sources small muted">
              {meta?.sources.map((s, i) => (
                <li key={i}>
                  {s.name} — {s.license}
                </li>
              ))}
            </ul>
          </div>
        </>
      )}

      <UpdatesSettings />
      <div className="block">
        <div className="onb-settings-links">
          <button type="button" className="ui-btn ui-btn--sm" onClick={() => useShellStore.getState().setPage('about')}>
            <Ico name="info" />
            {t('set.about')}
          </button>
          <button type="button" className="ui-btn ui-btn--sm ui-btn--ghost" onClick={() => useShellStore.getState().openWizard()}>
            <Ico name="compass" />
            {t('set.wizard')}
          </button>
        </div>
      </div>

      <div className="block support">
        <div className="block-title">{t('set.support')}</div>
        <div className="small muted">{t('set.support.text')}</div>
        <button className="btn small" onClick={() => window.overlayApi.window.openExternal(BOOSTY_URL)}>
          ♥ {t('set.support.btn')}
        </button>
      </div>

      <div className="disclaimer small muted">{t('set.disclaimer')}</div>
    </section>
  )
}
