"use client";

import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState, useTransition } from "react";
import { useI18n } from "@/lib/i18n/client";
import { formatDA } from "@/lib/format";
import { normalizeDim, normalizeRef, searchTerms } from "@/lib/search";
import Scanner from "@/components/Scanner";
import { IconAlert, IconBarcode, IconCart, IconMinus, IconPin, IconPlus, IconSearch, IconTrash } from "@/components/icons";
import { createSale } from "./actions";

type POSPart = {
  id: string;
  name: string;
  reference: string;
  refNorm: string;
  barcode: string;
  brand: string;
  dimensions: string;
  dimNorm: string;
  imageUrl: string;
  salePrice: number;
  vehicles: string;
  stocks: Record<string, { qty: number; loc: string }>;
};

type POSCustomer = { id: string; name: string; phone: string; balance: number };
type CartItem = { part: POSPart; quantity: number; unitPrice: number };

export default function POSClient({
  stores,
  defaultStoreId,
  parts,
  customers,
}: {
  stores: { id: string; name: string }[];
  defaultStoreId: string;
  parts: POSPart[];
  customers: POSCustomer[];
}) {
  const { t, lang } = useI18n();
  const router = useRouter();
  const [storeId, setStoreId] = useState(defaultStoreId);
  const [q, setQ] = useState("");
  const [scanOpen, setScanOpen] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [discountStr, setDiscountStr] = useState("");
  const [paymentMode, setPaymentMode] = useState<"cash" | "credit">("cash");
  const [customerId, setCustomerId] = useState("");
  const [addingCustomer, setAddingCustomer] = useState(false);
  const [newCustName, setNewCustName] = useState("");
  const [newCustPhone, setNewCustPhone] = useState("");
  const [paidStr, setPaidStr] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const stockOf = useCallback((p: POSPart) => p.stocks[storeId]?.qty ?? 0, [storeId]);
  const locOf = useCallback((p: POSPart) => p.stocks[storeId]?.loc ?? "", [storeId]);

  const addToCart = useCallback(
    (part: POSPart) => {
      const avail = stockOf(part);
      if (avail <= 0) {
        setError(`${t.pos.errStock}: ${part.name}`);
        return;
      }
      setError(null);
      setCart((prev) => {
        const existing = prev.find((x) => x.part.id === part.id);
        if (existing) {
          if (existing.quantity >= avail) return prev;
          return prev.map((x) => (x.part.id === part.id ? { ...x, quantity: x.quantity + 1 } : x));
        }
        return [...prev, { part, quantity: 1, unitPrice: part.salePrice }];
      });
    },
    [stockOf, t.pos.errStock],
  );

  const onScanned = useCallback(
    (code: string) => {
      setScanOpen(false);
      const norm = normalizeRef(code);
      const hit = parts.find((p) => p.barcode === code || (norm && p.refNorm === norm));
      if (hit) addToCart(hit);
      else setQ(code);
    },
    [parts, addToCart],
  );

  const filtered = useMemo(() => {
    const terms = searchTerms(q).map((term) => term.toLowerCase());
    return parts
      .filter((p) => {
        if (!terms.length) return stockOf(p) > 0;
        return terms.every((term) => {
          const n = normalizeRef(term);
          const dn = normalizeDim(term);
          return (
            p.name.toLowerCase().includes(term) ||
            p.brand.toLowerCase().includes(term) ||
            p.dimensions.toLowerCase().includes(term) ||
            p.vehicles.toLowerCase().includes(term) ||
            p.barcode === term ||
            (n && p.refNorm.includes(n)) ||
            (dn && p.dimNorm.includes(dn))
          );
        });
      })
      .slice(0, 24);
  }, [parts, q, stockOf]);

  const subtotal = cart.reduce((s, it) => s + it.quantity * it.unitPrice, 0);
  const discount = Math.min(subtotal, Math.max(0, Number(discountStr.replace(",", ".")) || 0));
  const total = Math.max(0, subtotal - discount);
  const paidNow = paymentMode === "cash" ? total : Math.min(total, Math.max(0, Number(paidStr.replace(",", ".")) || 0));
  const remainingDebt = Math.max(0, total - paidNow);

  const submitSale = () => {
    setError(null);
    startTransition(async () => {
      const res = await createSale({
        storeId,
        paymentMode,
        customerId: addingCustomer ? "" : customerId,
        newCustomerName: addingCustomer ? newCustName : "",
        newCustomerPhone: addingCustomer ? newCustPhone : "",
        discount,
        paidAmount: paidNow,
        note,
        items: cart.map((c) => ({ partId: c.part.id, quantity: c.quantity, unitPrice: c.unitPrice })),
      });
      if (res.error) setError(res.error);
      else if (res.saleId) router.push(`/sales/${res.saleId}`);
    });
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t.pos.title}</h1>
        </div>
        {stores.length > 1 && (
          <div className="page-head-actions">
            <select
              className="select"
              value={storeId}
              onChange={(e) => {
                setStoreId(e.target.value);
                setCart([]);
              }}
              aria-label={t.pos.storeRequired}
            >
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {error && (
        <div className="alert alert-error" role="alert">
          <IconAlert />
          {error}
        </div>
      )}

      <div className="grid-main">
        {/* Left / Top: Catalog search & quick add */}
        <section className="stack" style={{ gap: 14 }}>
          <div className="toolbar">
            <div className="input-group">
              <IconSearch />
              <input
                className="input"
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t.pos.searchPh}
                autoFocus
              />
            </div>
            <button
              className="btn btn-secondary btn-icon"
              type="button"
              onClick={() => setScanOpen(true)}
              title={t.home.scan}
              aria-label={t.home.scan}
            >
              <IconBarcode />
            </button>
          </div>

          <div className="card">
            <div className="list">
              {filtered.map((p) => {
                const qty = stockOf(p);
                const loc = locOf(p);
                return (
                  <button
                    key={p.id}
                    type="button"
                    disabled={qty <= 0}
                    onClick={() => addToCart(p)}
                    className="list-item"
                    style={{
                      width: "100%",
                      textAlign: "start",
                      background: "transparent",
                      border: 0,
                      borderBottom: "1px solid var(--line)",
                      cursor: qty > 0 ? "pointer" : "not-allowed",
                      opacity: qty > 0 ? 1 : 0.45,
                    }}
                  >
                    {p.imageUrl && (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={p.imageUrl}
                        alt=""
                        style={{ width: 42, height: 42, objectFit: "cover", borderRadius: 8, border: "1px solid var(--line)" }}
                      />
                    )}
                    <div className="grow">
                      <div className="title">{p.name}</div>
                      <div className="part-sub">
                        <span className="ref">{p.reference}</span>
                        {p.brand && <span>· {p.brand}</span>}
                        {p.dimensions && <span dir="ltr">· {p.dimensions}</span>}
                        {loc && (
                          <span>
                            · <IconPin width={12} height={12} /> {loc}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="stack" style={{ gap: 2, alignItems: "flex-end" }}>
                      <strong className="num">{formatDA(p.salePrice, lang)}</strong>
                      <span className={`badge num ${qty > 0 ? "badge-ok" : "badge-out"}`}>
                        {t.pos.inStock}: {qty}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* Right / Bottom: Cart & Checkout */}
        <section className="card card-pad stack" style={{ gap: 16 }}>
          <div className="row spread">
            <h2 className="row" style={{ gap: 8 }}>
              <IconCart width={20} height={20} />
              {t.pos.cart}
            </h2>
            <span className="badge num">{cart.reduce((s, c) => s + c.quantity, 0)}</span>
          </div>

          {cart.length === 0 ? (
            <p className="muted small" style={{ padding: "18px 0", textAlign: "center" }}>
              {t.pos.emptyCart}
            </p>
          ) : (
            <div className="stack" style={{ gap: 10 }}>
              {cart.map((it) => {
                const max = stockOf(it.part);
                return (
                  <div
                    key={it.part.id}
                    style={{
                      padding: 10,
                      borderRadius: 10,
                      background: "var(--surface-2)",
                      border: "1px solid var(--line)",
                    }}
                    className="stack"
                  >
                    <div className="row spread" style={{ flexWrap: "nowrap" }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600 }}>{it.part.name}</div>
                        <div className="ref muted small">{it.part.reference}</div>
                      </div>
                      <button
                        type="button"
                        className="btn btn-ghost btn-icon btn-sm"
                        onClick={() => setCart((c) => c.filter((x) => x.part.id !== it.part.id))}
                        aria-label={t.common.delete}
                      >
                        <IconTrash />
                      </button>
                    </div>
                    <div className="row spread">
                      <div className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
                        <button
                          type="button"
                          className="btn btn-secondary btn-icon btn-sm"
                          onClick={() =>
                            setCart((c) =>
                              c.map((x) => (x.part.id === it.part.id ? { ...x, quantity: Math.max(1, x.quantity - 1) } : x)),
                            )
                          }
                        >
                          <IconMinus />
                        </button>
                        <span className="num" style={{ minWidth: 28, textAlign: "center", fontWeight: 700 }}>
                          {it.quantity}
                        </span>
                        <button
                          type="button"
                          className="btn btn-secondary btn-icon btn-sm"
                          disabled={it.quantity >= max}
                          onClick={() =>
                            setCart((c) =>
                              c.map((x) => (x.part.id === it.part.id ? { ...x, quantity: Math.min(max, x.quantity + 1) } : x)),
                            )
                          }
                        >
                          <IconPlus />
                        </button>
                      </div>
                      <div className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
                        <input
                          className="input num"
                          style={{ width: 104, minHeight: 34, padding: "4px 8px" }}
                          inputMode="decimal"
                          value={it.unitPrice}
                          aria-label={t.pos.unitPrice}
                          onChange={(e) => {
                            const val = Math.max(0, Number(e.target.value.replace(",", ".")) || 0);
                            setCart((c) => c.map((x) => (x.part.id === it.part.id ? { ...x, unitPrice: val } : x)));
                          }}
                        />
                        <strong className="num">{formatDA(it.quantity * it.unitPrice, lang)}</strong>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="stack" style={{ gap: 10, borderTop: "1px solid var(--line)", paddingTop: 12 }}>
            <div className="row spread small">
              <span className="muted">{t.pos.subtotal}</span>
              <span className="num">{formatDA(subtotal, lang)}</span>
            </div>
            <div className="row spread">
              <label className="small muted" htmlFor="pos-discount">
                {t.pos.discount}
              </label>
              <input
                id="pos-discount"
                className="input num"
                style={{ width: 120, minHeight: 34, padding: "4px 8px" }}
                inputMode="decimal"
                placeholder="0"
                value={discountStr}
                onChange={(e) => setDiscountStr(e.target.value)}
              />
            </div>
            <div className="row spread" style={{ fontSize: "1.15rem" }}>
              <strong>{t.pos.total}</strong>
              <strong className="num" style={{ color: "var(--navy-900)" }}>
                {formatDA(total, lang)}
              </strong>
            </div>
          </div>

          {/* Payment mode */}
          <div className="stack" style={{ gap: 10 }}>
            <div className="segmented" role="radiogroup" style={{ width: "100%" }}>
              <label>
                <input type="radio" name="pmode" checked={paymentMode === "cash"} onChange={() => setPaymentMode("cash")} />
                {t.pos.cash}
              </label>
              <label>
                <input type="radio" name="pmode" checked={paymentMode === "credit"} onChange={() => setPaymentMode("credit")} />
                {t.pos.credit}
              </label>
            </div>

            <div className="field">
              <div className="row spread">
                <label className="label" htmlFor="pos-cust">
                  {t.pos.customer} {paymentMode === "credit" ? "*" : ""}
                </label>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setAddingCustomer((v) => !v)}
                >
                  {addingCustomer ? t.common.cancel : `+ ${t.pos.newCustomer}`}
                </button>
              </div>
              {addingCustomer ? (
                <div className="form-grid" style={{ gridTemplateColumns: "1.3fr 1fr" }}>
                  <input
                    className="input"
                    placeholder={t.customers.name}
                    value={newCustName}
                    onChange={(e) => setNewCustName(e.target.value)}
                  />
                  <input
                    className="input num"
                    placeholder={t.customers.phone}
                    value={newCustPhone}
                    onChange={(e) => setNewCustPhone(e.target.value)}
                    dir="ltr"
                  />
                </div>
              ) : (
                <select
                  id="pos-cust"
                  className="select"
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                >
                  <option value="">{paymentMode === "credit" ? t.pos.chooseCustomer : t.pos.walkIn}</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.balance > 0 ? `(${formatDA(c.balance, lang)})` : ""}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {paymentMode === "credit" && (
              <>
                <div className="field">
                  <label className="label" htmlFor="pos-paid">
                    {t.pos.paidNow}
                  </label>
                  <input
                    id="pos-paid"
                    className="input num"
                    inputMode="decimal"
                    placeholder="0"
                    value={paidStr}
                    onChange={(e) => setPaidStr(e.target.value)}
                  />
                </div>
                <div
                  className="row spread"
                  style={{ padding: "10px 12px", borderRadius: 10, background: "var(--warn-bg)", color: "var(--warn)" }}
                >
                  <span style={{ fontWeight: 600 }}>{t.pos.remainingDebt}</span>
                  <strong className="num">{formatDA(remainingDebt, lang)}</strong>
                </div>
              </>
            )}

            <input
              className="input"
              placeholder={t.pos.notePh}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />

            <button
              type="button"
              className="btn btn-primary btn-lg btn-block"
              disabled={pending || cart.length === 0 || !storeId}
              onClick={submitSale}
              id="complete-sale-btn"
            >
              {pending ? "…" : t.pos.completeSale}
            </button>
          </div>
        </section>
      </div>

      <Scanner open={scanOpen} onClose={() => setScanOpen(false)} onDetected={onScanned} />
    </>
  );
}
