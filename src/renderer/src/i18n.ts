import { useAppStore } from './store/useAppStore'
import type { Reward, UiLang } from '@shared/types'

// Interface language. Game zone/boss/quest names always stay English (they must
// match the English game client), so they are NOT translated here — only our own
// UI chrome, hints framing, reward descriptions and layout types are.

type Dict = Record<string, string>

const RU: Dict = {
  // toolbar
  'tb.auto': 'Авто',
  'tb.auto.title': 'Автоопределение зоны из лога игры (Client.txt)',
  'tb.lock.title': 'Сквозной режим: все клики идут в игру (Ctrl+Shift+L)',
  'tb.settings.title': 'Настройки',
  'tb.min.title': 'Свернуть',
  'tb.hide.title': 'Скрыть оверлей (Ctrl+Shift+O чтобы вернуть)',
  // profile bar
  'pf.addName': 'Имя нового персонажа',
  'pf.newName': 'Новое имя',
  'pf.ok': 'OK',
  'pf.cancel': 'Отмена',
  'pf.add': 'Новый персонаж',
  'pf.rename': 'Переименовать / изменить класс',
  'pf.class': 'Класс персонажа',
  'pf.noClass': '— класс —',
  'pf.delete': 'Удалить',
  'pf.confirmDelete': 'Удалить «{name}»?',
  'pf.export': 'Экспорт профиля в файл',
  'pf.import': 'Импорт профиля из файла',
  'pf.exported': '✓ Сохранено',
  'pf.imported': '✓ Профиль импортирован',
  'pf.importInvalid': '⚠ Неверный файл профиля',
  // act tabs
  'act.short': 'АКТ {n}',
  'int.short': 'ИНТ {n}',
  'act.level': 'Ур.',
  'act.levelTitle': 'Уровень персонажа',
  // zone banner
  'zb.waiting': 'ожидание входа в зону…',
  'zb.level': 'ур. {n}',
  // view toggle
  'vt.whatsnext': 'Что дальше?',
  'vt.checklist': 'Чек-лист',
  // rewards summary
  'rw.head': 'Награды · пассивки {a}/{b}',
  'rw.passive': 'Очки пассивок',
  'rw.weapon': 'Очки набора оружия',
  'rw.spirit': 'Дух',
  'rw.cold': '❄ Холод',
  'rw.fire': '🔥 Огонь',
  'rw.light': '⚡ Молния',
  // what's next
  'wn.head': 'Что дальше? · {i}/{n}',
  'wn.prev': 'Назад (Ctrl+Shift+[)',
  'wn.next': 'Вперёд (Ctrl+Shift+])',
  'wn.here': '📍 Вы сейчас здесь',
  'wn.backtrack': '📍 Вернуться к вашей текущей зоне',
  'wn.passthrough': 'Проходная зона — просто двигайся дальше.',
  'wn.mandatory': '⚔ Обязательно',
  'wn.optional': '✦ Необязательно',
  'wn.nextLabel': 'Дальше',
  'wn.go': 'Перейти →',
  // checklist / quest row
  'cl.head': 'Квесты — {act}',
  'q.map': '🗺 карта',
  'q.req': 'обяз',
  'q.opt': 'опц',
  // gems
  'gem.head': 'Камни умений',
  'gem.headEarly': 'Камни умений — ранние умения',
  'gem.skills': 'Умения:',
  'gem.supports': 'Поддержки:',
  'gem.carryover': 'Камни финального акта — билд к этому моменту уже сформирован.',
  // layout viewer
  'lv.title': 'Лейаут: {name}',
  'lv.close': 'Закрыть',
  'lv.loading': 'Загрузка лейаута…',
  'lv.unavailable': 'Лейаут недоступен (нужен интернет при первом показе).',
  'lv.rotateNote': 'Инстанс может быть повёрнут/отзеркален — ориентируйся на форму.',
  // settings
  'set.title': 'Настройки',
  'set.lang': 'Язык интерфейса',
  'set.nameLang': 'Язык названий (зоны и боссы)',
  'set.nameLang.note': 'Английские названия совпадают с EN-клиентом игры.',
  'set.opacity': 'Прозрачность',
  'set.taskbar': 'Показывать на панели задач',
  'set.windowedHint':
    'Игра должна работать в режиме «Окно» или «Окно без рамки». В эксклюзивном полноэкранном режиме оверлей не отображается.',
  'set.hotkeys': 'Горячие клавиши',
  'set.hk.toggle': 'Показать/скрыть',
  'set.hk.lock': 'Блокировка кликов',
  'set.hk.prev': 'Пред. зона',
  'set.hk.next': 'След. зона',
  'set.hk.press': 'Нажмите сочетание…',
  'set.hk.conflict': '⚠ Это сочетание уже занято',
  'set.hk.reset': 'Сбросить',
  'set.hk.hint': 'Клик — изменить · Esc — отмена',
  'set.auto': 'Автоопределение зоны (Client.txt)',
  'set.auto.read': 'Читать лог игры (подсветка текущей зоны и уровня)',
  'set.auto.found': '✓ Лог найден: {path}',
  'set.auto.notfound': '⚠ Client.txt не найден — укажите файл вручную',
  'set.auto.off': 'Выключено',
  'set.auto.pick': 'Указать Client.txt…',
  'set.auto.advance': 'Авто-переход к текущей зоне',
  'set.auto.note':
    'Подсвечивает зону и уровень из лога (безопасно, только чтение). Завершение квестов всегда отмечается вручную — в игре нет такого сигнала.',
  'set.data': 'Данные',
  'set.data.version': 'Версия данных: {label}',
  'set.data.schema': 'Схема {schema} · актов: {acts}',
  'set.disclaimer':
    'Неофициальный фанатский инструмент. Не связан с Grinding Gear Games. Path of Exile 2 и все ассеты © GGG.',
  // layout types
  'layout.linear': 'Линейная',
  'layout.open': 'Открытая',
  'layout.branching': 'Ветвящаяся',
  'layout.maze': 'Лабиринт',
  'layout.spiral': 'Спираль',
  'layout.dungeon': 'Подземелье'
}

