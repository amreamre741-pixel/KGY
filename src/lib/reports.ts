import "server-only";
import { db } from "./db";
import { perStoreValuations } from "./parts";

export type PeriodPreset = "today" | "week" | "month" | "year" | "custom";

export type ReportTrendPoint = {
  key: string;
  label: string;
  netSales: number;
  netProfit: number;
  cogs: number;
  count: number;
};

export type TopPartRow = {
  partId: string | null;
  reference: string;
  nameAr: string;
  nameEn: string;
  brand: string;
  netQty: number;
  netRevenue: number;
  cogs: number;
  netProfit: number;
  currentStock: number;
};

export type SleepingPartRow = {
  partId: string;
  reference: string;
  nameAr: string;
  nameEn: string;
  brand: string;
  quantity: number;
  purchasePrice: number;
  salePrice: number;
  tiedCost: number;
  tiedSale: number;
  lastSoldAt: string | null;
};

export type StorePerfRow = {
  storeId: string;
  storeName: string;
  salesCount: number;
  netSales: number;
  cogs: number;
  netProfit: number;
  marginPct: number;
  stockUnits: number;
  stockCostValue: number;
  stockSaleValue: number;
};

export type SaleExportRow = {
  id: string;
  number: string;
  createdAt: string;
  storeName: string;
  customerName: string;
  sellerName: string;
  netSales: number;
  cogs: number;
  netProfit: number;
  paidAmount: number;
  debtAmount: number;
};

export type ReportData = {
  period: PeriodPreset;
  fromInput: string;
  toInput: string;
  sleepDays: number;
  storeId: string | null;
  storeName: string | null;
  bucketBy: "day" | "month";
  kpis: {
    salesCount: number;
    unitsSold: number;
    grossSales: number;
    refundedTotal: number;
    netSales: number;
    cogs: number;
    netProfit: number;
    marginPct: number;
    collectedCash: number;
    newCredit: number;
    purchasesTotal: number;
    purchasesCount: number;
  };
  series: ReportTrendPoint[];
  perStore: StorePerfRow[];
  topParts: TopPartRow[];
  sleeping: {
    totalTypes: number;
    totalUnits: number;
    totalTiedCost: number;
    totalTiedSale: number;
    rows: SleepingPartRow[];
  };
  snapshot: {
    stockUnits: number;
    stockCostValue: number;
    stockSaleValue: number;
    receivables: number;
    debtorsCount: number;
    payables: number;
    creditorsCount: number;
    netPosition: number;
  };
  salesRows: SaleExportRow[];
};

