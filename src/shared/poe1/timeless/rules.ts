// Правила «лучшего гнезда» timeless-самоцветов (S45) — коротко и проверяемо:
//  - Militant Faith: сумма Преданности в радиусе (атрибутные ноды +10, прочие мелкие и не заменённые нотаблы +5);
//    заменённые храмовые нотаблы — заметки, самые ходовые первыми.
//  - остальные: «тема» — набор исходов одного назначения (двойной урон, крит, приспешники…); счёт гнезда — сколько
//    нотаблов в радиусе получили исход этой темы. Лучшее гнездо — где тема набрала больше всего.
// Это мерка, а не цена: что ценно для конкретного билда, решает игрок (калькулятор Vilsol, PoB). Исходы
// без темы в счёт не идут.

import type { TimelessDataKind } from './data'

export interface TimelessTheme {
  /** ключ темы: строка интерфейса `pc1.tl.theme.<id>` */
  id: string
  /** id исходов темы (как в данных, без префикса самоцвета — см. `outcomeKey`) */
  outcomes: readonly string[]
}

export type TimelessRule =
  | { metric: 'devotion'; stat: string; /** заменённые нотаблы по убыванию спроса */ notable: readonly string[] }
  | { metric: 'themes'; themes: readonly TimelessTheme[] }

/** `karui_notable_add_double_damage` → `double_damage`, `eternal_notable_crit_1` → `crit_1`, `kalguur_notable_17` → `17` */
export function outcomeKey(id: string): string {
  return id.replace(/^(?:karui|maraketh|templar|eternal|kalguur)_notable_(?:add_)?/, '')
}

export const TIMELESS_RULES: Record<TimelessDataKind, TimelessRule> = {
  LP: {
    metric: 'themes',
    themes: [
      { id: 'dd', outcomes: ['double_damage'] },
      { id: 'life', outcomes: ['life', 'life_regen'] },
      { id: 'meleeCrit', outcomes: ['melee_crit_multi', 'melee_crit_chance'] },
      { id: 'phys', outcomes: ['physical_damage', 'melee_damage', 'physical_added_as_fire'] },
      { id: 'str', outcomes: ['strength', 'percent_strength'] }
    ]
  },
  BR: {
    metric: 'themes',
    themes: [
      { id: 'speed', outcomes: ['speed'] },
      { id: 'life', outcomes: ['life'] },
      { id: 'crit', outcomes: ['global_crit_chance'] },
      { id: 'elem', outcomes: ['elemental_damage', 'physical_added_as_cold'] },
      { id: 'minion', outcomes: ['minion_damage', 'minion_movement_speed'] },
      { id: 'aura', outcomes: ['aura_effect'] },
      { id: 'dex', outcomes: ['dexterity', 'percent_dexterity'] }
    ]
  },
  MF: {
    metric: 'devotion',
    stat: 'base_devotion',
    notable: [
      'max_resistances',
      'additional_physical_reduction',
      'minimum_power_charge',
      'minimum_frenzy_charge',
      'minimum_endurance_charge',
      'mana_added_as_energy_shield',
      'arcane_surge',
      'consecrated_ground_ailments',
      'fire_conversion',
      'cold_conversion',
      'lightning_conversion',
      'fire_exposure',
      'cold_exposure',
      'lightning_exposure'
    ]
  },
  EH: {
    metric: 'themes',
    themes: [
      { id: 'crit', outcomes: ['crit_1', 'crit_2', 'spell_2', 'power_1'] },
      { id: 'spell', outcomes: ['spell_1', 'spell_2', 'cast_speed_1'] },
      {
        id: 'attack',
        outcomes: ['physical_damage_1', 'physical_damage_2', 'fire_attack_1', 'cold_attack_1', 'lightning_attack_1', 'projectile_attack_damage_1', 'attack_speed_1', 'bleed_damage_1']
      },
      { id: 'minion', outcomes: ['minion_1', 'minion_2'] },
      { id: 'defence', outcomes: ['life_1', 'block_1', 'block_2', 'dodge_2', 'armour_1', 'evasion_1'] },
      { id: 'aura', outcomes: ['aura_1', 'rarity_1'] },
      { id: 'charges', outcomes: ['endurance_3', 'frenzy_3', 'power_3', 'endurance_1', 'frenzy_1'] }
    ]
  },
  HT: {
    metric: 'themes',
    themes: [
      { id: 'ward', outcomes: ['17', '18', '19', '20', '21', '23', '9', '10', '11'] },
      { id: 'aura', outcomes: ['14'] },
      { id: 'block', outcomes: ['15', '16'] },
      { id: 'pen', outcomes: ['13'] }
    ]
  }
}
