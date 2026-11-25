"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState, useTransition } from "react";
import { useI18n } from "@/lib/i18n/client";
import { formatDA } from "@/lib/format";
import { normalizeRef } from "@/lib/search";
import Scanner from "@/components/Scanner";
import { IconAlert, IconArrowBack, IconBarcode, IconBoxIn, IconPlus, IconSearch, IconTrash } from "@/components/icons";
import { createPurchase } from "../actions";

type PartOption = {
  id: string;
  name: string;
  reference: string;
  refNorm: string;
  barcode: string;
  brand: string;
  purchasePrice: number;
  salePrice: number;
};

type Line = { part: PartOption; quantity: number; unitCost: number; newSalePrice: number };

export default function PurchaseFormClient({
  stores,
  defaultStoreId,
  suppliers,
  parts,
}: {
  stores: { id: string; name: string }[];
  defaultStoreId: string;
  suppliers: { id: string; name: string; balance: number }[];
  parts: PartOption[];
}) {
  const { t, lang } = useI18n();
  const router = useRouter();
  const [storeId, setStoreId] = useState(defaultStoreId);
  const [supplierId, setSupplierId] = useState("");
  const [addingSup, setAddingSup] = useState(false);
  const [newSupName, setNewSupName] = useState("");
  const [newSupPhone, setNewSupPhone] = useState("");
  const [supplierRef, setSupplierRef] = useState("");
  const [q, setQ] = useState("");
  const [scanOpen, setScanOpen] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [payMode, setPayMode] = useState<"cash" | "credit">("cash");
  const [paidStr, setPaidStr] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const addPart = useCallback((p: PartOption) => {
    setLines((prev) => {
      const ex = prev.find((x) => x.part.id === p.id);
      if (ex) return prev.map((x) => (x.part.id === p.id ? { ...x, quantity: x.quantity + 1 } : x));
      return [...prev, { part: p, quantity: 1, unitCost: p.purchasePrice, newSalePrice: p.salePrice }];
    });
  }, []);

  const onScanned = useCallback(
    (code: string) => {
      setScanOpen(false);
      const norm = normalizeRef(code);
      const hit = parts.find((p) => p.barcode === code || (norm && p.refNorm === norm));
      if (hit) addPart(hit);
      else setQ(code);
    },
    [parts, addPart],
  );

  const filtered = useMemo(() => {
    const terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return parts
      .filter((p) =>
        terms.every((term) => {
          const n = normalizeRef(term);
          return p.name.toLowerCase().includes(term) || p.brand.toLowerCase().includes(term) || p.barcode === term || (n && p.refNorm.includes(n));
        }),
      )
      .slice(0, 20);
  }, [parts, q]);

  const total = lines.reduce((s, l) => s + l.quantity * l.unitCost, 0);
  const paidNow = payMode === "cash" ? total : Math.min(total, Math.max(0, Number(paidStr.replace(",", ".")) || 0));
  const remDebt = Math.max(0, total - paidNow);

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const res = await createPurchase({
        storeId,
        supplierId: addingSup ? "" : supplierId,
        newSupplierName: addingSup ? newSupName : "",
        newSupplierPhone: addingSup ? newSupPhone : "",
        supplierRef,
        paidAmount: paidNow,
        note,
        items: lines.map((l) => ({
          partId: l.part.id,
          quantity: l.quantity,
          unitCost: l.unitCost,
          newSalePrice: l.newSalePrice,
        })),
      });
      if (res.error) setError(res.error);
      else if (res.purchaseId) router.push(`/purchases/${res.purchaseId}`);
    });
  };

  return (
    <>
      <div className="page-head">
        <div>
          <Link href="/purchases" className="crumb">
            <IconArrowBack className="flip" />
            {t.purchases.title}
          </Link>
          <h1>{t.purchases.newBtn}</h1>
        </div>
        <div className="page-head-actions">
          <Link href="/parts/new" className="btn btn-secondary">
            <IconPlus />
            {t.parts.newPart}
          </Link>
        </div>
      </div>

      {error && (
        <div className="alert alert-error">
          <IconAlert />
          {error}
        </div>
      )}

      <div className="grid-main">
        {/* Catalog picker */}
        <section className="stack" style={{ gap: 14 }}>
          <div className="toolbar">
            <div className="input-group">
              <IconSearch />
              <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.pos.searchPh} />
            </div>
            <button className="btn btn-secondary btn-icon" type="button" onClick={() => setScanOpen(true)} aria-label={t.home.scan}>
              <IconBarcode />
            </button>
          </div>

          <div className="card">
            <div className="list">
              {filtered.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => addPart(p)}
                  className="list-item"
                  style={{ width: "100%", textAlign: "start", background: "transparent", border: 0, borderBottom: "1px solid var(--line)", cursor: "pointer" }}
                >
                  <div className="grow">
                    <div className="title">{p.name}</div>
                    <div className="part-sub">
                      <span className="ref">{p.reference}</span>
                      {p.brand && <span>· {p.brand}</span>}
                    </div>
                  </div>
                  <span className="num muted small">{formatDA(p.purchasePrice, lang)}</span>
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Invoice builder */}
        <section className="card card-pad stack" style={{ gap: 16 }}>
          <div className="form-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <div className="field">
              <label className="label" htmlFor="pu-store">
                {t.purchases.targetStore}
              </label>
              <select id="pu-store" className="select" value={storeId} onChange={(e) => setStoreId(e.target.value)}>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label className="label" htmlFor="pu-ref">
                {t.purchases.supplierRef}
              </label>
              <input id="pu-ref" className="input mono" value={supplierRef} onChange={(e) => setSupplierRef(e.target.value)} dir="ltr" />
            </div>
          </div>

          <div className="field">
            <div className="row spread">
              <label className="label" htmlFor="pu-sup">
                {t.purchases.supplier}
              </label>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAddingSup((v) => !v)}>
                {addingSup ? t.common.cancel : `+ ${t.suppliers.add}`}
              </button>
            </div>
            {addingSup ? (
              <div className="form-grid" style={{ gridTemplateColumns: "1.3fr 1fr" }}>
                <input className="input" placeholder={t.suppliers.name} value={newSupName} onChange={(e) => setNewSupName(e.target.value)} />
                <input className="input num" placeholder={t.suppliers.phone} value={newSupPhone} onChange={(e) => setNewSupPhone(e.target.value)} dir="ltr" />
              </div>
            ) : (
              <select id="pu-sup" className="select" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                <option value="">{t.purchases.chooseSupplier}</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} {s.balance > 0 ? `(${formatDA(s.balance, lang)})` : ""}
                  </option>
                ))}
              </select>
            )}
          </div>

          {lines.length === 0 ? (
            <p className="muted small" style={{ padding: "16px 0", textAlign: "center" }}>
              {t.purchases.errItems}
            </p>
          ) : (
            <div className="stack" style={{ gap: 10 }}>
              {lines.map((l) => (
                <div key={l.part.id} style={{ padding: 10, borderRadius: 10, background: "var(--surface-2)", border: "1px solid var(--line)" }} className="stack">
                  <div className="row spread">
                    <div>
                      <div style={{ fontWeight: 600 }}>{l.part.name}</div>
                      <div className="ref small muted">{l.part.reference}</div>
                    </div>
                    <button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => setLines((arr) => arr.filter((x) => x.part.id !== l.part.id))}>
                      <IconTrash />
                    </button>
                  </div>
                  <div className="form-grid" style={{ gridTemplateColumns: "80px 1fr 1fr" }}>
                    <div className="field">
                      <span className="hint">{t.parts.quantity}</span>
                      <input
                        className="input num"
                        type="number"
                        min={1}
                        value={l.quantity}
                        onChange={(e) => {
                          const qn = Math.max(1, Number(e.target.value) || 1);
                          setLines((arr) => arr.map((x) => (x.part.id === l.part.id ? { ...x, quantity: qn } : x)));
                        }}
                      />
                    </div>
                    <div className="field">
                      <span className="hint">{t.purchases.unitCost}</span>
                      <input
                        className="input num"
                        inputMode="decimal"
                        value={l.unitCost}
                        onChange={(e) => {
                          const c = Math.max(0, Number(e.target.value.replace(",", ".")) || 0);
                          setLines((arr) => arr.map((x) => (x.part.id === l.part.id ? { ...x, unitCost: c } : x)));
                        }}
                      />
                    </div>
                    <div className="field">
                      <span className="hint">{t.purchases.newSalePrice}</span>
                      <input
                        className="input num"
                        inputMode="decimal"
                        value={l.newSalePrice}
                        onChange={(e) => {
                          const sp = Math.max(0, Number(e.target.value.replace(",", ".")) || 0);
                          setLines((arr) => arr.map((x) => (x.part.id === l.part.id ? { ...x, newSalePrice: sp } : x)));
                        }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="row spread" style={{ fontSize: "1.15rem", borderTop: "1px solid var(--line)", paddingTop: 10 }}>
            <strong>{t.purchases.total}</strong>
            <strong className="num">{formatDA(total, lang)}</strong>
          </div>

          <div className="segmented" role="radiogroup" style={{ width: "100%" }}>
            <label>
              <input type="radio" name="pupay" checked={payMode === "cash"} onChange={() => setPayMode("cash")} />
              {t.pos.cash}
            </label>
            <label>
              <input type="radio" name="pupay" checked={payMode === "credit"} onChange={() => setPayMode("credit")} />
              {t.pos.credit}
            </label>
          </div>

          {payMode === "credit" && (
            <>
              <div className="field">
                <label className="label" htmlFor="pu-paid">
                  {t.purchases.paidNow}
                </label>
                <input id="pu-paid" className="input num" inputMode="decimal" placeholder="0" value={paidStr} onChange={(e) => setPaidStr(e.target.value)} />
              </div>
              <div className="row spread" style={{ padding: "10px 12px", borderRadius: 10, background: "var(--warn-bg)", color: "var(--warn)" }}>
                <span style={{ fontWeight: 600 }}>{t.purchases.remainingDebt}</span>
                <strong className="num">{formatDA(remDebt, lang)}</strong>
              </div>
            </>
          )}

          <input className="input" placeholder={t.pos.notePh} value={note} onChange={(e) => setNote(e.target.value)} />

          <button type="button" className="btn btn-primary btn-lg btn-block" disabled={pending || lines.length === 0 || !storeId} onClick={submit}>
            <IconBoxIn />
            {pending ? "…" : t.purchases.savePurchase}
          </button>
        </section>
      </div>

      <Scanner open={scanOpen} onClose={() => setScanOpen(false)} onDetected={onScanned} />
    </>
  );
}
