"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useI18n } from "@/lib/i18n/client";
import { compressImageFile } from "@/lib/image";
import { IconAlert, IconCamera, IconEdit, IconImage, IconTrash, IconX } from "@/components/icons";
import { adjustStock, deletePart, updatePartPhoto } from "../actions";

export function AdjustButton({
  partId,
  storeId,
  storeName,
  current,
}: {
  partId: string;
  storeId: string;
  storeName: string;
  current: number;
}) {
  const { t } = useI18n();
  const ref = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(adjustStock, undefined);
  const [mode, setMode] = useState<"add" | "remove" | "set">("add");
  const [qty, setQty] = useState("");

  useEffect(() => {
    if (state?.ok) ref.current?.close();
  }, [state]);

  const open = () => {
    formRef.current?.reset();
    setQty("");
    setMode("add");
    ref.current?.showModal();
  };

  const n = Number.parseInt(qty, 10);
  const preview = Number.isFinite(n) ? (mode === "add" ? current + n : mode === "remove" ? current - n : n) : null;

  return (
    <>
      <button className="btn btn-secondary btn-sm" type="button" onClick={open} id={`adjust-${storeId}`}>
        <IconEdit />
        {t.partView.adjust}
      </button>
      <dialog ref={ref} className="modal">
        <form action={action} ref={formRef}>
          <input type="hidden" name="partId" value={partId} />
          <input type="hidden" name="storeId" value={storeId} />
          <div className="modal-head">
            <div>
              <h2>{t.adjust.title}</h2>
              <p className="hint">{storeName}</p>
            </div>
            <button className="btn btn-ghost btn-icon btn-sm" type="button" onClick={() => ref.current?.close()} aria-label={t.common.close}>
              <IconX />
            </button>
          </div>
          <div className="modal-body">
            {state?.error && (
              <div className="alert alert-error" role="alert">
                <IconAlert />
                {state.error}
              </div>
            )}
            <div className="segmented" role="radiogroup" style={{ width: "100%" }}>
              {(["add", "remove", "set"] as const).map((m) => (
                <label key={m}>
                  <input type="radio" name="mode" value={m} checked={mode === m} onChange={() => setMode(m)} />
                  {m === "add" ? t.adjust.add : m === "remove" ? t.adjust.remove : t.adjust.set}
                </label>
              ))}
            </div>
            <div className="field">
              <label className="label" htmlFor={`qty-${storeId}`}>
                {mode === "set" ? t.adjust.newQty : t.adjust.quantity}
              </label>
              <input
                className="input num"
                id={`qty-${storeId}`}
                name="quantity"
                inputMode="numeric"
                required
                autoFocus
                value={qty}
                onChange={(e) => setQty(e.target.value.replace(/\D/g, ""))}
                style={{ fontSize: "1.2rem", fontWeight: 700 }}
              />
            </div>
            <div className="row spread" style={{ padding: "10px 14px", borderRadius: 10, background: "var(--surface-2)" }}>
              <span className="muted">{t.adjust.current}</span>
              <span className="num">
                <strong>{current}</strong>
                {preview !== null && (
                  <>
                    {" → "}
                    <strong style={{ color: preview < 0 ? "var(--danger)" : "var(--orange-600)" }}>{preview}</strong>
                  </>
                )}
              </span>
            </div>
            <div className="field">
              <label className="label" htmlFor={`note-${storeId}`}>
                {t.adjust.note} <span className="opt">({t.common.optional})</span>
              </label>
              <input className="input" id={`note-${storeId}`} name="note" placeholder={t.adjust.notePh} />
            </div>
          </div>
          <div className="modal-foot">
            <button className="btn btn-ghost" type="button" onClick={() => ref.current?.close()}>
              {t.common.cancel}
            </button>
            <button className="btn btn-primary" type="submit" disabled={pending || preview === null || preview < 0}>
              {pending ? "…" : t.common.save}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}

export function DeletePartButton({ partId }: { partId: string }) {
  const { t } = useI18n();
  const [pending, start] = useTransition();
  return (
    <button
      className="btn btn-danger btn-icon"
      type="button"
      disabled={pending}
      aria-label={t.common.delete}
      title={t.common.delete}
      id="delete-part-btn"
      onClick={() => {
        if (confirm(t.partView.deleteConfirm)) start(() => deletePart(partId));
      }}
    >
      <IconTrash />
    </button>
  );
}

export function PartPhotoCard({
  partId,
  imageUrl,
  canEdit,
}: {
  partId: string;
  imageUrl: string;
  canEdit: boolean;
}) {
  const { t } = useI18n();
  const [pending, start] = useTransition();

  if (!imageUrl && !canEdit) return null;

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const dataUrl = await compressImageFile(file);
      start(() => updatePartPhoto(partId, dataUrl));
    } catch {
      // ignore invalid image
    }
  };

  return (
    <section className="card card-pad stack" style={{ gap: 12 }}>
      {imageUrl ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={imageUrl}
          alt=""
          style={{
            width: "100%",
            maxHeight: 280,
            objectFit: "contain",
            borderRadius: 12,
            background: "var(--surface-2)",
            border: "1px solid var(--line)",
          }}
        />
      ) : (
        <div
          style={{
            height: 120,
            borderRadius: 12,
            border: "1px dashed var(--line-strong)",
            background: "var(--surface-2)",
            display: "grid",
            placeItems: "center",
            color: "var(--muted)",
          }}
        >
          <IconCamera width={32} height={32} />
        </div>
      )}
      {canEdit && (
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <label className="btn btn-navy btn-sm" style={{ cursor: "pointer", opacity: pending ? 0.6 : 1 }}>
            <IconCamera />
            {pending ? "…" : t.partForm.takePhoto}
            <input type="file" accept="image/*" capture="environment" onChange={onFile} disabled={pending} className="sr-only" />
          </label>
          <label className="btn btn-secondary btn-sm" style={{ cursor: "pointer", opacity: pending ? 0.6 : 1 }}>
            <IconImage />
            {t.partForm.choosePhoto}
            <input type="file" accept="image/*" onChange={onFile} disabled={pending} className="sr-only" />
          </label>
          {imageUrl && (
            <button
              type="button"
              className="btn btn-ghost btn-icon btn-sm"
              disabled={pending}
              title={t.partForm.removePhoto}
              aria-label={t.partForm.removePhoto}
              onClick={() => start(() => updatePartPhoto(partId, ""))}
            >
              <IconTrash />
            </button>
          )}
        </div>
      )}
    </section>
  );
}


