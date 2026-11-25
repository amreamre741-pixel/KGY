"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { can, requireUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { partName } from "@/lib/format";

export type SaleInput = {
  storeId: string;
  paymentMode: "cash" | "credit";
  customerId?: string;
  newCustomerName?: string;
  newCustomerPhone?: string;
  discount: number;
  paidAmount: number;
  note?: string;
  items: { partId: string; quantity: number; unitPrice: number }[];
};

export async function createSale(input: SaleInput): Promise<{ error?: string; saleId?: string }> {
  const user = await requireUser();
  const { t, lang } = await getI18n();

  const storeId = String(input.storeId ?? "").trim();
  if (!storeId || (!can.seeAllStores(user) && user.storeId !== storeId)) {
    return { error: t.common.noAccess };
  }

  const rawItems = Array.isArray(input.items) ? input.items : [];
  if (rawItems.length === 0) return { error: t.pos.errEmpty };

  // Merge duplicate partIds if any
  const merged = new Map<string, { partId: string; quantity: number; unitPrice: number }>();
  for (const it of rawItems) {
    const qty = Math.floor(Number(it.quantity) || 0);
    const price = Math.max(0, Number(it.unitPrice) || 0);
    if (!it.partId || qty <= 0) continue;
    const prev = merged.get(it.partId);
    if (prev) prev.quantity += qty;
    else merged.set(it.partId, { partId: it.partId, quantity: qty, unitPrice: price });
  }
  const items = [...merged.values()];
  if (items.length === 0) return { error: t.pos.errEmpty };

  const subtotal = items.reduce((s, it) => s + it.quantity * it.unitPrice, 0);
  const discount = Math.min(subtotal, Math.max(0, Number(input.discount) || 0));
  const total = Math.max(0, Number((subtotal - discount).toFixed(2)));
  const isCredit = input.paymentMode === "credit";
  const paidAmount = isCredit ? Math.min(total, Math.max(0, Number(input.paidAmount) || 0)) : total;
  const debtAmount = Math.max(0, Number((total - paidAmount).toFixed(2)));

  const newName = String(input.newCustomerName ?? "").trim().slice(0, 120);
  const newPhone = String(input.newCustomerPhone ?? "").trim().slice(0, 40);
  const existingCustomerId = String(input.customerId ?? "").trim();

  if (debtAmount > 0 && !existingCustomerId && !newName) {
    return { error: t.pos.errCustomerRequired };
  }

  const res = await db.$transaction(async (tx) => {
    const store = await tx.store.findFirst({ where: { id: storeId, active: true }, select: { id: true } });
    if (!store) return { error: t.common.error };

    let customerId: string | null = existingCustomerId || null;
    if (!customerId && newName) {
      const c = await tx.customer.create({ data: { name: newName, phone: newPhone } });
      customerId = c.id;
    }

    const parts = await tx.part.findMany({
      where: { id: { in: items.map((i) => i.partId) } },
      include: { stocks: { where: { storeId } } },
    });
    const partMap = new Map(parts.map((p) => [p.id, p]));

    for (const it of items) {
      const p = partMap.get(it.partId);
      const avail = p?.stocks[0]?.quantity ?? 0;
      if (!p || avail < it.quantity) {
        return { error: `${t.pos.errStock}: ${p ? partName(p, lang) : ""} (${avail})` };
      }
    }

    const year = new Date().getFullYear();
    const count = await tx.sale.count();
    const number = `BL-${year}-${String(count + 1).padStart(4, "0")}`;

    const sale = await tx.sale.create({
      data: {
        number,
        storeId,
        userId: user.id,
        customerId,
        subtotal: new Prisma.Decimal(subtotal.toFixed(2)),
        discount: new Prisma.Decimal(discount.toFixed(2)),
        total: new Prisma.Decimal(total.toFixed(2)),
        paidAmount: new Prisma.Decimal(paidAmount.toFixed(2)),
        debtAmount: new Prisma.Decimal(debtAmount.toFixed(2)),
        note: String(input.note ?? "").trim().slice(0, 300),
        items: {
          create: items.map((it) => {
            const p = partMap.get(it.partId)!;
            return {
              partId: p.id,
              partName: p.nameAr,
              reference: p.reference,
              quantity: it.quantity,
              purchasePrice: p.purchasePrice,
              unitPrice: new Prisma.Decimal(it.unitPrice.toFixed(2)),
              lineTotal: new Prisma.Decimal((it.quantity * it.unitPrice).toFixed(2)),
            };
          }),
        },
      },
    });

    for (const it of items) {
      const p = partMap.get(it.partId)!;
      const stock = p.stocks[0]!;
      const after = stock.quantity - it.quantity;
      await tx.stock.update({ where: { id: stock.id }, data: { quantity: after } });
      await tx.stockMovement.create({
        data: {
          partId: p.id,
          storeId,
          userId: user.id,
          type: "SALE",
          quantity: -it.quantity,
          after,
          note: number,
        },
      });
    }

    if (debtAmount > 0 && customerId) {
      await tx.customer.update({
        where: { id: customerId },
        data: { balance: { increment: new Prisma.Decimal(debtAmount.toFixed(2)) } },
      });
    }

    return { saleId: sale.id };
  });

  if (res.saleId) {
    revalidatePath("/");
    revalidatePath("/parts");
    revalidatePath("/pos");
    revalidatePath("/sales");
    revalidatePath("/customers");
  }
  return res;
}
