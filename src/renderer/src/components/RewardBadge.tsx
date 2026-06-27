import type { Reward, RewardKind } from '@shared/types'

const LABEL: Record<RewardKind, string> = {
  passive_point: 'Очко пассивных умений',
  skill_point: 'Очко умения',
  weapon_set_point: 'Очко набора оружия',
  spirit: 'Дух (Spirit)',
  resistance: 'Сопротивление',
  attribute: 'Атрибут',
  life: 'Максимум жизни',
  mana: 'Мана',
  charm_slot: 'Чарм',
  uncut_gem: 'Необработанный камень умения',
  support_gem: 'Камень поддержки',
  skill_gem: 'Камень умения',
  crafting: 'Крафт',
  unique_item: 'Уникальный предмет',
  currency: 'Валюта',
  ring_or_amulet: 'Кольцо / амулет',
  other: ''
}

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
  const cls = PERMANENT.has(reward.kind) ? 'badge perm' : GEM.has(reward.kind) ? 'badge gem' : 'badge other'
  return (
    <span className={cls} title={LABEL[reward.kind] || reward.value}>
      {reward.value}
      {reward.swappable ? ' ⤿' : ''}
    </span>
  )
}
