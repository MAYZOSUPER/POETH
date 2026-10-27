import type { NetError } from '@shared/types'

// Текст ошибки сети трейда (шлюз S3) для UI прайс-чека/live (S4/S6):
// `t(...netErrorText(err))`. Для rate-limited — секунды до повтора (обратный отсчёт —
// забота виджета: пересчитывать от retryAfterMs).

export function netErrorText(err: NetError): [key: string, params?: Record<string, number>] {
  if (err.code === 'rate-limited') {
    return err.retryAfterMs !== undefined
      ? ['net.err.rate-limited', { sec: Math.max(1, Math.ceil(err.retryAfterMs / 1000)) }]
      : ['net.err.rate-limited.nosec']
  }
  return [`net.err.${err.code}`]
}
