// СГЕНЕРИРОВАНО tools/regex/build-vendor-data.mjs — не править руками (S27).
// Источник: RePoE fork (mods, stat_translations, base_items, item_classes EN/RU) от 2026-10-19, патч 3.29;
// метки свойств — client_strings APT. Фрагменты проверены на корпусе строк предметов торговца
// (tests/regex/fixtures/vendor-corpus.{en,ru}.json): нет ложных совпадений, кроме вариантов своей строки и also.

import type { VendorData } from './vendorTypes'

export const VENDOR_DATA_META = {
  source: 'RePoE fork (repoe-fork.github.io)',
  date: '2026-10-19',
  patch: '3.29'
}

export const VENDOR_DATA: VendorData = {
  en: {
    mods: {
      life: {
        text: ['+# to maximum Life'],
        pre: '',
        posts: [' to maximum l'],
        digit: '\\d'
      },
      mana: {
        text: ['+# to maximum Mana'],
        pre: '',
        posts: [' to maximum m'],
        digit: '\\d'
      },
      energyShield: {
        text: ['+# to maximum Energy Shield'],
        pre: '',
        posts: [' to maximum ene'],
        digit: '\\d'
      },
      resFire: {
        text: ['+#% to Fire Resistance', '+#% to Fire and Cold Resistances', '+#% to Fire and Lightning Resistances'],
        pre: '\\+',
        posts: ['% to fire and co', '% to fire and l', '% to fire r'],
        digit: '.'
      },
      resCold: {
        text: ['+#% to Cold Resistance', '+#% to Fire and Cold Resistances', '+#% to Cold and Lightning Resistances'],
        pre: '\\+',
        posts: ['% to cold and l', '% to cold r', '% to fire and co'],
        digit: '.'
      },
      resLightning: {
        text: ['+#% to Lightning Resistance', '+#% to Fire and Lightning Resistances', '+#% to Cold and Lightning Resistances'],
        pre: '\\+',
        posts: ['% to cold and l', '% to fire and l', '% to lightning r'],
        digit: '.'
      },
      resChaos: {
        text: ['+#% to Chaos Resistance'],
        pre: '\\+',
        posts: ['% to chaos r'],
        digit: '.'
      },
      resAll: {
        text: ['+#% to all Elemental Resistances'],
        pre: '',
        posts: ['% to all e'],
        digit: '.',
        side: ['minions']
      },
      gemAll: {
        text: ['+# to Level of Socketed Gems', '+# to Level of all Skill Gems'],
        token: 'all sk|l of socketed g'
      },
      gemSpell: {
        text: ['+# to Level of all Spell Skill Gems', '+# to Level of Socketed Spell Gems'],
        token: 'ell g|ll sp'
      },
      gemFire: {
        text: ['+# to Level of Socketed Fire Gems', '+# to Level of all Fire Spell Skill Gems', '+# to Level of all Fire Skill Gems'],
        token: 'l fi|l of socketed f'
      },
      gemCold: {
        text: ['+# to Level of Socketed Cold Gems', '+# to Level of all Cold Spell Skill Gems', '+# to Level of all Cold Skill Gems'],
        token: 'l col|l of socketed co'
      },
      gemLightning: {
        text: ['+# to Level of Socketed Lightning Gems', '+# to Level of all Lightning Spell Skill Gems', '+# to Level of all Lightning Skill Gems'],
        token: 'l lig|l of socketed l'
      },
      gemChaos: {
        text: ['+# to Level of Socketed Chaos Gems', '+# to Level of all Chaos Spell Skill Gems', '+# to Level of all Chaos Skill Gems'],
        token: 'all ch|l of socketed ch'
      },
      gemPhys: {
        text: ['+# to Level of Socketed Physical Gems', '+# to Level of all Physical Spell Skill Gems', '+# to Level of all Physical Skill Gems'],
        token: 'cal g|ll ph'
      },
      gemMinion: {
        text: ['+# to Level of Socketed Minion Gems', '+# to Level of all Minion Skill Gems'],
        token: 'll mi|nion g'
      },
      gemBow: {
        text: ['+# to Level of Socketed Bow Gems'],
        token: 'w g'
      },
      gemMelee: {
        text: ['+# to Level of Socketed Melee Gems'],
        token: 'ee g'
      },
      spellDamage: {
        text: ['#% increased Spell Damage'],
        pre: '',
        posts: ['% increased spell d'],
        digit: '.'
      },
      physDamage: {
        text: ['#% increased Physical Damage'],
        pre: '',
        posts: ['% increased physical d'],
        digit: '.',
        side: ['gems']
      },
      eleAttack: {
        text: ['#% increased Elemental Damage with Attack Skills'],
        pre: '',
        posts: ['% increased elemental damage w'],
        digit: '.'
      },
      addAttackPhys: {
        text: ['Adds # to # Physical Damage to Attacks', 'Adds # to # Physical Damage'],
        token: 'ds \\d+ to \\d+ p',
        also: ['addSpellPhys']
      },
      addAttackFire: {
        text: ['Adds # to # Fire Damage to Attacks', 'Adds # to # Fire Damage'],
        token: 's \\d+ to \\d+ f',
        also: ['addSpellFire']
      },
      addAttackCold: {
        text: ['Adds # to # Cold Damage to Attacks', 'Adds # to # Cold Damage'],
        token: 'ds \\d+ to \\d+ co',
        also: ['addSpellCold']
      },
      addAttackLightning: {
        text: ['Adds # to # Lightning Damage to Attacks', 'Adds # to # Lightning Damage'],
        token: 's \\d+ to \\d+ l',
        also: ['addSpellLightning']
      },
      addAttackChaos: {
        text: ['Adds # to # Chaos Damage to Attacks', 'Adds # to # Chaos Damage'],
        token: 'o \\d+ ch',
        also: ['addSpellChaos']
      },
      addSpellPhys: {
        text: ['Adds # to # Physical Damage to Spells'],
        token: 'l damage to s'
      },
      addSpellFire: {
        text: ['Adds # to # Fire Damage to Spells'],
        token: 'e damage to s'
      },
      addSpellCold: {
        text: ['Adds # to # Cold Damage to Spells'],
        token: 'd damage to s'
      },
      addSpellLightning: {
        text: ['Adds # to # Lightning Damage to Spells'],
        token: 'g damage to s'
      },
      addSpellChaos: {
        text: ['Adds # to # Chaos Damage to Spells'],
        token: 's damage to s'
      },
      moveSpeed: {
        text: ['#% increased Movement Speed'],
        pre: '',
        posts: ['% increased mo'],
        digit: '.',
        side: ['minions']
      },
      attackSpeed: {
        text: ['#% increased Attack Speed'],
        pre: '',
        posts: ['% increased attack s'],
        digit: '.',
        side: ['minions']
      },
      castSpeed: {
        text: ['#% increased Cast Speed'],
        pre: '',
        posts: ['% increased ca'],
        digit: '.',
        side: ['minions']
      },
      critChance: {
        text: ['#% increased Critical Strike Chance', '#% increased Global Critical Strike Chance'],
        pre: '',
        posts: ['% increased cr', '% increased global c'],
        digit: '.',
        side: ['minions']
      },
      str: {
        text: ['+# to Strength', '+# to Strength and Dexterity', '+# to Strength and Intelligence'],
        pre: '',
        posts: [' to s'],
        digit: '\\d'
      },
      dex: {
        text: ['+# to Dexterity', '+# to Strength and Dexterity', '+# to Dexterity and Intelligence'],
        pre: '',
        posts: [' to d', ' to strength and d'],
        digit: '\\d'
      },
      int: {
        text: ['+# to Intelligence', '+# to Strength and Intelligence', '+# to Dexterity and Intelligence'],
        pre: '',
        posts: [' to dexterity a', ' to i', ' to strength and i'],
        digit: '\\d'
      },
      allAttributes: {
        text: ['+# to all Attributes'],
        pre: '',
        posts: [' to al'],
        digit: '\\d'
      }
    },
    classes: {
      boots: ': boo',
      gloves: ': gl',
      helmet: ': hel',
      bodyArmour: ': bod',
      shield: ': shi',
      quiver: ': qui',
      ring: ': ri',
      amulet: ': am',
      belt: ': be',
      wand: ': wan',
      sceptre: ': sc',
      staff: ': stav|: war',
      dagger: ': da|: ru',
      claw: ': cl',
      bow: ': bow',
      sword1h: ': one hand s|: thr',
      axe1h: ': one hand a',
      mace1h: ': one hand m',
      sword2h: ': two hand s',
      axe2h: ': two hand a',
      mace2h: ': two hand m'
    },
    rarity: {
      normal: ': n',
      magic: 'y: m',
      rare: ': ra'
    },
    notItemLevel: 'm level:'
  },
  ru: {
    mods: {
      life: {
        text: ['+# к максимуму здоровья'],
        pre: '',
        posts: [' к максимуму зд'],
        digit: '\\d'
      },
      mana: {
        text: ['+# к максимуму маны'],
        pre: '',
        posts: [' к максимуму м'],
        digit: '\\d'
      },
      energyShield: {
        text: ['+# к максимуму энергетического щита'],
        pre: '',
        posts: [' к максимуму э'],
        digit: '\\d'
      },
      resFire: {
        text: ['+#% к сопротивлению огню', '+#% к сопротивлению огню и холоду', '+#% к сопротивлению огню и молнии'],
        pre: '\\+',
        posts: ['% к сопротивлению о'],
        digit: '.'
      },
      resCold: {
        text: ['+#% к сопротивлению холоду', '+#% к сопротивлению огню и холоду', '+#% к сопротивлению холоду и молнии'],
        pre: '\\+',
        posts: ['% к сопротивлению огню и х', '% к сопротивлению хо'],
        digit: '.'
      },
      resLightning: {
        text: ['+#% к сопротивлению молнии', '+#% к сопротивлению огню и молнии', '+#% к сопротивлению холоду и молнии'],
        pre: '\\+',
        posts: ['% к сопротивлению м', '% к сопротивлению огню и м', '% к сопротивлению холоду и'],
        digit: '.'
      },
      resChaos: {
        text: ['+#% к сопротивлению хаосу'],
        pre: '\\+',
        posts: ['% к сопротивлению ха'],
        digit: '.'
      },
      resAll: {
        text: ['+#% к сопротивлению всем стихиям'],
        pre: '',
        posts: ['% к сопротивлению в'],
        digit: '.',
        side: ['minions']
      },
      gemAll: {
        text: ['+# к уровню размещённых камней', '+# к уровню всех камней умений'],
        token: 'ех камней у|ю размещённых к',
        also: ['gemSpell', 'gemFire', 'gemCold', 'gemLightning', 'gemChaos', 'gemPhys', 'gemMinion', 'gemBow', 'gemMelee'],
        side: ['negative']
      },
      gemSpell: {
        text: ['+# к уровню всех камней умений чар', '+# к уровню размещённых камней чар'],
        token: 'й ча',
        also: ['gemFire', 'gemCold', 'gemLightning', 'gemChaos']
      },
      gemFire: {
        text: ['+# к уровню размещённых камней огня', '+# к уровню всех камней умений чар огня', '+# к уровню всех камней умений огня'],
        token: 'вню.*гн'
      },
      gemCold: {
        text: ['+# к уровню размещённых камней холода', '+# к уровню всех камней умений чар холода', '+# к уровню всех камней умений холода'],
        token: 'вню.*да'
      },
      gemLightning: {
        text: ['+# к уровню размещённых камней молнии', '+# к уровню всех камней умений чар молнии', '+# к уровню всех камней умений молнии'],
        token: 'вню.*ии'
      },
      gemChaos: {
        text: ['+# к уровню размещённых камней хаоса', '+# к уровню всех камней умений чар хаоса', '+# к уровню всех камней умений хаоса'],
        token: 'ню.*са'
      },
      gemPhys: {
        text: ['+# к уровню размещенных физических камней', '+# к уровню всех камней умений физических чар', '+# к уровню всех физических камней умений'],
        token: 'зических'
      },
      gemMinion: {
        text: ['+# к уровню размещённых камней приспешников', '+# к уровню всех камней умений приспешников'],
        token: 'й прис'
      },
      gemBow: {
        text: ['+# к уровню размещённых камней лука'],
        token: 'ей лу'
      },
      gemMelee: {
        text: ['+# к уровню размещённых камней ближнего боя'],
        token: 'ей бл'
      },
      spellDamage: {
        text: ['#% увеличение урона от чар'],
        pre: '',
        posts: ['% увеличение урона от ч'],
        digit: '.'
      },
      physDamage: {
        text: ['#% увеличение физического урона'],
        pre: '',
        posts: ['% увеличение ф'],
        digit: '.'
      },
      eleAttack: {
        text: ['#% увеличение урона от стихий от умений атак'],
        pre: '',
        posts: ['% увеличение урона от стихий о'],
        digit: '.'
      },
      addAttackPhys: {
        text: ['Добавляет от # до # физического урона к атакам', 'Добавляет от # до # физического урона'],
        token: 'яет от \\d+ до \\d+ ф',
        also: ['addSpellPhys']
      },
      addAttackFire: {
        text: ['Добавляет от # до # урона от огня к атакам', 'Добавляет от # до # урона от огня'],
        token: 'ет от.*гн',
        also: ['addSpellFire']
      },
      addAttackCold: {
        text: ['Добавляет от # до # урона от холода к атакам', 'Добавляет от # до # урона от холода'],
        token: 'ба.*ода',
        also: ['addSpellCold']
      },
      addAttackLightning: {
        text: ['Добавляет от # до # урона от молнии к атакам', 'Добавляет от # до # урона от молнии'],
        token: 'т о.*а от м',
        also: ['addSpellLightning']
      },
      addAttackChaos: {
        text: ['Добавляет от # до # урона хаосом к атакам', 'Добавляет от # до # урона хаосом'],
        token: 'о \\d+ урона х',
        also: ['addSpellChaos']
      },
      addSpellPhys: {
        text: ['Добавляет от # до # физического урона к чарам'],
        token: 'на к ч'
      },
      addSpellFire: {
        text: ['Добавляет от # до # урона от огня к чарам'],
        token: 'ет о.*я к ч'
      },
      addSpellCold: {
        text: ['Добавляет от # до # урона от холода к чарам'],
        token: 'да к ч'
      },
      addSpellLightning: {
        text: ['Добавляет от # до # урона от молнии к чарам'],
        token: 'и к ч'
      },
      addSpellChaos: {
        text: ['Добавляет от # до # урона хаосом к чарам'],
        token: 'м к ч'
      },
      moveSpeed: {
        text: ['#% повышение скорости передвижения'],
        pre: '',
        posts: ['% повышение скорости перед'],
        digit: '.',
        side: ['minions']
      },
      attackSpeed: {
        text: ['#% повышение скорости атаки'],
        pre: '',
        posts: ['% повышение скорости а'],
        digit: '.',
        side: ['minions']
      },
      castSpeed: {
        text: ['#% повышение скорости сотворения чар'],
        pre: '',
        posts: ['% повышение скорости со'],
        digit: '.',
        side: ['minions']
      },
      critChance: {
        text: ['#% повышение шанса критического удара', '#% повышение глобального шанса критического удара'],
        pre: '',
        posts: ['% повышение глобальног', '% повышение ш'],
        digit: '.',
        side: ['minions']
      },
      str: {
        text: ['+# к силе', '+# к силе и ловкости', '+# к силе и интеллекту'],
        pre: '',
        posts: [' к с'],
        digit: '\\d'
      },
      dex: {
        text: ['+# к ловкости', '+# к силе и ловкости', '+# к ловкости и интеллекту'],
        pre: '',
        posts: [' к л', ' к силе и л'],
        digit: '\\d'
      },
      int: {
        text: ['+# к интеллекту', '+# к силе и интеллекту', '+# к ловкости и интеллекту'],
        pre: '',
        posts: [' к ин', ' к ловкости и', ' к силе и и'],
        digit: '\\d'
      },
      allAttributes: {
        text: ['+# ко всем характеристикам'],
        pre: '',
        posts: [' ко'],
        digit: '\\d'
      }
    },
    classes: {
      boots: ': .бу',
      gloves: ': .ерч',
      helmet: ': .ле',
      bodyArmour: ': .оспе',
      shield: ': .ит',
      quiver: ': .олч',
      ring: ': .ольц',
      amulet: ': .му',
      belt: ': .оя',
      wand: ': .ез',
      sceptre: ': .ки',
      staff: ': .осо|: .ои',
      dagger: ': .ин|: .ун',
      claw: ': .огт',
      bow: ': .ук',
      sword1h: ': .дноручные м|: .п',
      axe1h: ': .дноручные т',
      mace1h: ': .дноручные б',
      sword2h: ': .вуручные м',
      axe2h: ': .вуручные т',
      mace2h: ': .вуручные б'
    },
    rarity: {
      normal: ': .бы',
      magic: 'ь: .о',
      rare: ': .ед'
    },
    notItemLevel: 'ь предмета:'
  }
}
