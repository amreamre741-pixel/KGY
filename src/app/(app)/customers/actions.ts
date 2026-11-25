"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getActiveStoreId, requireUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";

export type CustomerState = { error?: string; ok?: boolean } | undefined;

const str = (v: FormDataEntryValue | null, max = 200) => String(v ?? "").trim().slice(0, max);

export async function saveCustomer(_prev: CustomerState, formData: FormData): Promise<CustomerState> {
  await requireUser();
  const { t } = await getI18n();
  const id = str(formData.get("id"), 40);
  const name = str(formData.get("name"), 120);
  const phone = str(formData.get("phone"), 40);
  const address = str(formData.get("address"), 240);
  const notes = str(formData.get("notes"), 500);

  if (!name) return { error: t.customers.errName };

  if (id) {
    await db.customer.update({ where: { id }, data: { name, phone, address, notes } });
    revalidatePath(`/customers/${id}`);
  } else {
    await db.customer.create({ data: { name, phone, address, notes } });
  }
  revalidatePath("/customers");
  revalidatePath("/pos");
  return { ok: true };
}

export async function recordCustomerPayment(_prev: CustomerState, formData: FormData): Promise<CustomerState> {
  const user = await requireUser();
  const { t } = await getI18n();
  const customerId = str(formData.get("customerId"), 40);
  const rawAmt = String(formData.get("amount") ?? "").replace(/\s/g, "").replace(",", ".");
  const amount = Number(rawAmt);
  const note = str(formData.get("note"), 300);

  if (!customerId || !Number.isFinite(amount) || amount <= 0) {
    return { error: t.customers.errAmount };
  }

  const storeId = (await getActiveStoreId(user)) ?? user.storeId ?? null;

  await db.$transaction(async (tx) => {
    const cust = await tx.customer.findUniqueOrThrow({ where: { id: customerId } });
    const nextBalance = Number(cust.balance) - amount;
    await tx.customer.update({
      where: { id: customerId },
      data: { balance: new Prisma.Decimal(nextBalance.toFixed(2)) },
    });
    await tx.customerPayment.create({
      data: {
        customerId,
        storeId,
        userId: user.id,
        amount: new Prisma.Decimal(amount.toFixed(2)),
        balanceAfter: new Prisma.Decimal(nextBalance.toFixed(2)),
        note,
      },
    });
  });

  revalidatePath(`/customers/${customerId}`);
  revalidatePath("/customers");
  revalidatePath("/pos");
  return { ok: true };
}
