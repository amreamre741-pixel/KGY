import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { can, requireUser } from "@/lib/auth";
import { editableStores, partFormOptions } from "@/lib/parts";
import PartForm from "../../PartForm";

export const metadata: Metadata = { title: "تعديل القطعة" };

export default async function EditPartPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!can.editParts(user)) redirect("/parts");
  const { id } = await params;

  const [part, opts, stores] = await Promise.all([
    db.part.findUnique({
      where: { id },
      include: { category: true, compat: { orderBy: { make: "asc" } }, stocks: true },
    }),
    partFormOptions(),
    editableStores(user),
  ]);
  if (!part) notFound();

  return (
    <PartForm
      initial={{
        id: part.id,
        reference: part.reference,
        barcode: part.barcode ?? "",
        nameAr: part.nameAr,
        nameEn: part.nameEn,
        brand: part.brand,
        category: part.category?.nameAr ?? "",
        purchasePrice: Number(part.purchasePrice) ? String(Number(part.purchasePrice)) : "",
        salePrice: Number(part.salePrice) ? String(Number(part.salePrice)) : "",
        imageUrl: part.imageUrl,
        notes: part.notes,
        compat: part.compat.map((c) => ({
          type: c.type,
          make: c.make,
          model: c.model,
          yearFrom: c.yearFrom ? String(c.yearFrom) : "",
          yearTo: c.yearTo ? String(c.yearTo) : "",
        })),
        stocks: stores.map((s) => {
          const st = part.stocks.find((x) => x.storeId === s.id);
          return {
            storeId: s.id,
            storeName: s.name,
            quantity: String(st?.quantity ?? 0),
            minQuantity: st?.minQuantity ? String(st.minQuantity) : "",
            location: st?.location ?? "",
          };
        }),
      }}
      {...opts}
    />
  );
}
