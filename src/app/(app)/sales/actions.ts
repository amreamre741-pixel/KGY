"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { can, requireUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";

export async function returnSaleItems(
  saleId: string,
  returns: { itemId: string; qty: number }[],
  refundMode: "debt" | "cash",
): Promise<{ error?: string; ok?: boolean }> {
  const user = await requireUser();
  const { t } = await getI18n();

  const valid = returns.map((r) => ({ itemId: r.itemId, qty: Math.floor(Number(r.qty) || 0) })).filter((r) => r.qty > 0);
  if (valid.length === 0) return { ok: true };

  const res = await db.$transaction(async (tx) => {
    const sale = await tx.sale.findUnique({
      where: { id: saleId },
      include: { items: true },
    });
    if (!sale) return { error: t.common.error };
    if (!can.seeAllStores(user) && user.storeId !== sale.storeId) return { error: t.common.noAccess };

    let totalRefund = 0;

    for (const r of valid) {
      const item = sale.items.find((x) => x.id === r.itemId);
      if (!item) continue;
      const maxRet = item.quantity - item.returnedQty;
      const qty = Math.min(maxRet, r.qty);
      if (qty <= 0) continue;

      await tx.saleItem.update({
        where: { id: item.id },
        data: { returnedQty: { increment: qty } },
      });

      totalRefund += qty * Number(item.unitPrice);

      if (item.partId) {
        const stock = await tx.stock.upsert({
          where: { partId_storeId: { partId: item.partId, storeId: sale.storeId } },
          update: { quantity: { increment: qty } },
          create: { partId: item.partId, storeId: sale.storeId, quantity: qty },
        });
        await tx.stockMovement.create({
          data: {
            partId: item.partId,
            storeId: sale.storeId,
            userId: user.id,
            type: "RETURN",
            quantity: qty,
            after: stock.quantity,
            note: sale.number,
          },
        });
      }
    }

    if (totalRefund > 0) {
      const dec = new Prisma.Decimal(totalRefund.toFixed(2));
      await tx.sale.update({
        where: { id: sale.id },
        data: {
          refundedAmount: { increment: dec },
          ...(refundMode === "debt" && sale.customerId
            ? { debtAmount: { decrement: new Prisma.Decimal(Math.min(Number(sale.debtAmount), totalRefund).toFixed(2)) } }
            : {}),
        },
      });

      if (refundMode === "debt" && sale.customerId) {
        await tx.customer.update({
          where: { id: sale.customerId },
          data: { balance: { decrement: dec } },
        });
      }
    }

    return { ok: true };
  });

  if (res.ok) {
    revalidatePath(`/sales/${saleId}`);
    revalidatePath("/sales");
    revalidatePath("/parts");
    revalidatePath("/pos");
    revalidatePath("/customers");
    revalidatePath("/");
  }
  return res;
}
