import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { formatDA, formatDateTime } from "@/lib/format";
import FormDialog from "@/components/FormDialog";
import { IconArrowBack, IconEdit, IconPin, IconWallet } from "@/components/icons";
import { recordCustomerPayment, saveCustomer } from "../actions";
import PrintStatementButton from "./PrintStatementButton";

export const metadata: Metadata = { title: "كشف حساب كليان" };

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { t, lang } = await getI18n();
  const { id } = await params;

  const customer = await db.customer.findUnique({
    where: { id },
    include: {
      sales: { orderBy: { createdAt: "desc" }, take: 100 },
      payments: { orderBy: { createdAt: "desc" }, take: 100, include: { user: { select: { name: true } } } },
    },
  });
  if (!customer) notFound();

  const bal = Number(customer.balance);

  type Entry =
    | { kind: "sale"; id: string; date: Date; number: string; total: number; paid: number; debt: number }
    | { kind: "payment"; id: string; date: Date; amount: number; balanceAfter: number; note: string; user: string };

  const entries: Entry[] = [
    ...customer.sales.map(
      (s): Entry => ({
        kind: "sale",
        id: s.id,
        date: s.createdAt,
        number: s.number,
        total: Number(s.total),
        paid: Number(s.paidAmount),
        debt: Number(s.debtAmount),
      }),
    ),
    ...customer.payments.map(
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
          <Link href="/customers" className="crumb no-print">
            <IconArrowBack className="flip" />
            {t.customers.title}
          </Link>
          <h1>{customer.name}</h1>
          <div className="part-sub" style={{ marginTop: 4 }}>
            {customer.phone && <span className="num">{customer.phone}</span>}
            {customer.address && (
              <span>
                · <IconPin width={13} height={13} /> {customer.address}
              </span>
            )}
          </div>
        </div>
        <div className="page-head-actions no-print">
          <PrintStatementButton />
          <FormDialog
            title={t.common.edit}
            action={saveCustomer}
            triggerClass="btn btn-secondary"
            trigger={
              <>
                <IconEdit />
                {t.common.edit}
              </>
            }
          >
            <input type="hidden" name="id" value={customer.id} />
            <div className="field">
              <label className="label" htmlFor="ce-name">
                {t.customers.name} *
              </label>
              <input className="input" id="ce-name" name="name" defaultValue={customer.name} required />
            </div>
            <div className="form-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <div className="field">
                <label className="label" htmlFor="ce-phone">
                  {t.customers.phone}
                </label>
                <input className="input num" id="ce-phone" name="phone" defaultValue={customer.phone} dir="ltr" />
              </div>
              <div className="field">
                <label className="label" htmlFor="ce-addr">
                  {t.customers.address}
                </label>
                <input className="input" id="ce-addr" name="address" defaultValue={customer.address} />
              </div>
            </div>
            <div className="field">
              <label className="label" htmlFor="ce-notes">
                {t.partForm.notes}
              </label>
              <input className="input" id="ce-notes" name="notes" defaultValue={customer.notes} />
            </div>
          </FormDialog>

          <FormDialog
            title={t.customers.payBtn}
            action={recordCustomerPayment}
            triggerClass="btn btn-primary"
            triggerId="record-payment-btn"
            trigger={
              <>
                <IconWallet />
                {t.customers.payBtn}
              </>
            }
          >
            <input type="hidden" name="customerId" value={customer.id} />
            <div className="row spread" style={{ padding: "10px 12px", borderRadius: 10, background: "var(--surface-2)" }}>
              <span className="muted">{t.customers.balance}</span>
              <strong className="num">{formatDA(bal, lang)}</strong>
            </div>
            <div className="field">
              <label className="label" htmlFor="pay-amt">
                {t.customers.payAmount} *
              </label>
              <input
                className="input num"
                id="pay-amt"
                name="amount"
                inputMode="decimal"
                defaultValue={bal > 0 ? String(bal) : ""}
                required
                style={{ fontSize: "1.2rem", fontWeight: 700 }}
              />
            </div>
            <div className="field">
              <label className="label" htmlFor="pay-note">
                {t.adjust.note}
              </label>
              <input className="input" id="pay-note" name="note" />
            </div>
          </FormDialog>
        </div>
      </div>

      <section className="stats">
        <div className={`card stat ${bal > 0 ? "is-alert" : ""}`}>
          <div className="stat-label">
            <IconWallet />
            {t.customers.balance}
          </div>
          <div className="stat-value num">{formatDA(bal, lang)}</div>
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>{t.customers.statement}</h2>
        </div>
        {entries.length === 0 ? (
          <div className="empty">
            <span>—</span>
          </div>
        ) : (
          <div className="list">
            {entries.map((e) =>
              e.kind === "sale" ? (
                <Link key={`s-${e.id}`} href={`/sales/${e.id}`} className="list-item">
                  <span className="mv-icon mv-out num">+</span>
                  <div className="grow">
                    <div className="title">
                      {t.customers.saleEntry} · <span className="mono">{e.number}</span>
                    </div>
                    <div className="part-sub">
                      <span>{formatDateTime(e.date, lang)}</span>
                      <span>
                        · {t.sales.total}: {formatDA(e.total, lang)}
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
                <div key={`p-${e.id}`} className="list-item">
                  <span className="mv-icon mv-in num">✓</span>
                  <div className="grow">
                    <div className="title">
                      {t.customers.paymentEntry}
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
