import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { can, requireUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { formatDateTime } from "@/lib/format";
import PrintStatementButton from "@/app/(app)/customers/[id]/PrintStatementButton";
import { IconArrowBack } from "@/components/icons";

export const metadata: Metadata = { title: "بون تحويل سلعة" };

export default async function TransferDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!can.editParts(user)) redirect("/");
  const { t, lang } = await getI18n();
  const { id } = await params;

  const transfer = await db.stockTransfer.findUnique({
    where: { id },
    include: {
      fromStore: true,
      toStore: true,
      user: { select: { name: true } },
      items: true,
    },
  });
  if (!transfer) notFound();

  return (
    <>
      <div className="page-head no-print">
        <div>
          <Link href="/transfers" className="crumb">
            <IconArrowBack className="flip" />
            {t.transfers.title}
          </Link>
          <h1 className="mono">{transfer.number}</h1>
        </div>
        <div className="page-head-actions">
          <PrintStatementButton />
        </div>
      </div>

      <section className="card card-pad stack" style={{ gap: 18, maxWidth: 860 }}>
        <div className="row spread" style={{ borderBottom: "2px solid var(--navy-800)", paddingBottom: 14 }}>
          <div>
            <h2>{t.transfers.slipTitle}</h2>
            <p className="muted small">
              {t.transfers.fromStore}: <strong>{transfer.fromStore.name}</strong> → {t.transfers.toStore}:{" "}
              <strong>{transfer.toStore.name}</strong>
            </p>
          </div>
          <div style={{ textAlign: "end" }}>
            <div className="mono">{transfer.number}</div>
            <div className="muted small">{formatDateTime(transfer.createdAt, lang)}</div>
          </div>
        </div>

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                <th>{t.parts.name}</th>
                <th>{t.parts.reference}</th>
                <th>{t.transfers.toLocation}</th>
                <th className="end">{t.parts.quantity}</th>
              </tr>
            </thead>
            <tbody>
              {transfer.items.map((it, idx) => (
                <tr key={it.id}>
                  <td className="num">{idx + 1}</td>
                  <td>
                    <strong>{it.partName}</strong>
                  </td>
                  <td className="ref">{it.reference}</td>
                  <td className="mono">{it.toLocation || "—"}</td>
                  <td className="end num">
                    <strong>{it.quantity}</strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {transfer.note && <p className="muted small">{transfer.note}</p>}

        <div className="row spread small muted" style={{ borderTop: "1px dashed var(--line-strong)", paddingTop: 20 }}>
          <span>إمضاء المرسل ({transfer.fromStore.name}): …………………</span>
          <span>إمضاء المستلم ({transfer.toStore.name}): …………………</span>
        </div>
      </section>
    </>
  );
}
