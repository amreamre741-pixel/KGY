/**
 * Reads an image File (from camera or gallery), resizes it proportionally
 * so its longest edge is <= maxSize, and returns a compact JPEG data URL.
 */
export function compressImageFile(file: File, maxSize = 720, quality = 0.8): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read_failed"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("decode_failed"));
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width || 1, img.height || 1));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("canvas_failed"));
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Computes a compact, lighting-normalized visual signature combining:
 * 1) 8x8 spatial normalized luma + chroma grid (shape & layout)
 * 2) 4x4 Sobel edge-orientation histogram (mechanical contours)
 * 3) 12-bin color histogram (packaging/part colors, rotation-tolerant)
 */
export function computeImageSignature(src: string): Promise<number[]> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onerror = () => reject(new Error("sig_decode_failed"));
    img.onload = () => {
      const S = 32;
      const canvas = document.createElement("canvas");
      canvas.width = S;
      canvas.height = S;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("sig_canvas_failed"));
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, S, S);
      // Center-crop square region (80% of shortest side + full fit blend) for stability
      const side = Math.min(img.width, img.height);
      const sx = (img.width - side) / 2;
      const sy = (img.height - side) / 2;
      ctx.drawImage(img, sx, sy, side, side, 0, 0, S, S);
      const { data } = ctx.getImageData(0, 0, S, S);

      const luma = new Float32Array(S * S);
      const cr = new Float32Array(S * S);
      const cb = new Float32Array(S * S);
      const colorHist = new Float32Array(12);

      let meanL = 0;
      for (let i = 0; i < S * S; i++) {
        const r = data[i * 4] / 255;
        const g = data[i * 4 + 1] / 255;
        const b = data[i * 4 + 2] / 255;
        const y = 0.299 * r + 0.587 * g + 0.114 * b;
        luma[i] = y;
        cr[i] = r - y;
        cb[i] = b - y;
        meanL += y;

        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const sat = max === 0 ? 0 : (max - min) / max;
        if (sat < 0.15) {
          colorHist[y < 0.35 ? 0 : y < 0.7 ? 1 : 2] += 1;
        } else {
          let hue = 0;
          const d = max - min;
          if (max === r) hue = ((g - b) / d + 6) % 6;
          else if (max === g) hue = (b - r) / d + 2;
          else hue = (r - g) / d + 4;
          const bin = 3 + (Math.floor((hue / 6) * 9) % 9);
          colorHist[bin] += 1;
        }
      }
      meanL /= S * S;
      let stdL = 0;
      for (let i = 0; i < S * S; i++) stdL += (luma[i] - meanL) ** 2;
      stdL = Math.sqrt(stdL / (S * S)) || 1;

      const features: number[] = [];

      // 1) 8x8 downsampled normalized luma + chroma
      const G = 8;
      const step = S / G;
      for (let gy = 0; gy < G; gy++) {
        for (let gx = 0; gx < G; gx++) {
          let sl = 0,
            scr = 0,
            scb = 0;
          for (let y = gy * step; y < (gy + 1) * step; y++) {
            for (let x = gx * step; x < (gx + 1) * step; x++) {
              const idx = y * S + x;
              sl += (luma[idx] - meanL) / stdL;
              scr += cr[idx];
              scb += cb[idx];
            }
          }
          const area = step * step;
          features.push((sl / area) * 0.45, (scr / area) * 1.2, (scb / area) * 1.2);
        }
      }

      // 2) 4x4 grid of 4-bin Sobel edge orientations
      const E = 4;
      const eStep = S / E;
      for (let ey = 0; ey < E; ey++) {
        for (let ex = 0; ex < E; ex++) {
          const bins = [0, 0, 0, 0];
          for (let y = Math.max(1, ey * eStep); y < Math.min(S - 1, (ey + 1) * eStep); y++) {
            for (let x = Math.max(1, ex * eStep); x < Math.min(S - 1, (ex + 1) * eStep); x++) {
              const gx = luma[y * S + x + 1] - luma[y * S + x - 1];
              const gy = luma[(y + 1) * S + x] - luma[(y - 1) * S + x];
              const mag = Math.hypot(gx, gy) / stdL;
              if (mag < 0.08) continue;
              const angle = ((Math.atan2(gy, gx) * 180) / Math.PI + 180) % 180;
              bins[Math.floor(angle / 45) % 4] += mag;
            }
          }
          for (const b of bins) features.push(b * 0.12);
        }
      }

      // 3) Color histogram (rotation invariant)
      for (let i = 0; i < colorHist.length; i++) {
        features.push((colorHist[i] / (S * S)) * 2.2);
      }

      // L2-normalize vector
      let norm = 0;
      for (const v of features) norm += v * v;
      norm = Math.sqrt(norm) || 1;
      resolve(features.map((v) => v / norm));
    };
    img.src = src;
  });
}

/** Returns a 0..100 similarity percentage between two L2-normalized signatures. */
export function compareSignatures(a: number[], b: number[]): number {
  if (!a.length || a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  // Map cosine [-0.2 .. 1.0] smoothly into [0 .. 99]
  const pct = Math.round(Math.max(0, Math.min(0.99, (dot + 0.15) / 1.15)) * 100);
  return pct;
}
