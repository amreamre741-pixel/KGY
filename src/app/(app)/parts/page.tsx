import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { can, getActiveStoreId, requireUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { findExactPart, listParts, PAGE_SIZE, stockStatus } from "@/lib/parts";
import { formatInt, partName, yearRange } from "@/lib/format";
import SearchBar from "@/components/SearchBar";
import { IconPlus } from "@/components/icons";
import PartsTable, { type PartRow } from "./PartsTable";

export const metadata: Metadata = { title: "السلعة" };

type SP = Promise<{ q?: string; low?: string; page?: string; scan?: string }>;

export default async function PartsPage({ searchParams }: { searchParams: SP }) {
  const user = await requireUser();
  const { t, lang } = await getI18n();
  const sp = await searchParams;
  const q = (sp.q ?? "").slice(0, 120);
  const lowOnly = sp.low === "1";
  const page = Math.max(1, Number(sp.page) || 1);
  const storeId = await getActiveStoreId(user);

  // A scanned code that matches exactly one part opens it directly.
  if (sp.scan === "1" && q) {
    const id = await findExactPart(q);
    if (id) redirect(`/parts/${id}`);
  }

  const { total, parts } = await listParts({ q, storeId, lowOnly, page });
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const rows: PartRow[] = parts.map((p) => {
    const qty = p.stocks.reduce((a, s) => a + s.quantity, 0);
    const statuses = p.stocks.map((s) => stockStatus(s.quantity, s.minQuantity));
    const status = p.stocks.length === 0 || qty <= 0 ? "out" : statuses.includes("low") || statuses.includes("out") ? "low" : "ok";
    return {
      id: p.id,
      name: partName(p, lang),
      reference: p.reference,
      brand: p.brand,
      category: p.category ? (lang === "en" && p.category.nameEn ? p.category.nameEn : p.category.nameAr) : "",
      vehicles: p.compat.map((c) => ({
        type: c.type,
        label: [c.make, c.model, yearRange(c.yearFrom, c.yearTo)].filter(Boolean).join(" "),
      })),
      moreVehicles: Math.max(0, p._count.compat - p.compat.length),
      quantity: qty,
      status,
      location: storeId ? (p.stocks[0]?.location ?? "") : "",
      salePrice: Number(p.salePrice),
      imageUrl: p.imageUrl,
    };
  });

  const pageHref = (n: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (lowOnly) params.set("low", "1");
    if (n > 1) params.set("page", String(n));
    return `/parts${params.size ? `?${params}` : ""}`;
  };

  const lowToggleHref = (() => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (!lowOnly) params.set("low", "1");
    return `/parts${params.size ? `?${params}` : ""}`;
  })();

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t.parts.title}</h1>
          <p className="sub">
            <span className="num">{formatInt(total)}</span> {t.parts.results}
          </p>
        </div>
        {can.editParts(user) && (
          <div className="page-head-actions">
            <Link href="/parts/new" className="btn btn-primary" id="new-part-btn">
              <IconPlus />
              {t.parts.newPart}
            </Link>
          </div>
        )}
      </div>

      <div className="stack">
        <SearchBar key={q} defaultValue={q} keep={lowOnly ? { low: "1" } : {}} />
        <div className="row">
          <Link href={lowToggleHref} className={`btn btn-sm ${lowOnly ? "btn-navy" : "btn-secondary"}`} id="low-filter">
            {t.parts.lowOnly}
          </Link>
        </div>
      </div>

      <PartsTable rows={rows} showLocation={Boolean(storeId)} hasQuery={Boolean(q) || lowOnly} />

      {pages > 1 && (
        <nav className="row spread" aria-label="pagination">
          <span className="muted small">
            {t.common.page} <span className="num">{page}</span> {t.common.of} <span className="num">{pages}</span>
          </span>
          <div className="row">
            {page > 1 && (
              <Link className="btn btn-secondary btn-sm" href={pageHref(page - 1)}>
                {t.common.previous}
              </Link>
            )}
            {page < pages && (
              <Link className="btn btn-secondary btn-sm" href={pageHref(page + 1)}>
                {t.common.next}
              </Link>
            )}
          </div>
        </nav>
      )}
    </>
  );
}
