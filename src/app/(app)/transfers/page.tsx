import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { can, getActiveStoreId, requireUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { formatDateTime } from "@/lib/format";
import { IconPlus, IconTransfer } from "@/components/icons";

export const metadata: Metadata = { title: "تحويل السلعة" };

export default async function TransfersPage() {
  const user = await requireUser();
  if (!can.editParts(user)) redirect("/");
  const { t, lang } = await getI18n();
  const storeId = await getActiveStoreId(user);

  const transfers = await db.stockTransfer.findMany({
    where: storeId ? { OR: [{ fromStoreId: storeId }, { toStoreId: storeId }] } : {},
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      fromStore: { select: { name: true } },
      toStore: { select: { name: true } },
      user: { select: { name: true } },
      items: { select: { quantity: true } },
    },
  });

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t.transfers.title}</h1>
        </div>
        <div className="page-head-actions">
          <Link href="/transfers/new" className="btn btn-primary" id="new-transfer-btn">
            <IconPlus />
            {t.transfers.newBtn}
          </Link>
        </div>
      </div>

      {transfers.length === 0 ? (
        <div className="card empty">
          <div className="empty-icon">
            <IconTransfer />
          </div>
          <span>{t.transfers.empty}</span>
        </div>
      ) : (
        <div className="card">
          <div className="table-wrap">
            <table className="table responsive">
              <thead>
                <tr>
                  <th>{t.sales.number}</th>
                  <th>{t.transfers.fromStore}</th>
                  <th>{t.transfers.toStore}</th>
                  <th className="end">{t.parts.quantity}</th>
                </tr>
              </thead>
              <tbody>
                {transfers.map((tr) => {
                  const totalUnits = tr.items.reduce((s, i) => s + i.quantity, 0);
                  return (
                    <tr key={tr.id}>
                      <td className="cell-main">
                        <Link href={`/transfers/${tr.id}`} className="part-name mono">
                          {tr.number}
                        </Link>
                        <div className="part-sub">
                          <span>{formatDateTime(tr.createdAt, lang)}</span>
                          {tr.user && <span>· {tr.user.name}</span>}
                        </div>
                      </td>
                      <td data-label={t.transfers.fromStore}>{tr.fromStore.name}</td>
                      <td data-label={t.transfers.toStore}>
                        <strong>{tr.toStore.name}</strong>
                      </td>
                      <td className="end num" data-label={t.parts.quantity}>
                        <span className="badge num">{totalUnits}</span>
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
