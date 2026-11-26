import type { Metadata } from "next";
import { db } from "@/lib/db";
import { can, getActiveStoreId, requireUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { partName } from "@/lib/format";
import AuditClient from "./AuditClient";

export const metadata: Metadata = { title: "جرد المخزون (Audit)" };

export default async function AuditPage() {
  const user = await requireUser();
  const { lang } = await getI18n();
  const activeStoreId = await getActiveStoreId(user);

  const stores = await db.store.findMany({
    where: { active: true, ...(can.seeAllStores(user) ? {} : { id: user.storeId ?? "__none__" }) },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  });

  const defaultStoreId = activeStoreId ?? stores[0]?.id ?? "";

  const parts = await db.part.findMany({
    orderBy: { updatedAt: "desc" },
    take: 1000,
    include: {
      stocks: {
        where: { store: { active: true } },
        select: { storeId: true, quantity: true, location: true },
      },
    },
  });

  return (
    <AuditClient
      stores={stores}
      defaultStoreId={defaultStoreId}
      canApprove={user.role !== "SELLER"}
      parts={parts.map((p) => ({
        id: p.id,
        name: partName(p, lang),
        reference: p.reference,
        refNorm: p.refNorm,
        barcode: p.barcode ?? "",
        brand: p.brand,
        stocks: Object.fromEntries(p.stocks.map((s) => [s.storeId, { qty: s.quantity, loc: s.location }])),
      }))}
    />
  );
}
