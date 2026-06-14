/**
 * Parse a DRF decimal string (e.g. "8500.00", "-54.90") to a JS number.
 * Returns 0 for empty/null input; NaN for non-numeric strings.
 */
export function parseAmount(s: string): number {
  if (!s) return 0
  return parseFloat(s)
}

const _brlFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

/**
 * Format a number as Brazilian Real (BRL).
 * Normalizes any non-breaking space (U+00A0) or narrow-no-break space (U+202F)
 * between the currency symbol and digits to a regular ASCII space.
 */
export function formatBRL(n: number): string {
  return _brlFormatter.format(n).replace(/[\u00A0\u202F]/g, ' ')
}
