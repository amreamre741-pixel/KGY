import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "./db";
import { asYear, normalizeDim, normalizeRef, searchTerms } from "./search";

export const PAGE_SIZE = 30;

/**
 * Every term must match something: reference (normalized), barcode, names,
 * brand, category, dimensions/size in mm, or a compatible vehicle (make/model/year).
 * "roulement 30x62x16" or "plaquette symbol 2016" -> exact matches.
 */
export function partSearchWhere(q: string): Prisma.PartWhereInput {
  const terms = searchTerms(q);
  if (!terms.length) return {};
  return {
    AND: terms.map((term): Prisma.PartWhereInput => {
      const ci = { contains: term, mode: "insensitive" as const };
      const norm = normalizeRef(term);
      const dNorm = normalizeDim(term);
      const year = asYear(term);
      const or: Prisma.PartWhereInput[] = [
        { nameAr: ci },
        { nameEn: ci },
        { brand: ci },
        { dimensions: ci },
        { barcode: { equals: term } },
        { category: { OR: [{ nameAr: ci }, { nameEn: ci }] } },
        { compat: { some: { OR: [{ make: ci }, { model: ci }] } } },
      ];
      if (norm) or.push({ refNorm: { contains: norm } });
      if (dNorm) or.push({ dimNorm: { contains: dNorm } });
      if (year) {
        or.push({
          compat: {
            some: {
              AND: [
                { OR: [{ yearFrom: null }, { yearFrom: { lte: year } }] },
                { OR: [{ yearTo: null }, { yearTo: { gte: year } }] },
                { OR: [{ yearFrom: { not: null } }, { yearTo: { not: null } }] },
              ],
            },
          },
        });
      }
      return { OR: or };
    }),
  };
}

/** Parts running low (0 < quantity <= minQuantity). */
export function runningLowWhere(storeId: string | null): Prisma.StockWhereInput {
  return {
    ...(storeId ? { storeId } : {}),
    store: { active: true },
    minQuantity: { gt: 0 },
    quantity: { gt: 0, lte: db.stock.fields.minQuantity },
  };
}

/** Parts that emptied completely in a store (quantity <= 0). */
export function outOfStockWhere(storeId: string | null): Prisma.StockWhereInput {
  return {
    ...(storeId ? { storeId } : {}),
    store: { active: true },
    quantity: { lte: 0 },
  };
}

export function lowStockWhere(storeId: string | null): Prisma.StockWhereInput {
  return {
    ...(storeId ? { storeId } : {}),
    store: { active: true },
    minQuantity: { gt: 0 },
    quantity: { lte: db.stock.fields.minQuantity },
  };
}

export async function listParts(opts: {
  q: string;
  storeId: string | null;
  lowOnly: boolean;
  outOnly?: boolean;
  page: number;
}) {
  // Complete warehouse isolation: every store ONLY sees the goods belonging to its own warehouse!
  const storeMembershipFilter: Prisma.PartWhereInput = opts.storeId
    ? { stocks: { some: { storeId: opts.storeId } } }
    : {};

  const stockFilter: Prisma.PartWhereInput = opts.outOnly
    ? { stocks: { some: outOfStockWhere(opts.storeId) } }
    : opts.lowOnly
      ? { stocks: { some: lowStockWhere(opts.storeId) } }
      : {};

  const where: Prisma.PartWhereInput = {
    AND: [partSearchWhere(opts.q), storeMembershipFilter, stockFilter],
  };
  const [total, parts] = await Promise.all([
    db.part.count({ where }),
    db.part.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }],
      skip: (opts.page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        category: { select: { nameAr: true, nameEn: true } },
        compat: { take: 3, orderBy: { make: "asc" } },
        _count: { select: { compat: true } },
        stocks: {
          where: {
            store: { active: true },
            ...(opts.storeId ? { storeId: opts.storeId } : {}),
          },
          select: {
            quantity: true,
            minQuantity: true,
            location: true,
            storeId: true,
            store: { select: { name: true } },
          },
        },
      },
    }),
  ]);
  return { total, parts };
}

/** If a scanned/typed code matches exactly one part in this store's warehouse, return its id. */
export async function findExactPart(code: string, storeId?: string | null): Promise<string | null> {
  const norm = normalizeRef(code);
  const matches = await db.part.findMany({
    where: {
      ...(storeId ? { stocks: { some: { storeId } } } : {}),
      OR: [{ barcode: code }, ...(norm ? [{ refNorm: norm }] : [])],
    },
    select: { id: true },
    take: 2,
  });
  return matches.length === 1 ? matches[0].id : null;
}

