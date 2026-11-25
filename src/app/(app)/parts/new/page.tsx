import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { can, getActiveStoreId, requireUser } from "@/lib/auth";
import { editableStores, partFormOptions } from "@/lib/parts";
import PartForm from "../PartForm";

export const metadata: Metadata = { title: "قطعة جديدة" };

export default async function NewPartPage() {
  const user = await requireUser();
  if (!can.editParts(user)) redirect("/parts");
  const [opts, stores, activeStoreId] = await Promise.all([
    partFormOptions(),
    editableStores(user),
    getActiveStoreId(user),
  ]);

  const orderedStores = activeStoreId
    ? [...stores.filter((s) => s.id === activeStoreId), ...stores.filter((s) => s.id !== activeStoreId)]
    : stores;

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
        stocks: orderedStores.map((s) => ({ storeId: s.id, storeName: s.name, quantity: "", minQuantity: "", location: "" })),
      }}
      {...opts}
    />
  );
}
