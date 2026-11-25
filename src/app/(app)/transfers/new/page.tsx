import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { can, requireUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { partName } from "@/lib/format";
import TransferFormClient from "./TransferFormClient";

export const metadata: Metadata = { title: "تحويل جديد" };

export default async function NewTransferPage() {
  const user = await requireUser();
  if (!can.editParts(user)) redirect("/");
  const { lang } = await getI18n();

  const [allStores, parts] = await Promise.all([
    db.store.findMany({ where: { active: true }, orderBy: { createdAt: "asc" }, select: { id: true, name: true } }),
    db.part.findMany({
      orderBy: { updatedAt: "desc" },
      take: 800,
      include: {
        stocks: {
          where: { store: { active: true } },
          select: { storeId: true, quantity: true, location: true },
        },
      },
    }),
  ]);

  const fromStores = can.seeAllStores(user) ? allStores : allStores.filter((s) => s.id === user.storeId);

  return (
    <TransferFormClient
      fromStores={fromStores}
      allStores={allStores}
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
