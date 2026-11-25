"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { useI18n } from "@/lib/i18n/client";
import { formatDA } from "@/lib/format";
import { IconAlert, IconArrowBack, IconCart, IconPrinter, IconUndo, IconX } from "@/components/icons";
import { returnSaleItems } from "../actions";

type InvoiceData = {
  id: string;
  number: string;
  dateStr: string;
  storeName: string;
  storeAddress: string;
  storePhone: string;
  sellerName: string;
  customerId: string | null;
  customerName: string;
  customerPhone: string;
  subtotal: number;
  discount: number;
  total: number;
  paidAmount: number;
  debtAmount: number;
  refundedAmount: number;
  note: string;
  items: {
    id: string;
    partName: string;
    reference: string;
    quantity: number;
    returnedQty: number;
    unitPrice: number;
    lineTotal: number;
  }[];
};

export default function InvoiceClient({ sale }: { sale: InvoiceData }) {
  const { t, lang } = useI18n();
  const [format, setFormat] = useState<"a4" | "ticket">("a4");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [retQtys, setRetQtys] = useState<Record<string, number>>({});
  const [refundMode, setRefundMode] = useState<"debt" | "cash">(sale.customerId && sale.debtAmount > 0 ? "debt" : "cash");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const canReturnAny = sale.items.some((it) => it.quantity > it.returnedQty);

  const submitReturn = () => {
    setError(null);
    startTransition(async () => {
      const payload = Object.entries(retQtys).map(([itemId, qty]) => ({ itemId, qty }));
      const res = await returnSaleItems(sale.id, payload, refundMode);
      if (res.error) setError(res.error);
      else {
        setRetQtys({});
        dialogRef.current?.close();
      }
    });
  };

  return (
    <>
      <div className="page-head no-print">
        <div>
          <Link href="/sales" className="crumb">
            <IconArrowBack className="flip" />
            {t.sales.title}
          </Link>
          <h1 className="mono">{sale.number}</h1>
        </div>
        <div className="page-head-actions">
          <Link href="/pos" className="btn btn-secondary">
            <IconCart />
            {t.nav.pos}
          </Link>
          {canReturnAny && (
            <button type="button" className="btn btn-secondary" onClick={() => dialogRef.current?.showModal()}>
              <IconUndo />
              {t.sales.returnBtn}
            </button>
          )}
          <button type="button" className="btn btn-primary" onClick={() => window.print()} id="print-invoice-btn">
            <IconPrinter />
            {t.common.print}
          </button>
        </div>
      </div>

      <div className="no-print">
        <div className="segmented" role="radiogroup">
          <label>
            <input type="radio" name="invfmt" checked={format === "a4"} onChange={() => setFormat("a4")} />
            {t.sales.formatA4}
          </label>
          <label>
            <input type="radio" name="invfmt" checked={format === "ticket"} onChange={() => setFormat("ticket")} />
            {t.sales.formatTicket}
          </label>
        </div>
      </div>

      {format === "a4" ? (
        <section className="card card-pad stack" style={{ gap: 20, maxWidth: 860 }}>
          <div className="row spread" style={{ borderBottom: "2px solid var(--navy-800)", paddingBottom: 16 }}>
            <div className="row" style={{ gap: 14 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt="KGY" style={{ width: 64, height: "auto" }} />
              <div>
                <h2 style={{ fontSize: "1.3rem" }}>{sale.storeName}</h2>
                <p className="muted small">{t.common.tagline}</p>
                {(sale.storeAddress || sale.storePhone) && (
                  <p className="muted small">
                    {sale.storeAddress} {sale.storePhone ? `· ${sale.storePhone}` : ""}
                  </p>
                )}
              </div>
            </div>
            <div style={{ textAlign: "end" }}>
              <div className="badge badge-orange" style={{ fontSize: "0.85rem" }}>
                {t.sales.invoiceTitle}
              </div>
              <div className="mono" style={{ fontSize: "1.1rem", marginTop: 6 }}>
                {sale.number}
              </div>
              <div className="muted small">{sale.dateStr}</div>
            </div>
          </div>

          <div className="row spread small">
            <div>
              <span className="muted">{t.sales.customer}: </span>
              <strong>{sale.customerName || t.pos.walkIn}</strong>
              {sale.customerPhone && <span className="num muted"> ({sale.customerPhone})</span>}
            </div>
            {sale.sellerName && (
              <div>
                <span className="muted">{t.sales.seller}: </span>
                <strong>{sale.sellerName}</strong>
              </div>
            )}
          </div>

          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>{t.parts.name}</th>
                  <th>{t.parts.reference}</th>
                  <th className="end">{t.parts.quantity}</th>
                  <th className="end">{t.pos.unitPrice}</th>
                  <th className="end">{t.sales.total}</th>
                </tr>
              </thead>
              <tbody>
                {sale.items.map((it, idx) => (
                  <tr key={it.id}>
                    <td className="num">{idx + 1}</td>
                    <td>
                      <strong>{it.partName}</strong>
                      {it.returnedQty > 0 && (
                        <span className="badge badge-out" style={{ marginInlineStart: 8 }}>
                          {t.sales.returned}: {it.returnedQty}
                        </span>
                      )}
                    </td>
                    <td className="ref">{it.reference}</td>
                    <td className="end num">{it.quantity}</td>
                    <td className="end num">{formatDA(it.unitPrice, lang)}</td>
                    <td className="end num">
                      <strong>{formatDA(it.lineTotal, lang)}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="row" style={{ justifyContent: "flex-end" }}>
            <div className="stack" style={{ width: 290, gap: 8 }}>
              {sale.discount > 0 && (
                <>
                  <div className="row spread small">
                    <span className="muted">{t.pos.subtotal}</span>
                    <span className="num">{formatDA(sale.subtotal, lang)}</span>
                  </div>
                  <div className="row spread small">
                    <span className="muted">{t.pos.discount}</span>
                    <span className="num">-{formatDA(sale.discount, lang)}</span>
                  </div>
                </>
              )}
              <div className="row spread" style={{ fontSize: "1.15rem", borderTop: "1px solid var(--line)", paddingTop: 8 }}>
                <strong>{t.pos.total}</strong>
                <strong className="num">{formatDA(sale.total, lang)}</strong>
              </div>
              <div className="row spread small">
                <span className="muted">{t.sales.paid}</span>
                <span className="num">{formatDA(sale.paidAmount, lang)}</span>
              </div>
              {sale.debtAmount > 0 && (
                <div className="row spread small" style={{ color: "var(--warn)", fontWeight: 700 }}>
                  <span>{t.sales.debt}</span>
                  <span className="num">{formatDA(sale.debtAmount, lang)}</span>
                </div>
              )}
              {sale.refundedAmount > 0 && (
                <div className="row spread small" style={{ color: "var(--danger)" }}>
                  <span>{t.sales.returned}</span>
                  <span className="num">-{formatDA(sale.refundedAmount, lang)}</span>
                </div>
              )}
            </div>
          </div>

          {sale.note && <p className="muted small">{sale.note}</p>}
          <p className="muted small" style={{ textAlign: "center", borderTop: "1px dashed var(--line-strong)", paddingTop: 12 }}>
            {t.sales.thankYou}
          </p>
        </section>
      ) : (
        /* 80mm thermal ticket layout */
        <section
          className="card card-pad stack"
          style={{ width: "min(320px, 100%)", marginInline: "auto", gap: 10, fontSize: "0.86rem" }}
        >
          <div style={{ textAlign: "center", borderBottom: "1px dashed var(--line-strong)", paddingBottom: 8 }}>
            <strong style={{ fontSize: "1.1rem", letterSpacing: "0.06em" }}>KGY</strong>
            <div>{sale.storeName}</div>
            {sale.storePhone && <div className="num muted small">{sale.storePhone}</div>}
            <div className="mono small" style={{ marginTop: 4 }}>
              {sale.number}
            </div>
            <div className="muted small">{sale.dateStr}</div>
            <div className="small">{sale.customerName || t.pos.walkIn}</div>
          </div>

          <div className="stack" style={{ gap: 6, borderBottom: "1px dashed var(--line-strong)", paddingBottom: 8 }}>
            {sale.items.map((it) => (
              <div key={it.id}>
                <div style={{ fontWeight: 600 }}>{it.partName}</div>
                <div className="row spread small muted">
                  <span className="num">
                    {it.quantity} × {formatDA(it.unitPrice, lang)}
                  </span>
                  <strong className="num" style={{ color: "var(--text)" }}>
                    {formatDA(it.lineTotal, lang)}
                  </strong>
                </div>
              </div>
            ))}
          </div>

          <div className="stack" style={{ gap: 4 }}>
            {sale.discount > 0 && (
              <div className="row spread small">
                <span>{t.pos.discount}</span>
                <span className="num">-{formatDA(sale.discount, lang)}</span>
              </div>
            )}
            <div className="row spread" style={{ fontSize: "1rem" }}>
              <strong>{t.pos.total}</strong>
              <strong className="num">{formatDA(sale.total, lang)}</strong>
            </div>
            <div className="row spread small">
              <span>{t.sales.paid}</span>
              <span className="num">{formatDA(sale.paidAmount, lang)}</span>
            </div>
            {sale.debtAmount > 0 && (
              <div className="row spread small" style={{ fontWeight: 700 }}>
                <span>{t.sales.debt}</span>
                <span className="num">{formatDA(sale.debtAmount, lang)}</span>
              </div>
            )}
          </div>

          <div className="muted small" style={{ textAlign: "center", borderTop: "1px dashed var(--line-strong)", paddingTop: 8 }}>
            {t.sales.thankYou}
          </div>
        </section>
      )}

      {/* Return modal */}
      <dialog ref={dialogRef} className="modal no-print">
        <div className="modal-head">
          <h2>{t.sales.returnBtn}</h2>
          <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => dialogRef.current?.close()}>
            <IconX />
          </button>
        </div>
        <div className="modal-body">
          {error && (
            <div className="alert alert-error">
              <IconAlert />
              {error}
            </div>
          )}
          <div className="stack" style={{ gap: 10 }}>
            {sale.items.map((it) => {
              const rem = it.quantity - it.returnedQty;
              if (rem <= 0) return null;
              return (
                <div key={it.id} className="row spread" style={{ padding: 10, borderRadius: 10, background: "var(--surface-2)" }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{it.partName}</div>
                    <div className="small muted num">
                      {formatDA(it.unitPrice, lang)} · max: {rem}
                    </div>
                  </div>
                  <input
                    className="input num"
                    style={{ width: 84 }}
                    type="number"
                    min={0}
                    max={rem}
                    value={retQtys[it.id] ?? 0}
                    aria-label={t.sales.returnQty}
                    onChange={(e) =>
                      setRetQtys((prev) => ({
                        ...prev,
                        [it.id]: Math.min(rem, Math.max(0, Number(e.target.value) || 0)),
                      }))
                    }
                  />
                </div>
              );
            })}
          </div>
          {sale.customerId && (
            <div className="segmented" role="radiogroup" style={{ width: "100%" }}>
              <label>
                <input type="radio" name="rfm" checked={refundMode === "debt"} onChange={() => setRefundMode("debt")} />
                {t.sales.deductDebt}
              </label>
              <label>
                <input type="radio" name="rfm" checked={refundMode === "cash"} onChange={() => setRefundMode("cash")} />
                {t.sales.refundCash}
              </label>
            </div>
          )}
        </div>
        <div className="modal-foot">
          <button type="button" className="btn btn-ghost" onClick={() => dialogRef.current?.close()}>
            {t.common.cancel}
          </button>
          <button type="button" className="btn btn-primary" disabled={pending} onClick={submitReturn}>
            {pending ? "…" : t.common.save}
          </button>
        </div>
      </dialog>
    </>
  );
}
