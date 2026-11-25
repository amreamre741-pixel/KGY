"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { can, requireUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";

export type PurchaseInput = {
  storeId: string;
  supplierId?: string;
  newSupplierName?: string;
  newSupplierPhone?: string;
  supplierRef?: string;
  paidAmount: number;
  note?: string;
  items: { partId: string; quantity: number; unitCost: number; newSalePrice?: number }[];
};

export async function createPurchase(input: PurchaseInput): Promise<{ error?: string; purchaseId?: string }> {
  const user = await requireUser();
  const { t } = await getI18n();

  if (!can.seeCost(user)) return { error: t.common.noAccess };
  const storeId = String(input.storeId ?? "").trim();
  if (!storeId || !can.adjustStock(user, storeId)) return { error: t.common.noAccess };

  const rawItems = Array.isArray(input.items) ? input.items : [];
  const items = rawItems
    .map((it) => ({
      partId: String(it.partId ?? "").trim(),
      quantity: Math.floor(Number(it.quantity) || 0),
      unitCost: Math.max(0, Number(it.unitCost) || 0),
      newSalePrice: it.newSalePrice != null && Number(it.newSalePrice) > 0 ? Number(it.newSalePrice) : undefined,
    }))
    .filter((it) => it.partId && it.quantity > 0);

  if (items.length === 0) return { error: t.purchases.errItems };

  const total = Number(items.reduce((s, it) => s + it.quantity * it.unitCost, 0).toFixed(2));
  const paidAmount = Math.min(total, Math.max(0, Number(input.paidAmount) || 0));
  const debtAmount = Math.max(0, Number((total - paidAmount).toFixed(2)));

  const existingSupplierId = String(input.supplierId ?? "").trim();
  const newName = String(input.newSupplierName ?? "").trim().slice(0, 120);
  const newPhone = String(input.newSupplierPhone ?? "").trim().slice(0, 40);

  if (debtAmount > 0 && !existingSupplierId && !newName) {
    return { error: t.purchases.errSupplierDebt };
  }

  const res = await db.$transaction(async (tx) => {
    const store = await tx.store.findFirst({ where: { id: storeId, active: true }, select: { id: true } });
    if (!store) return { error: t.common.error };

    let supplierId: string | null = existingSupplierId || null;
    if (!supplierId && newName) {
      const sup = await tx.supplier.create({ data: { name: newName, phone: newPhone } });
      supplierId = sup.id;
    }

    const parts = await tx.part.findMany({ where: { id: { in: items.map((i) => i.partId) } } });
    const partMap = new Map(parts.map((p) => [p.id, p]));

    const year = new Date().getFullYear();
    const count = await tx.purchase.count();
    const number = `BA-${year}-${String(count + 1).padStart(4, "0")}`;

    const validItems = items.filter((it) => partMap.has(it.partId));
    if (validItems.length === 0) return { error: t.purchases.errItems };

    const purchase = await tx.purchase.create({
      data: {
        number,
        supplierRef: String(input.supplierRef ?? "").trim().slice(0, 80),
        storeId,
        supplierId,
        userId: user.id,
        total: new Prisma.Decimal(total.toFixed(2)),
        paidAmount: new Prisma.Decimal(paidAmount.toFixed(2)),
        debtAmount: new Prisma.Decimal(debtAmount.toFixed(2)),
        note: String(input.note ?? "").trim().slice(0, 300),
        items: {
          create: validItems.map((it) => {
            const p = partMap.get(it.partId)!;
            return {
              partId: p.id,
              partName: p.nameAr,
              reference: p.reference,
              quantity: it.quantity,
              unitCost: new Prisma.Decimal(it.unitCost.toFixed(2)),
              lineTotal: new Prisma.Decimal((it.quantity * it.unitCost).toFixed(2)),
            };
          }),
        },
      },
    });

    for (const it of validItems) {
      const p = partMap.get(it.partId)!;
      await tx.part.update({
        where: { id: p.id },
        data: {
          purchasePrice: new Prisma.Decimal(it.unitCost.toFixed(2)),
          ...(it.newSalePrice != null ? { salePrice: new Prisma.Decimal(it.newSalePrice.toFixed(2)) } : {}),
        },
      });

      const stock = await tx.stock.upsert({
        where: { partId_storeId: { partId: p.id, storeId } },
        update: { quantity: { increment: it.quantity } },
        create: { partId: p.id, storeId, quantity: it.quantity },
      });

      await tx.stockMovement.create({
        data: {
          partId: p.id,
          storeId,
          userId: user.id,
          type: "PURCHASE",
          quantity: it.quantity,
          after: stock.quantity,
          note: number,
        },
      });
    }

    if (debtAmount > 0 && supplierId) {
      await tx.supplier.update({
        where: { id: supplierId },
        data: { balance: { increment: new Prisma.Decimal(debtAmount.toFixed(2)) } },
      });
    }

    return { purchaseId: purchase.id };
  });

  if (res.purchaseId) {
    revalidatePath("/");
    revalidatePath("/parts");
    revalidatePath("/pos");
    revalidatePath("/purchases");
    revalidatePath("/suppliers");
    revalidatePath("/zakat");
  }
  return res;
}
