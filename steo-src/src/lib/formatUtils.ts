/**
 * Format Utilities - Safe formatting functions for odds and numbers
 * 
 * Prevents toFixed errors when values are null, undefined, or NaN
 * Use these helpers throughout the codebase for consistent and safe formatting
 */

/**
 * Safe odds formatting - prevents toFixed errors
 * @param odds The odds value to format (can be null, undefined, or number)
 * @returns Formatted string with 2 decimal places or '-' if invalid
 */
export function formatOdds(odds: number | null | undefined): string {
  if (odds == null || typeof odds !== 'number' || isNaN(odds)) return '-';
  return odds.toFixed(2);
}

/**
 * Safe percentage formatting
 * @param value The percentage value to format (can be null, undefined, or number)
 * @returns Formatted string with % suffix or '--' if invalid
 */
export function formatPercent(value: number | null | undefined): string {
  if (value == null || typeof value !== 'number' || isNaN(value)) return '--';
  return `${Math.round(value)}%`;
}

/**
 * Safe number formatting with custom decimals
 * @param value The number value to format (can be null, undefined, or number)
 * @param decimals Number of decimal places (default: 2)
 * @returns Formatted string or '--' if invalid
 */
export function formatNumber(value: number | null | undefined, decimals: number = 2): string {
  if (value == null || typeof value !== 'number' || isNaN(value)) return '--';
  return value.toFixed(decimals);
}

/**
 * Safe probability formatting (0-1 range to percentage)
 * @param prob Probability value between 0 and 1
 * @returns Formatted percentage string or '--' if invalid
 */
export function formatProbability(prob: number | null | undefined): string {
  if (prob == null || typeof prob !== 'number' || isNaN(prob)) return '--';
  return `${Math.round(prob * 100)}%`;
}

/**
 * Format odds display string (e.g., "1.50 | 3.25 | 2.10")
 * @param oddsHome Home team odds
 * @param oddsDraw Draw odds (can be null for sports without draws)
 * @param oddsAway Away team odds
 * @returns Formatted odds string
 */
export function formatOddsDisplay(
  oddsHome: number | null | undefined,
  oddsDraw: number | null | undefined,
  oddsAway: number | null | undefined
): string {
  const home = formatOdds(oddsHome);
  const away = formatOdds(oddsAway);
  
  if (oddsDraw != null && typeof oddsDraw === 'number' && !isNaN(oddsDraw)) {
    return `${home} | ${formatOdds(oddsDraw)} | ${away}`;
  }
  
  return `${home} | ${away}`;
}

/**
 * Safe string conversion for display
 * @param value Any value to convert to string safely
 * @param fallback Fallback string if value is null/undefined
 * @returns String representation or fallback
 */
export function safeString(value: unknown, fallback: string = '-'): string {
  if (value == null) return fallback;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && !isNaN(value)) return String(value);
  return fallback;
}

/**
 * Check if a value is a valid number
 * @param value Value to check
 * @returns True if value is a valid number (not null, undefined, or NaN)
 */
export function isValidNumber(value: unknown): value is number {
  return value != null && typeof value === 'number' && !isNaN(value);
}

/**
 * Safe number with fallback
 * @param value Value to convert to number
 * @param fallback Fallback value if conversion fails
 * @returns Number or fallback
 */
export function safeNumber(value: unknown, fallback: number = 0): number {
  if (value == null) return fallback;
  if (typeof value === 'number' && !isNaN(value)) return value;
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    return isNaN(parsed) ? fallback : parsed;
  }
  return fallback;
}

// Export default object
const formatUtils = {
  formatOdds,
  formatPercent,
  formatNumber,
  formatProbability,
  formatOddsDisplay,
  safeString,
  isValidNumber,
  safeNumber,
};

export default formatUtils;
