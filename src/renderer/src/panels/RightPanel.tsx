import { useAppStore } from '../store/useAppStore'
import { LayoutViewerPanel } from './LayoutViewerPanel'

/**
 * Схема выбранной зоны над «Наградами» в правой колонке компаса. На узкой вкладке (одна колонка) .cp-layout —
 * окно поверх вкладки с затемнением (campaign.css). Без выбранной зоны — ничего: декоративный компас и
 * EN-слоган старой правой колонки убраны (макет PoE 2 v1).
 */
export function RightPanel() {
  const dataset = useAppStore((s) => s.dataset)
  const selectedZoneAreaId = useAppStore((s) => s.selectedZoneAreaId)

  const zone = dataset?.acts.flatMap((a) => a.zones).find((z) => z.areaId === selectedZoneAreaId)
  const hasLayout = !!zone?.layout && !!dataset?.layouts[zone.layout]
  if (!selectedZoneAreaId || !hasLayout) return null

  return (
    <div className="cp-layout">
      <LayoutViewerPanel />
    </div>
  )
}
