import type { Metadata } from "next";
import { db } from "@/lib/db";
import { can, getActiveStoreId, requireRole } from "@/lib/auth";
import { loadReportData } from "@/lib/reports";
import ReportsClient from "./ReportsClient";

export const metadata: Metadata = { title: "التقارير والفايدة الصافية" };

type Props = {
  searchParams: Promise<{
    period?: string;
    from?: string;
    to?: string;
    store?: string;
    sleep?: string;
  }>;
};

export default async function ReportsPage({ searchParams }: Props) {
  const user = await requireRole("OWNER", "MANAGER");
  const sp = await searchParams;
  const canSeeAll = can.seeAllStores(user);

  const stores = canSeeAll
    ? await db.store.findMany({
        where: { active: true },
        orderBy: { createdAt: "asc" },
        select: { id: true, name: true },
      })
    : [];

  let storeId: string | null = await getActiveStoreId(user);
  if (canSeeAll && sp.store !== undefined) {
    if (!sp.store || sp.store === "all") {
      storeId = null;
    } else if (stores.some((s) => s.id === sp.store)) {
      storeId = sp.store;
    }
  }

  const data = await loadReportData({
    period: sp.period,
    from: sp.from,
    to: sp.to,
    storeId,
    sleepDays: sp.sleep ? Number(sp.sleep) : 30,
  });

  return <ReportsClient key={`${data.fromInput}:${data.toInput}`} data={data} stores={stores} canSeeAllStores={canSeeAll} />;
}
