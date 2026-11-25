"use server";

import bcrypt from "bcryptjs";
import { Prisma, type Role } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";

export type AdminState = { error?: string; ok?: boolean } | undefined;

const str = (v: FormDataEntryValue | null, max = 120) => String(v ?? "").trim().slice(0, max);

export async function saveStore(_prev: AdminState, formData: FormData): Promise<AdminState> {
  await requireRole("OWNER");
  const { t } = await getI18n();
  const id = str(formData.get("id"), 40);
  const data = {
    name: str(formData.get("name")),
    address: str(formData.get("address"), 300),
    phone: str(formData.get("phone"), 40),
    active: formData.get("active") !== null || !id,
  };
  if (!data.name) return { error: t.stores.errName };
  if (id) await db.store.update({ where: { id }, data });
  else await db.store.create({ data });
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function saveUser(_prev: AdminState, formData: FormData): Promise<AdminState> {
  const me = await requireRole("OWNER");
  const { t } = await getI18n();
  const id = str(formData.get("id"), 40);
  const name = str(formData.get("name"));
  const username = str(formData.get("username"), 40).toLowerCase();
  const password = String(formData.get("password") ?? "");
  const roleIn = str(formData.get("role"), 10);
  const role: Role = roleIn === "OWNER" || roleIn === "MANAGER" ? roleIn : "SELLER";
  const storeId = str(formData.get("storeId"), 40) || null;
  const active = formData.get("active") !== null || !id;

  if (!name || !username) return { error: t.users.errRequired };
  if (!/^[a-z0-9._-]{3,40}$/.test(username)) return { error: t.users.errRequired };
  if ((!id || password) && password.length < 6) return { error: t.users.errPassword };
  if (role !== "OWNER" && !storeId) return { error: t.users.errStore };
  if (id === me.id && (role !== "OWNER" || !active)) return { error: t.users.errSelf };

  const data = {
    name,
    username,
    role,
    storeId,
    active,
    ...(password ? { passwordHash: await bcrypt.hash(password, 10) } : {}),
  };

  try {
    if (id) await db.user.update({ where: { id }, data });
    else await db.user.create({ data: { ...data, passwordHash: data.passwordHash! } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { error: t.users.errUsername };
    throw e;
  }
  revalidatePath("/users");
  return { ok: true };
}
