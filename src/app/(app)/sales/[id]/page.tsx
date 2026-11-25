import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { can, requireUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { formatDateTime } from "@/lib/format";
import InvoiceClient from "./InvoiceClient";

export const metadata: Metadata = { title: "فاتورة بيع" };

export default async function SaleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { lang } = await getI18n();
  const { id } = await params;

  const sale = await db.sale.findUnique({
    where: { id },
    include: {
      store: true,
      customer: true,
      user: { select: { name: true } },
      items: true,
    },
  });

  if (!sale) notFound();
  if (!can.seeAllStores(user) && user.storeId !== sale.storeId) notFound();

  return (
    <InvoiceClient
      sale={{
        id: sale.id,
        number: sale.number,
        dateStr: formatDateTime(sale.createdAt, lang),
        storeName: sale.store.name,
        storeAddress: sale.store.address,
        storePhone: sale.store.phone,
        sellerName: sale.user?.name ?? "",
        customerId: sale.customerId,
        customerName: sale.customer?.name ?? "",
        customerPhone: sale.customer?.phone ?? "",
        subtotal: Number(sale.subtotal),
        discount: Number(sale.discount),
        total: Number(sale.total),
        paidAmount: Number(sale.paidAmount),
        debtAmount: Number(sale.debtAmount),
        refundedAmount: Number(sale.refundedAmount),
        note: sale.note,
        items: sale.items.map((it) => ({
          id: it.id,
          partName: it.partName,
          reference: it.reference,
          quantity: it.quantity,
          returnedQty: it.returnedQty,
          unitPrice: Number(it.unitPrice),
          lineTotal: Number(it.lineTotal),
        })),
      }}
    />
  );
}