export async function homeStats(storeId: string | null) {
  const stockWhere: Prisma.StockWhereInput = { store: { active: true }, ...(storeId ? { storeId } : {}) };
  const storeFilter = storeId ? Prisma.sql`AND s."storeId" = ${storeId}` : Prisma.empty;

  const [partCount, units, valueRows, lowCount, outCount, pendingOrders] = await Promise.all([
    storeId ? db.stock.count({ where: { storeId } }) : db.part.count(),
    db.stock.aggregate({ where: stockWhere, _sum: { quantity: true } }),
    db.$queryRaw<{ cost_value: Prisma.Decimal | null; sale_value: Prisma.Decimal | null }[]>`
      SELECT
        SUM(s."quantity" * p."purchasePrice") AS cost_value,
        SUM(s."quantity" * p."salePrice") AS sale_value
      FROM "Stock" s
      JOIN "Part" p ON p."id" = s."partId"
      JOIN "Store" st ON st."id" = s."storeId"
      WHERE st."active" = true AND s."quantity" > 0 ${storeFilter}`,
    db.stock.count({ where: runningLowWhere(storeId) }),
    db.stock.count({ where: outOfStockWhere(storeId) }),
    db.orderNote.count({ where: { status: "PENDING", ...(storeId ? { storeId } : {}) } }),
  ]);

  return {
    partCount,
    units: units._sum.quantity ?? 0,
    value: Number(valueRows[0]?.cost_value ?? 0),
    saleValue: Number(valueRows[0]?.sale_value ?? 0),
    lowCount,
    outCount,
    pendingOrders,
  };
}

export async function perStoreValuations() {
  const stores = await db.store.findMany({
    where: { active: true },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  });

  const rows = await db.$queryRaw<
    {
      storeId: string;
      units: bigint | null;
      partTypes: bigint | null;
      costValue: Prisma.Decimal | null;
      saleValue: Prisma.Decimal | null;
    }[]
  >`
    SELECT
      s."storeId",
      SUM(s."quantity") AS units,
      COUNT(s."partId") AS "partTypes",
      SUM(s."quantity" * p."purchasePrice") AS "costValue",
      SUM(s."quantity" * p."salePrice") AS "saleValue"
    FROM "Stock" s
    JOIN "Part" p ON p."id" = s."partId"
    JOIN "Store" st ON st."id" = s."storeId"
    WHERE st."active" = true AND s."quantity" > 0
    GROUP BY s."storeId"`;

  const byStore = new Map(rows.map((r) => [r.storeId, r]));

  return stores.map((st) => {
    const r = byStore.get(st.id);
    return {
      storeId: st.id,
      storeName: st.name,
      units: Number(r?.units ?? 0),
      partTypes: Number(r?.partTypes ?? 0),
      costValue: Number(r?.costValue ?? 0),
      saleValue: Number(r?.saleValue ?? 0),
    };
  });
}

export async function lowStockList(storeId: string | null, take = 8) {
  return db.stock.findMany({
    where: runningLowWhere(storeId),
    orderBy: [{ quantity: "asc" }],
    take,
    include: {
      part: { select: { id: true, nameAr: true, nameEn: true, reference: true, brand: true, dimensions: true } },
      store: { select: { id: true, name: true } },
    },
  });
}

export async function outOfStockList(storeId: string | null, take = 8) {
  return db.stock.findMany({
    where: outOfStockWhere(storeId),
    orderBy: [{ part: { updatedAt: "desc" } }],
    take,
    include: {
      part: { select: { id: true, nameAr: true, nameEn: true, reference: true, brand: true, dimensions: true } },
      store: { select: { id: true, name: true } },
    },
  });
}

export async function recentMovements(storeId: string | null, take = 8) {
  return db.stockMovement.findMany({
    where: storeId ? { storeId } : {},
    orderBy: { createdAt: "desc" },
    take,
    include: {
      part: { select: { id: true, nameAr: true, nameEn: true, reference: true } },
      store: { select: { name: true } },
      user: { select: { name: true } },
    },
  });
}

export function stockStatus(quantity: number, minQuantity: number): "ok" | "low" | "out" {
  if (quantity <= 0) return "out";
  if (minQuantity > 0 && quantity <= minQuantity) return "low";
  return "ok";
}

/** Suggestions for the part form (datalists). */
export async function partFormOptions() {
  const [cats, brands, makes] = await Promise.all([
    db.category.findMany({ orderBy: { nameAr: "asc" }, select: { nameAr: true }, take: 300 }),
    db.part.findMany({ where: { brand: { not: "" } }, distinct: ["brand"], select: { brand: true }, take: 300 }),
    db.vehicleCompat.findMany({ distinct: ["make"], select: { make: true }, take: 300 }),
  ]);
  const commonMakes = [
    "Renault", "Peugeot", "Citroën", "Dacia", "Volkswagen", "Hyundai", "Kia", "Toyota", "Nissan", "Chevrolet",
    "Fiat", "Seat", "Skoda", "Suzuki", "Chery", "Geely", "Mercedes", "Iveco", "MAN", "Volvo", "Scania", "DAF",
    "Isuzu", "Mitsubishi", "SNVI", "Shacman", "Foton", "JAC",
  ];
  return {
    categories: cats.map((c) => c.nameAr),
    brands: brands.map((b) => b.brand).sort(),
    makes: [...new Set([...makes.map((m) => m.make), ...commonMakes])].sort(),
  };
}

/** Stores the user may manage stock in. */
export async function editableStores(user: { role: string; storeId: string | null }) {
  return db.store.findMany({
    where: { active: true, ...(user.role === "OWNER" ? {} : { id: user.storeId ?? "__none__" }) },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  });
}
