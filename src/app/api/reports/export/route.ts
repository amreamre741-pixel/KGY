import { NextResponse, type NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { can, getActiveStoreId, getCurrentUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { loadReportData } from "@/lib/reports";
import { db } from "@/lib/db";

function styleHeader(row: ExcelJS.Row) {
  row.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F2A44" } };
  row.alignment = { vertical: "middle", horizontal: "center" };
  row.height = 24;
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !can.seeCost(user)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { t, lang } = await getI18n();
  const sp = req.nextUrl.searchParams;
  const period = sp.get("period") ?? undefined;
  const from = sp.get("from") ?? undefined;
  const to = sp.get("to") ?? undefined;
  const sleepDays = Number(sp.get("sleep") || 30);

  let storeId: string | null = await getActiveStoreId(user);
  if (can.seeAllStores(user) && sp.has("store")) {
    const rawStore = sp.get("store");
    if (!rawStore || rawStore === "all") {
      storeId = null;
    } else {
      const exists = await db.store.findFirst({ where: { id: rawStore, active: true }, select: { id: true } });
      storeId = exists ? rawStore : null;
    }
  }

  const data = await loadReportData({ period, from, to, storeId, sleepDays });
  const rtl = lang === "ar";
  const moneyFmt = '#,##0.00 "DA"';

  const wb = new ExcelJS.Workbook();
  wb.creator = "KGY";
  wb.created = new Date();

  // Sheet 1: Summary & Store Comparison
  const s1 = wb.addWorksheet(rtl ? "ملخص التقرير" : "Summary", {
    views: [{ rightToLeft: rtl }],
  });
  s1.columns = [
    { key: "k", width: 38 },
    { key: "v", width: 26 },
    { key: "n", width: 32 },
  ];

  const titleRow = s1.addRow([
    `KGY — ${t.reports.title}`,
    `${data.fromInput} → ${data.toInput}`,
    data.storeName ?? t.store.all,
  ]);
  styleHeader(titleRow);
  s1.addRow([]);

  const summaryRows: [string, number, string][] = [
    [t.reports.netSales, data.kpis.netSales, `${data.kpis.salesCount} ${t.reports.invoicesCount}`],
    [t.reports.cogs, data.kpis.cogs, t.reports.cogsHint],
    [t.reports.netProfit, data.kpis.netProfit, `${t.reports.marginPct}: ${data.kpis.marginPct.toFixed(1)}%`],
    [t.reports.collectedCash, data.kpis.collectedCash, t.reports.fromSalesAndPayments],
    [t.reports.newCredit, data.kpis.newCredit, ""],
    [t.reports.purchasesInPeriod, data.kpis.purchasesTotal, `${data.kpis.purchasesCount}`],
    [t.reports.totalStockCost, data.snapshot.stockCostValue, `${data.snapshot.stockUnits}`],
    [t.reports.totalStockSale, data.snapshot.stockSaleValue, ""],
    [t.reports.receivables, data.snapshot.receivables, `${data.snapshot.debtorsCount}`],
    [t.reports.payables, data.snapshot.payables, `${data.snapshot.creditorsCount}`],
    [t.reports.netPosition, data.snapshot.netPosition, ""],
  ];

  for (const [label, val, note] of summaryRows) {
    const r = s1.addRow([label, val, note]);
    r.getCell(1).font = { bold: true };
    r.getCell(2).numFmt = moneyFmt;
    if (label === t.reports.netProfit) {
      r.getCell(2).font = { bold: true, color: { argb: "FF157F4B" } };
    }
  }

  if (data.perStore.length > 0 && can.seeAllStores(user)) {
    s1.addRow([]);
    const stHead = s1.addRow([
      t.store.label,
      t.reports.netSales,
      t.reports.cogs,
      t.reports.netProfit,
      t.reports.totalStockCost,
      t.reports.totalStockSale,
    ]);
    styleHeader(stHead);
    s1.getColumn(4).width = 22;
    s1.getColumn(5).width = 24;
    s1.getColumn(6).width = 24;

    for (const st of data.perStore) {
      const r = s1.addRow([
        st.storeName,
        st.netSales,
        st.cogs,
        st.netProfit,
        st.stockCostValue,
        st.stockSaleValue,
      ]);
      for (const c of [2, 3, 4, 5, 6]) r.getCell(c).numFmt = moneyFmt;
    }
  }

  // Sheet 2: Top Selling Parts
  const s2 = wb.addWorksheet(rtl ? "الأكثر مبيعاً" : "Top Selling", {
    views: [{ rightToLeft: rtl }],
  });
  s2.columns = [
    { header: t.parts.reference, key: "ref", width: 20 },
    { header: t.parts.name, key: "name", width: 32 },
    { header: t.parts.brand, key: "brand", width: 16 },
    { header: t.reports.soldQty, key: "qty", width: 14 },
    { header: t.reports.revenue, key: "rev", width: 20 },
    { header: t.reports.cogs, key: "cogs", width: 20 },
    { header: t.reports.profit, key: "profit", width: 20 },
    { header: t.reports.inStockNow, key: "stock", width: 14 },
  ];
  styleHeader(s2.getRow(1));
  for (const p of data.topParts) {
    const r = s2.addRow({
      ref: p.reference,
      name: rtl ? p.nameAr : p.nameEn || p.nameAr,
      brand: p.brand,
      qty: p.netQty,
      rev: p.netRevenue,
      cogs: p.cogs,
      profit: p.netProfit,
      stock: p.currentStock,
    });
    r.getCell(5).numFmt = moneyFmt;
    r.getCell(6).numFmt = moneyFmt;
    r.getCell(7).numFmt = moneyFmt;
  }

  // Sheet 3: Sleeping Stock
  const s3 = wb.addWorksheet(rtl ? "السلعة الراقدة" : "Sleeping Stock", {
    views: [{ rightToLeft: rtl }],
  });
  s3.columns = [
    { header: t.parts.reference, key: "ref", width: 20 },
    { header: t.parts.name, key: "name", width: 32 },
    { header: t.parts.brand, key: "brand", width: 16 },
    { header: t.parts.quantity, key: "qty", width: 14 },
    { header: t.parts.purchasePrice, key: "buy", width: 18 },
    { header: t.reports.tiedCost, key: "tied", width: 22 },
    { header: t.reports.lastSold, key: "last", width: 20 },
  ];
  styleHeader(s3.getRow(1));
  for (const p of data.sleeping.rows) {
    const r = s3.addRow({
      ref: p.reference,
      name: rtl ? p.nameAr : p.nameEn || p.nameAr,
      brand: p.brand,
      qty: p.quantity,
      buy: p.purchasePrice,
      tied: p.tiedCost,
      last: p.lastSoldAt ? p.lastSoldAt.slice(0, 10) : t.reports.neverSold,
    });
    r.getCell(5).numFmt = moneyFmt;
    r.getCell(6).numFmt = moneyFmt;
  }

  // Sheet 4: Sales Invoices in Period
  const s4 = wb.addWorksheet(rtl ? "الفواتير" : "Invoices", {
    views: [{ rightToLeft: rtl }],
  });
  s4.columns = [
    { header: t.sales.number, key: "num", width: 18 },
    { header: t.partView.date, key: "date", width: 20 },
    { header: t.store.label, key: "store", width: 22 },
    { header: t.sales.customer, key: "cust", width: 24 },
    { header: t.sales.seller, key: "seller", width: 18 },
    { header: t.reports.netSales, key: "net", width: 18 },
    { header: t.reports.cogs, key: "cogs", width: 18 },
    { header: t.reports.netProfit, key: "profit", width: 18 },
    { header: t.sales.debt, key: "debt", width: 18 },
  ];
  styleHeader(s4.getRow(1));
  for (const s of data.salesRows) {
    const r = s4.addRow({
      num: s.number,
      date: s.createdAt.slice(0, 16).replace("T", " "),
      storeName: s.storeName,
      store: s.storeName,
      cust: s.customerName || t.pos.walkIn,
      seller: s.sellerName,
      net: s.netSales,
      cogs: s.cogs,
      profit: s.netProfit,
      debt: s.debtAmount,
    });
    for (const c of [6, 7, 8, 9]) r.getCell(c).numFmt = moneyFmt;
  }

  const buffer = await wb.xlsx.writeBuffer();
  const filename = `KGY_Report_${data.fromInput}_${data.toInput}.xlsx`;

  return new NextResponse(Buffer.from(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
