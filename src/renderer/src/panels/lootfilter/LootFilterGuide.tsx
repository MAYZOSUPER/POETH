// «Как включить в игре» (S53): схема окна настроек игры (SVG, цвета — токены через классы) и шаги словами.
// Схема — не снимок экрана игры: условные рамки с подписями на языке интерфейса POETH.

type T = (key: string, params?: Record<string, string | number>) => string

function Step({ n, x, y }: { n: number; x: number; y: number }) {
  return (
    <g className="lf-svg__step" aria-hidden="true">
      <circle cx={x} cy={y} r={9} />
      <text x={x} y={y + 4} textAnchor="middle">
        {n}
      </text>
    </g>
  )
}

export function LootFilterGuide({ t, file, onLadder }: { t: T; file: string; onLadder: () => void }) {
  return (
    <div className="lf-guide">
      <svg className="lf-svg" viewBox="0 0 520 150" role="img" aria-label={t('lf.svg.alt')}>
        {/* 1: Esc */}
        <rect className="lf-svg__key" x={8} y={46} width={58} height={34} rx={6} />
        <text className="lf-svg__keytext" x={37} y={68} textAnchor="middle">
          Esc
        </text>
        <Step n={1} x={14} y={40} />
        <path className="lf-svg__arrow" d="M70 63 H92" />
        <path className="lf-svg__arrowhead" d="M92 58 L99 63 L92 68 Z" />

        {/* окно настроек игры */}
        <rect className="lf-svg__frame" x={104} y={10} width={408} height={130} rx={8} />
        <text className="lf-svg__title" x={118} y={30}>
          {t('lf.svg.options')}
        </text>

        {/* 2: вкладка «Игра» */}
        <rect className="lf-svg__tab" x={118} y={40} width={56} height={20} rx={4} />
        <rect className="lf-svg__tab lf-svg__tab--on" x={180} y={40} width={80} height={20} rx={4} />
        <text className="lf-svg__tabtext" x={220} y={54} textAnchor="middle">
          {t('lf.svg.game')}
        </text>
        <rect className="lf-svg__tab" x={266} y={40} width={56} height={20} rx={4} />
        <Step n={2} x={262} y={38} />

        {/* 3: «Фильтр предметов» и файл */}
        <text className="lf-svg__label" x={118} y={94}>
          {t('lf.svg.filter')}
        </text>
        <rect className="lf-svg__drop" x={238} y={78} width={202} height={24} rx={4} />
        <text className="lf-svg__file" x={246} y={94}>
          {file}
        </text>
        <path className="lf-svg__chev" d="M426 87 L431 93 L436 87" />
        <Step n={3} x={238} y={76} />

        {/* 4: перезагрузить */}
        <rect className="lf-svg__btn" x={448} y={78} width={30} height={24} rx={4} />
        <path className="lf-svg__reload" d="M469 86 A6 6 0 1 0 469 94" />
        <path className="lf-svg__reloadhead" d="M466 82 L471 86 L466 89 Z" />
        <text className="lf-svg__hint" x={463} y={122} textAnchor="middle">
          {t('lf.svg.reload')}
        </text>
        <Step n={4} x={484} y={76} />
      </svg>
      <ol className="lf-guide__steps small">
        <li>{t('lf.guide.1')}</li>
        <li>{t('lf.guide.2')}</li>
        <li>{t('lf.guide.3', { file })}</li>
        <li>{t('lf.guide.4')}</li>
      </ol>
      <div className="small muted">
        {t('lf.guide.alt')}{' '}
        <button type="button" className="ui-btn ui-btn--sm ui-btn--ghost lf-inline" onClick={onLadder}>
          {t('lf.guide.ladder')} ↗
        </button>
      </div>
    </div>
  )
}
