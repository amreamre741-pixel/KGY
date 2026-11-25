"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n/client";
import Scanner from "./Scanner";
import ImageSearchModal from "./ImageSearchModal";
import { IconBarcode, IconCamera, IconSearch } from "./icons";

type Props = {
  defaultValue?: string;
  variant?: "hero" | "toolbar";
  /** extra query params to keep (e.g. low=1) */
  keep?: Record<string, string>;
  autoFocus?: boolean;
};

export default function SearchBar({ defaultValue = "", variant = "toolbar", keep = {}, autoFocus }: Props) {
  const { t } = useI18n();
  const router = useRouter();
  const [q, setQ] = useState(defaultValue);
  const [scanOpen, setScanOpen] = useState(false);
  const [imgSearchOpen, setImgSearchOpen] = useState(false);

  const go = (query: string, scan = false) => {
    const params = new URLSearchParams(keep);
    if (query.trim()) params.set("q", query.trim());
    if (scan) params.set("scan", "1");
    router.push(`/parts${params.size ? `?${params}` : ""}`);
  };

  const onDetected = useCallback(
    (code: string) => {
      setScanOpen(false);
      setQ(code);
      const params = new URLSearchParams({ q: code, scan: "1" });
      router.push(`/parts?${params}`);
    },
    [router],
  );

  return (
    <>
      <form
        className={variant === "hero" ? "hero-search" : "toolbar"}
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          go(q);
        }}
      >
        <div className="input-group">
          <IconSearch />
          <input
            className="input"
            type="search"
            id={variant === "hero" ? "hero-search" : "parts-search"}
            name="q"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={variant === "hero" ? t.home.searchPlaceholder : t.parts.searchPlaceholder}
            aria-label={t.common.search}
            autoFocus={autoFocus}
            autoComplete="off"
          />
        </div>
        {variant === "hero" ? (
          <>
            <button className="btn btn-primary" type="submit" id="hero-search-btn">
              <IconSearch />
              <span className="btn-label">{t.common.search}</span>
            </button>
            <button className="btn btn-secondary" type="button" onClick={() => setImgSearchOpen(true)} id="hero-img-search-btn">
              <IconCamera />
              <span className="btn-label">{t.imageSearch.button}</span>
            </button>
            <button className="btn btn-secondary" type="button" onClick={() => setScanOpen(true)} id="hero-scan-btn">
              <IconBarcode />
              <span className="btn-label">{t.home.scan}</span>
            </button>
          </>
        ) : (
          <>
            <button
              className="btn btn-secondary btn-icon"
              type="button"
              onClick={() => setImgSearchOpen(true)}
              aria-label={t.imageSearch.button}
              title={t.imageSearch.button}
              id="parts-img-search-btn"
            >
              <IconCamera />
            </button>
            <button
              className="btn btn-secondary btn-icon"
              type="button"
              onClick={() => setScanOpen(true)}
              aria-label={t.home.scan}
              title={t.home.scan}
              id="parts-scan-btn"
            >
              <IconBarcode />
            </button>
          </>
        )}
      </form>
      <Scanner open={scanOpen} onClose={() => setScanOpen(false)} onDetected={onDetected} />
      <ImageSearchModal open={imgSearchOpen} onClose={() => setImgSearchOpen(false)} />
    </>
  );
}
