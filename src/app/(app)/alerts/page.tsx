import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { getActiveStoreId, requireUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { outOfStockWhere, runningLowWhere } from "@/lib/parts";
import { formatInt, partName } from "@/lib/format";
import { IconAlert, IconCheck, IconClipboard, IconPin, IconRuler, IconStore } from "@/components/icons";

export const metadata: Metadata = { title: "تنبيهات المخزون والنواقص" };

type Props = {
  searchParams: Promise<{ tab?: string }>;
};

export default async function AlertsPage({ searchParams }: Props) {
  const user = await requireUser();
  const { t, lang } = await getI18n();
  const sp = await searchParams;
  const storeId = await getActiveStoreId(user);

  const tab = sp.tab === "low" ? "low" : sp.tab === "all" ? "all" : "out";

  const [outRows, lowRows, currentStore] = await Promise.all([
    db.stock.findMany({
      where: outOfStockWhere(storeId),
      orderBy: [{ part: { updatedAt: "desc" } }],
      take: 200,
      include: {
        store: { select: { id: true, name: true } },
        part: {
          select: {
            id: true,
            nameAr: true,
            nameEn: true,
            reference: true,
            brand: true,
            dimensions: true,
          },
        },
      },
    }),
    db.stock.findMany({
      where: runningLowWhere(storeId),
      orderBy: [{ quantity: "asc" }],
      take: 200,
      include: {
        store: { select: { id: true, name: true } },
        part: {
          select: {
            id: true,
            nameAr: true,
            nameEn: true,
            reference: true,
            brand: true,
            dimensions: true,
          },
        },
      },
    }),
    storeId ? db.store.findUnique({ where: { id: storeId }, select: { name: true } }) : Promise.resolve(null),
  ]);

  const tabHref = (nextTab: string) => `/alerts?tab=${nextTab}`;

  const renderSection = (kind: "out" | "low", list: typeof outRows) => {
    const isOut = kind === "out";
    return (
      <section className="card">
        <div className="card-head">
          <div className="row" style={{ gap: 8 }}>
            <IconAlert style={{ width: 20, height: 20, color: isOut ? "var(--danger)" : "var(--warn)" }} />
            <h2>{isOut ? t.alerts.outTab : t.alerts.lowTab}</h2>
          </div>
          <span className={`badge num ${isOut ? "badge-out" : "badge-low"}`}>{formatInt(list.length)}</span>
        </div>

        {list.length === 0 ? (
          <div className="empty">
            <div className="empty-icon" style={{ background: "var(--ok-bg)", color: "var(--ok)" }}>
              <IconCheck />
            </div>
            <span>{isOut ? t.alerts.emptyOut : t.alerts.emptyLow}</span>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table responsive">
              <thead>
                <tr>
                  <th>{t.parts.name}</th>
                  <th>{isOut ? t.alerts.emptiedStore : t.alerts.lowStore}</th>
                  <th className="end">{t.parts.quantity}</th>
                  <th className="end">{t.common.actions}</th>
                </tr>
              </thead>
              <tbody>
                {list.map((row) => (
                  <tr key={row.id}>
                    <td className="cell-main">
                      <Link href={`/parts/${row.part.id}`} className="part-name">
                        {partName(row.part, lang)}
                      </Link>
                      <div className="part-sub">
                        <span className="ref">{row.part.reference}</span>
                        {row.part.brand && <span className="badge">{row.part.brand}</span>}
                        {row.part.dimensions && (
                          <span className="chip mono" dir="ltr">
                            <IconRuler />
                            {row.part.dimensions}
                          </span>
                        )}
                        {row.location && (
                          <span className="chip">
                            <IconPin />
                            {row.location}
                          </span>
                        )}
                      </div>
                    </td>

                    <td data-label={isOut ? t.alerts.emptiedStore : t.alerts.lowStore}>
                      <span className={`badge ${isOut ? "badge-out" : "badge-low"}`} style={{ fontSize: "0.84rem" }}>
                        <IconStore width={13} height={13} />
                        {row.store.name}
                      </span>
                    </td>

                    <td className="end num" data-label={t.parts.quantity}>
                      <span className={`badge num ${isOut ? "badge-out" : "badge-low"}`}>
                        {row.quantity}
                        {row.minQuantity > 0 ? ` / ${row.minQuantity}` : ""}
                      </span>
                    </td>

                    <td className="end" data-label={t.common.actions}>
                      <div className="row" style={{ gap: 6, justifyContent: "flex-end" }}>
                        <Link
                          href={`/order-notes?part=${encodeURIComponent(partName(row.part, lang))}&ref=${encodeURIComponent(row.part.dimensions ? `${row.part.reference} (${row.part.dimensions})` : row.part.reference)}`}
                          className="btn btn-navy btn-sm"
                        >
                          <IconClipboard />
                          {t.alerts.orderNow}
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    );
  };

  return (
    <div className="stack fade-in">
      <div className="page-head">
        <div>
          <div className="row" style={{ gap: 8 }}>
            <h1>{t.alerts.title}</h1>
            {currentStore && (
              <span className="badge badge-orange" style={{ fontSize: "0.85rem", padding: "4px 10px" }}>
                <IconStore width={14} height={14} />
                {currentStore.name}
              </span>
            )}
          </div>
          <p className="hint" style={{ marginTop: 4 }}>
            {t.alerts.subtitle}
          </p>
        </div>
        <div className="page-head-actions">
          <Link href="/order-notes" className="btn btn-primary">
            <IconClipboard />
            {t.nav.orderNotes}
          </Link>
        </div>
      </div>

      <section className="card card-pad row spread">
        <div className="report-pills">
          <Link href={tabHref("out")} className={`report-pill ${tab === "out" ? "is-active" : ""}`}>
            {t.alerts.outTab} ({formatInt(outRows.length)})
          </Link>
          <Link href={tabHref("low")} className={`report-pill ${tab === "low" ? "is-active" : ""}`}>
            {t.alerts.lowTab} ({formatInt(lowRows.length)})
          </Link>
          <Link href={tabHref("all")} className={`report-pill ${tab === "all" ? "is-active" : ""}`}>
            {t.alerts.allTab} ({formatInt(outRows.length + lowRows.length)})
          </Link>
        </div>
      </section>

      {(tab === "out" || tab === "all") && renderSection("out", outRows)}
      {(tab === "low" || tab === "all") && renderSection("low", lowRows)}
    </div>
  );
}

