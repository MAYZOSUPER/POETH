import { useState } from 'react'
import type { StashCalibration, StashGridMode, StashPos } from '@shared/types'
import {
  GRID_CELLS,
  STASH_GEOMETRY,
  calibrationFromCorners,
  stashCellRect,
  stashGridRect,
  uiOffsetX,
  type ClientSize
} from '@shared/deals/stashGrid'
import { useT } from '../../i18n'
import { useAppStore } from '../../store/useAppStore'
import { useDealsStore } from '../../store/useDealsStore'
import { Box, Hint, Seg, Switch, useSimple } from './common'

// «Тайник»: сетка 12×12 / 24×24, вкладка в папке, предпросмотр ячейки для размера окна игры
// и ручная калибровка (два угла сетки → Settings.deals.calibration). Клики по углам поверх
// игры — фаза 2 (оверлей S1); модель калибровки — @shared/deals/stashGrid.

const RESOLUTIONS: ClientSize[] = [
  { width: 1920, height: 1080 },
  { width: 2560, height: 1440 },
  { width: 3840, height: 2160 },
  { width: 3440, height: 1440 },
  { width: 5120, height: 1440 },
  { width: 1600, height: 900 }
]

const resKey = (r: ClientSize): string => `${r.width}x${r.height}`

function intOr(v: string, fallback: number): number {
  const n = Math.round(Number(v))
  return Number.isFinite(n) ? n : fallback
}

export function StashPage() {
  const t = useT()
  const simple = useSimple()
  const deals = useAppStore((s) => s.settings?.deals)
  const patchSettings = useAppStore((s) => s.patchSettings)
  const state = useDealsStore((s) => s.state)
  const setConfig = useDealsStore((s) => s.setConfig)
  const cal = deals?.calibration ?? null
  const [client, setClient] = useState<ClientSize>(
    cal?.refWidth && cal.refHeight ? { width: cal.refWidth, height: cal.refHeight } : RESOLUTIONS[0]
  )
  const [pos, setPos] = useState<StashPos>({ left: 7, top: 3 })
  if (!deals || !state) return null

  const mode = deals.stashGrid
  const inFolder = state.config.stashInFolder

  return (
    <div className="dl-two">
      <div className="dl-stack">
        <Box title={t('deals.stash.title')} icon="grid">
          {simple && <Hint text={t('deals.stash.calib.help')} />}
          <label className="dl-field">
            <span className="ui-field__label">{t('deals.stash.grid')}</span>
            <Seg<StashGridMode>
              value={mode}
              onChange={(v) => void patchSettings({ deals: { stashGrid: v } })}
              options={[
                { value: 'auto', label: t('deals.stash.grid.auto') },
                { value: 'normal', label: t('deals.stash.grid.normal') },
                { value: 'quad', label: t('deals.stash.grid.quad') }
              ]}
            />
            <span className="ui-field__help">{t('deals.stash.grid.help', { n: state.quadTabs.length })}</span>
          </label>
          <Switch on={inFolder} onChange={(v) => void setConfig({ stashInFolder: v })}>
            {t('deals.stash.folder')}
          </Switch>
          <span className="ui-field__help">{t('deals.stash.folder.help')}</span>
        </Box>
        <CalibrationBox client={client} calibration={cal} />
      </div>
      <div className="dl-stack">
        <Box title={t('deals.stash.preview')} icon="search">
          <div className="dl-grid3">
            <label className="dl-field">
              <span className="ui-field__label">{t('deals.stash.res')}</span>
              <select
                className="ui-select"
                value={RESOLUTIONS.some((r) => resKey(r) === resKey(client)) ? resKey(client) : 'custom'}
                onChange={(e) => {
                  const r = RESOLUTIONS.find((x) => resKey(x) === e.target.value)
                  if (r) setClient(r)
                }}
              >
                {RESOLUTIONS.map((r) => (
                  <option key={resKey(r)} value={resKey(r)}>
                    {r.width}×{r.height}
                  </option>
                ))}
                <option value="custom">{t('deals.stash.res.custom')}</option>
              </select>
            </label>
            <label className="dl-field">
              <span className="ui-field__label">W×H</span>
              <span className="dl-pair">
                <input
                  className="ui-input ui-input--num"
                  inputMode="numeric"
                  value={client.width}
                  onChange={(e) => setClient({ ...client, width: intOr(e.target.value, client.width) })}
                />
                <input
                  className="ui-input ui-input--num"
                  inputMode="numeric"
                  value={client.height}
                  onChange={(e) => setClient({ ...client, height: intOr(e.target.value, client.height) })}
                />
              </span>
            </label>
            <label className="dl-field">
              <span className="ui-field__label">
                {t('deals.stash.col')} / {t('deals.stash.row')}
              </span>
              <span className="dl-pair">
                <input
                  className="ui-input ui-input--num"
                  inputMode="numeric"
                  value={pos.left}
                  onChange={(e) => setPos({ ...pos, left: intOr(e.target.value, pos.left) })}
                />
                <input
                  className="ui-input ui-input--num"
                  inputMode="numeric"
                  value={pos.top}
                  onChange={(e) => setPos({ ...pos, top: intOr(e.target.value, pos.top) })}
                />
              </span>
            </label>
          </div>
          <StashPreview
            client={client}
            pos={pos}
            mode={mode}
            calibration={cal}
            inFolder={inFolder}
          />
        </Box>
      </div>
    </div>
  )
}

