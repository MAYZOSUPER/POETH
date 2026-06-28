import type { Reward, RewardKind } from '@shared/types'
import { useLang, formatReward } from '../i18n'

const PERMANENT = new Set<RewardKind>([
  'passive_point',
  'skill_point',
  'weapon_set_point',
  'spirit',
  'resistance',
  'attribute',
  'life',
  'mana',
  'charm_slot'
])
const GEM = new Set<RewardKind>(['uncut_gem', 'support_gem', 'skill_gem'])

export function RewardBadge({ reward }: { reward: Reward }) {
  const lang = useLang()
  const cls = PERMANENT.has(reward.kind) ? 'badge perm' : GEM.has(reward.kind) ? 'badge gem' : 'badge other'
  return (
    <span className={cls} title={reward.value}>
      {formatReward(reward, lang)}
      {reward.swappable ? ' ⤿' : ''}
    </span>
  )
}
