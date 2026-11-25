"use server";

import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { SESSION_COOKIE, sessionCookieOptions, signSession } from "@/lib/session";
import { getCurrentUser, STORE_COOKIE } from "@/lib/auth";
import { LANG_COOKIE, dictionaries } from "@/lib/i18n/dict";
import { getLang } from "@/lib/i18n/server";

export type LoginState = { error?: string } | undefined;

// Compared against when the username doesn't exist, so timing doesn't reveal valid usernames.
const DUMMY_HASH = bcrypt.hashSync("kgy-dummy-password", 10);

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const username = String(formData.get("username") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const t = dictionaries[await getLang()];

  const user = username ? await db.user.findUnique({ where: { username } }) : null;
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok || !user.active) return { error: t.login.invalid };

  const token = await signSession({ userId: user.id });
  (await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions);
  redirect("/");
}

export async function logout() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  jar.delete(STORE_COOKIE);
  redirect("/login");
}

export async function toggleLang() {
  const jar = await cookies();
  const next = (await getLang()) === "ar" ? "en" : "ar";
  jar.set(LANG_COOKIE, next, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  revalidatePath("/", "layout");
}

export async function setActiveStore(storeId: string) {
  const user = await getCurrentUser();
  if (!user || user.role !== "OWNER") return;
  (await cookies()).set(STORE_COOKIE, storeId || "all", {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    httpOnly: true,
  });
  revalidatePath("/", "layout");
}
