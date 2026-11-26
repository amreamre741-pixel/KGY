"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { can, requireUser } from "@/lib/auth";

export type AuditItemInput = {
  partId: string;
  countedQty: number;
};

export async function applyAuditAdjustments(storeId: string, items: AuditItemInput[], note: string) {
  const user = await requireUser();
  if (user.role === "SELLER") {
    return { error: "غير مسموح للبائع باعتماد الجرد" };
  }
  if (!storeId) {
    return { error: "يرجى اختيار المحل أولاً" };
  }
  if (!can.seeAllStores(user) && user.storeId !== storeId) {
    return { error: "غير مسموح بالتعديل على هذا المحل" };
  }
  if (!items || items.length === 0) {
    return { error: "لا توجد قطع في قائمة الجرد" };
  }

  const reason = note.trim() || "جرد المخزون السريع بالكاميرا";
  let adjustedCount = 0;

  await db.$transaction(async (tx) => {
    for (const item of items) {
      const counted = Math.max(0, Math.floor(Number(item.countedQty) || 0));
      const existing = await tx.stock.findUnique({
        where: { partId_storeId: { partId: item.partId, storeId } },
      });
      const currentQty = existing?.quantity ?? 0;
      const diff = counted - currentQty;
      if (diff === 0) continue;

      if (existing) {
        await tx.stock.update({
          where: { id: existing.id },
          data: { quantity: counted },
        });
      } else {
        await tx.stock.create({
          data: {
            partId: item.partId,
            storeId,
            quantity: counted,
          },
        });
      }

      await tx.stockMovement.create({
        data: {
          partId: item.partId,
          storeId,
          userId: user.id,
          type: "ADJUST",
          quantity: diff,
          reason,
        },
      });
      adjustedCount++;
    }
  });

  revalidatePath("/audit");
  revalidatePath("/parts");
  revalidatePath("/alerts");
  revalidatePath("/");

  return { ok: true, adjustedCount };
}
