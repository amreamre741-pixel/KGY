"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n/client";
import { IconAlert, IconCamera, IconFlash, IconX, IconZoomIn } from "./icons";

type Props = {
  open: boolean;
  onClose: () => void;
  onDetected: (code: string) => void;
};

type NativeBarcodeDetector = {
  detect: (source: ImageBitmapSource) => Promise<{ rawValue?: string }[]>;
};

const FORMATS_1D_2D = [
  "code_128",
  "code_39",
  "code_93",
  "ean_13",
  "ean_8",
  "upc_a",
  "upc_e",
  "itf",
  "codabar",
  "qr_code",
  "data_matrix",
];

function getNativeDetector(): NativeBarcodeDetector | null {
  const g = globalThis as unknown as {
    BarcodeDetector?: new (opts?: { formats?: string[] }) => NativeBarcodeDetector;
  };
  if (!g.BarcodeDetector) return null;
  try {
    return new g.BarcodeDetector({ formats: FORMATS_1D_2D });
  } catch {
    try {
      return new g.BarcodeDetector();
    } catch {
      return null;
    }
  }
}

/**
 * High-precision camera barcode scanner:
 * - Requests Full HD (1920x1080) + continuous autofocus for dense thermal Code-128 labels
 * - Uses Android Chrome native `BarcodeDetector` (MLKit) in parallel with ZXing (`TRY_HARDER`)
 * - Exposes hardware Zoom (1x / 2x / 3x) & Torch (Flash) controls when supported by phone camera
 * - Includes sharp macro photo fallback for tricky labels
 */
