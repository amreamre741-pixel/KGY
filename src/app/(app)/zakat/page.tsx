import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { perStoreValuations } from "@/lib/parts";
import ZakatClient from "./ZakatClient";

export const metadata: Metadata = { title: "تقييم المخزون والزكاة" };

export default async function ZakatPage() {
  await requireRole("OWNER");

  const [valuations, creditByStoreRows, debtByStoreRows, totalCreditAgg] = await Promise.all([
    perStoreValuations(),
    db.sale.groupBy({
      by: ["storeId"],
      _sum: { debtAmount: true },
    }),
    db.purchase.groupBy({
      by: ["storeId"],
      _sum: { debtAmount: true },
    }),
    db.customer.aggregate({
      where: { active: true, balance: { gt: 0 } },
      _sum: { balance: true },
    }),
  ]);

  const storeCreditMap = new Map(creditByStoreRows.map((r) => [r.storeId, Number(r._sum.debtAmount ?? 0)]));
  const storeDebtMap = new Map(debtByStoreRows.map((r) => [r.storeId, Number(r._sum.debtAmount ?? 0)]));

  return (
    <ZakatClient
      stores={valuations.map((v) => ({
        ...v,
        suggestedReceivables: storeCreditMap.get(v.storeId) ?? 0,
        suggestedDebts: storeDebtMap.get(v.storeId) ?? 0,
      }))}
      totalCustomerCredit={Number(totalCreditAgg._sum.balance ?? 0)}
    />
  );
}
