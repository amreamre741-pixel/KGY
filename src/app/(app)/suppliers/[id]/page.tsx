import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { can, requireUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { formatDA, formatDateTime } from "@/lib/format";
import FormDialog from "@/components/FormDialog";
import PrintStatementButton from "@/app/(app)/customers/[id]/PrintStatementButton";
import { IconArrowBack, IconEdit, IconPin, IconWallet } from "@/components/icons";
import { recordSupplierPayment, saveSupplier } from "../actions";

export const metadata: Metadata = { title: "كشف حساب مورد" };

export default async function SupplierDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!can.seeCost(user)) redirect("/");
  const { t, lang } = await getI18n();
  const { id } = await params;

  const supplier = await db.supplier.findUnique({
    where: { id },
    include: {
      purchases: { orderBy: { createdAt: "desc" }, take: 100 },
      payments: { orderBy: { createdAt: "desc" }, take: 100, include: { user: { select: { name: true } } } },
    },
  });
  if (!supplier) notFound();

  const bal = Number(supplier.balance);

  type Entry =
    | { kind: "purchase"; id: string; date: Date; number: string; supplierRef: string; total: number; paid: number; debt: number }
    | { kind: "payment"; id: string; date: Date; amount: number; balanceAfter: number; note: string; user: string };

  const entries: Entry[] = [
    ...supplier.purchases.map(
      (p): Entry => ({
        kind: "purchase",
        id: p.id,
        date: p.createdAt,
        number: p.number,
        supplierRef: p.supplierRef,
        total: Number(p.total),
        paid: Number(p.paidAmount),
        debt: Number(p.debtAmount),
      }),
    ),
    ...supplier.payments.map(
      (p): Entry => ({
        kind: "payment",
        id: p.id,
        date: p.createdAt,
        amount: Number(p.amount),
        balanceAfter: Number(p.balanceAfter),
        note: p.note,
        user: p.user?.name ?? "",
      }),
    ),
  ].sort((a, b) => b.date.getTime() - a.date.getTime());

  return (
    <>
      <div className="page-head">
        <div>
          <Link href="/suppliers" className="crumb no-print">
            <IconArrowBack className="flip" />
            {t.suppliers.title}
          </Link>
          <h1>{supplier.name}</h1>
          <div className="part-sub" style={{ marginTop: 4 }}>
            {supplier.phone && <span className="num">{supplier.phone}</span>}
            {supplier.address && (
              <span>
                · <IconPin width={13} height={13} /> {supplier.address}
              </span>
            )}
          </div>
        </div>
        <div className="page-head-actions no-print">
          <PrintStatementButton />
          <FormDialog
            title={t.common.edit}
            action={saveSupplier}
            triggerClass="btn btn-secondary"
            trigger={
              <>
                <IconEdit />
                {t.common.edit}
              </>
            }
          >
            <input type="hidden" name="id" value={supplier.id} />
            <div className="field">
              <label className="label" htmlFor="se-name">
                {t.suppliers.name} *
              </label>
              <input className="input" id="se-name" name="name" defaultValue={supplier.name} required />
            </div>
            <div className="form-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <div className="field">
                <label className="label" htmlFor="se-phone">
                  {t.suppliers.phone}
                </label>
                <input className="input num" id="se-phone" name="phone" defaultValue={supplier.phone} dir="ltr" />
              </div>
              <div className="field">
                <label className="label" htmlFor="se-addr">
                  {t.suppliers.address}
                </label>
                <input className="input" id="se-addr" name="address" defaultValue={supplier.address} />
              </div>
            </div>
            <div className="field">
              <label className="label" htmlFor="se-notes">
                {t.partForm.notes}
              </label>
              <input className="input" id="se-notes" name="notes" defaultValue={supplier.notes} />
            </div>
          </FormDialog>

          <FormDialog
            title={t.suppliers.payBtn}
            action={recordSupplierPayment}
            triggerClass="btn btn-primary"
            triggerId="pay-supplier-btn"
            trigger={
              <>
                <IconWallet />
                {t.suppliers.payBtn}
              </>
            }
          >
            <input type="hidden" name="supplierId" value={supplier.id} />
            <div className="row spread" style={{ padding: "10px 12px", borderRadius: 10, background: "var(--surface-2)" }}>
              <span className="muted">{t.suppliers.balance}</span>
              <strong className="num">{formatDA(bal, lang)}</strong>
            </div>
            <div className="field">
              <label className="label" htmlFor="spay-amt">
                {t.suppliers.payAmount} *
              </label>
              <input
                className="input num"
                id="spay-amt"
                name="amount"
                inputMode="decimal"
                defaultValue={bal > 0 ? String(bal) : ""}
                required
                style={{ fontSize: "1.2rem", fontWeight: 700 }}
              />
            </div>
            <div className="field">
              <label className="label" htmlFor="spay-note">
                {t.adjust.note}
              </label>
              <input className="input" id="spay-note" name="note" />
            </div>
          </FormDialog>
        </div>
      </div>

      <section className="stats">
        <div className={`card stat ${bal > 0 ? "is-alert" : ""}`}>
          <div className="stat-label">{t.suppliers.balance}</div>
          <div className="stat-value num">{formatDA(bal, lang)}</div>
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>{t.suppliers.statement}</h2>
        </div>
        {entries.length === 0 ? (
          <div className="empty">
            <span>—</span>
          </div>
        ) : (
          <div className="list">
            {entries.map((e) =>
              e.kind === "purchase" ? (
                <Link key={`pu-${e.id}`} href={`/purchases/${e.id}`} className="list-item">
                  <span className="mv-icon mv-out num">+</span>
                  <div className="grow">
                    <div className="title">
                      {t.suppliers.purchaseEntry} · <span className="mono">{e.number}</span>
                      {e.supplierRef && <span className="muted small"> ({e.supplierRef})</span>}
                    </div>
                    <div className="part-sub">
                      <span>{formatDateTime(e.date, lang)}</span>
                      <span>
                        · {t.purchases.total}: {formatDA(e.total, lang)}
                      </span>
                      {e.paid > 0 && (
                        <span>
                          · {t.sales.paid}: {formatDA(e.paid, lang)}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="num" style={{ fontWeight: 700, color: e.debt > 0 ? "var(--warn)" : "var(--ok)" }}>
                    {e.debt > 0 ? `+${formatDA(e.debt, lang)}` : t.sales.paidBadge}
                  </span>
                </Link>
              ) : (
                <div key={`sp-${e.id}`} className="list-item">
                  <span className="mv-icon mv-in num">✓</span>
                  <div className="grow">
                    <div className="title">
                      {t.suppliers.paymentEntry}
                      {e.note && <span className="muted" style={{ fontWeight: 400 }}> — {e.note}</span>}
                    </div>
                    <div className="part-sub">
                      <span>{formatDateTime(e.date, lang)}</span>
                      {e.user && <span>· {e.user}</span>}
                    </div>
                  </div>
                  <div className="stack" style={{ gap: 2, alignItems: "flex-end" }}>
                    <strong className="num" style={{ color: "var(--ok)" }}>
                      -{formatDA(e.amount, lang)}
                    </strong>
                    <span className="muted small num">→ {formatDA(e.balanceAfter, lang)}</span>
                  </div>
                </div>
              ),
            )}
          </div>
        )}
      </section>
    </>
  );
}
