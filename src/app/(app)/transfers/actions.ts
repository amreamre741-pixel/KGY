"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { can, requireUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { partName } from "@/lib/format";

export type TransferInput = {
  fromStoreId: string;
  toStoreId: string;
  note?: string;
  items: { partId: string; quantity: number; toLocation?: string }[];
};

export async function createTransfer(input: TransferInput): Promise<{ error?: string; transferId?: string }> {
  const user = await requireUser();
  const { t, lang } = await getI18n();

  if (!can.editParts(user)) return { error: t.common.noAccess };
  const fromStoreId = String(input.fromStoreId ?? "").trim();
  const toStoreId = String(input.toStoreId ?? "").trim();

  if (!fromStoreId || !toStoreId || fromStoreId === toStoreId) {
    return { error: t.transfers.errSameStore };
  }
  if (!can.adjustStock(user, fromStoreId)) {
    return { error: t.common.noAccess };
  }

  const rawItems = Array.isArray(input.items) ? input.items : [];
  const items = rawItems
    .map((it) => ({
      partId: String(it.partId ?? "").trim(),
      quantity: Math.floor(Number(it.quantity) || 0),
      toLocation: String(it.toLocation ?? "").trim().slice(0, 40),
    }))
    .filter((it) => it.partId && it.quantity > 0);

  if (items.length === 0) return { error: t.transfers.errItems };

  const res = await db.$transaction(async (tx) => {
    const [sFrom, sTo] = await Promise.all([
      tx.store.findFirst({ where: { id: fromStoreId, active: true }, select: { id: true } }),
      tx.store.findFirst({ where: { id: toStoreId, active: true }, select: { id: true } }),
    ]);
    if (!sFrom || !sTo) return { error: t.common.error };

    const parts = await tx.part.findMany({
      where: { id: { in: items.map((i) => i.partId) } },
      include: { stocks: { where: { storeId: { in: [fromStoreId, toStoreId] } } } },
    });
    const partMap = new Map(parts.map((p) => [p.id, p]));

    for (const it of items) {
      const p = partMap.get(it.partId);
      const fromStock = p?.stocks.find((s) => s.storeId === fromStoreId);
      const avail = fromStock?.quantity ?? 0;
      if (!p || avail < it.quantity) {
        return { error: `${t.transfers.errStock}: ${p ? partName(p, lang) : ""} (${avail})` };
      }
    }

    const year = new Date().getFullYear();
    const count = await tx.stockTransfer.count();
    const number = `TR-${year}-${String(count + 1).padStart(4, "0")}`;

    const transfer = await tx.stockTransfer.create({
      data: {
        number,
        fromStoreId,
        toStoreId,
        userId: user.id,
        note: String(input.note ?? "").trim().slice(0, 300),
        items: {
          create: items.map((it) => {
            const p = partMap.get(it.partId)!;
            return {
              partId: p.id,
              partName: p.nameAr,
              reference: p.reference,
              quantity: it.quantity,
              toLocation: it.toLocation,
            };
          }),
        },
      },
    });

    for (const it of items) {
      const p = partMap.get(it.partId)!;
      const fromStock = p.stocks.find((s) => s.storeId === fromStoreId)!;
      const afterFrom = fromStock.quantity - it.quantity;

      await tx.stock.update({ where: { id: fromStock.id }, data: { quantity: afterFrom } });
      await tx.stockMovement.create({
        data: {
          partId: p.id,
          storeId: fromStoreId,
          userId: user.id,
          type: "TRANSFER_OUT",
          quantity: -it.quantity,
          after: afterFrom,
          note: number,
        },
      });

      const toStock = await tx.stock.upsert({
        where: { partId_storeId: { partId: p.id, storeId: toStoreId } },
        update: {
          quantity: { increment: it.quantity },
          ...(it.toLocation ? { location: it.toLocation } : {}),
        },
        create: {
          partId: p.id,
          storeId: toStoreId,
          quantity: it.quantity,
          location: it.toLocation,
        },
      });

      await tx.stockMovement.create({
        data: {
          partId: p.id,
          storeId: toStoreId,
          userId: user.id,
          type: "TRANSFER_IN",
          quantity: it.quantity,
          after: toStock.quantity,
          note: number,
        },
      });
    }

    return { transferId: transfer.id };
  });

  if (res.transferId) {
    revalidatePath("/");
    revalidatePath("/parts");
    revalidatePath("/pos");
    revalidatePath("/transfers");
    revalidatePath("/zakat");
  }
  return res;
}
