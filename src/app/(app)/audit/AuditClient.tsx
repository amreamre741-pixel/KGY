"use client";

import { useMemo, useState, useTransition } from "react";
import Scanner from "@/components/Scanner";
import { applyAuditAdjustments } from "./actions";

type PartItem = {
  id: string;
  name: string;
  reference: string;
  refNorm: string;
  barcode: string;
  brand: string;
  stocks: Record<string, { qty: number; loc: string }>;
};

type Props = {
  stores: { id: string; name: string }[];
  defaultStoreId: string;
  canApprove: boolean;
  parts: PartItem[];
};

type AuditRow = {
  part: PartItem;
  counted: number;
};

export default function AuditClient({ stores, defaultStoreId, canApprove, parts }: Props) {
  const [storeId, setStoreId] = useState(defaultStoreId);
  const [query, setQuery] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [note, setNote] = useState("");
  const [feedback, setFeedback] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const getSystemQty = (p: PartItem) => p.stocks[storeId]?.qty ?? 0;
  const getLoc = (p: PartItem) => p.stocks[storeId]?.loc || "";

  function addOrIncrementPart(part: PartItem, increment = true) {
    setFeedback(null);
    setRows((prev) => {
      const idx = prev.findIndex((r) => r.part.id === part.id);
      if (idx >= 0) {
        return prev.map((r, i) => (i === idx ? { ...r, counted: increment ? r.counted + 1 : r.counted } : r));
      }
      return [{ part, counted: 1 }, ...prev];
    });
  }

  function handleScan(code: string) {
    const clean = code.trim();
    const norm = clean.toUpperCase().replace(/[^A-Z0-9]/g, "");
    const found = parts.find(
      (p) =>
        (p.barcode && p.barcode.toLowerCase() === clean.toLowerCase()) ||
        p.reference.toLowerCase() === clean.toLowerCase() ||
        p.refNorm === norm
    );
    if (found) {
      addOrIncrementPart(found, true);
      setFeedback({ kind: "ok", text: `✓ تم مسح: ${found.name} (${found.reference})` });
    } else {
      setFeedback({ kind: "err", text: `لم يتم العثور على قطعة بالباركود: ${clean}` });
    }
    setScannerOpen(false);
  }

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const norm = q.toUpperCase().replace(/[^A-Z0-9]/g, "");
    return parts
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.reference.toLowerCase().includes(q) ||
          (norm && p.refNorm.includes(norm)) ||
          (p.barcode && p.barcode.toLowerCase().includes(q))
      )
      .slice(0, 8);
  }, [parts, query]);

  const stats = useMemo(() => {
    let matched = 0;
    let shortage = 0;
    let surplus = 0;
    for (const r of rows) {
      const diff = r.counted - getSystemQty(r.part);
      if (diff === 0) matched++;
      else if (diff < 0) shortage++;
      else surplus++;
    }
    return { total: rows.length, matched, shortage, surplus, changed: shortage + surplus };
  }, [rows, storeId]);

  function handleSaveAudit() {
    if (!canApprove) return;
    if (rows.length === 0) return;
    startTransition(async () => {
      const res = await applyAuditAdjustments(
        storeId,
        rows.map((r) => ({ partId: r.part.id, countedQty: r.counted })),
        note
      );
      if ("error" in res && res.error) {
        setFeedback({ kind: "err", text: res.error });
      } else {
        setFeedback({
          kind: "ok",
          text: `✅ تم اعتماد الجرد وتحديث ${res.adjustedCount ?? 0} قطعة في المخزون بنجاح!`,
        });
        setRows([]);
        setNote("");
      }
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="page-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22 }}>📷 جرد المخزون السريع بالكاميرا</h1>
          <p style={{ margin: "4px 0 0", opacity: 0.7, fontSize: 13 }}>
            امسح الباركود بكاميرا الهاتف لمقارنة الكمية الفعلية على الرف بالمسجلة في النظام واعتماد الفروقات.
          </p>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {stores.length > 1 && (
            <select className="select" value={storeId} onChange={(e) => setStoreId(e.target.value)}>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  🏪 {s.name}
                </option>
              ))}
            </select>
          )}
          <button type="button" className="btn btn-primary" onClick={() => setScannerOpen(true)}>
            📷 مسح باركود بالكاميرا
          </button>
        </div>
      </div>

      {feedback && (
        <div
          className="card"
          style={{
            padding: "12px 16px",
            borderColor: feedback.kind === "ok" ? "#16a34a" : "#dc2626",
            background: feedback.kind === "ok" ? "rgba(22,163,74,0.08)" : "rgba(220,38,38,0.08)",
            fontWeight: 600,
          }}
        >
          {feedback.text}
        </div>
      )}

      {/* Search & Add Manually */}
      <div className="card" style={{ padding: 14 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            type="text"
            className="input"
            style={{ flex: 1, minWidth: 220 }}
            placeholder="🔍 ابحث بالاسم أو المرجع (Reference) أو الباركود لإضافة قطعة للجرد..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        {searchResults.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
            {searchResults.map((p) => (
              <div
                key={p.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "8px 12px",
                  borderRadius: 10,
                  border: "1px solid var(--border, #e2e8f0)",
                }}
              >
                <div>
                  <strong>{p.name}</strong>{" "}
                  <span style={{ opacity: 0.7, fontSize: 12 }}>
                    ({p.reference} {p.brand ? `· ${p.brand}` : ""})
                  </span>
                  <div style={{ fontSize: 12, opacity: 0.7 }}>
                    في النظام: <strong>{getSystemQty(p)}</strong> {getLoc(p) ? `· الرف: ${getLoc(p)}` : ""}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => {
                    addOrIncrementPart(p, true);
                    setQuery("");
                  }}
                >
                  + إضافة للجرد
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Summary KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
        <div className="card" style={{ padding: 12 }}>
          <div style={{ fontSize: 12, opacity: 0.7 }}>القطع المجرودة</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{stats.total}</div>
        </div>
        <div className="card" style={{ padding: 12 }}>
          <div style={{ fontSize: 12, opacity: 0.7 }}>مطابقة ✓</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#16a34a" }}>{stats.matched}</div>
        </div>
        <div className="card" style={{ padding: 12 }}>
          <div style={{ fontSize: 12, opacity: 0.7 }}>نقص 📉</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#dc2626" }}>{stats.shortage}</div>
        </div>
        <div className="card" style={{ padding: 12 }}>
          <div style={{ fontSize: 12, opacity: 0.7 }}>زيادة 📈</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "#0284c7" }}>{stats.surplus}</div>
        </div>
      </div>

      {/* Audit List */}
      <div className="card" style={{ padding: 16 }}>
        {rows.length === 0 ? (
          <div style={{ textAlign: "center", padding: "32px 12px", opacity: 0.7 }}>
            اضغط على <strong>«📷 مسح باركود بالكاميرا»</strong> أو ابحث عن قطعة للبدء في الجرد.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {rows.map((r) => {
              const sysQty = getSystemQty(r.part);
              const diff = r.counted - sysQty;
              return (
                <div
                  key={r.part.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 12,
                    flexWrap: "wrap",
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: "1px solid var(--border, #e2e8f0)",
                  }}
                >
                  <div style={{ minWidth: 180, flex: 1 }}>
                    <div style={{ fontWeight: 700 }}>{r.part.name}</div>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>
                      {r.part.reference} {getLoc(r.part) ? `· الرف: ${getLoc(r.part)}` : ""} · المسجل في النظام:{" "}
                      <strong>{sysQty}</strong>
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() =>
                        setRows((prev) =>
                          prev.map((x) => (x.part.id === r.part.id ? { ...x, counted: Math.max(0, x.counted - 1) } : x))
                        )
                      }
                    >
                      −
                    </button>
                    <input
                      type="number"
                      min={0}
                      className="input"
                      style={{ width: 76, textAlign: "center", fontWeight: 700 }}
                      value={r.counted}
                      onChange={(e) => {
                        const v = Math.max(0, Number(e.target.value) || 0);
                        setRows((prev) => prev.map((x) => (x.part.id === r.part.id ? { ...x, counted: v } : x)));
                      }}
                    />
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() =>
                        setRows((prev) =>
                          prev.map((x) => (x.part.id === r.part.id ? { ...x, counted: x.counted + 1 } : x))
                        )
                      }
                    >
                      +
                    </button>

                    <span
                      style={{
                        minWidth: 74,
                        textAlign: "center",
                        fontWeight: 700,
                        fontSize: 13,
                        color: diff === 0 ? "#16a34a" : diff < 0 ? "#dc2626" : "#0284c7",
                      }}
                    >
                      {diff === 0 ? "مطابق ✓" : diff > 0 ? `+${diff}` : `${diff}`}
                    </span>

                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => setRows((prev) => prev.filter((x) => x.part.id !== r.part.id))}
                      title="إزالة من القائمة"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              );
            })}

            {canApprove && (
              <div
                style={{
                  marginTop: 12,
                  paddingTop: 12,
                  borderTop: "1px solid var(--border, #e2e8f0)",
                  display: "flex",
                  gap: 10,
                  flexWrap: "wrap",
                  alignItems: "center",
                }}
              >
                <input
                  type="text"
                  className="input"
                  style={{ flex: 1, minWidth: 200 }}
                  placeholder="ملاحظة الجرد (مثال: جرد رفوف المحرك - نوفمبر)"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={pending || stats.changed === 0}
                  onClick={handleSaveAudit}
                >
                  {pending ? "جاري الاعتماد..." : `✅ اعتماد الجرد (${stats.changed} تعديل)`}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <Scanner open={scannerOpen} onClose={() => setScannerOpen(false)} onDetected={handleScan} />
    </div>
  );
}
