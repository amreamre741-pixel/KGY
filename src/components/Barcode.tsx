"use client";

import { useEffect, useRef } from "react";

/** Renders a CODE128 barcode as SVG. */
export default function Barcode({ value, height = 40, width = 1.6 }: { value: string; height?: number; width?: number }) {
  const ref = useRef<SVGSVGElement>(null);

  useEffect(() => {
    let cancelled = false;
    import("jsbarcode").then(({ default: JsBarcode }) => {
      if (cancelled || !ref.current) return;
      try {
        JsBarcode(ref.current, value, {
          format: "CODE128",
          height,
          width,
          fontSize: 12,
          margin: 0,
          displayValue: true,
          font: "monospace",
        });
      } catch {
        // invalid characters for CODE128: leave empty
      }
    });
    return () => {
      cancelled = true;
    };
  }, [value, height, width]);

  return <svg ref={ref} role="img" aria-label={value} />;
}
