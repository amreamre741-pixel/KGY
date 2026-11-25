import type { Metadata } from "next";
import { db } from "@/lib/db";
import { can, getActiveStoreId, requireUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { partName } from "@/lib/format";
import POSClient from "./POSClient";

export const metadata: Metadata = { title: "البيع (Caisse)" };

export default async function POSPage() {
  const user = await requireUser();
  const { lang } = await getI18n();
  const activeStoreId = await getActiveStoreId(user);

  const stores = await db.store.findMany({
    where: { active: true, ...(can.seeAllStores(user) ? {} : { id: user.storeId ?? "__none__" }) },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  });

  const defaultStoreId = activeStoreId ?? stores[0]?.id ?? "";

  const [parts, customers] = await Promise.all([
    db.part.findMany({
      orderBy: { updatedAt: "desc" },
      take: 800,
      include: {
        compat: { take: 3 },
        stocks: {
          where: { store: { active: true } },
          select: { storeId: true, quantity: true, location: true },
        },
      },
    }),
    db.customer.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, phone: true, balance: true },
    }),
  ]);

  return (
    <POSClient
      stores={stores}
      defaultStoreId={defaultStoreId}
      parts={parts.map((p) => ({
        id: p.id,
        name: partName(p, lang),
        reference: p.reference,
        refNorm: p.refNorm,
        barcode: p.barcode ?? "",
        brand: p.brand,
        dimensions: p.dimensions,
        dimNorm: p.dimNorm,
        imageUrl: p.imageUrl,
        salePrice: Number(p.salePrice),
        vehicles: p.compat.map((c) => `${c.make} ${c.model}`).join(" "),
        stocks: Object.fromEntries(p.stocks.map((s) => [s.storeId, { qty: s.quantity, loc: s.location }])),
      }))}
      customers={customers.map((c) => ({
        id: c.id,
        name: c.name,
        phone: c.phone,
        balance: Number(c.balance),
      }))}
    />
  );
}
