// Inline SVG fallback compass mark (used until the user drops brand PNGs in
// resources/brand/). Uses currentColor so it inherits the gold theme color.

export function CompassMark({ size = 64 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className="compass-mark" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="2.5">
        <circle cx="50" cy="50" r="36" opacity="0.85" />
        <circle cx="50" cy="50" r="27" opacity="0.4" />
      </g>
      {/* diagonal short rays */}
      <g fill="currentColor" opacity="0.5">
        <polygon points="50,50 68,32 55,45" />
        <polygon points="50,50 32,32 45,45" />
        <polygon points="50,50 68,68 55,55" />
        <polygon points="50,50 32,68 45,55" />
      </g>
      {/* cardinal long rays */}
      <g fill="currentColor" opacity="0.9">
        <polygon points="50,8 55,48 50,52 45,48" />
        <polygon points="50,92 55,52 50,48 45,52" />
        <polygon points="8,50 48,45 52,50 48,55" />
        <polygon points="92,50 52,45 48,50 52,55" />
      </g>
      {/* central blade */}
      <polygon points="50,12 58,50 50,88 42,50" fill="currentColor" />
      {/* red gem */}
      <polygon points="50,33 57,50 50,67 43,50" fill="#bf3a2c" stroke="#7d2017" strokeWidth="1.5" />
    </svg>
  )
}
