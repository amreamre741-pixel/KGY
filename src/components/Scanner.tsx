"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n/client";
import { IconAlert, IconX } from "./icons";

type Props = {
  open: boolean;
  onClose: () => void;
  onDetected: (code: string) => void;
};

/** Camera barcode scanner in a modal (EAN/UPC/Code128/Code39/QR…). */
export default function Scanner({ open, onClose, onDetected }: Props) {
  const { t } = useI18n();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [manual, setManual] = useState("");

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let stopped = false;
    let controls: { stop: () => void } | null = null;

    (async () => {
      try {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const reader = new BrowserMultiFormatReader();
        if (stopped || !videoRef.current) return;
        controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: "environment" } }, audio: false },
          videoRef.current,
          (result) => {
            if (result && !stopped) {
              stopped = true;
              controls?.stop();
              if (navigator.vibrate) navigator.vibrate(80);
              onDetected(result.getText().trim());
            }
          },
        );
        if (stopped) controls.stop();
      } catch {
        if (!stopped) setError(t.scanner.cameraError);
      }
    })();

    return () => {
      stopped = true;
      controls?.stop();
    };
  }, [open, onDetected, t.scanner.cameraError]);

  const close = () => {
    setError(null);
    onClose();
  };

  return (
    <dialog ref={dialogRef} className="modal" onClose={close} onCancel={close}>
      <div className="modal-head">
        <h2>{t.scanner.title}</h2>
        <button className="btn btn-ghost btn-icon btn-sm" type="button" onClick={close} aria-label={t.common.close}>
          <IconX />
        </button>
      </div>
      <div className="modal-body">
        {error ? (
          <div className="alert alert-error">
            <IconAlert />
            {error}
          </div>
        ) : (
          <>
            <div className="scanner-view">
              <video ref={videoRef} muted playsInline />
              <div className="scanner-frame" />
            </div>
            <p className="muted small" style={{ textAlign: "center" }}>
              {t.scanner.hint}
            </p>
          </>
        )}
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            if (manual.trim()) onDetected(manual.trim());
          }}
        >
          <input
            className="input"
            style={{ flex: 1 }}
            dir="ltr"
            placeholder={t.scanner.manual}
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            aria-label={t.scanner.manual}
          />
          <button className="btn btn-navy" type="submit">
            {t.common.search}
          </button>
        </form>
      </div>
    </dialog>
  );
}
