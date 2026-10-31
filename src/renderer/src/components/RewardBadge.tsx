import type { Reward, RewardKind } from '@shared/types'
import type { IconName } from '../overlay/Icon'
import { useLang, useT, formatReward } from '../i18n'
import { ShellIcon } from './ShellIcon'

// Награда квеста — .ui-reward: цвет всегда вместе со значком и словом (docs/design-system.md).
const KIND: Partial<Record<RewardKind, [IconName, string]>> = {
  passive_point: ['passive', 'passive'],
  skill_point: ['passive', 'passive'],
  weapon_set_point: ['passive', 'passive'],
  spirit: ['shield', 'trial'],
  resistance: ['shield', 'trial'],
  attribute: ['shield', 'trial'],
  life: ['shield', 'trial'],
  mana: ['shield', 'trial'],
  charm_slot: ['flask', 'flask'],
  uncut_gem: ['gem', 'gem'],
  support_gem: ['gem', 'gem'],
  skill_gem: ['gem', 'gem']
}

export function RewardBadge({ reward }: { reward: Reward }) {
  const lang = useLang()
  const t = useT()
  const [icon, tone] = KIND[reward.kind] ?? ['coins', '']
  return (
    <span className={`ui-reward${tone ? ` ui-reward--${tone}` : ''}`} title={reward.value}>
      <ShellIcon name={icon} />
      {formatReward(reward, lang)}
      {reward.swappable && <span className="cp-swap"> · {t('q.swap')}</span>}
    </span>
  )
}
