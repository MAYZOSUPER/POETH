import { useState, type ReactNode } from 'react'

/**
 * Renders a brand asset PNG from resources/brand/ (served via poe2img://brand/).
 * If the file isn't present (user hasn't dropped it yet) it shows `fallback`.
 */
export function BrandImg({
  file,
  alt,
  className,
  fallback
}: {
  file: string
  alt?: string
  className?: string
  fallback: ReactNode
}) {
  const [failed, setFailed] = useState(false)
  if (failed) return <>{fallback}</>
  return (
    <img
      src={`poe2img://brand/${encodeURIComponent(file)}`}
      alt={alt ?? ''}
      className={className}
      onError={() => setFailed(true)}
    />
  )
}
