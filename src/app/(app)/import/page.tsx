import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { can, getActiveStoreId, requireUser } from "@/lib/auth";
import { editableStores } from "@/lib/parts";
import Importer from "./Importer";

export const metadata: Metadata = { title: "الاستيراد" };

export default async function ImportPage() {
  const user = await requireUser();
  if (!can.importData(user)) redirect("/");
  const [stores, active] = await Promise.all([editableStores(user), getActiveStoreId(user)]);
  return <Importer stores={stores} defaultStoreId={active ?? stores[0]?.id ?? ""} />;
}
