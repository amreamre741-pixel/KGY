"use client";

import { useState, useTransition } from "react";
import { useI18n } from "@/lib/i18n/client";
import { formatDateTime } from "@/lib/format";
import { IconAlert, IconCheck, IconClipboard, IconPlus, IconPrinter, IconStore, IconTrash } from "@/components/icons";
import { addOrderNote, deleteOrderNote, toggleOrderNoteStatus } from "./actions";

export type OrderNoteItem = {
  id: string;
  partName: string;
  reference: string;
  vehicle: string;
  quantity: number;
  customerInfo: string;
  note: string;
  status: "PENDING" | "DONE";
  storeName: string;
  userName: string;
  canDelete: boolean;
  createdAt: string;
};

export default function OrderNotesClient({
  notes,
  prefillPart,
  prefillRef,
}: {
  notes: OrderNoteItem[];
  prefillPart: string;
  prefillRef: string;
}) {
  const { t, lang } = useI18n();
  const [partName, setPartName] = useState(prefillPart);
  const [reference, setReference] = useState(prefillRef);
  const [vehicle, setVehicle] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [customerInfo, setCustomerInfo] = useState("");
  const [note, setNote] = useState("");
  const [tab, setTab] = useState<"PENDING" | "DONE">("PENDING");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await addOrderNote({
        partName,
        reference,
        vehicle,
        quantity: Number(quantity) || 1,
        customerInfo,
        note,
      });
      if (res.error) {
        setError(res.error);
      } else {
        setPartName("");
        setReference("");
        setVehicle("");
        setQuantity("1");
        setCustomerInfo("");
        setNote("");
        setTab("PENDING");
      }
    });
  };

  const pendingCount = notes.filter((n) => n.status === "PENDING").length;
  const doneCount = notes.filter((n) => n.status === "DONE").length;
  const shown = notes.filter((n) => n.status === tab);

  return (
    <div className="stack fade-in" style={{ opacity: pending ? 0.72 : 1 }}>
      <div className="row spread no-print">
        <div>
          <h1>{t.orderNotes.title}</h1>
          <p className="hint" style={{ marginTop: 4 }}>
            {t.orderNotes.subtitle}
          </p>
        </div>
        <button type="button" className="btn btn-secondary" onClick={() => window.print()}>
          <IconPrinter />
          {t.common.print}
        </button>
      </div>

      {/* Add Request Form */}
      <form onSubmit={submit} className="card card-pad stack no-print">
        <h2 className="row" style={{ gap: 8 }}>
          <IconPlus width={18} height={18} />
          {t.orderNotes.addTitle}
        </h2>

        {error && (
          <div className="alert alert-error">
            <IconAlert />
            {error}
          </div>
        )}

        <div className="form-grid">
          <div className="field">
            <label className="label" htmlFor="on-part">
              {t.orderNotes.partName} *
            </label>
            <input
              id="on-part"
              className="input"
              required
              value={partName}
              onChange={(e) => setPartName(e.target.value)}
              placeholder={t.orderNotes.partNamePh}
            />
          </div>

          <div className="field">
            <label className="label" htmlFor="on-ref">
              {t.orderNotes.reference}
            </label>
            <input
              id="on-ref"
              className="input mono"
              dir="ltr"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder={t.orderNotes.referencePh}
            />
          </div>

          <div className="field">
            <label className="label" htmlFor="on-veh">
              {t.orderNotes.vehicle}
            </label>
            <input
              id="on-veh"
              className="input"
              value={vehicle}
              onChange={(e) => setVehicle(e.target.value)}
              placeholder={t.orderNotes.vehiclePh}
            />
          </div>

          <div className="field">
            <label className="label" htmlFor="on-qty">
              {t.orderNotes.quantity}
            </label>
            <input
              id="on-qty"
              className="input num"
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </div>

          <div className="field">
            <label className="label" htmlFor="on-cust">
              {t.orderNotes.customerInfo}
            </label>
            <input
              id="on-cust"
              className="input"
              value={customerInfo}
              onChange={(e) => setCustomerInfo(e.target.value)}
              placeholder={t.orderNotes.customerInfoPh}
            />
          </div>

          <div className="field">
            <label className="label" htmlFor="on-note">
              {t.orderNotes.note}
            </label>
            <input
              id="on-note"
              className="input"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t.orderNotes.notePh}
            />
          </div>
        </div>

        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={pending}>
            <IconClipboard />
            {pending ? "…" : t.orderNotes.addBtn}
          </button>
        </div>
      </form>

      {/* Tabs */}
      <div className="report-pills no-print">
        <button
          type="button"
          className={`report-pill ${tab === "PENDING" ? "is-active" : ""}`}
          onClick={() => setTab("PENDING")}
        >
          {t.orderNotes.pendingTab} ({pendingCount})
        </button>
        <button
          type="button"
          className={`report-pill ${tab === "DONE" ? "is-active" : ""}`}
          onClick={() => setTab("DONE")}
        >
          {t.orderNotes.doneTab} ({doneCount})
        </button>
      </div>

      {/* Notes list */}
      <section className="card">
        {shown.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">
              <IconClipboard />
            </div>
            <span>{t.orderNotes.empty}</span>
          </div>
        ) : (
          <div className="list">
            {shown.map((n) => (
              <div key={n.id} className="list-item" style={{ alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
                <div className="grow stack" style={{ gap: 4 }}>
                  <div className="row" style={{ gap: 8 }}>
                    <strong style={{ fontSize: "1rem", color: "var(--navy-900)" }}>{n.partName}</strong>
                    <span className="badge badge-orange num">× {n.quantity}</span>
                    {n.reference && (
                      <span className="chip mono" dir="ltr">
                        {n.reference}
                      </span>
                    )}
                    {n.vehicle && <span className="chip">{n.vehicle}</span>}
                  </div>
                  {(n.customerInfo || n.note) && (
                    <div style={{ fontSize: "0.88rem", color: "var(--text-2)" }}>
                      {n.customerInfo && <strong>👤 {n.customerInfo} </strong>}
                      {n.note && <span>— {n.note}</span>}
                    </div>
                  )}
                  <div className="part-sub">
                    {n.storeName && (
                      <span>
                        <IconStore width={12} height={12} /> {n.storeName}
                      </span>
                    )}
                    {n.userName && (
                      <span>
                        · {t.orderNotes.writtenBy}: {n.userName}
                      </span>
                    )}
                    <span>· {formatDateTime(new Date(n.createdAt), lang)}</span>
                  </div>
                </div>

                <div className="row no-print" style={{ gap: 6 }}>
                  <button
                    type="button"
                    className={`btn btn-sm ${n.status === "PENDING" ? "btn-navy" : "btn-secondary"}`}
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        await toggleOrderNoteStatus(n.id);
                      })
                    }
                  >
                    <IconCheck />
                    {n.status === "PENDING" ? t.orderNotes.markDone : t.orderNotes.reopen}
                  </button>
                  {n.canDelete && (
                    <button
                      type="button"
                      className="btn btn-danger btn-icon btn-sm"
                      disabled={pending}
                      title={t.common.delete}
                      aria-label={t.common.delete}
                      onClick={() => {
                        if (confirm(t.common.confirmDelete)) {
                          startTransition(async () => {
                            await deleteOrderNote(n.id);
                          });
                        }
                      }}
                    >
                      <IconTrash />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
