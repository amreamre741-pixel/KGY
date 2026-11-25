import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { can, getActiveStoreId, requireUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { findExactPart, listParts, PAGE_SIZE, stockStatus } from "@/lib/parts";
import { formatInt, partName, yearRange } from "@/lib/format";
import SearchBar from "@/components/SearchBar";
import { IconPlus, IconStore } from "@/components/icons";
import PartsTable, { type PartRow } from "./PartsTable";

export const metadata: Metadata = { title: "السلعة" };

type SP = Promise<{ q?: string; low?: string; out?: string; all?: string; page?: string; scan?: string }>;

export default async function PartsPage({ searchParams }: { searchParams: SP }) {
  const user = await requireUser();
  const { t, lang } = await getI18n();
  const sp = await searchParams;
  const q = (sp.q ?? "").slice(0, 120);
  const lowOnly = sp.low === "1";
  const outOnly = sp.out === "1";
  const page = Math.max(1, Number(sp.page) || 1);
  const storeId = await getActiveStoreId(user);

  // A scanned code that matches exactly one part in this store opens it directly.
  if (sp.scan === "1" && q) {
    const id = await findExactPart(q, storeId);
    if (id) redirect(`/parts/${id}`);
  }

  const [{ total, parts }, activeStoresCount, currentStore] = await Promise.all([
    listParts({ q, storeId, lowOnly, outOnly, page }),
    db.store.count({ where: { active: true } }),
    storeId ? db.store.findUnique({ where: { id: storeId }, select: { name: true } }) : Promise.resolve(null),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const rows: PartRow[] = parts.map((p) => {
    const relevantStocks = storeId ? p.stocks.filter((s) => s.storeId === storeId) : p.stocks;
    const qty = relevantStocks.reduce((a, s) => a + s.quantity, 0);
    const statuses = relevantStocks.map((s) => stockStatus(s.quantity, s.minQuantity));
    const status =
      relevantStocks.length === 0 || qty <= 0
        ? "out"
        : statuses.includes("low") || statuses.includes("out")
          ? "low"
          : "ok";

    return {
      id: p.id,
      name: partName(p, lang),
      reference: p.reference,
      brand: p.brand,
      category: p.category ? (lang === "en" && p.category.nameEn ? p.category.nameEn : p.category.nameAr) : "",
      dimensions: p.dimensions,
      vehicles: p.compat.map((c) => ({
        type: c.type,
        label: [c.make, c.model, yearRange(c.yearFrom, c.yearTo)].filter(Boolean).join(" "),
      })),
      moreVehicles: Math.max(0, p._count.compat - p.compat.length),
      quantity: qty,
      status,
      location: storeId ? (relevantStocks[0]?.location ?? "") : "",
      salePrice: Number(p.salePrice),
      imageUrl: p.imageUrl,
      storeStocks: [],
    };
  });

  const pageHref = (n: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (lowOnly) params.set("low", "1");
    if (outOnly) params.set("out", "1");
    if (n > 1) params.set("page", String(n));
    return `/parts${params.size ? `?${params}` : ""}`;
  };

  const lowToggleHref = (() => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (!lowOnly) params.set("low", "1");
    return `/parts${params.size ? `?${params}` : ""}`;
  })();

  const outToggleHref = (() => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (!outOnly) params.set("out", "1");
    return `/parts${params.size ? `?${params}` : ""}`;
  })();

  return (
    <>
      <div className="page-head">
        <div>
          <div className="row" style={{ gap: 8 }}>
            <h1>{t.parts.title}</h1>
            {currentStore && (
              <span className="badge badge-orange" style={{ fontSize: "0.85rem", padding: "4px 10px" }}>
                <IconStore width={14} height={14} />
                {currentStore.name}
              </span>
            )}
          </div>
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
        <SearchBar
          key={q}
          defaultValue={q}
          keep={lowOnly ? { low: "1" } : outOnly ? { out: "1" } : {}}
        />
        <div className="row">
          <Link href={lowToggleHref} className={`btn btn-sm ${lowOnly ? "btn-navy" : "btn-secondary"}`} id="low-filter">
            {t.parts.lowOnly}
          </Link>
          <Link href={outToggleHref} className={`btn btn-sm ${outOnly ? "btn-navy" : "btn-secondary"}`} id="out-filter">
            {t.parts.outOnly}
          </Link>
        </div>
      </div>

      <PartsTable
        rows={rows}
        showLocation={Boolean(storeId)}
        hasQuery={Boolean(q) || lowOnly || outOnly}
        canEdit={can.editParts(user)}
        canDelete={user.role === "OWNER"}
        canTransfer={can.editParts(user) && activeStoresCount >= 2}
      />

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
