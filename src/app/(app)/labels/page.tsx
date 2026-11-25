import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { partName } from "@/lib/format";
import LabelsSheet from "./LabelsSheet";

export const metadata: Metadata = { title: "طباعة الليبالات" };

export default async function LabelsPage({ searchParams }: { searchParams: Promise<{ ids?: string }> }) {
  await requireUser();
  const { lang } = await getI18n();
  const ids = ((await searchParams).ids ?? "").split(",").filter(Boolean).slice(0, 300);

  const parts = ids.length
    ? await db.part.findMany({
        where: { id: { in: ids } },
        select: { id: true, nameAr: true, nameEn: true, reference: true, brand: true, barcode: true, salePrice: true },
      })
    : [];

  return (
    <LabelsSheet
      parts={parts.map((p) => ({
        id: p.id,
        name: partName(p, lang),
        reference: p.reference,
        brand: p.brand,
        barcode: p.barcode ?? p.reference,
        salePrice: Number(p.salePrice),
      }))}
    />
  );
}
