import type { ReactNode } from 'react'
import type { RegexLang, VendorModKey } from '@shared/types'
import { VENDOR_MOD_KEYS, isThresholdMod, vendorModText } from '@shared/regex'
import { useT } from '../../i18n'
import './vendor.css'

// Свойства предметов (S27) — общий блок «Торговца» и «Предметов» (S46): жизнь, сопротивления, «+ к уровню
// камней», урон, скорость, характеристики. Пороги — строка «подпись ≥ число %», без порога — чипы; в подсказке
// строки — текст мода на языке клиента игры. Подписи — ключи regex.vendor.*.

export type PropGroup = { id: string; num?: VendorModKey[]; chips?: VendorModKey[] }

/** Группы свойств экспертного режима (подписи — regex.vendor.group.<id>). */
export const PROP_GROUPS: PropGroup[] = [
  { id: 'defence', num: ['life', 'mana', 'energyShield'] },
  { id: 'res', num: ['resFire', 'resCold', 'resLightning', 'resChaos', 'resAll'] },
  {
    id: 'gems',
    chips: ['gemAll', 'gemSpell', 'gemFire', 'gemCold', 'gemLightning', 'gemChaos', 'gemPhys', 'gemMinion', 'gemBow', 'gemMelee']
  },
  { id: 'damage', num: ['spellDamage', 'physDamage', 'eleAttack'] },
  { id: 'addAttack', chips: ['addAttackPhys', 'addAttackFire', 'addAttackCold', 'addAttackLightning', 'addAttackChaos'] },
  { id: 'addSpell', chips: ['addSpellPhys', 'addSpellFire', 'addSpellCold', 'addSpellLightning', 'addSpellChaos'] },
  { id: 'speed', num: ['moveSpeed', 'attackSpeed', 'castSpeed', 'critChance'] },
  { id: 'attributes', num: ['str', 'dex', 'int', 'allAttributes'] }
]

/** Простой режим: то, что ищут на прокачке и в начале лиги. */
export const SIMPLE_PROP_GROUPS: PropGroup[] = [
  { id: 'main', num: ['moveSpeed', 'life'] },
  { id: 'res', num: ['resFire', 'resCold', 'resLightning', 'resAll'] },
  PROP_GROUPS[2]
]

/** Свойства, которые видны в простом режиме (остальные выбранные — строкой «Ещё выбрано»). */
const SIMPLE_KEYS = new Set<VendorModKey>(SIMPLE_PROP_GROUPS.flatMap((g) => [...(g.num ?? []), ...(g.chips ?? [])]))

/** Короткая подпись внутри группы: стихия или тип камня (полное имя — в подсказке и «что убрать»). */
const CHIP: Partial<Record<VendorModKey, string>> = {
  gemAll: 'regex.vendor.chip.all',
  gemSpell: 'regex.vendor.chip.spell',
  gemFire: 'regex.vendor.el.fire',
  gemCold: 'regex.vendor.el.cold',
  gemLightning: 'regex.vendor.el.lightning',
  gemChaos: 'regex.vendor.el.chaos',
  gemPhys: 'regex.vendor.el.phys',
  gemMinion: 'regex.vendor.chip.minion',
  gemBow: 'regex.vendor.chip.bow',
  gemMelee: 'regex.vendor.chip.melee',
  addAttackPhys: 'regex.vendor.el.phys',
  addAttackFire: 'regex.vendor.el.fire',
  addAttackCold: 'regex.vendor.el.cold',
  addAttackLightning: 'regex.vendor.el.lightning',
  addAttackChaos: 'regex.vendor.el.chaos',
  addSpellPhys: 'regex.vendor.el.phys',
  addSpellFire: 'regex.vendor.el.fire',
  addSpellCold: 'regex.vendor.el.cold',
  addSpellLightning: 'regex.vendor.el.lightning',
  addSpellChaos: 'regex.vendor.el.chaos',
  // в группе «Сопротивления» — короткие подписи
  resFire: 'regex.vendor.el.fire',
  resCold: 'regex.vendor.el.cold',
  resLightning: 'regex.vendor.el.lightning',
  resChaos: 'regex.vendor.el.chaos',
  resAll: 'regex.vendor.short.resAll'
}

