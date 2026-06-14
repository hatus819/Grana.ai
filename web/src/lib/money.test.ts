import { describe, it, expect } from 'vitest'
import { parseAmount, formatBRL } from './money'

describe('parseAmount', () => {
  it('parses a positive decimal string', () => {
    expect(parseAmount('8500.00')).toBe(8500)
  })

  it('parses a negative decimal string', () => {
    expect(parseAmount('-54.90')).toBe(-54.9)
  })

  it('returns 0 for empty string', () => {
    expect(parseAmount('')).toBe(0)
  })

  it('returns NaN for a non-numeric string', () => {
    expect(Number.isNaN(parseAmount('not-a-number'))).toBe(true)
  })
})

describe('formatBRL', () => {
  it('formats a negative number as BRL currency with regular space', () => {
    // NOTE: Intl.NumberFormat may insert a non-breaking space (U+00A0) or
    // narrow-no-break-space (U+202F) between "R$" and digits.
    // The implementation MUST normalize to a regular ASCII space.
    expect(formatBRL(-54.9)).toBe('-R$ 54,90')
  })

  it('formats a positive number as BRL currency with regular space', () => {
    expect(formatBRL(8500)).toBe('R$ 8.500,00')
  })
})
