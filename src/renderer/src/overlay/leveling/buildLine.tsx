import type { GuideBuildLine } from '@shared/build/view'
import { Icon } from '../Icon'
import { useOverlayT } from '../useOverlayT'

// Строка «Билд: …» в шаге гида прокачки (S39, макет v0.2, раздел 2); что показывать — buildGuide.ts.

export function BuildLines({ lines, simple }: { lines: GuideBuildLine[]; simple: boolean }) {
  const t = useOverlayT()
  return (
    <>
      {lines.map((l) => (
        <div key={`${l.kind}-${l.gem.gemId}`} className="lv-item is-gem lv-build">
          <Icon name={l.kind === 'quest' ? 'gem' : 'coins'} />
          <div>
            <span className="ui-tag">{t('bd.guide.tag')}</span>
            <b>{t(l.kind === 'quest' ? 'bd.guide.quest' : 'bd.guide.buy', { gem: l.name, npc: l.npc })}</b>
            {simple && <span> {t(l.kind === 'quest' ? 'bd.guide.why.quest' : 'bd.guide.why.buy')}</span>}
          </div>
        </div>
      ))}
    </>
  )
}
