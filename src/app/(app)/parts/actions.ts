"use server";

import { Prisma, type VehicleType } from "@prisma/client";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { can, requireUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { normalizeDim, normalizeRef } from "@/lib/search";
import { generateBarcode } from "@/lib/barcode";

export type FormState = { error?: string; ok?: boolean } | undefined;

type CompatInput = { type: VehicleType; make: string; model: string; yearFrom: string; yearTo: string };
type StockInput = { storeId: string; quantity: string; minQuantity: string; location: string };
type PartPayload = {
  id?: string;
  reference: string;
  barcode: string;
  nameAr: string;
  nameEn: string;
  brand: string;
  category: string;
  dimensions?: string;
  purchasePrice: string;
  salePrice: string;
  imageUrl?: string;
  notes: string;
  compat: CompatInput[];
  stocks: StockInput[];
};

const str = (v: unknown, max = 200) => String(v ?? "").trim().slice(0, max);
const safeImageUrl = (v: unknown) => {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) return "";
  if (s.startsWith("data:image/") && s.length <= 800_000) return s;
  return "";
};
const toInt = (v: string, fallback = 0) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
};
const toYear = (v: string) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n >= 1950 && n <= 2100 ? n : null;
};
const toPrice = (v: string) => {
  const n = Number(String(v).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : NaN;
};

export async function savePart(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const { t } = await getI18n();
  if (!can.editParts(user)) return { error: t.common.noAccess };

  let p: PartPayload;
  try {
    p = JSON.parse(String(formData.get("payload") ?? "{}"));
  } catch {
    return { error: t.common.error };
  }

  const reference = str(p.reference, 80);
  const nameAr = str(p.nameAr);
  if (!reference || !nameAr) return { error: t.partForm.errRequired };

  const purchasePrice = p.purchasePrice ? toPrice(p.purchasePrice) : 0;
  const salePrice = p.salePrice ? toPrice(p.salePrice) : 0;
  if (!(purchasePrice >= 0) || !(salePrice >= 0)) return { error: t.partForm.errPrice };

  const brand = str(p.brand, 80);
  const barcodeInput = str(p.barcode, 64);
  const categoryName = str(p.category, 80);
  const dimensions = str(p.dimensions, 100);

  const compat = (Array.isArray(p.compat) ? p.compat : [])
    .map((c) => ({
      type: (c.type === "TRUCK" ? "TRUCK" : "CAR") as VehicleType,
      make: str(c.make, 60),
      model: str(c.model, 60),
      yearFrom: toYear(c.yearFrom),
      yearTo: toYear(c.yearTo),
    }))
    .filter((c) => c.make)
    .slice(0, 100);

  // Stores this user may touch
  const allowedStores = await db.store.findMany({
    where: { active: true, ...(can.seeAllStores(user) ? {} : { id: user.storeId ?? "__none__" }) },
    select: { id: true },
  });
  const allowed = new Set(allowedStores.map((s) => s.id));
  const stocks = (Array.isArray(p.stocks) ? p.stocks : [])
    .filter((s) => allowed.has(s.storeId))
    .map((s) => ({
      storeId: s.storeId,
      quantity: Math.max(0, toInt(s.quantity)),
      minQuantity: Math.max(0, toInt(s.minQuantity)),
      location: str(s.location, 40),
    }));

  // Duplicate checks with friendly messages
  const dup = await db.part.findFirst({
    where: { reference, brand, ...(p.id ? { NOT: { id: p.id } } : {}) },
    select: { id: true },
  });
  if (dup) return { error: t.partForm.errDuplicate };
  if (barcodeInput) {
    const bc = await db.part.findFirst({
      where: { barcode: barcodeInput, ...(p.id ? { NOT: { id: p.id } } : {}) },
      select: { id: true },
    });
    if (bc) return { error: t.partForm.errBarcode };
  }

  let categoryId: string | null = null;
  if (categoryName) {
    const cat = await db.category.upsert({
      where: { nameAr: categoryName },
      update: {},
      create: { nameAr: categoryName },
    });
    categoryId = cat.id;
  }

  const data = {
    reference,
    refNorm: normalizeRef(reference),
    nameAr,
    nameEn: str(p.nameEn),
    brand,
    categoryId,
    dimensions,
    dimNorm: normalizeDim(dimensions),
    purchasePrice: new Prisma.Decimal(purchasePrice.toFixed(2)),
    salePrice: new Prisma.Decimal(salePrice.toFixed(2)),
    imageUrl: safeImageUrl(p.imageUrl),
    notes: str(p.notes, 2000),
  };

  let partId: string;
  try {
    if (p.id) {
      const existing = await db.part.findUnique({ where: { id: p.id }, select: { id: true } });
      if (!existing) return { error: t.common.error };
      partId = p.id;
      await db.$transaction([
        db.part.update({ where: { id: partId }, data: { ...data, barcode: barcodeInput || undefined } }),
        db.vehicleCompat.deleteMany({ where: { partId } }),
        db.vehicleCompat.createMany({ data: compat.map((c) => ({ ...c, partId })) }),
        // On edit, quantities change only through "adjust" (keeps the history honest);
        // here we only update the min quantity and the shelf location.
        ...stocks.map((s) =>
          db.stock.upsert({
            where: { partId_storeId: { partId, storeId: s.storeId } },
            update: { minQuantity: s.minQuantity, location: s.location },
            create: { partId, storeId: s.storeId, minQuantity: s.minQuantity, location: s.location },
          }),
        ),
      ]);
    } else {
      const barcode = barcodeInput || (await generateBarcode());
      const created = await db.$transaction(async (tx) => {
        const part = await tx.part.create({
          data: { ...data, barcode, compat: { create: compat } },
        });
        for (const s of stocks) {
          await tx.stock.create({ data: { partId: part.id, ...s } });
          if (s.quantity > 0) {
            await tx.stockMovement.create({
              data: {
                partId: part.id,
                storeId: s.storeId,
                userId: user.id,
                type: "INITIAL",
                quantity: s.quantity,
                after: s.quantity,
              },
            });
          }
        }
        return part;
      });
      partId = created.id;
    }
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { error: t.partForm.errDuplicate };
    }
    throw e;
  }

  revalidatePath("/parts");
  revalidatePath("/");
  redirect(`/parts/${partId}`);
}

