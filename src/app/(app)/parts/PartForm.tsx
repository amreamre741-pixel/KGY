"use client";

import Link from "next/link";
import { useActionState, useCallback, useState } from "react";
import { useI18n } from "@/lib/i18n/client";
import { formatDA } from "@/lib/format";
import { compressImageFile } from "@/lib/image";
import Scanner from "@/components/Scanner";
import { IconAlert, IconArrowBack, IconBarcode, IconCamera, IconCar, IconImage, IconPlus, IconTrash, IconTruck } from "@/components/icons";
import { savePart } from "./actions";

type Compat = { type: "CAR" | "TRUCK"; make: string; model: string; yearFrom: string; yearTo: string };
type StockRow = { storeId: string; storeName: string; quantity: string; minQuantity: string; location: string };

export type PartFormInitial = {
  id?: string;
  reference: string;
  barcode: string;
  nameAr: string;
  nameEn: string;
  brand: string;
  category: string;
  purchasePrice: string;
  salePrice: string;
  imageUrl: string;
  notes: string;
  compat: Compat[];
  stocks: StockRow[];
};

const emptyCompat = (): Compat => ({ type: "CAR", make: "", model: "", yearFrom: "", yearTo: "" });

export default function PartForm({
  initial,
  categories,
  brands,
  makes,
}: {
  initial: PartFormInitial;
  categories: string[];
  brands: string[];
  makes: string[];
}) {
  const { t, lang } = useI18n();
  const isEdit = Boolean(initial.id);
  const [state, action, pending] = useActionState(savePart, undefined);
  const [f, setF] = useState(initial);
  const [compat, setCompat] = useState<Compat[]>(initial.compat.length ? initial.compat : []);
  const [stocks, setStocks] = useState<StockRow[]>(initial.stocks);
  const [scanOpen, setScanOpen] = useState(false);

  const set = (k: keyof PartFormInitial) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setF((prev) => ({ ...prev, [k]: e.target.value }));

  const onPhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const dataUrl = await compressImageFile(file);
      setF((prev) => ({ ...prev, imageUrl: dataUrl }));
    } catch {
      // ignore invalid image
    }
  };

  const setCompatField = (i: number, k: keyof Compat, v: string) =>
    setCompat((rows) => rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));

  const setStockField = (i: number, k: keyof StockRow, v: string) =>
    setStocks((rows) => rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));

  const onScanned = useCallback((code: string) => {
    setScanOpen(false);
    setF((prev) => ({ ...prev, barcode: code }));
  }, []);

  const buy = Number(f.purchasePrice.replace(",", ".")) || 0;
  const sell = Number(f.salePrice.replace(",", ".")) || 0;
  const margin = sell - buy;
  const marginPct = buy > 0 ? Math.round((margin / buy) * 100) : null;

  const payload = JSON.stringify({ ...f, compat, stocks });

  return (
    <form action={action} className="stack" style={{ gap: 22 }}>
      <input type="hidden" name="payload" value={payload} />

      <div className="page-head">
        <div>
          <Link href={isEdit ? `/parts/${initial.id}` : "/parts"} className="crumb">
            <IconArrowBack className="flip" />
            {t.common.back}
          </Link>
          <h1>{isEdit ? t.partForm.editTitle : t.partForm.newTitle}</h1>
        </div>
        <div className="page-head-actions">
          <button className="btn btn-primary" type="submit" disabled={pending} id="part-save-top">
            {pending ? "…" : t.common.save}
          </button>
        </div>
      </div>

      {state?.error && (
        <div className="alert alert-error" role="alert">
          <IconAlert />
          {state.error}
        </div>
      )}

      <section className="card">
        <div className="card-head">
          <h2>{t.partForm.general}</h2>
        </div>
        <div className="card-body form-grid">
          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <span className="label">
              {t.partForm.photo} <span className="opt">({t.common.optional})</span>
            </span>
            <div className="row" style={{ gap: 14, alignItems: "center", flexWrap: "wrap" }}>
              {f.imageUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={f.imageUrl}
                  alt=""
                  style={{
                    width: 96,
                    height: 96,
                    objectFit: "cover",
                    borderRadius: 12,
                    border: "1px solid var(--line)",
                  }}
                />
              ) : (
                <div
                  style={{
                    width: 96,
                    height: 96,
                    borderRadius: 12,
                    border: "1px dashed var(--line-strong)",
                    background: "var(--surface-2)",
                    display: "grid",
                    placeItems: "center",
                    color: "var(--muted)",
                  }}
                >
                  <IconCamera width={28} height={28} />
                </div>
              )}
              <div className="stack" style={{ gap: 8 }}>
                <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                  <label className="btn btn-navy btn-sm" style={{ cursor: "pointer" }}>
                    <IconCamera />
                    {t.partForm.takePhoto}
                    <input type="file" accept="image/*" capture="environment" onChange={onPhotoChange} className="sr-only" />
                  </label>
                  <label className="btn btn-secondary btn-sm" style={{ cursor: "pointer" }}>
                    <IconImage />
                    {t.partForm.choosePhoto}
                    <input type="file" accept="image/*" onChange={onPhotoChange} className="sr-only" />
                  </label>
                  {f.imageUrl && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => setF((prev) => ({ ...prev, imageUrl: "" }))}
                    >
                      <IconTrash />
                      {t.partForm.removePhoto}
                    </button>
                  )}
                </div>
                <span className="hint">{t.partForm.photoHint}</span>
              </div>
            </div>
          </div>
          <div className="field">
            <label className="label" htmlFor="reference">
              {t.partForm.reference} *
            </label>
            <input className="input ref" id="reference" value={f.reference} onChange={set("reference")} required dir="ltr" />
            <span className="hint">{t.partForm.referenceHint}</span>
          </div>
          <div className="field">
            <label className="label" htmlFor="nameAr">
              {t.partForm.nameAr} *
            </label>
            <input className="input" id="nameAr" value={f.nameAr} onChange={set("nameAr")} required dir="rtl" />
          </div>
          <div className="field">
            <label className="label" htmlFor="nameEn">
              {t.partForm.nameEn} <span className="opt">({t.common.optional})</span>
            </label>
            <input className="input" id="nameEn" value={f.nameEn} onChange={set("nameEn")} dir="ltr" />
          </div>
          <div className="field">
            <label className="label" htmlFor="brand">
              {t.partForm.brand}
            </label>
            <input className="input" id="brand" value={f.brand} onChange={set("brand")} list="brands-list" />
            <datalist id="brands-list">
              {brands.map((b) => (
                <option key={b} value={b} />
              ))}
            </datalist>
            <span className="hint">{t.partForm.brandHint}</span>
          </div>
          <div className="field">
            <label className="label" htmlFor="category">
              {t.partForm.category}
            </label>
            <input className="input" id="category" value={f.category} onChange={set("category")} list="cats-list" />
            <datalist id="cats-list">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            <span className="hint">{t.partForm.categoryHint}</span>
          </div>
          <div className="field">
            <label className="label" htmlFor="barcode">
              {t.partForm.barcode}
            </label>
            <div className="row" style={{ flexWrap: "nowrap", gap: 6 }}>
              <input className="input mono" id="barcode" value={f.barcode} onChange={set("barcode")} dir="ltr" />
              <button
                className="btn btn-secondary btn-icon"
                type="button"
                onClick={() => setScanOpen(true)}
                aria-label={t.home.scan}
                title={t.home.scan}
              >
                <IconBarcode />
              </button>
            </div>
            <span className="hint">{t.partForm.barcodeHint}</span>
          </div>
          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label className="label" htmlFor="notes">
              {t.partForm.notes} <span className="opt">({t.common.optional})</span>
            </label>
            <textarea className="textarea" id="notes" value={f.notes} onChange={set("notes")} rows={2} />
          </div>
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>{t.partForm.prices}</h2>
        </div>
        <div className="card-body form-grid">
          <div className="field">
            <label className="label" htmlFor="purchasePrice">
              {t.partForm.purchasePrice} ({lang === "ar" ? "دج" : "DA"})
            </label>
            <input
              className="input num"
              id="purchasePrice"
              inputMode="decimal"
              value={f.purchasePrice}
              onChange={set("purchasePrice")}
              placeholder="0"
            />
          </div>
          <div className="field">
            <label className="label" htmlFor="salePrice">
              {t.partForm.salePrice} ({lang === "ar" ? "دج" : "DA"})
            </label>
            <input
              className="input num"
              id="salePrice"
              inputMode="decimal"
              value={f.salePrice}
              onChange={set("salePrice")}
              placeholder="0"
            />
          </div>
          <div className="field">
            <span className="label">{t.partForm.margin}</span>
            <div
              className="input num"
              style={{
                display: "flex",
                alignItems: "center",
                background: "var(--surface-2)",
                color: margin < 0 ? "var(--danger)" : "var(--ok)",
                fontWeight: 700,
              }}
            >
              {formatDA(margin, lang)}
              {marginPct !== null && <span className="muted small" style={{ marginInlineStart: 8 }}>({marginPct}%)</span>}
            </div>
          </div>
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <div>
            <h2>{t.partForm.compat}</h2>
            <p className="hint">{t.partForm.compatHint}</p>
          </div>
          <button
            className="btn btn-secondary btn-sm"
            type="button"
            onClick={() => setCompat((r) => [...r, emptyCompat()])}
            id="add-vehicle"
          >
            <IconPlus />
            {t.partForm.addVehicle}
          </button>
        </div>
        <div className="card-body stack" style={{ gap: 10 }}>
          {compat.length === 0 && <p className="muted small">{t.partView.noCompat}</p>}
          <datalist id="makes-list">
            {makes.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
          {compat.map((c, i) => (
            <div className="compat-row fade-in" key={i}>
              <div className="field">
                <span className="label">{t.partForm.type}</span>
                <div className="segmented" role="radiogroup">
                  {(["CAR", "TRUCK"] as const).map((type) => (
                    <label key={type} title={t.vehicle[type]}>
                      <input
                        type="radio"
                        name={`ctype-${i}`}
                        checked={c.type === type}
                        onChange={() => setCompatField(i, "type", type)}
                      />
                      {type === "CAR" ? <IconCar width={18} /> : <IconTruck width={18} />}
                      <span className="sr-only">{t.vehicle[type]}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="field">
                <label className="label" htmlFor={`make-${i}`}>
                  {t.partForm.make}
                </label>
                <input
                  className="input"
                  id={`make-${i}`}
                  value={c.make}
                  list="makes-list"
                  placeholder={c.type === "TRUCK" ? "Mercedes" : t.partForm.makePh}
                  onChange={(e) => setCompatField(i, "make", e.target.value)}
                />
              </div>
              <div className="field">
                <label className="label" htmlFor={`model-${i}`}>
                  {t.partForm.model}
                </label>
                <input
                  className="input"
                  id={`model-${i}`}
                  value={c.model}
                  placeholder={c.type === "TRUCK" ? "Actros" : t.partForm.modelPh}
                  onChange={(e) => setCompatField(i, "model", e.target.value)}
                />
              </div>
              <div className="field">
                <label className="label" htmlFor={`yf-${i}`}>
                  {t.partForm.yearFrom}
                </label>
                <input
                  className="input num"
                  id={`yf-${i}`}
                  inputMode="numeric"
                  maxLength={4}
                  value={c.yearFrom}
                  onChange={(e) => setCompatField(i, "yearFrom", e.target.value.replace(/\D/g, ""))}
                />
              </div>
              <div className="field">
                <label className="label" htmlFor={`yt-${i}`}>
                  {t.partForm.yearTo}
                </label>
                <input
                  className="input num"
                  id={`yt-${i}`}
                  inputMode="numeric"
                  maxLength={4}
                  value={c.yearTo}
                  onChange={(e) => setCompatField(i, "yearTo", e.target.value.replace(/\D/g, ""))}
                />
              </div>
              <button
                className="btn btn-ghost btn-icon compat-remove"
                type="button"
                aria-label={t.partForm.remove}
                title={t.partForm.remove}
                onClick={() => setCompat((r) => r.filter((_, j) => j !== i))}
              >
                <IconTrash />
              </button>
            </div>
          ))}
        </div>
      </section>

      {stocks.length > 0 && (
        <section className="card">
          <div className="card-head">
            <div>
              <h2>{isEdit ? t.partView.settings : t.partForm.initialStock}</h2>
              {!isEdit && <p className="hint">{t.partForm.initialStockHint}</p>}
            </div>
          </div>
          <div className="card-body stack" style={{ gap: 12 }}>
            {stocks.map((s, i) => (
              <div className="stock-row" key={s.storeId}>
                <strong>{s.storeName}</strong>
                <div className="field">
                  <label className="label" htmlFor={`q-${i}`}>
                    {t.parts.quantity}
                  </label>
                  <input
                    className="input num"
                    id={`q-${i}`}
                    inputMode="numeric"
                    value={s.quantity}
                    disabled={isEdit}
                    title={isEdit ? t.partView.adjust : undefined}
                    onChange={(e) => setStockField(i, "quantity", e.target.value.replace(/\D/g, ""))}
                    placeholder="0"
                  />
                </div>
                <div className="field">
                  <label className="label" htmlFor={`m-${i}`}>
                    {t.partForm.minQuantity}
                  </label>
                  <input
                    className="input num"
                    id={`m-${i}`}
                    inputMode="numeric"
                    value={s.minQuantity}
                    onChange={(e) => setStockField(i, "minQuantity", e.target.value.replace(/\D/g, ""))}
                    placeholder="0"
                  />
                </div>
                <div className="field">
                  <label className="label" htmlFor={`l-${i}`}>
                    {t.partForm.location}
                  </label>
                  <input
                    className="input"
                    id={`l-${i}`}
                    value={s.location}
                    onChange={(e) => setStockField(i, "location", e.target.value)}
                    placeholder={t.partForm.locationPh}
                    dir="ltr"
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="form-actions">
        <Link href={isEdit ? `/parts/${initial.id}` : "/parts"} className="btn btn-ghost">
          {t.common.cancel}
        </Link>
        <button className="btn btn-primary btn-lg" type="submit" disabled={pending} id="part-save">
          {pending ? "…" : t.common.save}
        </button>
      </div>

      <Scanner open={scanOpen} onClose={() => setScanOpen(false)} onDetected={onScanned} />
    </form>
  );
}
