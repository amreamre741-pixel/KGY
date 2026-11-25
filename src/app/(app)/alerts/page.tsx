import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { can, getActiveStoreId, requireUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { outOfStockWhere, runningLowWhere } from "@/lib/parts";
import { formatInt, partName } from "@/lib/format";
import { IconAlert, IconCheck, IconClipboard, IconPin, IconRuler, IconStore, IconTransfer } from "@/components/icons";

export const metadata: Metadata = { title: "تنبيهات المخزون والنواقص" };

type Props = {
  searchParams: Promise<{ tab?: string; store?: string }>;
};

export default async function AlertsPage({ searchParams }: Props) {
  const user = await requireUser();
  const { t, lang } = await getI18n();
  const sp = await searchParams;
  const crossStore = can.viewCrossStoreStock(user);

  const stores = crossStore
    ? await db.store.findMany({ where: { active: true }, orderBy: { createdAt: "asc" }, select: { id: true, name: true } })
    : [];

  let storeId: string | null = await getActiveStoreId(user);
  if (crossStore && sp.store !== undefined) {
    if (sp.store === "all") {
      storeId = null;
    } else if (stores.some((s) => s.id === sp.store)) {
      storeId = sp.store;
    }
  }

  const tab = sp.tab === "low" ? "low" : sp.tab === "all" ? "all" : "out";

  const [outRows, lowRows] = await Promise.all([
    db.stock.findMany({
      where: outOfStockWhere(storeId),
      orderBy: [{ store: { name: "asc" } }, { part: { updatedAt: "desc" } }],
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
            stocks: {
              where: { store: { active: true }, quantity: { gt: 0 } },
              select: { storeId: true, quantity: true, store: { select: { name: true } } },
            },
          },
        },
      },
    }),
    db.stock.findMany({
      where: runningLowWhere(storeId),
      orderBy: [{ quantity: "asc" }, { store: { name: "asc" } }],
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
            stocks: {
              where: { store: { active: true }, quantity: { gt: 0 } },
              select: { storeId: true, quantity: true, store: { select: { name: true } } },
            },
          },
        },
      },
    }),
  ]);

  const tabHref = (nextTab: string, nextStore?: string) => {
    const p = new URLSearchParams();
    p.set("tab", nextTab);
    const st = nextStore !== undefined ? nextStore : storeId ?? "all";
    if (crossStore) p.set("store", st);
    return `/alerts?${p.toString()}`;
  };

  const canTransfer = can.editParts(user) && stores.length >= 2;

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
                  {crossStore && <th>{t.alerts.availableElsewhere}</th>}
                  <th className="end">{t.parts.quantity}</th>
                  <th className="end">{t.common.actions}</th>
                </tr>
              </thead>
              <tbody>
                {list.map((row) => {
                  const otherStores = row.part.stocks.filter((s) => s.storeId !== row.store.id && s.quantity > 0);
                  return (
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

                      {crossStore && (
                        <td data-label={t.alerts.availableElsewhere}>
                          {otherStores.length > 0 ? (
                            <div className="row" style={{ gap: 4 }}>
                              {otherStores.map((os) => (
                                <span key={os.storeId} className="badge badge-ok">
                                  {os.store.name}: <span className="num">{os.quantity}</span>
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="muted small">{t.alerts.notElsewhere}</span>
                          )}
                        </td>
                      )}

                      <td className="end num" data-label={t.parts.quantity}>
                        <span className={`badge num ${isOut ? "badge-out" : "badge-low"}`}>
                          {row.quantity}
                          {row.minQuantity > 0 ? ` / ${row.minQuantity}` : ""}
                        </span>
                      </td>

                      <td className="end" data-label={t.common.actions}>
                        <div className="row" style={{ gap: 6, justifyContent: "flex-end" }}>
                          {canTransfer && otherStores.length > 0 && (
                            <Link
                              href={`/transfers/new?partId=${row.part.id}&to=${row.store.id}`}
                              className="btn btn-secondary btn-sm"
                            >
                              <IconTransfer />
                              {t.alerts.transferFromOther}
                            </Link>
                          )}
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
                  );
                })}
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
          <h1>{t.alerts.title}</h1>
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

        {crossStore && stores.length > 1 && (
          <div className="report-pills">
            <Link href={tabHref(tab, "all")} className={`report-pill ${!storeId ? "is-active" : ""}`}>
              {t.store.all}
            </Link>
            {stores.map((st) => (
              <Link
                key={st.id}
                href={tabHref(tab, st.id)}
                className={`report-pill ${storeId === st.id ? "is-active" : ""}`}
              >
                {st.name}
              </Link>
            ))}
          </div>
        )}
      </section>

      {(tab === "out" || tab === "all") && renderSection("out", outRows)}
      {(tab === "low" || tab === "all") && renderSection("low", lowRows)}
    </div>
  );
}
