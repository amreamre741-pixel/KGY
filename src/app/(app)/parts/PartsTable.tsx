"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useI18n } from "@/lib/i18n/client";
import { formatDA } from "@/lib/format";
import { IconCar, IconEdit, IconParts, IconPin, IconPrinter, IconRuler, IconTransfer, IconTrash, IconTruck } from "@/components/icons";
import { deletePartFromList } from "./actions";

export type PartRow = {
  id: string;
  name: string;
  reference: string;
  brand: string;
  category: string;
  dimensions: string;
  vehicles: { type: "CAR" | "TRUCK"; label: string }[];
  moreVehicles: number;
  quantity: number;
  status: "ok" | "low" | "out";
  location: string;
  salePrice: number;
  imageUrl: string;
  storeStocks: { storeId: string; storeName: string; quantity: number; status: "ok" | "low" | "out" }[];
};

export default function PartsTable({
  rows,
  showLocation,
  hasQuery,
  canEdit,
  canDelete,
  canTransfer,
}: {
  rows: PartRow[];
  showLocation: boolean;
  hasQuery: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canTransfer: boolean;
}) {
  const { t, lang } = useI18n();
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));

  if (rows.length === 0) {
    return (
      <div className="card empty">
        <div className="empty-icon">
          <IconParts />
        </div>
        <strong>{t.parts.empty}</strong>
        {!hasQuery && <span>{t.parts.emptyHint}</span>}
      </div>
    );
  }

  return (
    <div className="card" style={{ opacity: pending ? 0.7 : 1 }}>
      {selected.size > 0 && (
        <div className="card-head fade-in" style={{ background: "var(--orange-50)" }}>
          <span>
            <strong className="num">{selected.size}</strong> {t.parts.selected}
          </span>
          <button
            className="btn btn-navy btn-sm"
            type="button"
            id="print-labels-btn"
            onClick={() => router.push(`/labels?ids=${[...selected].join(",")}`)}
          >
            <IconPrinter />
            {t.parts.printLabels}
          </button>
        </div>
      )}
      <div className="table-wrap">
        <table className="table responsive">
          <thead>
            <tr>
              <th style={{ width: 40 }}>
                <input
                  type="checkbox"
                  className="checkbox"
                  aria-label={t.common.all}
                  checked={allSelected}
                  onChange={() => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)))}
                  style={{ accentColor: "var(--orange-500)", width: 17, height: 17 }}
                />
              </th>
              <th>{t.parts.name}</th>
              <th>{t.parts.vehicles}</th>
              {showLocation && <th>{t.parts.location}</th>}
              <th className="end">{t.parts.salePrice}</th>
              <th className="end">{t.parts.quantity}</th>
              {canEdit && <th className="end">{t.common.actions}</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="cell-check">
                  <input
                    type="checkbox"
                    aria-label={r.name}
                    checked={selected.has(r.id)}
                    onChange={() => toggle(r.id)}
                    style={{ accentColor: "var(--orange-500)", width: 17, height: 17 }}
                  />
                </td>
                <td className="cell-main">
                  <div className="row" style={{ gap: 12, flexWrap: "nowrap", alignItems: "center" }}>
                    {r.imageUrl ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={r.imageUrl}
                        alt=""
                        style={{
                          width: 44,
                          height: 44,
                          objectFit: "cover",
                          borderRadius: 8,
                          border: "1px solid var(--line)",
                          flexShrink: 0,
                        }}
                      />
                    ) : null}
                    <div className="part-cell">
                      <Link href={`/parts/${r.id}`} className="part-name">
                        {r.name}
                      </Link>
                      <div className="part-sub">
                        <span className="ref">{r.reference}</span>
                        {r.brand && <span className="badge">{r.brand}</span>}
                        {r.dimensions && (
                          <span className="chip mono" dir="ltr">
                            <IconRuler />
                            {r.dimensions}
                          </span>
                        )}
                        {r.category && <span>{r.category}</span>}
                      </div>
                      {r.storeStocks.length > 0 && (
                        <div className="row" style={{ gap: 4, marginTop: 4 }}>
                          {r.storeStocks.map((st) => (
                            <span
                              key={st.storeId}
                              className="badge badge-ok"
                            >
                              🏪 {st.storeName}: <span className="num">{st.quantity}</span>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </td>
                <td data-label={t.parts.vehicles}>
                  <div className="row" style={{ gap: 4, justifyContent: "flex-start" }}>
                    {r.vehicles.length === 0 && <span className="muted">—</span>}
                    {r.vehicles.map((v, i) => (
                      <span className="chip" key={i}>
                        {v.type === "TRUCK" ? <IconTruck /> : <IconCar />}
                        {v.label}
                      </span>
                    ))}
                    {r.moreVehicles > 0 && (
                      <span className="chip num">
                        +{r.moreVehicles} {t.parts.moreVehicles}
                      </span>
                    )}
                  </div>
                </td>
                {showLocation && (
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
                )}
                <td className="end num" data-label={t.parts.salePrice}>
                  {formatDA(r.salePrice, lang)}
                </td>
                <td className="end" data-label={t.parts.quantity}>
                  <div className="row" style={{ gap: 6, justifyContent: "flex-end", flexWrap: "nowrap" }}>
                    {r.status !== "ok" && (
                      <span className={`badge ${r.status === "out" ? "badge-out" : "badge-low"}`}>
                        {r.status === "out" ? t.parts.out : t.parts.low}
                      </span>
                    )}
                    <span className={`qty num ${r.status === "ok" ? "" : `is-${r.status}`}`}>{r.quantity}</span>
                  </div>
                </td>
                {canEdit && (
                  <td className="end" data-label={t.common.actions}>
                    <div className="row" style={{ gap: 6, justifyContent: "flex-end", flexWrap: "nowrap" }}>
                      <Link
                        href={`/parts/${r.id}/edit`}
                        className="btn btn-secondary btn-icon btn-sm"
                        title={t.common.edit}
                        aria-label={t.common.edit}
                      >
                        <IconEdit />
                      </Link>
                      {canTransfer && (
                        <Link
                          href={`/transfers/new?partId=${r.id}`}
                          className="btn btn-secondary btn-icon btn-sm"
                          title={t.parts.transferPart}
                          aria-label={t.parts.transferPart}
                        >
                          <IconTransfer />
                        </Link>
                      )}
                      {canDelete && (
                        <button
                          type="button"
                          className="btn btn-danger btn-icon btn-sm"
                          title={t.common.delete}
                          aria-label={t.common.delete}
                          disabled={pending}
                          onClick={() => {
                            if (confirm(t.partView.deleteConfirm)) {
                              startTransition(async () => {
                                await deletePartFromList(r.id);
                              });
                            }
                          }}
                        >
                          <IconTrash />
                        </button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
