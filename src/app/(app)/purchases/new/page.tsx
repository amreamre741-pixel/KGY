import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { can, getActiveStoreId, requireUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { partName } from "@/lib/format";
import { editableStores } from "@/lib/parts";
import PurchaseFormClient from "./PurchaseFormClient";

export const metadata: Metadata = { title: "فاتورة شراء جديدة" };

export default async function NewPurchasePage() {
  const user = await requireUser();
  if (!can.seeCost(user)) redirect("/");
  const { lang } = await getI18n();

  const [stores, activeStoreId, suppliers] = await Promise.all([
    editableStores(user),
    getActiveStoreId(user),
    db.supplier.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, balance: true },
    }),
  ]);
  const targetStoreId = activeStoreId ?? stores[0]?.id ?? "";
  const parts = await db.part.findMany({
    where: targetStoreId ? { stocks: { some: { storeId: targetStoreId } } } : {},
    orderBy: { updatedAt: "desc" },
    take: 800,
    select: {
      id: true,
      nameAr: true,
      nameEn: true,
      reference: true,
      refNorm: true,
      barcode: true,
      brand: true,
      purchasePrice: true,
      salePrice: true,
    },
  });

  return (
    <PurchaseFormClient
      stores={stores}
      defaultStoreId={activeStoreId ?? stores[0]?.id ?? ""}
      suppliers={suppliers.map((s) => ({ id: s.id, name: s.name, balance: Number(s.balance) }))}
      parts={parts.map((p) => ({
        id: p.id,
        name: partName(p, lang),
        reference: p.reference,
        refNorm: p.refNorm,
        barcode: p.barcode ?? "",
        brand: p.brand,
        purchasePrice: Number(p.purchasePrice),
        salePrice: Number(p.salePrice),
      }))}
    />
  );
}
