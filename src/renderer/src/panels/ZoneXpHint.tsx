import { useEffect, useState } from 'react'
import type { TailerStatus, ZoneEvent } from '@shared/types'
import { zoneXp } from '@shared/leveling/zoneXp'
import { useAppStore } from '../store/useAppStore'
import { useLang, useT } from '../i18n'
import { Ico } from './regex/Ico'
import { zoneXpHintText } from './zoneXpHintText'
import './zoneXpHint.css'

// Подсказка компаса PoE 2 «Эта зона даёт ~40 % опыта — идите дальше по маршруту» (S64, Б2). Штраф опыта за
// разницу уровней — @shared/leveling/zoneXp (у PoE 2 степень 1,3; полоса без штрафа не подтверждена — экспертная
// строка это говорит). Уровень персонажа — как у компаса (progress.level, строки «is now level» журнала);
// уровень и id области — из той же строки журнала, что зона компаса (`Generating level N area "<id>"`: событие
// zoneChange и tailer.status). Пропсы, если переданы, важнее (карточка зоны может дать свои значения).
// Ничего не пишет и никуда не ходит; штрафа нет (или он мал в простом режиме) — ничего не рисует.

export interface ZoneXpHintProps {
  /** id области из журнала (`g1_4`, `mapcrypt`…); по умолчанию — последняя зона журнала */
  areaId?: string | null
  /** уровень области; по умолчанию — из строки журнала */
  areaLevel?: number | null
  /** уровень персонажа; по умолчанию — как в компасе (progress.level) */
  playerLevel?: number | null
  className?: string
}

/** Последняя зона журнала: id и уровень области (S64: logTailer передаёт areaLevel). */
function useLogZone(): { areaId?: string; areaLevel?: number } {
  const [zone, setZone] = useState<{ areaId?: string; areaLevel?: number }>({})
  useEffect(() => {
    const api = window.overlayApi
    let alive = true
    void api.tailer
      .status()
      .then((s: TailerStatus) => {
        if (alive && s.areaId) setZone((z) => (z.areaId ? z : { areaId: s.areaId, areaLevel: s.areaLevel }))
      })
      .catch(() => undefined)
    const off = api.onZoneChange((e: ZoneEvent) => {
      // строка [SCENE] без id не меняет уровень: подсказка держится за последнюю область с уровнем
      if (e.areaId) setZone({ areaId: e.areaId, areaLevel: e.areaLevel })
    })
    return () => {
      alive = false
      off()
    }
  }, [])
  return zone
}

export function ZoneXpHint({ areaId, areaLevel, playerLevel, className = '' }: ZoneXpHintProps) {
  const t = useT()
  const lang = useLang()
  const game = useAppStore((s) => s.settings?.game ?? 'poe2')
  const simple = useAppStore((s) => s.settings?.ui.simpleMode ?? true)
  const charLevel = useAppStore((s) => s.progress?.level ?? null)
  const log = useLogZone()

  const id = areaId ?? log.areaId
  const area = areaLevel ?? log.areaLevel
  const player = playerLevel ?? charLevel
  if (!id || !area || !player) return null
  const x = zoneXp(id, area, player, simple, false, game)
  if (!x) return null
  const { main, extra } = zoneXpHintText(x, t, lang === 'en' ? 'en' : 'ru', game)
  return (
    <div className={`zxh zxh--${x.kind} ${className}`.trim()} role="status" title={t('lev.p2xp.hint')}>
      <Ico name={x.kind === 'high' ? 'warn' : 'info'} />
      <span>
        {main}
        {!simple && <span className="zxh__extra"> ({extra})</span>}
      </span>
    </div>
  )
}
