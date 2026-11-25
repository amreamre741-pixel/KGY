"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState, useTransition } from "react";
import { useI18n } from "@/lib/i18n/client";
import { normalizeRef } from "@/lib/search";
import Scanner from "@/components/Scanner";
import { IconAlert, IconArrowBack, IconBarcode, IconPin, IconSearch, IconTransfer, IconTrash } from "@/components/icons";
import { createTransfer } from "../actions";

type TransferPart = {
  id: string;
  name: string;
  reference: string;
  refNorm: string;
  barcode: string;
  brand: string;
  stocks: Record<string, { qty: number; loc: string }>;
};

type TransferLine = { part: TransferPart; quantity: number; toLocation: string };

export default function TransferFormClient({
  fromStores,
  allStores,
  parts,
}: {
  fromStores: { id: string; name: string }[];
  allStores: { id: string; name: string }[];
  parts: TransferPart[];
}) {
  const { t } = useI18n();
  const router = useRouter();
  const initialFrom = fromStores[0]?.id ?? "";
  const initialTo = allStores.find((s) => s.id !== initialFrom)?.id ?? "";

  const [fromStoreId, setFromStoreId] = useState(initialFrom);
  const [toStoreId, setToStoreId] = useState(initialTo);
  const [q, setQ] = useState("");
  const [scanOpen, setScanOpen] = useState(false);
  const [lines, setLines] = useState<TransferLine[]>([]);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const availOf = useCallback((p: TransferPart) => p.stocks[fromStoreId]?.qty ?? 0, [fromStoreId]);

  const addPart = useCallback(
    (p: TransferPart) => {
      const avail = availOf(p);
      if (avail <= 0) return;
      const defaultToLoc = p.stocks[toStoreId]?.loc ?? "";
      setLines((prev) => {
        const ex = prev.find((x) => x.part.id === p.id);
        if (ex) {
          if (ex.quantity >= avail) return prev;
          return prev.map((x) => (x.part.id === p.id ? { ...x, quantity: x.quantity + 1 } : x));
        }
        return [...prev, { part: p, quantity: 1, toLocation: defaultToLoc }];
      });
    },
    [availOf, toStoreId],
  );

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
      .filter((p) => {
        if (!terms.length) return availOf(p) > 0;
        return terms.every((term) => {
          const n = normalizeRef(term);
          return p.name.toLowerCase().includes(term) || p.brand.toLowerCase().includes(term) || p.barcode === term || (n && p.refNorm.includes(n));
        });
      })
      .slice(0, 24);
  }, [parts, q, availOf]);

  if (allStores.length < 2) {
    return (
      <div className="card empty">
        <div className="empty-icon">
          <IconTransfer />
        </div>
        <span>{t.transfers.needTwoStores}</span>
        <Link href="/stores" className="btn btn-primary">
          {t.nav.stores}
        </Link>
      </div>
    );
  }

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const res = await createTransfer({
        fromStoreId,
        toStoreId,
        note,
        items: lines.map((l) => ({ partId: l.part.id, quantity: l.quantity, toLocation: l.toLocation })),
      });
      if (res.error) setError(res.error);
      else if (res.transferId) router.push(`/transfers/${res.transferId}`);
    });
  };

  return (
    <>
      <div className="page-head">
        <div>
          <Link href="/transfers" className="crumb">
            <IconArrowBack className="flip" />
            {t.transfers.title}
          </Link>
          <h1>{t.transfers.newBtn}</h1>
        </div>
      </div>

      {error && (
        <div className="alert alert-error">
          <IconAlert />
          {error}
        </div>
      )}

      <div className="grid-main">
        {/* Source store parts */}
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
              {filtered.map((p) => {
                const qty = availOf(p);
                const loc = p.stocks[fromStoreId]?.loc ?? "";
                return (
                  <button
                    key={p.id}
                    type="button"
                    disabled={qty <= 0}
                    onClick={() => addPart(p)}
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
                    <div className="grow">
                      <div className="title">{p.name}</div>
                      <div className="part-sub">
                        <span className="ref">{p.reference}</span>
                        {loc && (
                          <span>
                            · <IconPin width={12} height={12} /> {loc}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className={`badge num ${qty > 0 ? "badge-ok" : "badge-out"}`}>{qty}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* Transfer builder */}
        <section className="card card-pad stack" style={{ gap: 16 }}>
          <div className="form-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <div className="field">
              <label className="label" htmlFor="tr-from">
                {t.transfers.fromStore}
              </label>
              <select
                id="tr-from"
                className="select"
                value={fromStoreId}
                onChange={(e) => {
                  const nextFrom = e.target.value;
                  setFromStoreId(nextFrom);
                  if (toStoreId === nextFrom) {
                    setToStoreId(allStores.find((s) => s.id !== nextFrom)?.id ?? "");
                  }
                  setLines([]);
                }}
              >
                {fromStores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label className="label" htmlFor="tr-to">
                {t.transfers.toStore}
              </label>
              <select id="tr-to" className="select" value={toStoreId} onChange={(e) => setToStoreId(e.target.value)}>
                {allStores
                  .filter((s) => s.id !== fromStoreId)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          {lines.length === 0 ? (
            <p className="muted small" style={{ padding: "16px 0", textAlign: "center" }}>
              {t.transfers.errItems}
            </p>
          ) : (
            <div className="stack" style={{ gap: 10 }}>
              {lines.map((l) => {
                const max = availOf(l.part);
                return (
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
                    <div className="form-grid" style={{ gridTemplateColumns: "110px 1fr" }}>
                      <div className="field">
                        <span className="hint">
                          {t.parts.quantity} (max: {max})
                        </span>
                        <input
                          className="input num"
                          type="number"
                          min={1}
                          max={max}
                          value={l.quantity}
                          onChange={(e) => {
                            const qn = Math.min(max, Math.max(1, Number(e.target.value) || 1));
                            setLines((arr) => arr.map((x) => (x.part.id === l.part.id ? { ...x, quantity: qn } : x)));
                          }}
                        />
                      </div>
                      <div className="field">
                        <span className="hint">{t.transfers.toLocation}</span>
                        <input
                          className="input"
                          placeholder="A-3"
                          dir="ltr"
                          value={l.toLocation}
                          onChange={(e) => setLines((arr) => arr.map((x) => (x.part.id === l.part.id ? { ...x, toLocation: e.target.value } : x)))}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <input className="input" placeholder={t.pos.notePh} value={note} onChange={(e) => setNote(e.target.value)} />

          <button
            type="button"
            className="btn btn-primary btn-lg btn-block"
            disabled={pending || lines.length === 0 || !fromStoreId || !toStoreId || fromStoreId === toStoreId}
            onClick={submit}
          >
            <IconTransfer />
            {pending ? "…" : t.transfers.saveTransfer}
          </button>
        </section>
      </div>

      <Scanner open={scanOpen} onClose={() => setScanOpen(false)} onDetected={onScanned} />
    </>
  );
}
