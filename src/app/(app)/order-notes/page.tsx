import type { Metadata } from "next";
import { db } from "@/lib/db";
import { getActiveStoreId, requireUser } from "@/lib/auth";
import OrderNotesClient from "./OrderNotesClient";

export const metadata: Metadata = { title: "ملاحظات الطلبات" };

type Props = {
  searchParams: Promise<{ part?: string; ref?: string }>;
};

export default async function OrderNotesPage({ searchParams }: Props) {
  const user = await requireUser();
  const sp = await searchParams;
  const activeStoreId = await getActiveStoreId(user);

  const notes = await db.orderNote.findMany({
    where: activeStoreId ? { storeId: activeStoreId } : {},
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 250,
    include: {
      store: { select: { name: true } },
      user: { select: { name: true } },
    },
  });

  return (
    <OrderNotesClient
      key={`${sp.part ?? ""}:${sp.ref ?? ""}`}
      prefillPart={sp.part ?? ""}
      prefillRef={sp.ref ?? ""}
      notes={notes.map((n) => ({
        id: n.id,
        partName: n.partName,
        reference: n.reference,
        vehicle: n.vehicle,
        quantity: n.quantity,
        customerInfo: n.customerInfo,
        note: n.note,
        status: n.status,
        storeName: n.store?.name ?? "",
        userName: n.user?.name ?? "",
        canDelete: user.role !== "SELLER" || n.userId === user.id,
        createdAt: n.createdAt.toISOString(),
      }))}
    />
  );
}
