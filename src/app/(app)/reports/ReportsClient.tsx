"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { useI18n } from "@/lib/i18n/client";
import { formatDA, formatInt, partName } from "@/lib/format";
import type { PeriodPreset, ReportData } from "@/lib/reports";
import {
  IconBoxIn,
  IconChart,
  IconCheck,
  IconCoins,
  IconDownload,
  IconMoon,
  IconPrinter,
  IconReceipt,
  IconStore,
  IconTrendingUp,
  IconTruck,
  IconWallet,
} from "@/components/icons";

type Props = {
  data: ReportData;
  stores: { id: string; name: string }[];
  canSeeAllStores: boolean;
};

export default function ReportsClient({ data, stores, canSeeAllStores }: Props) {
  const { t, lang } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [customFrom, setCustomFrom] = useState(data.fromInput);
  const [customTo, setCustomTo] = useState(data.toInput);
  const [topSort, setTopSort] = useState<"qty" | "profit">("qty");

  const buildQuery = (overrides: {
    period?: PeriodPreset;
    from?: string;
    to?: string;
    store?: string;
    sleep?: number;
  }) => {
    const sp = new URLSearchParams();
    const p = overrides.period ?? data.period;
    sp.set("period", p);
    if (p === "custom") {
      sp.set("from", overrides.from ?? customFrom);
      sp.set("to", overrides.to ?? customTo);
    }
    const st = overrides.store !== undefined ? overrides.store : data.storeId ?? "all";
    if (canSeeAllStores) sp.set("store", st);
    sp.set("sleep", String(overrides.sleep ?? data.sleepDays));
    return sp.toString();
  };

  const navigate = (overrides: Parameters<typeof buildQuery>[0]) => {
    const qs = buildQuery(overrides);
    startTransition(() => {
      router.push(`/reports?${qs}`);
    });
  };

  const exportUrl = `/api/reports/export?${buildQuery({})}`;

  const maxChartVal = useMemo(() => {
    let m = 0;
    for (const pt of data.series) {
      if (pt.netSales > m) m = pt.netSales;
      if (Math.abs(pt.netProfit) > m) m = Math.abs(pt.netProfit);
    }
    return m;
  }, [data.series]);

  const sortedTopParts = useMemo(() => {
    const copy = [...data.topParts];
    if (topSort === "profit") {
      copy.sort((a, b) => b.netProfit - a.netProfit || b.netQty - a.netQty);
    } else {
      copy.sort((a, b) => b.netQty - a.netQty || b.netProfit - a.netProfit);
    }
    return copy;
  }, [data.topParts, topSort]);

  const periodOptions: { id: PeriodPreset; label: string }[] = [
    { id: "today", label: t.reports.periodToday },
    { id: "week", label: t.reports.periodWeek },
    { id: "month", label: t.reports.periodMonth },
    { id: "year", label: t.reports.periodYear },
    { id: "custom", label: t.reports.periodCustom },
  ];

  const sleepOptions: { days: number; label: string }[] = [
    { days: 30, label: t.reports.days30 },
    { days: 60, label: t.reports.days60 },
    { days: 90, label: t.reports.days90 },
    { days: 180, label: t.reports.days180 },
  ];

  const activeStoreLabel = data.storeName ?? t.store.all;

  return (
    <div className="stack fade-in" style={{ opacity: pending ? 0.72 : 1, transition: "opacity 0.15s" }}>
      {/* Print header */}
      <div
        className="print-only"
        style={{
          alignItems: "center",
          justifyContent: "space-between",
          paddingBottom: 12,
          marginBottom: 8,
          borderBottom: "2px solid var(--navy-800)",
        }}
      >
        <div className="row" style={{ gap: 12 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="KGY" style={{ width: 44, height: 44, borderRadius: 10 }} />
          <div>
            <strong style={{ fontSize: "1.15rem" }}>KGY — {t.reports.title}</strong>
            <div className="hint num">
              {activeStoreLabel} · {data.fromInput} → {data.toInput}
            </div>
          </div>
        </div>
      </div>

      {/* Screen header */}
      <div className="row spread no-print">
        <div>
          <h1>{t.reports.title}</h1>
          <p className="hint" style={{ marginTop: 4 }}>
            {t.reports.subtitle}
          </p>
        </div>
        <div className="row">
          <a href={exportUrl} className="btn btn-secondary" id="export-excel-btn">
            <IconDownload />
            {t.reports.exportExcel}
          </a>
          <button type="button" className="btn btn-navy" id="print-report-btn" onClick={() => window.print()}>
            <IconPrinter />
            {t.reports.printPdf}
          </button>
        </div>
      </div>

      {/* Filter toolbar */}
      <section className="card card-pad stack no-print">
        <div className="row spread">
          <div className="report-pills" role="group" aria-label="period">
            {periodOptions.map((opt) => (
              <button
                key={opt.id}
                type="button"
                className={`report-pill ${data.period === opt.id ? "is-active" : ""}`}
                onClick={() => {
                  if (opt.id === "custom") {
                    setCustomFrom(data.fromInput);
                    setCustomTo(data.toInput);
                    navigate({ period: "custom", from: data.fromInput, to: data.toInput });
                  } else {
                    navigate({ period: opt.id });
                  }
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {canSeeAllStores && stores.length > 0 && (
            <div className="row" style={{ minWidth: 210 }}>
              <IconStore style={{ width: 18, height: 18, color: "var(--muted)" }} />
              <select
                className="select"
                aria-label={t.store.label}
                value={data.storeId ?? "all"}
                onChange={(e) => navigate({ store: e.target.value })}
                style={{ width: "auto", minWidth: 180 }}
              >
                <option value="all">{t.store.all}</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {data.period === "custom" ? (
          <form
            className="row"
            onSubmit={(e) => {
              e.preventDefault();
              navigate({ period: "custom", from: customFrom, to: customTo });
            }}
          >
            <label className="row" style={{ gap: 6 }}>
              <span className="label">{t.reports.fromDate}</span>
              <input
                type="date"
                className="input num"
                style={{ width: "auto" }}
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                required
              />
            </label>
            <label className="row" style={{ gap: 6 }}>
              <span className="label">{t.reports.toDate}</span>
              <input
                type="date"
                className="input num"
                style={{ width: "auto" }}
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                required
              />
            </label>
            <button type="submit" className="btn btn-primary btn-sm">
              {t.reports.apply}
            </button>
          </form>
        ) : (
          <div className="hint num">
            {activeStoreLabel} · {data.fromInput} → {data.toInput}
          </div>
        )}
      </section>

      {/* Primary KPIs */}
      <section className="stats">
        <div className="card stat">
          <div className="stat-label">
            <IconReceipt />
            {t.reports.netSales}
          </div>
          <div className="stat-value num">{formatDA(data.kpis.netSales, lang)}</div>
          <div className="stat-sub num">
            <span>
              {formatInt(data.kpis.salesCount)} {t.reports.invoicesCount}
            </span>
            <span>·</span>
            <span>
              {formatInt(data.kpis.unitsSold)} {t.reports.unitsSold}
            </span>
            {data.kpis.refundedTotal > 0 && (
              <span className="badge badge-low">
                {t.reports.refundedNote}: {formatDA(data.kpis.refundedTotal, lang)}
              </span>
            )}
          </div>
        </div>

        <div className="card stat">
          <div className="stat-label">
            <IconCoins />
            {t.reports.cogs}
          </div>
          <div className="stat-value num">{formatDA(data.kpis.cogs, lang)}</div>
          <div className="stat-sub">{t.reports.cogsHint}</div>
        </div>

        <div className="card stat is-profit">
          <div className="stat-label">
            <IconTrendingUp />
            {t.reports.netProfit}
          </div>
          <div
            className="stat-value num"
            style={data.kpis.netProfit < 0 ? { color: "var(--danger)" } : undefined}
          >
            {formatDA(data.kpis.netProfit, lang)}
          </div>
          <div className="stat-sub">
            <span className={`badge num ${data.kpis.netProfit >= 0 ? "badge-ok" : "badge-out"}`}>
              {t.reports.marginPct}: {data.kpis.marginPct.toFixed(1)}%
            </span>
          </div>
        </div>

        <div className="card stat">
          <div className="stat-label">
            <IconWallet />
            {t.reports.collectedCash}
          </div>
          <div className="stat-value num">{formatDA(data.kpis.collectedCash, lang)}</div>
          <div className="stat-sub">{t.reports.fromSalesAndPayments}</div>
        </div>

        <div className={`card stat ${data.kpis.newCredit > 0 ? "is-alert" : ""}`}>
          <div className="stat-label">
            <IconWallet />
            {t.reports.newCredit}
          </div>
          <div className="stat-value num">{formatDA(data.kpis.newCredit, lang)}</div>
          <div className="stat-sub">
            <Link href="/customers?debt=1" className="crumb" style={{ margin: 0 }}>
              {t.nav.customers} →
            </Link>
          </div>
        </div>

        <div className="card stat">
          <div className="stat-label">
            <IconBoxIn />
            {t.reports.purchasesInPeriod}
          </div>
          <div className="stat-value num">{formatDA(data.kpis.purchasesTotal, lang)}</div>
          <div className="stat-sub num">
            {formatInt(data.kpis.purchasesCount)} {t.reports.invoicesCount}
          </div>
        </div>
      </section>

      {/* Sales & Profit Trend Chart */}
      <section className="card">
        <div className="card-head">
          <div className="row" style={{ gap: 8 }}>
            <IconChart style={{ width: 20, height: 20, color: "var(--navy-700)" }} />
            <h2>{t.reports.trendTitle}</h2>
          </div>
          <div className="report-legend">
            <span>
              <i className="report-dot" style={{ background: "var(--navy-700)" }} />
              {t.reports.salesBar}
            </span>
            <span>
              <i className="report-dot" style={{ background: "var(--ok)" }} />
              {t.reports.profitBar}
            </span>
          </div>
        </div>
        <div className="card-body">
          {maxChartVal <= 0 ? (
            <div className="empty" style={{ padding: "24px 12px" }}>
              <span>{t.reports.noSalesInPeriod}</span>
            </div>
          ) : (
            <div className="report-chart-wrap">
              <div className="report-bars">
                {data.series.map((pt) => {
                  const salesH = Math.max(pt.netSales > 0 ? 4 : 0, Math.round((pt.netSales / maxChartVal) * 140));
                  const profAbs = Math.abs(pt.netProfit);
                  const profH = Math.max(profAbs > 0 ? 4 : 0, Math.round((profAbs / maxChartVal) * 140));
                  return (
                    <div
                      key={pt.key}
                      className="report-bar-col"
                      title={`${pt.key}\n${t.reports.salesBar}: ${formatDA(pt.netSales, lang)}\n${t.reports.profitBar}: ${formatDA(pt.netProfit, lang)}`}
                    >
                      <div className="report-bar-pair">
                        <div className="report-bar is-sales" style={{ height: `${salesH}px` }} />
                        <div
                          className={`report-bar ${pt.netProfit >= 0 ? "is-profit" : "is-loss"}`}
                          style={{ height: `${profH}px` }}
                        />
                      </div>
                      <span className="report-bar-lbl">{pt.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Per-Store Performance Comparison (Owner viewing All Stores) */}
      {canSeeAllStores && !data.storeId && data.perStore.length > 1 && (
        <section className="card">
          <div className="card-head">
            <div className="row" style={{ gap: 8 }}>
              <IconStore style={{ width: 20, height: 20, color: "var(--navy-700)" }} />
              <h2>{t.reports.storeComparison}</h2>
            </div>
          </div>
          <div className="table-wrap">
            <table className="table responsive">
              <thead>
                <tr>
                  <th>{t.store.label}</th>
                  <th className="end">{t.reports.netSales}</th>
                  <th className="end">{t.reports.cogs}</th>
                  <th className="end">{t.reports.netProfit}</th>
                  <th className="end">{t.reports.marginPct}</th>
                  <th className="end">{t.reports.totalStockCost}</th>
                  <th className="end">{t.reports.totalStockSale}</th>
                </tr>
              </thead>
              <tbody>
                {data.perStore.map((st) => (
                  <tr key={st.storeId}>
                    <td className="cell-main">
                      <button
                        type="button"
                        className="part-name"
                        style={{ background: "none", border: 0, padding: 0, cursor: "pointer", textAlign: "start" }}
                        onClick={() => navigate({ store: st.storeId })}
                      >
                        {st.storeName}
                      </button>
                      <div className="part-sub num">
                        {formatInt(st.salesCount)} {t.reports.invoicesCount} · {formatInt(st.stockUnits)}{" "}
                        {t.home.statUnits}
                      </div>
                    </td>
                    <td className="end num" data-label={t.reports.netSales}>
                      <strong>{formatDA(st.netSales, lang)}</strong>
                    </td>
                    <td className="end num" data-label={t.reports.cogs}>
                      {formatDA(st.cogs, lang)}
                    </td>
                    <td
                      className="end num"
                      data-label={t.reports.netProfit}
                      style={{ color: st.netProfit >= 0 ? "var(--ok)" : "var(--danger)", fontWeight: 700 }}
                    >
                      {formatDA(st.netProfit, lang)}
                    </td>
                    <td className="end num" data-label={t.reports.marginPct}>
                      <span className="badge badge-ok">{st.marginPct.toFixed(1)}%</span>
                    </td>
                    <td className="end num" data-label={t.reports.totalStockCost}>
                      {formatDA(st.stockCostValue, lang)}
                    </td>
                    <td className="end num" data-label={t.reports.totalStockSale}>
                      {formatDA(st.stockSaleValue, lang)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Top-selling Parts & Sleeping Stock side-by-side */}
      <div className="report-split">
        {/* Top-Selling Parts */}
        <section className="card">
          <div className="card-head">
            <div className="row" style={{ gap: 8 }}>
              <IconTrendingUp style={{ width: 20, height: 20, color: "var(--ok)" }} />
              <h2>{t.reports.topPartsTitle}</h2>
            </div>
            <div className="report-pills no-print">
              <button
                type="button"
                className={`report-pill ${topSort === "qty" ? "is-active" : ""}`}
                style={{ minHeight: 30, padding: "4px 10px", fontSize: "0.8rem" }}
                onClick={() => setTopSort("qty")}
              >
                {t.reports.sortByQty}
              </button>
              <button
                type="button"
                className={`report-pill ${topSort === "profit" ? "is-active" : ""}`}
                style={{ minHeight: 30, padding: "4px 10px", fontSize: "0.8rem" }}
                onClick={() => setTopSort("profit")}
              >
                {t.reports.sortByProfit}
              </button>
            </div>
          </div>

          {sortedTopParts.length === 0 ? (
            <div className="empty">
              <span>{t.reports.topEmpty}</span>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="table responsive">
                <thead>
                  <tr>
                    <th>{t.parts.name}</th>
                    <th className="end">{t.reports.soldQty}</th>
                    <th className="end">{t.reports.revenue}</th>
                    <th className="end">{t.reports.profit}</th>
                    <th className="end">{t.reports.inStockNow}</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedTopParts.map((p, idx) => (
                    <tr key={`${p.partId ?? p.reference}-${idx}`}>
                      <td className="cell-main">
                        {p.partId ? (
                          <Link href={`/parts/${p.partId}`} className="part-name">
                            {partName(p, lang)}
                          </Link>
                        ) : (
                          <span className="part-name">{partName(p, lang)}</span>
                        )}
                        <div className="part-sub">
                          <span className="ref">{p.reference}</span>
                          {p.brand && <span>· {p.brand}</span>}
                        </div>
                      </td>
                      <td className="end num" data-label={t.reports.soldQty}>
                        <span className="badge badge-orange">{formatInt(p.netQty)}</span>
                      </td>
                      <td className="end num" data-label={t.reports.revenue}>
                        {formatDA(p.netRevenue, lang)}
                      </td>
                      <td
                        className="end num"
                        data-label={t.reports.profit}
                        style={{ color: p.netProfit >= 0 ? "var(--ok)" : "var(--danger)", fontWeight: 700 }}
                      >
                        {formatDA(p.netProfit, lang)}
                      </td>
                      <td className="end num" data-label={t.reports.inStockNow}>
                        <span className={p.currentStock <= 0 ? "qty is-out" : "qty"}>
                          {formatInt(p.currentStock)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Sleeping / Dead Stock */}
        <section className="card">
          <div className="card-head" style={{ flexWrap: "wrap" }}>
            <div>
              <div className="row" style={{ gap: 8 }}>
                <IconMoon style={{ width: 20, height: 20, color: "var(--orange-600)" }} />
                <h2>{t.reports.sleepingTitle}</h2>
              </div>
              <div className="hint" style={{ marginTop: 2 }}>
                {t.reports.sleepingSubtitle}{" "}
                <strong className="num">
                  {sleepOptions.find((o) => o.days === data.sleepDays)?.label ?? `${data.sleepDays}d`}
                </strong>
              </div>
            </div>
            <div className="report-pills no-print">
              {sleepOptions.map((o) => (
                <button
                  key={o.days}
                  type="button"
                  className={`report-pill ${data.sleepDays === o.days ? "is-active" : ""}`}
                  style={{ minHeight: 30, padding: "4px 10px", fontSize: "0.8rem" }}
                  onClick={() => navigate({ sleep: o.days })}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          {data.sleeping.totalTypes > 0 && (
            <div
              style={{
                padding: "12px 20px",
                background: "var(--warn-bg)",
                borderBottom: "1px solid var(--line)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 8,
              }}
            >
              <span style={{ fontSize: "0.88rem", color: "var(--warn)", fontWeight: 600 }}>
                {t.reports.tiedCapital} ({formatInt(data.sleeping.totalTypes)} {t.reports.sleepingCount})
              </span>
              <strong className="num" style={{ color: "var(--warn)", fontSize: "1.02rem" }}>
                {formatDA(data.sleeping.totalTiedCost, lang)}
              </strong>
            </div>
          )}

          {data.sleeping.rows.length === 0 ? (
            <div className="empty">
              <div className="empty-icon" style={{ background: "var(--ok-bg)", color: "var(--ok)" }}>
                <IconCheck />
              </div>
              <span>{t.reports.sleepingEmpty}</span>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="table responsive">
                <thead>
                  <tr>
                    <th>{t.parts.name}</th>
                    <th className="end">{t.parts.quantity}</th>
                    <th className="end">{t.reports.tiedCost}</th>
                    <th className="end">{t.reports.lastSold}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.sleeping.rows.map((p) => (
                    <tr key={p.partId}>
                      <td className="cell-main">
                        <Link href={`/parts/${p.partId}`} className="part-name">
                          {partName(p, lang)}
                        </Link>
                        <div className="part-sub">
                          <span className="ref">{p.reference}</span>
                          {p.brand && <span>· {p.brand}</span>}
                        </div>
                      </td>
                      <td className="end num" data-label={t.parts.quantity}>
                        <span className="qty">{formatInt(p.quantity)}</span>
                      </td>
                      <td className="end num" data-label={t.reports.tiedCost}>
                        <strong>{formatDA(p.tiedCost, lang)}</strong>
                      </td>
                      <td className="end num" data-label={t.reports.lastSold}>
                        {p.lastSoldAt ? (
                          <span className="badge">{p.lastSoldAt.slice(0, 10)}</span>
                        ) : (
                          <span className="badge badge-low">{t.reports.neverSold}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {/* Overall Financial Position: Stock Valuation + Receivables vs Payables */}
      <section className="card card-pad stack">
        <div className="row spread">
          <h2>{t.reports.financialSummary}</h2>
          {canSeeAllStores && (
            <Link href="/zakat" className="btn btn-secondary btn-sm no-print">
              <IconCoins />
              {t.home.zakatBtn}
            </Link>
          )}
        </div>
        <div className="stats">
          <div className="card stat" style={{ boxShadow: "none", background: "var(--surface-2)" }}>
            <div className="stat-label">
              <IconCoins />
              {t.reports.totalStockCost}
            </div>
            <div className="stat-value num">{formatDA(data.snapshot.stockCostValue, lang)}</div>
            <div className="stat-sub num">
              {formatInt(data.snapshot.stockUnits)} {t.home.statUnits}
            </div>
          </div>

          <div className="card stat" style={{ boxShadow: "none", background: "var(--surface-2)" }}>
            <div className="stat-label">
              <IconCoins />
              {t.reports.totalStockSale}
            </div>
            <div className="stat-value num" style={{ color: "var(--ok)" }}>
              {formatDA(data.snapshot.stockSaleValue, lang)}
            </div>
            <div className="stat-sub num">
              {t.zakat.expectedMargin}:{" "}
              {formatDA(Math.max(0, data.snapshot.stockSaleValue - data.snapshot.stockCostValue), lang)}
            </div>
          </div>

          <Link
            href="/customers?debt=1"
            className="card stat"
            style={{ boxShadow: "none", background: "var(--surface-2)" }}
          >
            <div className="stat-label">
              <IconWallet />
              {t.reports.receivables}
            </div>
            <div className="stat-value num" style={{ color: "var(--orange-600)" }}>
              {formatDA(data.snapshot.receivables, lang)}
            </div>
            <div className="stat-sub num">
              {formatInt(data.snapshot.debtorsCount)} {t.customers.debtorsCount}
            </div>
          </Link>

          <Link
            href="/suppliers?debt=1"
            className="card stat"
            style={{ boxShadow: "none", background: "var(--surface-2)" }}
          >
            <div className="stat-label">
              <IconTruck />
              {t.reports.payables}
            </div>
            <div className="stat-value num" style={{ color: "var(--danger)" }}>
              {formatDA(data.snapshot.payables, lang)}
            </div>
            <div className="stat-sub num">
              {formatInt(data.snapshot.creditorsCount)} {t.suppliers.creditorsCount}
            </div>
          </Link>

          <div className="card stat" style={{ boxShadow: "none", background: "var(--surface-2)" }}>
            <div className="stat-label">
              <IconTrendingUp />
              {t.reports.netPosition}
            </div>
            <div
              className="stat-value num"
              style={{ color: data.snapshot.netPosition >= 0 ? "var(--ok)" : "var(--danger)" }}
            >
              {formatDA(data.snapshot.netPosition, lang)}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