const EN: Dict = {
  'tb.auto': 'Auto',
  'tb.auto.title': 'Auto-detect the current zone from the game log (Client.txt)',
  'tb.lock.title': 'Click-through: all clicks go to the game (Ctrl+Shift+L)',
  'tb.settings.title': 'Settings',
  'tb.min.title': 'Minimize',
  'tb.hide.title': 'Hide overlay (Ctrl+Shift+O to bring it back)',
  'pf.addName': 'New character name',
  'pf.newName': 'New name',
  'pf.ok': 'OK',
  'pf.cancel': 'Cancel',
  'pf.add': 'New character',
  'pf.rename': 'Rename / change class',
  'pf.class': 'Character class',
  'pf.noClass': '— class —',
  'pf.delete': 'Delete',
  'pf.confirmDelete': 'Delete “{name}”?',
  'pf.export': 'Export profile to a file',
  'pf.import': 'Import profile from a file',
  'pf.exported': '✓ Saved',
  'pf.imported': '✓ Profile imported',
  'pf.importInvalid': '⚠ Invalid profile file',
  'act.short': 'ACT {n}',
  'int.short': 'INT {n}',
  'act.level': 'Lv.',
  'act.levelTitle': 'Character level',
  'zb.waiting': 'waiting to enter a zone…',
  'zb.level': 'lv. {n}',
  'vt.whatsnext': "What's Next",
  'vt.checklist': 'Checklist',
  'rw.head': 'Rewards · skill pts {a}/{b}',
  'rw.passive': 'Skill points',
  'rw.weapon': 'Weapon-set points',
  'rw.spirit': 'Spirit',
  'rw.cold': '❄ Cold',
  'rw.fire': '🔥 Fire',
  'rw.light': '⚡ Lightning',
  'wn.head': "What's Next · {i}/{n}",
  'wn.prev': 'Back (Ctrl+Shift+[)',
  'wn.next': 'Forward (Ctrl+Shift+])',
  'wn.here': '📍 You are here',
  'wn.backtrack': '📍 Back to your current zone',
  'wn.passthrough': 'Pass-through zone — just keep moving.',
  'wn.mandatory': '⚔ Mandatory',
  'wn.optional': '✦ Optional',
  'wn.nextLabel': 'Next',
  'wn.go': 'Go →',
  'cl.head': 'Quests — {act}',
  'q.map': '🗺 map',
  'q.req': 'req',
  'q.opt': 'opt',
  'gem.head': 'Skill gems',
  'gem.headEarly': 'Skill gems — early skills',
  'gem.skills': 'Skills:',
  'gem.supports': 'Supports:',
  'gem.carryover': 'Final-act gems — your build is essentially set by now.',
  'lv.title': 'Layout: {name}',
  'lv.close': 'Close',
  'lv.loading': 'Loading layout…',
  'lv.unavailable': 'Layout unavailable (needs internet on first view).',
  'lv.rotateNote': 'Your instance may be rotated/mirrored — match the shape, not the orientation.',
  'set.title': 'Settings',
  'set.lang': 'Interface language',
  'set.nameLang': 'Names language (zones & bosses)',
  'set.nameLang.note': 'English names match the English game client.',
  'set.opacity': 'Opacity',
  'set.taskbar': 'Show on the taskbar',
  'set.windowedHint':
    'The game must run in Windowed or Windowed Fullscreen. Exclusive fullscreen hides the overlay.',
  'set.hotkeys': 'Hotkeys',
  'set.hk.toggle': 'Show / hide',
  'set.hk.lock': 'Click-through lock',
  'set.hk.prev': 'Prev zone',
  'set.hk.next': 'Next zone',
  'set.hk.press': 'Press a key combo…',
  'set.hk.conflict': '⚠ That combo is already used',
  'set.hk.reset': 'Reset',
  'set.hk.hint': 'Click to change · Esc to cancel',
  'set.auto': 'Zone auto-detect (Client.txt)',
  'set.auto.read': 'Read the game log (highlight current zone and level)',
  'set.auto.found': '✓ Log found: {path}',
  'set.auto.notfound': '⚠ Client.txt not found — pick the file manually',
  'set.auto.off': 'Off',
  'set.auto.pick': 'Choose Client.txt…',
  'set.auto.advance': 'Auto-jump to the current zone',
  'set.auto.note':
    'Highlights the zone and level from the log (safe, read-only). Quest completion is always marked manually — the game has no signal for it.',
  'set.data': 'Data',
  'set.data.version': 'Data version: {label}',
  'set.data.schema': 'Schema {schema} · acts: {acts}',
  'set.disclaimer':
    'Unofficial fan-made tool. Not affiliated with Grinding Gear Games. Path of Exile 2 and all assets © GGG.',
  'layout.linear': 'Linear',
  'layout.open': 'Open',
  'layout.branching': 'Branching',
  'layout.maze': 'Maze',
  'layout.spiral': 'Spiral',
  'layout.dungeon': 'Dungeon'
}

