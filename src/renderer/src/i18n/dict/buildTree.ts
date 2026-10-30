// Строки домена «дерево этапа поверх игры» (S38): плашка этапа, легенда, подсказки калибровки. Имена нод —
// из данных дерева на языке клиента игры, не отсюда.

import type { DomainDict } from '../types'

export const buildTree: DomainDict = {
  ru: {
    'set.hk.buildTree': 'Билд: дерево этапа поверх игры (откройте дерево пассивок)',
    'bt.stage': 'Этап {i} из {n}',
    'bt.stage.auto': 'по уровню',
    'bt.prev': 'Прошлый этап',
    'bt.next': 'Следующий этап',
    'bt.center': 'В центр',
    'bt.center.tip': 'Снова считать, что круг класса — в центре окна (как сразу после входа в игру)',
    'bt.close': 'Спрятать (Esc)',
    'bt.legend.take': 'взять {n}',
    'bt.legend.taken': 'взято {n}',
    'bt.legend.remove': 'снять {n}',
    'bt.hint.align': 'Не совпадает? Наведите курсор на круг класса и нажмите колесо мыши. Не совпал размер — сначала отдалите дерево колесом до упора.',
    'bt.hint.version': 'Билд для дерева {v}, в игре {d}: часть нод могла сместиться.',
    'bt.hint.missing': 'Нет на дереве: {n}',
    'bt.problem.no-build': 'Билд не выбран: вставьте код Path of Building во вкладке «Билд».',
    'bt.problem.no-stages': 'В этом билде нет деревьев пассивок.',
    'bt.problem.no-data': 'Не удалось загрузить данные дерева пассивок.',
    'bt.problem.no-game': 'Окно игры не найдено.'
  },
  en: {
    'set.hk.buildTree': 'Build: stage tree over the game (open the passive tree)',
    'bt.stage': 'Stage {i} of {n}',
    'bt.stage.auto': 'by level',
    'bt.prev': 'Previous stage',
    'bt.next': 'Next stage',
    'bt.center': 'Center',
    'bt.center.tip': 'Assume the class circle is in the middle of the window again (as right after logging in)',
    'bt.close': 'Hide (Esc)',
    'bt.legend.take': 'take {n}',
    'bt.legend.taken': 'taken {n}',
    'bt.legend.remove': 'remove {n}',
    'bt.hint.align': 'Not lined up? Hover the class circle and press the mouse wheel. Size off too? Zoom the tree all the way out first.',
    'bt.hint.version': 'The build is for tree {v}, the game has {d}: some nodes may have moved.',
    'bt.hint.missing': 'Not on the tree: {n}',
    'bt.problem.no-build': 'No build selected: paste a Path of Building code in the Build tab.',
    'bt.problem.no-stages': 'This build has no passive trees.',
    'bt.problem.no-data': 'Could not load the passive tree data.',
    'bt.problem.no-game': 'Game window not found.'
  }
}
