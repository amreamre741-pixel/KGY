import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { can, requireUser } from "@/lib/auth";
import { editableStores, partFormOptions } from "@/lib/parts";
import PartForm from "../PartForm";

export const metadata: Metadata = { title: "قطعة جديدة" };

export default async function NewPartPage() {
  const user = await requireUser();
  if (!can.editParts(user)) redirect("/parts");
  const [opts, stores] = await Promise.all([partFormOptions(), editableStores(user)]);

  return (
    <PartForm
      initial={{
        reference: "",
        barcode: "",
        nameAr: "",
        nameEn: "",
        brand: "",
        category: "",
        dimensions: "",
        purchasePrice: "",
        salePrice: "",
        imageUrl: "",
        notes: "",
        compat: [],
        stocks: stores.map((s) => ({ storeId: s.id, storeName: s.name, quantity: "", minQuantity: "", location: "" })),
      }}
      {...opts}
    />
  );
}
