import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { getActiveStoreId, requireUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { formatDA, formatDateTime } from "@/lib/format";
import { IconCart, IconReceipt } from "@/components/icons";

export const metadata: Metadata = { title: "الفواتير" };

export default async function SalesPage() {
  const user = await requireUser();
  const { t, lang } = await getI18n();
  const storeId = await getActiveStoreId(user);

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const storeWhere = storeId ? { storeId } : {};

  const [todayAgg, sales] = await Promise.all([
    db.sale.aggregate({
      where: { ...storeWhere, createdAt: { gte: startOfDay } },
      _sum: { total: true, paidAmount: true, debtAmount: true, refundedAmount: true },
    }),
    db.sale.findMany({
      where: storeWhere,
      orderBy: { createdAt: "desc" },
      take: 80,
      include: {
        customer: { select: { name: true, phone: true } },
        store: { select: { name: true } },
        user: { select: { name: true } },
        items: {
          select: {
            quantity: true,
            unitPrice: true,
            part: { select: { nameAr: true, reference: true } },
          },
        },
        _count: { select: { items: true } },
      },
    }),
  ]);

  const todayNet = Number(todayAgg._sum.total ?? 0) - Number(todayAgg._sum.refundedAmount ?? 0);
  const todayPaid = Number(todayAgg._sum.paidAmount ?? 0);
  const todayDebt = Number(todayAgg._sum.debtAmount ?? 0);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t.sales.title}</h1>
        </div>
        <div className="page-head-actions">
          <Link href="/pos" className="btn btn-primary" id="sales-go-pos">
            <IconCart />
            {t.nav.pos}
          </Link>
        </div>
      </div>

      <section className="stats">
        <div className="card stat">
          <div className="stat-label">{t.sales.todayTotal}</div>
          <div className="stat-value num">{formatDA(todayNet, lang)}</div>
        </div>
        <div className="card stat">
          <div className="stat-label">{t.sales.todayCash}</div>
          <div className="stat-value num" style={{ color: "var(--ok)" }}>
            {formatDA(todayPaid, lang)}
          </div>
        </div>
        <div className="card stat">
          <div className="stat-label">{t.sales.todayDebt}</div>
          <div className="stat-value num" style={{ color: todayDebt > 0 ? "var(--warn)" : undefined }}>
            {formatDA(todayDebt, lang)}
          </div>
        </div>
      </section>

      {sales.length === 0 ? (
        <div className="card empty">
          <div className="empty-icon">
            <IconReceipt />
          </div>
          <span>{t.sales.empty}</span>
        </div>
      ) : (
        <div className="card">
          <div className="table-wrap">
            <table className="table responsive">
              <thead>
                <tr>
                  <th>{t.sales.number}</th>
                  <th>{t.sales.customer}</th>
                  {!storeId && <th>{t.store.label}</th>}
                  <th className="end">{t.sales.total}</th>
                  <th className="end">{t.sales.debt}</th>
                  <th className="end">{t.sales.status}</th>
                </tr>
              </thead>
              <tbody>
                {sales.map((s) => {
                  const debt = Number(s.debtAmount);
                  const refunded = Number(s.refundedAmount);
                  return (
                    <tr key={s.id}>
                      <td className="cell-main">
                        <Link href={`/sales/${s.id}`} className="part-name mono">
                          {s.number}
                        </Link>
                        <div className="part-sub">
                          <span>{formatDateTime(s.createdAt, lang)}</span>
                          {s.user && <span>· {s.user.name}</span>}
                        </div>
                      </td>
                      <td data-label={t.sales.customer}>{s.customer?.name ?? <span className="muted">{t.pos.walkIn}</span>}</td>
                      {!storeId && <td data-label={t.store.label}>{s.store.name}</td>}
                      <td className="end num" data-label={t.sales.total}>
                        <strong>{formatDA(Number(s.total), lang)}</strong>
                      </td>
                      <td className="end num" data-label={t.sales.debt}>
                        {debt > 0 ? <span style={{ color: "var(--warn)", fontWeight: 600 }}>{formatDA(debt, lang)}</span> : "—"}
                      </td>
                      <td className="end" data-label={t.sales.status}>
                        <div className="row" style={{ gap: 6, justifyContent: "flex-end", alignItems: "center", flexWrap: "wrap" }}>
                          {refunded > 0 && <span className="badge badge-out">{t.sales.returnedBadge}</span>}
                          <span className={`badge ${debt > 0 ? "badge-low" : "badge-ok"}`}>
                            {debt > 0 ? t.sales.creditBadge : t.sales.paidBadge}
                          </span>
                          {(() => {
                            const digits = (s.customer?.phone || "").replace(/\D/g, "");
                            const intlPhone = digits.startsWith("0") ? `213${digits.slice(1)}` : digits;
                            const lines = s.items.map(
                              (it) => `• ${it.part.nameAr} (${it.part.reference}) × ${it.quantity} = ${formatDA(Number(it.unitPrice) * it.quantity, lang)}`
                            );
                            const msg = [
                              `🧾 فاتورة محل KGY لقطع الغيار`,
                              `رقم الفاتورة: ${s.number}`,
                              s.customer?.name ? `الزبون: ${s.customer.name}` : "",
                              `----------------`,
                              ...lines,
                              `----------------`,
                              `الإجمالي: ${formatDA(Number(s.total), lang)}`,
                              debt > 0 ? `المتبقي (كريدي): ${formatDA(debt, lang)}` : `الحالة: مدفوعة بالكامل ✓`,
                            ]
                              .filter(Boolean)
                              .join("\n");
                            const waUrl = `https://wa.me/${intlPhone}?text=${encodeURIComponent(msg)}`;
                            return (
                              <a
                                href={waUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="btn btn-sm btn-secondary"
                                title="إرسال الفاتورة عبر واتساب"
                              >
                                📲 واتساب
                              </a>
                            );
                          })()}
                        </div>
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
