import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { can, getActiveStoreId, requireUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { formatDA, formatDateTime } from "@/lib/format";
import { IconBoxIn, IconPlus, IconTruck } from "@/components/icons";

export const metadata: Metadata = { title: "المشتريات" };

export default async function PurchasesPage() {
  const user = await requireUser();
  if (!can.seeCost(user)) redirect("/");
  const { t, lang } = await getI18n();
  const storeId = await getActiveStoreId(user);

  const purchases = await db.purchase.findMany({
    where: storeId ? { storeId } : {},
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      supplier: { select: { name: true } },
      store: { select: { name: true } },
      user: { select: { name: true } },
    },
  });

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t.purchases.title}</h1>
        </div>
        <div className="page-head-actions">
          <Link href="/suppliers" className="btn btn-secondary">
            <IconTruck />
            {t.nav.suppliers}
          </Link>
          <Link href="/purchases/new" className="btn btn-primary" id="new-purchase-btn">
            <IconPlus />
            {t.purchases.newBtn}
          </Link>
        </div>
      </div>

      {purchases.length === 0 ? (
        <div className="card empty">
          <div className="empty-icon">
            <IconBoxIn />
          </div>
          <span>{t.purchases.empty}</span>
        </div>
      ) : (
        <div className="card">
          <div className="table-wrap">
            <table className="table responsive">
              <thead>
                <tr>
                  <th>{t.sales.number}</th>
                  <th>{t.purchases.supplier}</th>
                  {!storeId && <th>{t.store.label}</th>}
                  <th className="end">{t.purchases.total}</th>
                  <th className="end">{t.suppliers.balance}</th>
                </tr>
              </thead>
              <tbody>
                {purchases.map((p) => {
                  const debt = Number(p.debtAmount);
                  return (
                    <tr key={p.id}>
                      <td className="cell-main">
                        <Link href={`/purchases/${p.id}`} className="part-name mono">
                          {p.number}
                        </Link>
                        <div className="part-sub">
                          <span>{formatDateTime(p.createdAt, lang)}</span>
                          {p.supplierRef && <span>· #{p.supplierRef}</span>}
                          {p.user && <span>· {p.user.name}</span>}
                        </div>
                      </td>
                      <td data-label={t.purchases.supplier}>{p.supplier?.name ?? <span className="muted">—</span>}</td>
                      {!storeId && <td data-label={t.store.label}>{p.store.name}</td>}
                      <td className="end num" data-label={t.purchases.total}>
                        <strong>{formatDA(Number(p.total), lang)}</strong>
                      </td>
                      <td className="end num" data-label={t.suppliers.balance}>
                        {debt > 0 ? (
                          <span className="badge badge-low">{formatDA(debt, lang)}</span>
                        ) : (
                          <span className="badge badge-ok">{t.sales.paidBadge}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
