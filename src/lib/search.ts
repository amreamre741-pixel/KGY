/** Uppercase, keep only letters and digits: "1K0 615-301.AA" -> "1K0615301AA" */
export function normalizeRef(value: string): string {
  return value.toUpperCase().replace(/[^\p{L}\p{N}]/gu, "");
}

/** Splits a search query into terms (removes empty pieces). */
export function searchTerms(q: string): string[] {
  return q
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