/** Порог в процентах (иначе — просто число: здоровье, характеристики). */
export function isPercentProp(lang: RegexLang, key: VendorModKey): boolean {
  return vendorModText(lang, key).every((l) => l.includes('#%'))
}

/** Строки мода в игре — подсказка «что именно ищем». */
export function propGameText(lang: RegexLang, key: VendorModKey): string {
  return vendorModText(lang, key).join(' · ')
}

/**
 * Группы свойств: values — ключ → порог (у чипов 1), onSet(key, 0) — снять. В простом режиме — короткий набор
 * и строка «Ещё выбрано» для остальных выбранных. gemsExtra — свой чип в начале группы «+ к уровню камней».
 */
export function PropGroups({
  values,
  onSet,
  simple,
  lang,
  idPrefix,
  gemsExtra
}: {
  values: Partial<Record<VendorModKey, number>>
  onSet: (key: VendorModKey, n: number) => void
  simple: boolean
  lang: RegexLang
  idPrefix: string
  gemsExtra?: ReactNode
}) {
  const t = useT()
  const modName = (key: VendorModKey): string => t(`regex.vendor.mod.${key}`)
  const selected = VENDOR_MOD_KEYS.filter((k) => (values[k] ?? 0) > 0)
  const hidden = selected.filter((k) => !SIMPLE_KEYS.has(k))

  // порог: подпись | ≥ | число | %; пусто — свойство не ищем
  const numRow = (key: VendorModKey) => (
    <div key={key} className="rx-v-row" title={propGameText(lang, key)}>
      <label htmlFor={`${idPrefix}-${key}`}>{t(CHIP[key] ?? `regex.vendor.mod.${key}`)}</label>
      <span className="rx-v-unit">≥</span>
      <input
        id={`${idPrefix}-${key}`}
        className="ui-input ui-input--num"
        type="number"
        min={0}
        max={999}
        value={values[key] || ''}
        placeholder="—"
        onChange={(e) => {
          const n = Math.round(Number(e.target.value))
          onSet(key, Number.isFinite(n) ? Math.max(0, Math.min(999, n)) : 0)
        }}
      />
      <span className="rx-v-unit">{isPercentProp(lang, key) ? '%' : ''}</span>
    </div>
  )
  const chip = (key: VendorModKey) => (
    <button
      key={key}
      type="button"
      className="ui-chip"
      aria-pressed={(values[key] ?? 0) > 0}
      title={propGameText(lang, key)}
      onClick={() => onSet(key, (values[key] ?? 0) > 0 ? 0 : 1)}
    >
      {t(CHIP[key] ?? `regex.vendor.mod.${key}`)}
    </button>
  )
  const group = (g: PropGroup) => (
    <div key={g.id} className="rx-v-group">
      <span className="ui-label">{t(`regex.vendor.group.${g.id}`)}</span>
      {g.num && <div className="rx-v-nums">{g.num.map(numRow)}</div>}
      {g.chips && (
        <div className="ui-chips">
          {g.id === 'gems' && gemsExtra}
          {g.chips.map(chip)}
        </div>
      )}
    </div>
  )

  return (
    <>
      {(simple ? SIMPLE_PROP_GROUPS : PROP_GROUPS).map(group)}
      {simple && hidden.length > 0 && (
        <div className="rx-v-group">
          <span className="ui-label">{t('regex.vendor.moreSelected')}</span>
          <div className="ui-chips">
            {hidden.map((k) => (
              <button
                key={k}
                type="button"
                className="ui-chip"
                aria-pressed
                title={`${propGameText(lang, k)} — ${t('regex.vendor.moreSelectedTip')}`}
                onClick={() => onSet(k, 0)}
              >
                {isThresholdMod(k) ? `${modName(k)} ≥ ${values[k]}${isPercentProp(lang, k) ? '%' : ''}` : modName(k)}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
