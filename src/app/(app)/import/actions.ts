"use server";

import { Prisma, type VehicleType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { can, requireUser } from "@/lib/auth";
import { normalizeDim, normalizeRef } from "@/lib/search";
import { generateBarcode } from "@/lib/barcode";

export type ImportRow = Partial<
  Record<
    | "reference"
    | "nameAr"
    | "nameEn"
    | "brand"
    | "barcode"
    | "category"
    | "dimensions"
    | "purchasePrice"
    | "salePrice"
    | "quantity"
    | "minQuantity"
    | "location"
    | "vehicles",
    string
  >
> & { _row: number };

export type ImportResult = {
  created: number;
  updated: number;
  skipped: number;
  errors: { row: number; message: string }[];
};

const TRUCK_MAKES = ["iveco", "man", "scania", "daf", "shacman", "snvi", "foton", "howo", "sinotruk", "faw", "dongfeng", "kamaz", "actros", "axor", "renault trucks"];

/** "1 250,50" / "1.250,50" / "1250.5" -> 1250.5 */
function parseNumber(v: string | undefined): number | null {
  if (v == null) return null;
  let s = String(v).replace(/[\s\u00a0\u202f]/g, "").replace(/(da|dzd|دج)$/i, "");
  if (!s) return null;
  if (s.includes(",") && s.includes(".")) s = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  else s = s.replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** "Renault Symbol 2013-2018; Peugeot 208 2015; Iveco Daily" */
function parseVehicles(text: string | undefined) {
  if (!text) return [];
  return text
    .split(/[;\n|]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 50)
    .map((part) => {
      let rest = part;
      let yearFrom: number | null = null;
      let yearTo: number | null = null;
      const range = rest.match(/(\d{4})\s*[-–/à]\s*(\d{4})\s*$/);
      const single = rest.match(/(\d{4})\s*\+?\s*$/);
      if (range) {
        yearFrom = Number(range[1]);
        yearTo = Number(range[2]);
        rest = rest.slice(0, range.index).trim();
      } else if (single) {
        yearFrom = Number(single[1]);
        yearTo = part.trim().endsWith("+") ? null : yearFrom;
        rest = rest.slice(0, single.index).trim();
      }
      const valid = (y: number | null) => (y && y >= 1950 && y <= 2100 ? y : null);
      const [make, ...model] = rest.split(/\s+/);
      const lower = part.toLowerCase();
      const type: VehicleType =
        TRUCK_MAKES.some((m) => lower.startsWith(m)) || /camion|truck|شاحنة/i.test(lower) ? "TRUCK" : "CAR";
      return { type, make: (make ?? "").slice(0, 60), model: model.join(" ").slice(0, 60), yearFrom: valid(yearFrom), yearTo: valid(yearTo) };
    })
    .filter((v) => v.make);
}

const clean = (v: string | undefined, max = 200) => (v == null ? "" : String(v).trim().slice(0, max));

export async function importParts(
  storeId: string,
  qtyMode: "replace" | "add",
  rows: ImportRow[],
): Promise<ImportResult> {
  const user = await requireUser();
  const result: ImportResult = { created: 0, updated: 0, skipped: 0, errors: [] };
  if (!can.importData(user) || !can.adjustStock(user, storeId)) {
    result.errors.push({ row: 0, message: "no access" });
    return result;
  }
  const store = await db.store.findFirst({ where: { id: storeId, active: true }, select: { id: true } });
  if (!store) {
    result.errors.push({ row: 0, message: "store" });
    return result;
  }

  const categoryCache = new Map<string, string>();
  const getCategoryId = async (name: string) => {
    if (!name) return undefined;
    if (categoryCache.has(name)) return categoryCache.get(name);
    const c = await db.category.upsert({ where: { nameAr: name }, update: {}, create: { nameAr: name } });
    categoryCache.set(name, c.id);
    return c.id;
  };

  for (const row of rows.slice(0, 2000)) {
    try {
      const reference = clean(row.reference, 80);
      const nameEn = clean(row.nameEn);
      const nameAr = clean(row.nameAr) || nameEn;
      if (!reference || !nameAr) {
        result.skipped++;
        continue;
      }
      const brand = clean(row.brand, 80);
      const barcode = clean(row.barcode, 64);
      const dimensions = clean(row.dimensions, 100);
      const categoryId = await getCategoryId(clean(row.category, 80));
      const purchasePrice = parseNumber(row.purchasePrice);
      const salePrice = parseNumber(row.salePrice);
      const quantity = parseNumber(row.quantity);
      const minQuantity = parseNumber(row.minQuantity);
      const location = row.location !== undefined ? clean(row.location, 40) : undefined;
      const vehicles = parseVehicles(row.vehicles);

      const existing = await db.part.findUnique({ where: { reference_brand: { reference, brand } }, select: { id: true } });
      // Only use the barcode if no other part already has it.
      let barcodeToSet: string | undefined;
      if (barcode) {
        const owner = await db.part.findUnique({ where: { barcode }, select: { id: true } });
        if (!owner || owner.id === existing?.id) barcodeToSet = barcode;
      }

      const fields = {
        refNorm: normalizeRef(reference),
        nameAr,
        ...(nameEn ? { nameEn } : {}),
        ...(categoryId ? { categoryId } : {}),
        ...(dimensions ? { dimensions, dimNorm: normalizeDim(dimensions) } : {}),
        ...(purchasePrice != null && purchasePrice >= 0 ? { purchasePrice: new Prisma.Decimal(purchasePrice.toFixed(2)) } : {}),
        ...(salePrice != null && salePrice >= 0 ? { salePrice: new Prisma.Decimal(salePrice.toFixed(2)) } : {}),
      };

      await db.$transaction(async (tx) => {
        let partId: string;
        if (existing) {
          partId = existing.id;
          await tx.part.update({ where: { id: partId }, data: { ...fields, ...(barcodeToSet ? { barcode: barcodeToSet } : {}) } });
          if (vehicles.length) {
            await tx.vehicleCompat.deleteMany({ where: { partId } });
            await tx.vehicleCompat.createMany({ data: vehicles.map((v) => ({ ...v, partId })) });
          }
        } else {
          const created = await tx.part.create({
            data: {
              reference,
              brand,
              ...fields,
              barcode: barcodeToSet ?? (await generateBarcode()),
              compat: { create: vehicles },
            },
          });
          partId = created.id;
        }

        const stock = await tx.stock.upsert({
          where: { partId_storeId: { partId, storeId } },
          update: {},
          create: { partId, storeId },
        });
        const qty = quantity != null ? Math.max(0, Math.round(quantity)) : null;
        const after = qty == null ? stock.quantity : qtyMode === "add" ? stock.quantity + qty : qty;
        await tx.stock.update({
          where: { id: stock.id },
          data: {
            quantity: after,
            ...(minQuantity != null ? { minQuantity: Math.max(0, Math.round(minQuantity)) } : {}),
            ...(location !== undefined && location !== "" ? { location } : {}),
          },
        });
        if (after !== stock.quantity) {
          await tx.stockMovement.create({
            data: { partId, storeId, userId: user.id, type: "IMPORT", quantity: after - stock.quantity, after },
          });
        }
      });

      if (existing) result.updated++;
      else result.created++;
    } catch (e) {
      result.errors.push({ row: row._row, message: e instanceof Error ? e.message.split("\n").pop()!.slice(0, 160) : "error" });
    }
  }

  revalidatePath("/parts");
  revalidatePath("/");
  return result;
}