function StashPreview({
  client,
  pos,
  mode,
  calibration,
  inFolder
}: {
  client: ClientSize
  pos: StashPos
  mode: StashGridMode
  calibration: StashCalibration | null
  inFolder: boolean
}) {
  const t = useT()
  if (!(client.width > 0 && client.height > 0)) return null
  const cell = stashCellRect(client, pos, { mode, calibration, inFolder })
  const grid = stashGridRect(client, { calibration, inFolder })
  const n = GRID_CELLS[cell?.kind ?? (mode === 'quad' ? 'quad' : 'normal')]
  const ui = uiOffsetX(client)
  const panelW = STASH_GEOMETRY.panelWidth * client.height
  const lines: number[] = Array.from({ length: n - 1 }, (_, i) => i + 1)
  const r = (v: number): number => Math.round(v)

  return (
    <div className="dl-preview">
      <svg viewBox={`0 0 ${client.width} ${client.height}`} className="dl-svg" role="img" aria-label={t('deals.stash.preview')}>
        <rect className="dl-svg__screen" x={0} y={0} width={client.width} height={client.height} />
        {ui > 0 && (
          <>
            <rect className="dl-svg__bars" x={0} y={0} width={ui} height={client.height} />
            <rect className="dl-svg__bars" x={client.width - ui} y={0} width={ui} height={client.height} />
          </>
        )}
        <rect className="dl-svg__panel" x={ui} y={0} width={panelW} height={client.height} />
        <rect className="dl-svg__grid" x={grid.x} y={grid.y} width={grid.width} height={grid.height} />
        {lines.map((i) => (
          <g key={i} className="dl-svg__line">
            <line x1={grid.x + (grid.width * i) / n} y1={grid.y} x2={grid.x + (grid.width * i) / n} y2={grid.y + grid.height} />
            <line x1={grid.x} y1={grid.y + (grid.height * i) / n} x2={grid.x + grid.width} y2={grid.y + (grid.height * i) / n} />
          </g>
        ))}
        {cell && <rect className="dl-svg__hit" x={cell.x} y={cell.y} width={cell.width} height={cell.height} />}
      </svg>
      <div className="dl-muted">
        {cell
          ? t('deals.stash.cell', { x: r(cell.x), y: r(cell.y), w: r(cell.width), h: r(cell.height) })
          : t('deals.stash.outside')}
        {' · '}
        {calibration ? t('deals.stash.mode.calib') : t('deals.stash.mode.auto')}
      </div>
    </div>
  )
}

function CalibrationBox({ client, calibration }: { client: ClientSize; calibration: StashCalibration | null }) {
  const t = useT()
  const patchSettings = useAppStore((s) => s.patchSettings)
  const start = calibration ?? null
  const [tl, setTl] = useState({ x: start?.left ?? 17, y: start?.top ?? 157 })
  const [br, setBr] = useState({
    x: start ? start.left + start.width : 650,
    y: start ? start.top + start.height : 790
  })
  const [msg, setMsg] = useState<{ bad: boolean; text: string } | null>(null)

  const save = (): void => {
    const c = calibrationFromCorners(tl, br, client)
    if (!c) {
      setMsg({ bad: true, text: t('deals.stash.calib.invalid') })
      return
    }
    void patchSettings({ deals: { calibration: c } })
    setMsg({ bad: false, text: t('deals.stash.calib.saved') })
  }

  return (
    <Box title={t('deals.stash.calib.title')} icon="edit">
      <span className="dl-muted">
        {calibration
          ? t('deals.stash.calib.set', {
              w: calibration.refWidth ?? '?',
              h: calibration.refHeight ?? '?',
              gw: calibration.width,
              gh: calibration.height,
              x: calibration.left,
              y: calibration.top
            })
          : t('deals.stash.calib.none')}
      </span>
      <div className="dl-grid2">
        <label className="dl-field">
          <span className="ui-field__label">{t('deals.stash.calib.tl')}</span>
          <span className="dl-pair">
            <input
              className="ui-input ui-input--num"
              inputMode="numeric"
              value={tl.x}
              onChange={(e) => setTl({ ...tl, x: intOr(e.target.value, tl.x) })}
            />
            <input
              className="ui-input ui-input--num"
              inputMode="numeric"
              value={tl.y}
              onChange={(e) => setTl({ ...tl, y: intOr(e.target.value, tl.y) })}
            />
          </span>
        </label>
        <label className="dl-field">
          <span className="ui-field__label">{t('deals.stash.calib.br')}</span>
          <span className="dl-pair">
            <input
              className="ui-input ui-input--num"
              inputMode="numeric"
              value={br.x}
              onChange={(e) => setBr({ ...br, x: intOr(e.target.value, br.x) })}
            />
            <input
              className="ui-input ui-input--num"
              inputMode="numeric"
              value={br.y}
              onChange={(e) => setBr({ ...br, y: intOr(e.target.value, br.y) })}
            />
          </span>
        </label>
      </div>
      <span className="ui-field__help">
        {t('deals.stash.res')}: {client.width}×{client.height}
      </span>
      <div className="dl-row">
        <button type="button" className="ui-btn ui-btn--sm ui-btn--primary" onClick={save}>
          {t('deals.stash.calib.save')}
        </button>
        <button
          type="button"
          className="ui-btn ui-btn--sm ui-btn--ghost"
          disabled={!calibration}
          onClick={() => {
            void patchSettings({ deals: { calibration: null } })
            setMsg(null)
          }}
        >
          {t('deals.stash.calib.reset')}
        </button>
        {msg && <span className={msg.bad ? 'ui-field__error' : 'dl-muted'}>{msg.text}</span>}
      </div>
    </Box>
  )
}
