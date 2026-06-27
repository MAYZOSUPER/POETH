import { useAppStore } from '../store/useAppStore'
import { LayoutViewerPanel } from './LayoutViewerPanel'
import { CompassMark } from '../components/CompassMark'
import { BrandImg } from '../components/BrandImg'

export function RightPanel() {
  const dataset = useAppStore((s) => s.dataset)
  const selectedZoneAreaId = useAppStore((s) => s.selectedZoneAreaId)

  const zone = dataset?.acts.flatMap((a) => a.zones).find((z) => z.areaId === selectedZoneAreaId)
  const hasLayout = !!zone?.layout && !!dataset?.layouts[zone.layout]

  if (selectedZoneAreaId && hasLayout) {
    return (
      <div className="rightpane">
        <LayoutViewerPanel />
      </div>
    )
  }

  return (
    <div className="rightpane empty">
      <BrandImg file="big_compass.png" className="big-compass" fallback={<CompassMark size={200} />} />
      <div className="empty-tag">
        Track your path.
        <br />
        Never miss a quest.
      </div>
      <BrandImg file="divider.png" className="empty-divider-img" fallback={<div className="empty-divider">✦</div>} />
    </div>
  )
}
