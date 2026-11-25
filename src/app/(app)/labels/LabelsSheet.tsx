"use client";

import Link from "next/link";
import { useState } from "react";
import { useI18n } from "@/lib/i18n/client";
import { formatDA } from "@/lib/format";
import Barcode from "@/components/Barcode";
import { IconArrowBack, IconPrinter, IconTag } from "@/components/icons";

type LabelPart = { id: string; name: string; reference: string; brand: string; barcode: string; salePrice: number };

export default function LabelsSheet({ parts }: { parts: LabelPart[] }) {
  const { t, lang } = useI18n();
  const [copies, setCopies] = useState(1);
  const [showPrice, setShowPrice] = useState(true);

  const labels = parts.flatMap((p) => Array.from({ length: copies }, (_, i) => ({ ...p, key: `${p.id}-${i}` })));

  return (
    <>
      <div className="page-head no-print">
        <div>
          <Link href="/parts" className="crumb">
            <IconArrowBack className="flip" />
            {t.parts.title}
          </Link>
          <h1>{t.labels.title}</h1>
          <p className="sub">{t.labels.hint}</p>
        </div>
        {parts.length > 0 && (
          <div className="page-head-actions">
            <button className="btn btn-primary" type="button" onClick={() => window.print()} id="print-btn">
              <IconPrinter />
              {t.common.print}
            </button>
          </div>
        )}
      </div>

      {parts.length === 0 ? (
        <div className="card empty no-print">
          <div className="empty-icon">
            <IconTag />
          </div>
          <span>{t.labels.empty}</span>
          <Link href="/parts" className="btn btn-secondary">
            {t.parts.title}
          </Link>
        </div>
      ) : (
        <>
          <div className="card card-pad row no-print" style={{ gap: 20 }}>
            <div className="field" style={{ width: 140 }}>
              <label className="label" htmlFor="copies">
                {t.labels.copies}
              </label>
              <input
                className="input num"
                id="copies"
                type="number"
                min={1}
                max={50}
                value={copies}
                onChange={(e) => setCopies(Math.min(50, Math.max(1, Number(e.target.value) || 1)))}
              />
            </div>
            <label className="checkbox" style={{ marginTop: 22 }}>
              <input type="checkbox" checked={showPrice} onChange={(e) => setShowPrice(e.target.checked)} />
              {t.labels.showPrice}
            </label>
          </div>

          <div className="labels-sheet">
            {labels.map((l) => (
              <div className="label-card" key={l.key}>
                <span className="lc-shop">KGY</span>
                <span className="lc-name">{l.name}</span>
                <span className="lc-ref">
                  {l.reference}
                  {l.brand ? ` · ${l.brand}` : ""}
                </span>
                <Barcode value={l.barcode} height={34} width={1.4} />
                {showPrice && <span className="lc-price num">{formatDA(l.salePrice, lang)}</span>}
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