export async function deletePart(partId: string) {
  const user = await requireUser();
  if (user.role !== "OWNER") return;
  await db.part.delete({ where: { id: partId } });
  revalidatePath("/parts");
  revalidatePath("/");
  redirect("/parts");
}

export async function deletePartFromList(partId: string): Promise<{ ok?: boolean }> {
  const user = await requireUser();
  if (user.role !== "OWNER") return {};
  await db.part.delete({ where: { id: partId } }).catch(() => {});
  revalidatePath("/parts");
  revalidatePath("/alerts");
  revalidatePath("/");
  return { ok: true };
}

export async function adjustStock(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const { t } = await getI18n();
  const partId = str(formData.get("partId"), 40);
  const storeId = str(formData.get("storeId"), 40);
  const mode = str(formData.get("mode"), 10);
  const qty = Number.parseInt(String(formData.get("quantity") ?? ""), 10);
  const note = str(formData.get("note"), 300);

  if (!can.adjustStock(user, storeId)) return { error: t.common.noAccess };
  if (!Number.isFinite(qty) || qty < 0 || (mode !== "set" && qty === 0) || qty > 1_000_000) {
    return { error: t.adjust.errQty };
  }

  const store = await db.store.findFirst({ where: { id: storeId, active: true }, select: { id: true } });
  const part = await db.part.findUnique({ where: { id: partId }, select: { id: true } });
  if (!store || !part) return { error: t.common.error };

  const result = await db.$transaction(async (tx) => {
    const stock = await tx.stock.upsert({
      where: { partId_storeId: { partId, storeId } },
      update: {},
      create: { partId, storeId },
    });
    let delta = 0;
    if (mode === "add") delta = qty;
    else if (mode === "remove") delta = -qty;
    else delta = qty - stock.quantity;

    const after = stock.quantity + delta;
    if (after < 0) return { error: t.adjust.errNegative };
    if (delta === 0) return { ok: true };

    await tx.stock.update({ where: { id: stock.id }, data: { quantity: after } });
    await tx.stockMovement.create({
      data: {
        partId,
        storeId,
        userId: user.id,
        type: mode === "add" ? "IN" : mode === "remove" ? "OUT" : "ADJUST",
        quantity: delta,
        after,
        note,
      },
    });
    return { ok: true };
  });

  if (result.ok) {
    revalidatePath(`/parts/${partId}`);
    revalidatePath("/parts");
    revalidatePath("/");
  }
  return result;
}

export async function updatePartPhoto(partId: string, imageUrl: string) {
  const user = await requireUser();
  if (!can.editParts(user)) return;
  await db.part.update({
    where: { id: partId },
    data: { imageUrl: safeImageUrl(imageUrl) },
  });
  revalidatePath(`/parts/${partId}`);
  revalidatePath("/parts");
}

