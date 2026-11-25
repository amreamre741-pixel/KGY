import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { can, requireUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { formatDA, formatDateTime } from "@/lib/format";
import PrintStatementButton from "@/app/(app)/customers/[id]/PrintStatementButton";
import { IconArrowBack } from "@/components/icons";

export const metadata: Metadata = { title: "فاتورة شراء" };

export default async function PurchaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!can.seeCost(user)) redirect("/");
  const { t, lang } = await getI18n();
  const { id } = await params;

  const purchase = await db.purchase.findUnique({
    where: { id },
    include: {
      store: true,
      supplier: true,
      user: { select: { name: true } },
      items: true,
    },
  });
  if (!purchase) notFound();
  if (!can.seeAllStores(user) && user.storeId !== purchase.storeId) notFound();

  const debt = Number(purchase.debtAmount);

  return (
    <>
      <div className="page-head no-print">
        <div>
          <Link href="/purchases" className="crumb">
            <IconArrowBack className="flip" />
            {t.purchases.title}
          </Link>
          <h1 className="mono">{purchase.number}</h1>
        </div>
        <div className="page-head-actions">
          <PrintStatementButton />
        </div>
      </div>

      <section className="card card-pad stack" style={{ gap: 18, maxWidth: 860 }}>
        <div className="row spread" style={{ borderBottom: "2px solid var(--navy-800)", paddingBottom: 14 }}>
          <div>
            <h2>{purchase.store.name}</h2>
            <p className="muted small">
              {t.purchases.supplier}: <strong>{purchase.supplier?.name ?? "—"}</strong>
              {purchase.supplierRef ? ` · #${purchase.supplierRef}` : ""}
            </p>
          </div>
          <div style={{ textAlign: "end" }}>
            <div className="mono">{purchase.number}</div>
            <div className="muted small">{formatDateTime(purchase.createdAt, lang)}</div>
          </div>
        </div>

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                <th>{t.parts.name}</th>
                <th>{t.parts.reference}</th>
                <th className="end">{t.parts.quantity}</th>
                <th className="end">{t.purchases.unitCost}</th>
                <th className="end">{t.purchases.total}</th>
              </tr>
            </thead>
            <tbody>
              {purchase.items.map((it, idx) => (
                <tr key={it.id}>
                  <td className="num">{idx + 1}</td>
                  <td>
                    <strong>{it.partName}</strong>
                  </td>
                  <td className="ref">{it.reference}</td>
                  <td className="end num">{it.quantity}</td>
                  <td className="end num">{formatDA(Number(it.unitCost), lang)}</td>
                  <td className="end num">
                    <strong>{formatDA(Number(it.lineTotal), lang)}</strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="row" style={{ justifyContent: "flex-end" }}>
          <div className="stack" style={{ width: 280, gap: 6 }}>
            <div className="row spread">
              <strong>{t.purchases.total}</strong>
              <strong className="num">{formatDA(Number(purchase.total), lang)}</strong>
            </div>
            <div className="row spread small">
              <span className="muted">{t.sales.paid}</span>
              <span className="num">{formatDA(Number(purchase.paidAmount), lang)}</span>
            </div>
            {debt > 0 && (
              <div className="row spread small" style={{ color: "var(--warn)", fontWeight: 700 }}>
                <span>{t.suppliers.balance}</span>
                <span className="num">{formatDA(debt, lang)}</span>
              </div>
            )}
          </div>
        </div>
        {purchase.note && <p className="muted small">{purchase.note}</p>}
      </section>
    </>
  );
}
