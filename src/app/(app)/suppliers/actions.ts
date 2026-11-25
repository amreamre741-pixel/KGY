"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { can, getActiveStoreId, requireUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";

export type SupplierState = { error?: string; ok?: boolean } | undefined;

const str = (v: FormDataEntryValue | null, max = 200) => String(v ?? "").trim().slice(0, max);

export async function saveSupplier(_prev: SupplierState, formData: FormData): Promise<SupplierState> {
  const user = await requireUser();
  const { t } = await getI18n();
  if (!can.seeCost(user)) return { error: t.common.noAccess };

  const id = str(formData.get("id"), 40);
  const name = str(formData.get("name"), 120);
  const phone = str(formData.get("phone"), 40);
  const address = str(formData.get("address"), 240);
  const notes = str(formData.get("notes"), 500);

  if (!name) return { error: t.suppliers.errName };

  if (id) {
    await db.supplier.update({ where: { id }, data: { name, phone, address, notes } });
    revalidatePath(`/suppliers/${id}`);
  } else {
    await db.supplier.create({ data: { name, phone, address, notes } });
  }
  revalidatePath("/suppliers");
  revalidatePath("/purchases/new");
  return { ok: true };
}

export async function recordSupplierPayment(_prev: SupplierState, formData: FormData): Promise<SupplierState> {
  const user = await requireUser();
  const { t } = await getI18n();
  if (!can.seeCost(user)) return { error: t.common.noAccess };

  const supplierId = str(formData.get("supplierId"), 40);
  const rawAmt = String(formData.get("amount") ?? "").replace(/\s/g, "").replace(",", ".");
  const amount = Number(rawAmt);
  const note = str(formData.get("note"), 300);

  if (!supplierId || !Number.isFinite(amount) || amount <= 0) {
    return { error: t.suppliers.errAmount };
  }

  const storeId = (await getActiveStoreId(user)) ?? user.storeId ?? null;

  await db.$transaction(async (tx) => {
    const sup = await tx.supplier.findUniqueOrThrow({ where: { id: supplierId } });
    const nextBalance = Number(sup.balance) - amount;
    await tx.supplier.update({
      where: { id: supplierId },
      data: { balance: new Prisma.Decimal(nextBalance.toFixed(2)) },
    });
    await tx.supplierPayment.create({
      data: {
        supplierId,
        storeId,
        userId: user.id,
        amount: new Prisma.Decimal(amount.toFixed(2)),
        balanceAfter: new Prisma.Decimal(nextBalance.toFixed(2)),
        note,
      },
    });
  });

  revalidatePath(`/suppliers/${supplierId}`);
  revalidatePath("/suppliers");
  revalidatePath("/zakat");
  return { ok: true };
}
