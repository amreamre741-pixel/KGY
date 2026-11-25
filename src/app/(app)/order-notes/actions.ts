"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getActiveStoreId, requireUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";

const str = (v: unknown, max = 200) => String(v ?? "").trim().slice(0, max);

export async function addOrderNote(input: {
  partName: string;
  reference?: string;
  vehicle?: string;
  quantity?: number;
  customerInfo?: string;
  note?: string;
}): Promise<{ error?: string; ok?: boolean }> {
  const user = await requireUser();
  const { t } = await getI18n();
  const partName = str(input.partName, 180);
  if (!partName) return { error: t.orderNotes.errPartName };

  const activeStoreId = await getActiveStoreId(user);
  const storeId = user.storeId ?? activeStoreId ?? null;
  const quantity = Math.max(1, Math.min(9999, Math.floor(Number(input.quantity) || 1)));

  await db.orderNote.create({
    data: {
      storeId,
      userId: user.id,
      partName,
      reference: str(input.reference, 120),
      vehicle: str(input.vehicle, 120),
      quantity,
      customerInfo: str(input.customerInfo, 160),
      note: str(input.note, 500),
    },
  });

  revalidatePath("/order-notes");
  revalidatePath("/");
  return { ok: true };
}

export async function toggleOrderNoteStatus(id: string): Promise<{ ok?: boolean }> {
  await requireUser();
  const existing = await db.orderNote.findUnique({ where: { id }, select: { status: true } });
  if (!existing) return {};
  await db.orderNote.update({
    where: { id },
    data: { status: existing.status === "PENDING" ? "DONE" : "PENDING" },
  });
  revalidatePath("/order-notes");
  revalidatePath("/");
  return { ok: true };
}

export async function deleteOrderNote(id: string): Promise<{ ok?: boolean }> {
  const user = await requireUser();
  const existing = await db.orderNote.findUnique({ where: { id }, select: { userId: true } });
  if (!existing) return {};
  if (user.role === "SELLER" && existing.userId !== user.id) return {};
  await db.orderNote.delete({ where: { id } });
  revalidatePath("/order-notes");
  revalidatePath("/");
  return { ok: true };
}
