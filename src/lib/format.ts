import type { Lang } from "./i18n/dict";

const numberFmt = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const intFmt = new Intl.NumberFormat("fr-FR");

/** Algerian dinar, Latin digits: "12 500,00 DA" / "12 500,00 دج" */
export function formatDA(value: number | string | { toString(): string }, lang: Lang): string {
  const n = typeof value === "number" ? value : Number(value.toString());
  return `${numberFmt.format(Number.isFinite(n) ? n : 0)} ${lang === "ar" ? "دج" : "DA"}`;
}

export function formatInt(n: number): string {
  return intFmt.format(n);
}

export function formatDateTime(d: Date, lang: Lang): string {
  return new Intl.DateTimeFormat(lang === "ar" ? "ar-DZ-u-nu-latn" : "en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

/** Part name in the current language (falls back to Arabic). */
export function partName(p: { nameAr: string; nameEn?: string | null }, lang: Lang): string {
  return lang === "en" && p.nameEn ? p.nameEn : p.nameAr;
}

export function yearRange(from: number | null, to: number | null): string {
  if (from && to) return from === to ? `${from}` : `${from}–${to}`;
  if (from) return `${from}+`;
  if (to) return `–${to}`;
  return "";
}
