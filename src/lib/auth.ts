import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { db } from "./db";
import { SESSION_COOKIE, verifySession } from "./session";

export type CurrentUser = {
  id: string;
  name: string;
  username: string;
  role: Role;
  storeId: string | null;
  storeName: string | null;
};

/** Reads the session cookie and loads the (active) user. Cached per request. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const session = await verifySession(token);
  if (!session) return null;
  const user = await db.user.findUnique({
    where: { id: session.userId },
    include: { store: { select: { name: true } } },
  });
  if (!user || !user.active) return null;
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    role: user.role,
    storeId: user.storeId,
    storeName: user.store?.name ?? null,
  };
});

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireRole(...roles: Role[]): Promise<CurrentUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) redirect("/");
  return user;
}

// ---- Permissions -------------------------------------------------------

export const can = {
  seeCost: (u: CurrentUser) => u.role !== "SELLER",
  editParts: (u: CurrentUser) => u.role !== "SELLER",
  importData: (u: CurrentUser) => u.role !== "SELLER",
  manageStores: (u: CurrentUser) => u.role === "OWNER",
  manageUsers: (u: CurrentUser) => u.role === "OWNER",
  seeAllStores: (u: CurrentUser) => u.role === "OWNER",
  adjustStock: (u: CurrentUser, storeId: string) =>
    u.role === "OWNER" || (u.role === "MANAGER" && u.storeId === storeId),
};

export const STORE_COOKIE = "kgy_store";

/**
 * The store the user is currently looking at.
 * Owners can switch (or pick "all" = null); others are locked to their own store.
 */
export async function getActiveStoreId(user: CurrentUser): Promise<string | null> {
  if (!can.seeAllStores(user)) return user.storeId;
  const value = (await cookies()).get(STORE_COOKIE)?.value;
  if (!value || value === "all") return null;
  const exists = await db.store.findFirst({ where: { id: value, active: true }, select: { id: true } });
  return exists ? value : null;
}
