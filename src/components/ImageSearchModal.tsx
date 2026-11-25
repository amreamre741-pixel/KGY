"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n/client";
import { formatDA } from "@/lib/format";
import { compareSignatures, compressImageFile, computeImageSignature } from "@/lib/image";
import { IconCamera, IconImage, IconPin, IconX } from "./icons";

type CandidatePart = {
  id: string;
  name: string;
  reference: string;
  brand: string;
  salePrice: number;
  quantity: number;
  location: string;
  imageUrl: string;
};

type RankedMatch = CandidatePart & { score: number; aiHit: boolean };

export default function ImageSearchModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, lang } = useI18n();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [queryImg, setQueryImg] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [detected, setDetected] = useState("");
  const [matches, setMatches] = useState<RankedMatch[]>([]);
  const [noPhotos, setNoPhotos] = useState(false);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const close = () => {
    setQueryImg("");
    setMatches([]);
    setDetected("");
    setNoPhotos(false);
    onClose();
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setLoading(true);
    setMatches([]);
    setDetected("");
    setNoPhotos(false);

    try {
      const dataUrl = await compressImageFile(file, 640, 0.8);
      setQueryImg(dataUrl);
      const querySig = await computeImageSignature(dataUrl);

      const [invRes, aiRes] = await Promise.all([
        fetch("/api/image-search").then((r) => r.json() as Promise<{ parts?: CandidatePart[] }>),
        fetch("/api/image-search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageUrl: dataUrl }),
        })
          .then((r) => r.json() as Promise<{ aiUsed?: boolean; detectedText?: string; matchedIds?: string[] }>)
          .catch(() => ({ aiUsed: false, detectedText: "", matchedIds: [] })),
      ]);

      const candidates = invRes.parts ?? [];
      if (aiRes.detectedText) setDetected(aiRes.detectedText);
      const aiSet = new Set(aiRes.matchedIds ?? []);

      if (candidates.length === 0) {
        setNoPhotos(true);
        setLoading(false);
        return;
      }

      const scored: RankedMatch[] = [];
      for (const c of candidates) {
        try {
          const sig = await computeImageSignature(c.imageUrl);
          const visualScore = compareSignatures(querySig, sig);
          const aiHit = aiSet.has(c.id);
          const score = aiHit ? Math.max(visualScore, 95) : visualScore;
          scored.push({ ...c, score, aiHit });
        } catch {
          // skip unreadable candidate image
        }
      }

      scored.sort((a, b) => b.score - a.score);
      setMatches(scored.slice(0, 8));
    } finally {
      setLoading(false);
    }
  };

  return (
    <dialog ref={dialogRef} className="modal" onClose={close} onCancel={close}>
      <div className="modal-head">
        <h2>{t.imageSearch.title}</h2>
        <button className="btn btn-ghost btn-icon btn-sm" type="button" onClick={close} aria-label={t.common.close}>
          <IconX />
        </button>
      </div>
      <div className="modal-body">
        <p className="muted small">{t.imageSearch.hint}</p>

        <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
          <label className="btn btn-primary" style={{ cursor: "pointer", flex: 1 }}>
            <IconCamera />
            {t.imageSearch.snap}
            <input type="file" accept="image/*" capture="environment" onChange={handleFile} className="sr-only" />
          </label>
          <label className="btn btn-secondary" style={{ cursor: "pointer", flex: 1 }}>
            <IconImage />
            {t.imageSearch.upload}
            <input type="file" accept="image/*" onChange={handleFile} className="sr-only" />
          </label>
        </div>

        {queryImg && (
          <div className="row" style={{ gap: 12, padding: 10, borderRadius: 12, background: "var(--surface-2)", border: "1px solid var(--line)" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={queryImg} alt="" style={{ width: 68, height: 68, objectFit: "cover", borderRadius: 10 }} />
            <div className="stack" style={{ gap: 4, flex: 1 }}>
              {loading && <span className="small">{t.imageSearch.searching}</span>}
              {detected && (
                <span className="small">
                  <strong>{t.imageSearch.detected}:</strong> <span className="mono">{detected}</span>
                </span>
              )}
            </div>
          </div>
        )}

        {noPhotos && <p className="muted small">{t.imageSearch.noPhotosYet}</p>}

        {matches.length > 0 && (
          <div className="stack" style={{ gap: 8 }}>
            <span className="label">{t.imageSearch.matches}</span>
            <div className="list" style={{ border: "1px solid var(--line)", borderRadius: 12, maxHeight: 300, overflowY: "auto" }}>
              {matches.map((m) => (
                <Link key={m.id} href={`/parts/${m.id}`} onClick={close} className="list-item">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={m.imageUrl}
                    alt=""
                    style={{ width: 46, height: 46, objectFit: "cover", borderRadius: 8, border: "1px solid var(--line)", flexShrink: 0 }}
                  />
                  <div className="grow">
                    <div className="title">{m.name}</div>
                    <div className="part-sub">
                      <span className="ref">{m.reference}</span>
                      {m.brand && <span>· {m.brand}</span>}
                      {m.location && (
                        <span>
                          · <IconPin width={12} height={12} /> {m.location}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="stack" style={{ gap: 4, alignItems: "flex-end" }}>
                    <span className={`badge num ${m.score >= 75 ? "badge-ok" : "badge-orange"}`}>
                      {m.aiHit ? t.imageSearch.aiMatch : `${m.score}% ${t.imageSearch.similarity}`}
                    </span>
                    <span className="small num">
                      {formatDA(m.salePrice, lang)} · ({m.quantity})
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </dialog>
  );
}
