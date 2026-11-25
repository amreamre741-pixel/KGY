"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n/client";
import { formatDA, formatInt } from "@/lib/format";
import { IconCoins, IconPrinter, IconStore } from "@/components/icons";

type StoreVal = {
  storeId: string;
  storeName: string;
  units: number;
  partTypes: number;
  costValue: number;
  saleValue: number;
  suggestedReceivables: number;
  suggestedDebts: number;
};

type StoreAdjustments = {
  cash: string;
  receivables: string;
  debts: string;
};

const num = (v: string) => Math.max(0, Number(String(v || "0").replace(/\s/g, "").replace(",", ".")) || 0);

export default function ZakatClient({
  stores,
  totalCustomerCredit,
}: {
  stores: StoreVal[];
  totalCustomerCredit: number;
}) {
  const { t, lang } = useI18n();
  const [basis, setBasis] = useState<"sale" | "cost">("sale");
  const [calendar, setCalendar] = useState<"hijri" | "gregorian">("hijri");
  const [goldPriceStr, setGoldPriceStr] = useState("");
  const [adj, setAdj] = useState<Record<string, StoreAdjustments>>(() =>
    Object.fromEntries(
      stores.map((s) => [
        s.storeId,
        {
          cash: "",
          receivables: s.suggestedReceivables > 0 ? String(s.suggestedReceivables) : "",
          debts: s.suggestedDebts > 0 ? String(s.suggestedDebts) : "",
        },
      ]),
    ),
  );

  const rate = calendar === "hijri" ? 0.025 : 0.02577;
  const goldPrice = num(goldPriceStr);
  const nisab = goldPrice > 0 ? goldPrice * 85 : 0;

  const setField = (storeId: string, field: keyof StoreAdjustments, value: string) =>
    setAdj((prev) => ({
      ...prev,
      [storeId]: { ...(prev[storeId] ?? { cash: "", receivables: "", debts: "" }), [field]: value },
    }));

  const rows = stores.map((s) => {
    const a = adj[s.storeId] ?? { cash: "", receivables: "", debts: "" };
    const stockVal = basis === "sale" ? s.saleValue : s.costValue;
    const cash = num(a.cash);
    const receivables = num(a.receivables);
    const debts = num(a.debts);
    const zakatBase = Math.max(0, stockVal + cash + receivables - debts);
    const reached = nisab > 0 ? zakatBase >= nisab : true;
    const zakatDue = reached ? zakatBase * rate : 0;
    return {
      ...s,
      cash,
      receivables,
      debts,
      stockVal,
      expectedMargin: s.saleValue - s.costValue,
      zakatBase,
      reached,
      zakatDue,
    };
  });

  const totals = rows.reduce(
    (acc, r) => ({
      units: acc.units + r.units,
      costValue: acc.costValue + r.costValue,
      saleValue: acc.saleValue + r.saleValue,
      expectedMargin: acc.expectedMargin + r.expectedMargin,
      zakatBase: acc.zakatBase + r.zakatBase,
      zakatDue: acc.zakatDue + r.zakatDue,
    }),
    { units: 0, costValue: 0, saleValue: 0, expectedMargin: 0, zakatBase: 0, zakatDue: 0 },
  );

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t.zakat.title}</h1>
          <p className="sub">{t.zakat.subtitle}</p>
        </div>
        <div className="page-head-actions no-print">
          <button type="button" className="btn btn-primary" onClick={() => window.print()}>
            <IconPrinter />
            {t.zakat.printReport}
          </button>
        </div>
      </div>

      {/* Global valuation settings */}
      <section className="card card-pad form-grid no-print">
        <div className="field">
          <span className="label">{t.zakat.basisLabel}</span>
          <div className="segmented" role="radiogroup">
            <label>
              <input type="radio" name="zbasis" checked={basis === "sale"} onChange={() => setBasis("sale")} />
              {t.zakat.basisSale}
            </label>
            <label>
              <input type="radio" name="zbasis" checked={basis === "cost"} onChange={() => setBasis("cost")} />
              {t.zakat.basisCost}
            </label>
          </div>
        </div>

        <div className="field">
          <span className="label">{t.zakat.calendarLabel}</span>
          <div className="segmented" role="radiogroup">
            <label>
              <input type="radio" name="zcal" checked={calendar === "hijri"} onChange={() => setCalendar("hijri")} />
              {t.zakat.hijri}
            </label>
            <label>
              <input type="radio" name="zcal" checked={calendar === "gregorian"} onChange={() => setCalendar("gregorian")} />
              {t.zakat.gregorian}
            </label>
          </div>
        </div>

        <div className="field">
          <label className="label" htmlFor="gold-price">
            {t.zakat.goldPriceLabel}
          </label>
          <input
            id="gold-price"
            className="input num"
            inputMode="decimal"
            placeholder="0"
            value={goldPriceStr}
            onChange={(e) => setGoldPriceStr(e.target.value)}
          />
          {nisab > 0 && (
            <span className="hint num">
              {t.zakat.nisabValue}: <strong>{formatDA(nisab, lang)}</strong>
            </span>
          )}
        </div>
      </section>

      {/* Per-store independent Zakat calculators */}
      <div className="stack" style={{ gap: 18 }}>
        <h2>{t.zakat.perStoreTitle}</h2>
        <div className="form-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 18 }}>
          {rows.map((r) => {
            const a = adj[r.storeId] ?? { cash: "", receivables: "", debts: "" };
            return (
              <article key={r.storeId} className="card stack" style={{ gap: 0 }}>
                <div className="card-head">
                  <div className="row" style={{ gap: 10 }}>
                    <span className="empty-icon" style={{ width: 40, height: 40, borderRadius: 10 }}>
                      <IconStore width={20} height={20} />
                    </span>
                    <div>
                      <h2>{r.storeName}</h2>
                      <p className="hint num">
                        {formatInt(r.partTypes)} {t.home.statParts} · {formatInt(r.units)} {t.parts.quantity}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="card-body stack" style={{ gap: 12 }}>
                  <div style={{ padding: 12, borderRadius: 12, background: "var(--surface-2)", border: "1px solid var(--line)" }} className="stack">
                    <div className="row spread small">
                      <span className="muted">{t.zakat.costValue}</span>
                      <strong className="num">{formatDA(r.costValue, lang)}</strong>
                    </div>
                    <div className="row spread small">
                      <span className="muted">{t.zakat.saleValue}</span>
                      <strong className="num" style={{ color: "var(--navy-900)" }}>
                        {formatDA(r.saleValue, lang)}
                      </strong>
                    </div>
                    <div className="row spread small" style={{ borderTop: "1px dashed var(--line-strong)", paddingTop: 6 }}>
                      <span className="muted">{t.zakat.expectedMargin}</span>
                      <strong className="num" style={{ color: "var(--ok)" }}>
                        +{formatDA(r.expectedMargin, lang)}
                      </strong>
                    </div>
                  </div>

                  <div className="field no-print">
                    <label className="label" htmlFor={`zcash-${r.storeId}`}>
                      {t.zakat.cashInHand}
                    </label>
                    <input
                      id={`zcash-${r.storeId}`}
                      className="input num"
                      inputMode="decimal"
                      placeholder="0"
                      value={a.cash}
                      onChange={(e) => setField(r.storeId, "cash", e.target.value)}
                    />
                  </div>

                  <div className="field no-print">
                    <div className="row spread">
                      <label className="label" htmlFor={`zrec-${r.storeId}`}>
                        {t.zakat.goodReceivables}
                      </label>
                      {totalCustomerCredit > 0 && (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => setField(r.storeId, "receivables", String(r.suggestedReceivables || totalCustomerCredit))}
                        >
                          {t.zakat.fillAllCredit}
                        </button>
                      )}
                    </div>
                    <input
                      id={`zrec-${r.storeId}`}
                      className="input num"
                      inputMode="decimal"
                      placeholder="0"
                      value={a.receivables}
                      onChange={(e) => setField(r.storeId, "receivables", e.target.value)}
                    />
                  </div>

                  <div className="field no-print">
                    <label className="label" htmlFor={`zdebt-${r.storeId}`}>
                      {t.zakat.supplierDebts}
                    </label>
                    <input
                      id={`zdebt-${r.storeId}`}
                      className="input num"
                      inputMode="decimal"
                      placeholder="0"
                      value={a.debts}
                      onChange={(e) => setField(r.storeId, "debts", e.target.value)}
                    />
                  </div>

                  <div
                    style={{
                      padding: 14,
                      borderRadius: 14,
                      background: "var(--orange-50)",
                      border: "1px solid var(--orange-100)",
                    }}
                    className="stack"
                  >
                    <div className="row spread small">
                      <span>{t.zakat.zakatBase}</span>
                      <strong className="num">{formatDA(r.zakatBase, lang)}</strong>
                    </div>
                    {nisab > 0 && (
                      <div className="small" style={{ color: r.reached ? "var(--ok)" : "var(--muted)", fontWeight: 600 }}>
                        {r.reached ? t.zakat.reachedNisab : t.zakat.belowNisab}
                      </div>
                    )}
                    <div className="row spread" style={{ fontSize: "1.2rem", borderTop: "1px solid var(--orange-100)", paddingTop: 8 }}>
                      <strong className="row" style={{ gap: 6 }}>
                        <IconCoins width={20} height={20} />
                        {t.zakat.zakatDue}
                      </strong>
                      <strong className="num" style={{ color: "var(--orange-600)" }}>
                        {formatDA(r.zakatDue, lang)}
                      </strong>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>

      {/* Comparison & Grand Total table */}
      <section className="card">
        <div className="card-head">
          <h2>{t.zakat.summaryTitle}</h2>
        </div>
        <div className="table-wrap">
          <table className="table responsive">
            <thead>
              <tr>
                <th>{t.store.label}</th>
                <th className="end">{t.zakat.costValue}</th>
                <th className="end">{t.zakat.saleValue}</th>
                <th className="end">{t.zakat.zakatBase}</th>
                <th className="end">{t.zakat.zakatDue}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.storeId}>
                  <td className="cell-main">
                    <strong>{r.storeName}</strong>
                  </td>
                  <td className="end num" data-label={t.zakat.costValue}>
                    {formatDA(r.costValue, lang)}
                  </td>
                  <td className="end num" data-label={t.zakat.saleValue}>
                    {formatDA(r.saleValue, lang)}
                  </td>
                  <td className="end num" data-label={t.zakat.zakatBase}>
                    {formatDA(r.zakatBase, lang)}
                  </td>
                  <td className="end num" data-label={t.zakat.zakatDue}>
                    <strong style={{ color: "var(--orange-600)" }}>{formatDA(r.zakatDue, lang)}</strong>
                  </td>
                </tr>
              ))}
              <tr style={{ background: "var(--surface-2)", fontWeight: 700 }}>
                <td className="cell-main">{t.zakat.totalAllStores}</td>
                <td className="end num" data-label={t.zakat.costValue}>
                  {formatDA(totals.costValue, lang)}
                </td>
                <td className="end num" data-label={t.zakat.saleValue}>
                  {formatDA(totals.saleValue, lang)}
                </td>
                <td className="end num" data-label={t.zakat.zakatBase}>
                  {formatDA(totals.zakatBase, lang)}
                </td>
                <td className="end num" data-label={t.zakat.zakatDue} style={{ color: "var(--orange-600)" }}>
                  {formatDA(totals.zakatDue, lang)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
