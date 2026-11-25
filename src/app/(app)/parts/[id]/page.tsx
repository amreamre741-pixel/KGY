import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { can, requireUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { stockStatus } from "@/lib/parts";
import { formatDA, formatDateTime, partName, yearRange } from "@/lib/format";
import Barcode from "@/components/Barcode";
import { IconArrowBack, IconCar, IconEdit, IconHistory, IconPin, IconPrinter, IconTruck } from "@/components/icons";
import { AdjustButton, DeletePartButton, PartPhotoCard } from "./PartActions";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const part = await db.part.findUnique({ where: { id }, select: { nameAr: true, reference: true } });
  return { title: part ? `${part.nameAr} · ${part.reference}` : "—" };
}

export default async function PartPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { t, lang } = await getI18n();
  const { id } = await params;

  const part = await db.part.findUnique({
    where: { id },
    include: {
      category: true,
      compat: { orderBy: [{ make: "asc" }, { model: "asc" }] },
      stocks: { where: { store: { active: true } }, include: { store: { select: { name: true } } } },
    },
  });
  if (!part) notFound();

  const stores = await db.store.findMany({
    where: { active: true, ...(can.seeAllStores(user) ? {} : { id: user.storeId ?? "__none__" }) },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  });

  const movements = await db.stockMovement.findMany({
    where: { partId: id, ...(can.seeAllStores(user) ? {} : { storeId: user.storeId ?? "__none__" }) },
    orderBy: { createdAt: "desc" },
    take: 30,
    include: { store: { select: { name: true } }, user: { select: { name: true } } },
  });

  // Owners see all stores; others see their own store (and read-only totals elsewhere are hidden).
  const rows = stores.map((s) => {
    const st = part.stocks.find((x) => x.storeId === s.id);
    return {
      storeId: s.id,
      storeName: s.name,
      quantity: st?.quantity ?? 0,
      minQuantity: st?.minQuantity ?? 0,
      location: st?.location ?? "",
    };
  });
  const total = rows.reduce((a, r) => a + r.quantity, 0);
  const showCost = can.seeCost(user);
  const buy = Number(part.purchasePrice);
  const sell = Number(part.salePrice);

  return (
    <>
      <div className="page-head">
        <div>
          <Link href="/parts" className="crumb">
            <IconArrowBack className="flip" />
            {t.parts.title}
          </Link>
          <h1>{partName(part, lang)}</h1>
          <div className="part-sub" style={{ marginTop: 6, fontSize: "0.9rem" }}>
            <span className="ref" style={{ color: "var(--navy-800)" }}>
              {part.reference}
            </span>
            {part.brand && <span className="badge">{part.brand}</span>}
            {part.category && (
              <span className="badge badge-orange">
                {lang === "en" && part.category.nameEn ? part.category.nameEn : part.category.nameAr}
              </span>
            )}
            {lang === "ar" && part.nameEn && <span dir="ltr">{part.nameEn}</span>}
          </div>
        </div>
        <div className="page-head-actions">
          <Link href={`/labels?ids=${part.id}`} className="btn btn-secondary" id="print-label-btn">
            <IconPrinter />
            {t.partView.printLabel}
          </Link>
          {can.editParts(user) && (
            <Link href={`/parts/${part.id}/edit`} className="btn btn-navy" id="edit-part-btn">
              <IconEdit />
              {t.common.edit}
            </Link>
          )}
          {user.role === "OWNER" && <DeletePartButton partId={part.id} />}
        </div>
      </div>

      <div className="grid-main">
        <div className="stack" style={{ gap: 22 }}>
          <section className="card">
            <div className="card-head">
              <h2>{t.partView.stockByStore}</h2>
              <span className="badge num">
                {t.partView.total}: {total}
              </span>
            </div>
            <div className="table-wrap">
              <table className="table responsive">
                <thead>
                  <tr>
                    <th>{t.store.label}</th>
                    <th>{t.parts.location}</th>
                    <th className="end">{t.partForm.minQuantity}</th>
                    <th className="end">{t.parts.quantity}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const status = stockStatus(r.quantity, r.minQuantity);
                    return (
                      <tr key={r.storeId}>
                        <td className="cell-main">
                          <strong>{r.storeName}</strong>
                        </td>
                        <td data-label={t.parts.location}>
                          {r.location ? (
                            <span className="chip">
                              <IconPin />
                              {r.location}
                            </span>
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                        <td className="end num" data-label={t.partForm.minQuantity}>
                          {r.minQuantity || "—"}
                        </td>
                        <td className="end" data-label={t.parts.quantity}>
                          <span className={`qty num ${status === "ok" ? "" : `is-${status}`}`}>{r.quantity}</span>
                        </td>
                        <td className="end" data-label="">
                          {can.adjustStock(user, r.storeId) && (
                            <AdjustButton
                              partId={part.id}
                              storeId={r.storeId}
                              storeName={r.storeName}
                              current={r.quantity}
                            />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="card">
            <div className="card-head">
              <h2>{t.partView.history}</h2>
            </div>
            {movements.length === 0 ? (
              <div className="empty">
                <div className="empty-icon">
                  <IconHistory />
                </div>
                <span>{t.partView.historyEmpty}</span>
              </div>
            ) : (
              <div className="list">
                {movements.map((m) => (
                  <div className="list-item" key={m.id}>
                    <span
                      className={`mv-icon num ${m.type === "ADJUST" ? "mv-adj" : m.quantity >= 0 ? "mv-in" : "mv-out"}`}
                    >
                      {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                    </span>
                    <div className="grow">
                      <div className="title" style={{ fontWeight: 600 }}>
                        {t.movement[m.type]}
                        {m.note && <span className="muted" style={{ fontWeight: 400 }}> — {m.note}</span>}
                      </div>
                      <div className="part-sub">
                        <span>{m.store.name}</span>
                        {m.user && <span>· {m.user.name}</span>}
                        <span>· {formatDateTime(m.createdAt, lang)}</span>
                      </div>
                    </div>
                    <span className="muted small num">
                      {t.partView.after}: {m.after}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <div className="stack" style={{ gap: 22 }}>
          <PartPhotoCard partId={part.id} imageUrl={part.imageUrl} canEdit={can.editParts(user)} />
          <section className="card card-pad stack" style={{ gap: 14 }}>
            <div className="row spread">
              <span className="muted">{t.parts.salePrice}</span>
              <strong className="num" style={{ fontSize: "1.35rem", color: "var(--navy-900)" }}>
                {formatDA(sell, lang)}
              </strong>
            </div>
            {showCost && (
              <>
                <div className="row spread">
                  <span className="muted">{t.parts.purchasePrice}</span>
                  <span className="num">{formatDA(buy, lang)}</span>
                </div>
                <div className="row spread">
                  <span className="muted">{t.partForm.margin}</span>
                  <span className="num" style={{ color: sell - buy < 0 ? "var(--danger)" : "var(--ok)", fontWeight: 700 }}>
                    {formatDA(sell - buy, lang)}
                    {buy > 0 && <span className="muted small"> ({Math.round(((sell - buy) / buy) * 100)}%)</span>}
                  </span>
                </div>
              </>
            )}
            {part.barcode && (
              <div
                style={{
                  display: "grid",
                  placeItems: "center",
                  padding: 14,
                  borderRadius: 12,
                  background: "var(--surface-2)",
                  border: "1px solid var(--line)",
                }}
              >
                <Barcode value={part.barcode} />
              </div>
            )}
          </section>

          <section className="card">
            <div className="card-head">
              <h2>{t.partForm.compat}</h2>
            </div>
            {part.compat.length === 0 ? (
              <p className="card-body muted small">{t.partView.noCompat}</p>
            ) : (
              <div className="list">
                {part.compat.map((c) => (
                  <div className="list-item" key={c.id}>
                    <span className="mv-icon mv-adj">{c.type === "TRUCK" ? <IconTruck width={18} /> : <IconCar width={18} />}</span>
                    <div className="grow">
                      <div className="title">
                        {c.make} {c.model}
                      </div>
                      <div className="part-sub">{t.vehicle[c.type]}</div>
                    </div>
                    <span className="num muted">{yearRange(c.yearFrom, c.yearTo)}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {part.notes && (
            <section className="card card-pad">
              <h3 style={{ marginBottom: 6 }}>{t.partForm.notes}</h3>
              <p className="muted" style={{ whiteSpace: "pre-wrap" }}>
                {part.notes}
              </p>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