function toDateInput(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseYMD(s: string | undefined): Date | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

export function resolvePeriodRange(
  rawPeriod?: string,
  rawFrom?: string,
  rawTo?: string,
): { period: PeriodPreset; start: Date; end: Date; fromInput: string; toInput: string } {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  const p: PeriodPreset =
    rawPeriod === "today" || rawPeriod === "week" || rawPeriod === "month" || rawPeriod === "year" || rawPeriod === "custom"
      ? rawPeriod
      : "month";

  if (p === "today") {
    return { period: p, start: todayStart, end: todayEnd, fromInput: toDateInput(todayStart), toInput: toDateInput(todayEnd) };
  }
  if (p === "week") {
    const start = new Date(todayStart);
    start.setDate(start.getDate() - 6);
    return { period: p, start, end: todayEnd, fromInput: toDateInput(start), toInput: toDateInput(todayEnd) };
  }
  if (p === "year") {
    const start = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
    return { period: p, start, end: todayEnd, fromInput: toDateInput(start), toInput: toDateInput(todayEnd) };
  }
  if (p === "custom") {
    let f = parseYMD(rawFrom);
    let t = parseYMD(rawTo);
    if (f && t) {
      if (f > t) [f, t] = [t, f];
      const start = new Date(f.getFullYear(), f.getMonth(), f.getDate(), 0, 0, 0, 0);
      const end = new Date(t.getFullYear(), t.getMonth(), t.getDate(), 23, 59, 59, 999);
      return { period: "custom", start, end, fromInput: toDateInput(start), toInput: toDateInput(end) };
    }
  }
  // Default: current month
  const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  return { period: "month", start, end: todayEnd, fromInput: toDateInput(start), toInput: toDateInput(todayEnd) };
}

export async function loadReportData(opts: {
  period?: string;
  from?: string;
  to?: string;
  storeId: string | null;
  sleepDays?: number;
}): Promise<ReportData> {
  const { period, start, end, fromInput, toInput } = resolvePeriodRange(opts.period, opts.from, opts.to);
  const sleepDays = [30, 60, 90, 180].includes(Number(opts.sleepDays)) ? Number(opts.sleepDays) : 30;
  const storeId = opts.storeId;

  const spanDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1);
  const bucketBy: "day" | "month" = spanDays > 45 ? "month" : "day";

  const sleepCutoff = new Date(Date.now() - sleepDays * 86_400_000);

  const [
    selectedStore,
    valuations,
    sales,
    paymentsAgg,
    purchasesAgg,
    receivablesAgg,
    debtorsCount,
    payablesAgg,
    creditorsCount,
    stockedParts,
    recentSoldGroups,
    lastSoldGroups,
  ] = await Promise.all([
    storeId ? db.store.findUnique({ where: { id: storeId }, select: { name: true } }) : Promise.resolve(null),
    perStoreValuations(),
    db.sale.findMany({
      where: {
        createdAt: { gte: start, lte: end },
        ...(storeId ? { storeId } : {}),
      },
      orderBy: { createdAt: "desc" },
      include: {
        items: true,
        store: { select: { name: true } },
        customer: { select: { name: true } },
        user: { select: { name: true } },
      },
    }),
    db.customerPayment.aggregate({
      where: {
        createdAt: { gte: start, lte: end },
        ...(storeId ? { storeId } : {}),
      },
      _sum: { amount: true },
    }),
    db.purchase.aggregate({
      where: {
        createdAt: { gte: start, lte: end },
        ...(storeId ? { storeId } : {}),
      },
      _sum: { total: true },
      _count: { _all: true },
    }),
    db.customer.aggregate({
      where: { active: true, balance: { gt: 0 } },
      _sum: { balance: true },
    }),
    db.customer.count({ where: { active: true, balance: { gt: 0 } } }),
    db.supplier.aggregate({
      where: { active: true, balance: { gt: 0 } },
      _sum: { balance: true },
    }),
    db.supplier.count({ where: { active: true, balance: { gt: 0 } } }),
    db.part.findMany({
      where: {
        stocks: {
          some: {
            quantity: { gt: 0 },
            store: { active: true },
            ...(storeId ? { storeId } : {}),
          },
        },
      },
      select: {
        id: true,
        reference: true,
        nameAr: true,
        nameEn: true,
        brand: true,
        purchasePrice: true,
        salePrice: true,
        stocks: {
          where: {
            store: { active: true },
            ...(storeId ? { storeId } : {}),
          },
          select: { quantity: true },
        },
      },
    }),
    db.saleItem.findMany({
      where: {
        partId: { not: null },
        sale: {
          createdAt: { gte: sleepCutoff },
          ...(storeId ? { storeId } : {}),
        },
      },
      select: { partId: true, quantity: true, returnedQty: true },
    }),
    db.saleItem.findMany({
      where: {
        partId: { not: null },
        sale: storeId ? { storeId } : {},
      },
      select: {
        partId: true,
        quantity: true,
        returnedQty: true,
        sale: { select: { createdAt: true } },
      },
    }),
  ]);

  // Build initial time buckets so chart shows full timeline
  const bucketMap = new Map<string, ReportTrendPoint>();
  if (bucketBy === "day") {
    const cur = new Date(start);
    while (cur <= end) {
      const key = toDateInput(cur);
      const label = `${String(cur.getDate()).padStart(2, "0")}/${String(cur.getMonth() + 1).padStart(2, "0")}`;
      bucketMap.set(key, { key, label, netSales: 0, netProfit: 0, cogs: 0, count: 0 });
      cur.setDate(cur.getDate() + 1);
    }
  } else {
    const cur = new Date(start.getFullYear(), start.getMonth(), 1);
    const last = new Date(end.getFullYear(), end.getMonth(), 1);
    while (cur <= last) {
      const key = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}`;
      const label = `${String(cur.getMonth() + 1).padStart(2, "0")}/${String(cur.getFullYear()).slice(-2)}`;
      bucketMap.set(key, { key, label, netSales: 0, netProfit: 0, cogs: 0, count: 0 });
      cur.setMonth(cur.getMonth() + 1);
    }
  }

  // Per-store accumulators
  const storeAcc = new Map<string, { salesCount: number; netSales: number; cogs: number; netProfit: number }>();
  for (const v of valuations) {
    storeAcc.set(v.storeId, { salesCount: 0, netSales: 0, cogs: 0, netProfit: 0 });
  }

  // Part aggregation for top-selling
  const partAcc = new Map<
    string,
    {
      partId: string | null;
      reference: string;
      fallbackName: string;
      netQty: number;
      netRevenue: number;
      cogs: number;
    }
  >();

  let grossSales = 0;
  let refundedTotal = 0;
  let netSales = 0;
  let totalCogs = 0;
  let unitsSold = 0;
  let cashFromSales = 0;
  let newCredit = 0;

  const salesRows: SaleExportRow[] = [];

  for (const s of sales) {
    const sTotal = Number(s.total);
    const sSub = Number(s.subtotal);
    const sRef = Math.min(sTotal, Number(s.refundedAmount));
    const sNet = Math.max(0, sTotal - sRef);
    const discRatio = sSub > 0 ? sTotal / sSub : 1;

    let sCogs = 0;
    for (const it of s.items) {
      const netQty = Math.max(0, it.quantity - it.returnedQty);
      if (netQty <= 0) continue;
      const itemCogs = netQty * Number(it.purchasePrice);
      const itemRev = netQty * Number(it.unitPrice) * discRatio;
      sCogs += itemCogs;
      unitsSold += netQty;

      const pKey = it.partId ?? `ref:${it.reference}`;
      const prev = partAcc.get(pKey) ?? {
        partId: it.partId,
        reference: it.reference,
        fallbackName: it.partName,
        netQty: 0,
        netRevenue: 0,
        cogs: 0,
      };
      prev.netQty += netQty;
      prev.netRevenue += itemRev;
      prev.cogs += itemCogs;
      partAcc.set(pKey, prev);
    }

    const sProfit = sNet - sCogs;

    grossSales += sTotal;
    refundedTotal += sRef;
    netSales += sNet;
    totalCogs += sCogs;
    cashFromSales += Math.max(0, Number(s.paidAmount) - sRef);
    newCredit += Number(s.debtAmount);

    const stEntry = storeAcc.get(s.storeId);
    if (stEntry) {
      stEntry.salesCount += 1;
      stEntry.netSales += sNet;
      stEntry.cogs += sCogs;
      stEntry.netProfit += sProfit;
    }

    const bKey =
      bucketBy === "day"
        ? toDateInput(s.createdAt)
        : `${s.createdAt.getFullYear()}-${String(s.createdAt.getMonth() + 1).padStart(2, "0")}`;
    const b = bucketMap.get(bKey);
    if (b) {
      b.netSales += sNet;
      b.cogs += sCogs;
      b.netProfit += sProfit;
      b.count += 1;
    }

    if (salesRows.length < 500) {
      salesRows.push({
        id: s.id,
        number: s.number,
        createdAt: s.createdAt.toISOString(),
        storeName: s.store.name,
        customerName: s.customer?.name ?? "",
        sellerName: s.user?.name ?? "",
        netSales: sNet,
        cogs: sCogs,
        netProfit: sProfit,
        paidAmount: Number(s.paidAmount),
        debtAmount: Number(s.debtAmount),
      });
    }
  }

  const netProfit = netSales - totalCogs;
  const marginPct = netSales > 0 ? (netProfit / netSales) * 100 : 0;
  const collectedCash = cashFromSales + Number(paymentsAgg._sum.amount ?? 0);

  // Enrich top-selling parts with Part metadata & current stock
  const topPartIds = [...partAcc.values()].map((p) => p.partId).filter((id): id is string => Boolean(id));
  const partMetaList =
    topPartIds.length > 0
      ? await db.part.findMany({
          where: { id: { in: topPartIds } },
          select: {
            id: true,
            nameAr: true,
            nameEn: true,
            brand: true,
            stocks: {
              where: { store: { active: true }, ...(storeId ? { storeId } : {}) },
              select: { quantity: true },
            },
          },
        })
      : [];
  const partMetaMap = new Map(partMetaList.map((p) => [p.id, p]));

  const topParts: TopPartRow[] = [...partAcc.values()]
    .map((p) => {
      const meta = p.partId ? partMetaMap.get(p.partId) : undefined;
      const currentStock = meta ? meta.stocks.reduce((acc, st) => acc + st.quantity, 0) : 0;
      return {
        partId: p.partId,
        reference: p.reference,
        nameAr: meta?.nameAr ?? p.fallbackName,
        nameEn: meta?.nameEn ?? "",
        brand: meta?.brand ?? "",
        netQty: p.netQty,
        netRevenue: p.netRevenue,
        cogs: p.cogs,
        netProfit: p.netRevenue - p.cogs,
        currentStock,
      };
    })
    .sort((a, b) => b.netQty - a.netQty || b.netProfit - a.netProfit)
    .slice(0, 25);

  // Compute sleeping stock (currently in stock > 0, zero net units sold since sleepCutoff)
  const soldInWindow = new Set<string>();
  for (const si of recentSoldGroups) {
    if (si.partId && si.quantity - si.returnedQty > 0) {
      soldInWindow.add(si.partId);
    }
  }

  const lastSoldMap = new Map<string, Date>();
  for (const si of lastSoldGroups) {
    if (!si.partId || si.quantity - si.returnedQty <= 0) continue;
    const prev = lastSoldMap.get(si.partId);
    if (!prev || si.sale.createdAt > prev) {
      lastSoldMap.set(si.partId, si.sale.createdAt);
    }
  }

  const allSleeping: SleepingPartRow[] = [];
  for (const p of stockedParts) {
    if (soldInWindow.has(p.id)) continue;
    const qty = p.stocks.reduce((acc, st) => acc + st.quantity, 0);
    if (qty <= 0) continue;
    const buy = Number(p.purchasePrice);
    const sell = Number(p.salePrice);
    const last = lastSoldMap.get(p.id);
    allSleeping.push({
      partId: p.id,
      reference: p.reference,
      nameAr: p.nameAr,
      nameEn: p.nameEn,
      brand: p.brand,
      quantity: qty,
      purchasePrice: buy,
      salePrice: sell,
      tiedCost: qty * buy,
      tiedSale: qty * sell,
      lastSoldAt: last ? last.toISOString() : null,
    });
  }
  allSleeping.sort((a, b) => b.tiedCost - a.tiedCost || b.quantity - a.quantity);

  const sleepingSummary = {
    totalTypes: allSleeping.length,
    totalUnits: allSleeping.reduce((s, r) => s + r.quantity, 0),
    totalTiedCost: allSleeping.reduce((s, r) => s + r.tiedCost, 0),
    totalTiedSale: allSleeping.reduce((s, r) => s + r.tiedSale, 0),
    rows: allSleeping.slice(0, 40),
  };

  // Per-store breakdown
  const perStore: StorePerfRow[] = valuations.map((v) => {
    const acc = storeAcc.get(v.storeId) ?? { salesCount: 0, netSales: 0, cogs: 0, netProfit: 0 };
    return {
      storeId: v.storeId,
      storeName: v.storeName,
      salesCount: acc.salesCount,
      netSales: acc.netSales,
      cogs: acc.cogs,
      netProfit: acc.netProfit,
      marginPct: acc.netSales > 0 ? (acc.netProfit / acc.netSales) * 100 : 0,
      stockUnits: v.units,
      stockCostValue: v.costValue,
      stockSaleValue: v.saleValue,
    };
  });

  // Snapshot totals (filtered by storeId for stock, global for customer/supplier ledgers)
  const relevantVals = storeId ? valuations.filter((v) => v.storeId === storeId) : valuations;
  const stockUnits = relevantVals.reduce((s, v) => s + v.units, 0);
  const stockCostValue = relevantVals.reduce((s, v) => s + v.costValue, 0);
  const stockSaleValue = relevantVals.reduce((s, v) => s + v.saleValue, 0);
  const receivables = Number(receivablesAgg._sum.balance ?? 0);
  const payables = Number(payablesAgg._sum.balance ?? 0);

  return {
    period,
    fromInput,
    toInput,
    sleepDays,
    storeId,
    storeName: selectedStore?.name ?? null,
    bucketBy,
    kpis: {
      salesCount: sales.length,
      unitsSold,
      grossSales,
      refundedTotal,
      netSales,
      cogs: totalCogs,
      netProfit,
      marginPct,
      collectedCash,
      newCredit,
      purchasesTotal: Number(purchasesAgg._sum.total ?? 0),
      purchasesCount: purchasesAgg._count._all,
    },
    series: [...bucketMap.values()],
    perStore,
    topParts,
    sleeping: sleepingSummary,
    snapshot: {
      stockUnits,
      stockCostValue,
      stockSaleValue,
      receivables,
      debtorsCount,
      payables,
      creditorsCount,
      netPosition: receivables - payables,
    },
    salesRows,
  };
}
