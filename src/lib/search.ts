/** Uppercase, keep only letters and digits: "1K0 615-301.AA" -> "1K0615301AA" */
export function normalizeRef(value: string): string {
  return value.toUpperCase().replace(/[^\p{L}\p{N}]/gu, "");
}

/**
 * Normalizes part measurements / millimeter sizes so mechanics can search flexibly:
 * - "30 * 62 * 16 مم" -> "30x62x16"
 * - "30×62×16 mm" -> "30x62x16"
 * - "M12 x 1,5" -> "m12x1.5"
 * - "12mm" -> "12"
 */
export function normalizeDim(value: string): string {
  return value
    .toLowerCase()
    .replace(/,/g, ".")
    .replace(/(?:مم|ملم|ملي|mm)\b/gi, "")
    .replace(/\s*[×*xX/\\-]\s*/g, "x")
    .replace(/\s+/g, "")
    .replace(/^x+|x+$/g, "");
}

/** Splits a search query into terms, collapsing "30 * 62" or "30 x 62" into "30x62" first. */
export function searchTerms(q: string): string[] {
  const collapsed = q.replace(/(\d+(?:[.,]\d+)?)\s*[×*xX]\s*(\d+(?:[.,]\d+)?)/g, "$1x$2");
  return collapsed
    .trim()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 6);
}

export function asYear(term: string): number | null {
  if (!/^\d{4}$/.test(term)) return null;
  const y = Number(term);
  return y >= 1950 && y <= 2100 ? y : null;
}