export default function Scanner({ open, onClose, onDetected }: Props) {
  const { t } = useI18n();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [photoMsg, setPhotoMsg] = useState<string | null>(null);
  const [manual, setManual] = useState("");
  const [zoomCap, setZoomCap] = useState<{ min: number; max: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [hasTorch, setHasTorch] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let stopped = false;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        });
        if (stopped) {
          stream.getTracks().forEach((tr) => tr.stop());
          return;
        }

        const track = stream.getVideoTracks()[0] ?? null;
        trackRef.current = track;

        if (track && typeof track.getCapabilities === "function") {
          const caps = track.getCapabilities() as Record<string, unknown>;
          // Request continuous autofocus if supported
          if (Array.isArray(caps.focusMode) && caps.focusMode.includes("continuous")) {
            track.applyConstraints({ advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet] }).catch(() => {});
          }
          if (caps.zoom && typeof caps.zoom === "object") {
            const z = caps.zoom as { min?: number; max?: number };
            const min = Number(z.min ?? 1);
            const max = Number(z.max ?? 1);
            if (max > min) {
              setZoomCap({ min, max });
              // Slight default 1.5x zoom helps phone cameras focus from ~15cm away on small labels
              const initialZ = Math.min(max, Math.max(min, 1.5));
              setZoom(initialZ);
              track.applyConstraints({ advanced: [{ zoom: initialZ } as MediaTrackConstraintSet] }).catch(() => {});
            }
          }
          if (caps.torch === true) {
            setHasTorch(true);
          }
        }

        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();

        const nativeDetector = getNativeDetector();
        const zxingLib = await import("@zxing/library");
        const hints = new Map();
        hints.set(zxingLib.DecodeHintType.TRY_HARDER, true);
        hints.set(zxingLib.DecodeHintType.POSSIBLE_FORMATS, [
          zxingLib.BarcodeFormat.CODE_128,
          zxingLib.BarcodeFormat.CODE_39,
          zxingLib.BarcodeFormat.CODE_93,
          zxingLib.BarcodeFormat.EAN_13,
          zxingLib.BarcodeFormat.EAN_8,
          zxingLib.BarcodeFormat.ITF,
          zxingLib.BarcodeFormat.CODABAR,
          zxingLib.BarcodeFormat.UPC_A,
          zxingLib.BarcodeFormat.UPC_E,
          zxingLib.BarcodeFormat.QR_CODE,
          zxingLib.BarcodeFormat.DATA_MATRIX,
        ]);
        const zxingReader = new zxingLib.MultiFormatReader();
        zxingReader.setHints(hints);

        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d", { willReadFrequently: true });

        const finishHit = (code: string) => {
          const clean = code.trim();
          if (!clean || stopped) return;
          stopped = true;
          if (navigator.vibrate) navigator.vibrate(80);
          onDetected(clean);
        };

        const scanFrame = async () => {
          if (stopped) return;
          if (video.readyState >= 2 && video.videoWidth > 0) {
            // 1. Native Android MLKit BarcodeDetector (very fast & handles small thermal labels)
            if (nativeDetector) {
              try {
                const hits = await nativeDetector.detect(video);
                const val = hits.find((h) => h.rawValue && h.rawValue.trim())?.rawValue;
                if (val) {
                  finishHit(val);
                  return;
                }
              } catch {
                // ignore frame error
              }
            }

            // 2. ZXing TRY_HARDER on cropped center region of HD frame
            if (ctx) {
              const vw = video.videoWidth;
              const vh = video.videoHeight;
              const cw = Math.floor(vw * 0.84);
              const ch = Math.floor(vh * 0.52);
              const sx = Math.floor((vw - cw) / 2);
              const sy = Math.floor((vh - ch) / 2);
              canvas.width = cw;
              canvas.height = ch;
              ctx.drawImage(video, sx, sy, cw, ch, 0, 0, cw, ch);
              const imgData = ctx.getImageData(0, 0, cw, ch);
              const data = imgData.data;
              const lum = new Uint8ClampedArray(cw * ch);
              for (let i = 0, p = 0; i < lum.length; i++, p += 4) {
                lum[i] = ((data[p] + data[p + 1] * 2 + data[p + 2]) >> 2) & 0xff;
              }
              const src = new zxingLib.RGBLuminanceSource(lum, cw, ch);
              try {
                const res = zxingReader.decode(new zxingLib.BinaryBitmap(new zxingLib.HybridBinarizer(src)));
                if (res?.getText()) {
                  finishHit(res.getText());
                  return;
                }
              } catch {
                try {
                  const res2 = zxingReader.decode(new zxingLib.BinaryBitmap(new zxingLib.GlobalHistogramBinarizer(src)));
                  if (res2?.getText()) {
                    finishHit(res2.getText());
                    return;
                  }
                } catch {
                  // no barcode in this frame
                }
              }
            }
          }
          if (!stopped) {
            timer = setTimeout(scanFrame, 130);
          }
        };

        scanFrame();
      } catch {
        if (!stopped) setError(t.scanner.cameraError);
      }
    })();

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      trackRef.current = null;
      stream?.getTracks().forEach((tr) => tr.stop());
    };
  }, [open, onDetected, t.scanner.cameraError]);

  const applyZoom = (nextZoom: number) => {
    const tr = trackRef.current;
    if (!tr || !zoomCap) return;
    const clamped = Math.min(zoomCap.max, Math.max(zoomCap.min, nextZoom));
    setZoom(clamped);
    tr.applyConstraints({ advanced: [{ zoom: clamped } as MediaTrackConstraintSet] }).catch(() => {});
  };

  const toggleTorch = () => {
    const tr = trackRef.current;
    if (!tr || !hasTorch) return;
    const next = !torchOn;
    setTorchOn(next);
    tr.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] }).catch(() => {});
  };

  const onPhotoFallback = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setPhotoMsg(null);
    try {
      const bitmap = await createImageBitmap(file);
      const nativeDetector = getNativeDetector();
      if (nativeDetector) {
        const hits = await nativeDetector.detect(bitmap);
        const val = hits.find((h) => h.rawValue && h.rawValue.trim())?.rawValue;
        if (val) {
          onDetected(val.trim());
          return;
        }
      }
      const zxingLib = await import("@zxing/library");
      const hints = new Map([[zxingLib.DecodeHintType.TRY_HARDER, true]]);
      const reader = new zxingLib.MultiFormatReader();
      reader.setHints(hints);

      const maxDim = 1600;
      const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
      const w = Math.max(1, Math.round(bitmap.width * scale));
      const h = Math.max(1, Math.round(bitmap.height * scale));
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const ctx = c.getContext("2d");
      if (ctx) {
        ctx.drawImage(bitmap, 0, 0, w, h);
        const d = ctx.getImageData(0, 0, w, h).data;
        const lum = new Uint8ClampedArray(w * h);
        for (let i = 0, p = 0; i < lum.length; i++, p += 4) {
          lum[i] = ((d[p] + d[p + 1] * 2 + d[p + 2]) >> 2) & 0xff;
        }
        const src = new zxingLib.RGBLuminanceSource(lum, w, h);
        const res = reader.decode(new zxingLib.BinaryBitmap(new zxingLib.HybridBinarizer(src)));
        if (res?.getText()) {
          onDetected(res.getText().trim());
          return;
        }
      }
      setPhotoMsg(t.scanner.photoNoHit);
    } catch {
      setPhotoMsg(t.scanner.photoNoHit);
    }
  };

  const close = () => {
    setError(null);
    setPhotoMsg(null);
    setTorchOn(false);
    setHasTorch(false);
    setZoomCap(null);
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

            <div className="row" style={{ justifyContent: "space-between", gap: 8 }}>
              {zoomCap ? (
                <div className="row" style={{ gap: 6, flex: 1 }}>
                  <IconZoomIn width={16} height={16} />
                  {[1, 2, 3]
                    .filter((z) => z <= zoomCap.max + 0.2)
                    .map((z) => {
                      const target = Math.min(zoomCap.max, Math.max(zoomCap.min, z));
                      const active = Math.abs(zoom - target) < 0.35;
                      return (
                        <button
                          key={z}
                          type="button"
                          className={`btn btn-sm num ${active ? "btn-navy" : "btn-secondary"}`}
                          onClick={() => applyZoom(target)}
                        >
                          {z}x
                        </button>
                      );
                    })}
                </div>
              ) : (
                <span />
              )}

              <div className="row" style={{ gap: 6 }}>
                {hasTorch && (
                  <button
                    type="button"
                    className={`btn btn-sm ${torchOn ? "btn-primary" : "btn-secondary"}`}
                    onClick={toggleTorch}
                  >
                    <IconFlash />
                    {t.scanner.torch}
                  </button>
                )}
                <label className="btn btn-secondary btn-sm" style={{ cursor: "pointer" }}>
                  <IconCamera />
                  {t.scanner.photoScan}
                  <input type="file" accept="image/*" capture="environment" onChange={onPhotoFallback} className="sr-only" />
                </label>
              </div>
            </div>

            {photoMsg && (
              <div className="alert alert-info" style={{ fontSize: "0.82rem" }}>
                <IconAlert />
                {photoMsg}
              </div>
            )}

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