const DICT: Record<UiLang, Dict> = { ru: RU, en: EN }

export function translate(
  lang: UiLang,
  key: string,
  params?: Record<string, string | number>
): string {
  let s = DICT[lang]?.[key] ?? RU[key] ?? key
  if (params) for (const k of Object.keys(params)) s = s.replace(`{${k}}`, String(params[k]))
  return s
}

export function useLang(): UiLang {
  return useAppStore((s) => s.settings?.uiLang ?? 'ru')
}

export function useT(): (key: string, params?: Record<string, string | number>) => string {
  const lang = useLang()
  return (key, params) => translate(lang, key, params)
}

export function layoutLabel(lang: UiLang, type: string): string {
  return translate(lang, `layout.${type}`)
}

/** Normalize an English name for the EN->RU name map lookup. */
export function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[’'`]/g, '')
    .replace(/[^a-z0-9а-яё]+/gi, ' ')
    .trim()
}

/** Returns a localizer for game zone/boss names based on the nameLang setting. */
export function useName(): (en: string) => string {
  const nameLang = useAppStore((s) => s.settings?.nameLang ?? 'en')
  const namesRu = useAppStore((s) => s.dataset?.namesRu)
  return (en: string) => {
    if (nameLang === 'ru' && en) {
      const ru = namesRu?.[norm(en)]
      if (ru) return ru
    }
    return en
  }
}

const RES_RU: Record<string, string> = {
  cold: 'холоду',
  fire: 'огню',
  lightning: 'молнии',
  chaos: 'хаосу'
}

/** Localize a reward description. English mode keeps the canonical value. */
export function formatReward(r: Reward, lang: UiLang): string {
  if (lang === 'en') return r.value
  const n = r.numeric
  switch (r.kind) {
    case 'passive_point':
    case 'skill_point':
      return `+${n ?? ''} очк. умений`.replace('+ ', '+')
    case 'weapon_set_point':
      return `+${n ?? ''} очк. набора оружия`.replace('+ ', '+')
    case 'spirit':
      return `+${n ?? ''} духа`.replace('+ ', '+')
    case 'resistance': {
      const v = r.value.toLowerCase()
      const el =
        (Object.keys(RES_RU).find((k) => v.includes(k)) &&
          RES_RU[Object.keys(RES_RU).find((k) => v.includes(k)) as string]) ||
        ''
      return `+${n ?? ''}% сопр. ${el}`.trim()
    }
    case 'life':
      return r.value.includes('%') ? `+${n}% к макс. жизни` : `+${n} к макс. жизни`
    case 'uncut_gem':
      return 'Необраб. камень'
    case 'support_gem':
      return 'Камень поддержки'
    case 'skill_gem':
      return 'Камень умения'
    case 'charm_slot':
      return 'Чарм'
    default:
      return r.value
  }
}
