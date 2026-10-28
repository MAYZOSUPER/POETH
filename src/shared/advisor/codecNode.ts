// Сжатие кода POETH1 в Node (zlib): main, тесты и инструменты (tools/advisor). В renderer не импортировать.

import { deflateSync, inflateSync } from 'zlib'
import { CodeTooLargeError, decodeStrategyCode, encodeStrategy, type DecodeResult } from './codec'
import type { AdvisorStrategy } from '../types/advisor'

export function deflateNode(bytes: Uint8Array): Uint8Array {
  return new Uint8Array(deflateSync(bytes, { level: 9 }))
}

/** inflate с пределом размера: больше — CodeTooLargeError (zlib прерывает распаковку сам). */
export function inflateNode(bytes: Uint8Array, maxBytes: number): Uint8Array {
  try {
    return new Uint8Array(inflateSync(bytes, { maxOutputLength: maxBytes }))
  } catch (e) {
    if ((e as { code?: string }).code === 'ERR_BUFFER_TOO_LARGE' || e instanceof RangeError) throw new CodeTooLargeError()
    throw e
  }
}

export const encodeStrategyNode = (s: AdvisorStrategy): Promise<string> => encodeStrategy(s, deflateNode)
export const decodeStrategyNode = (input: string): Promise<DecodeResult> => decodeStrategyCode(input, inflateNode)
