import "server-only";
import { randomInt } from "crypto";
import { db } from "./db";

/** EAN-13 check digit for the first 12 digits. */
function ean13Check(d12: string): number {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(d12[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - (sum % 10)) % 10;
}

/**
 * Generates a unique in-store EAN-13 (prefix 20–29 is reserved for internal use,
 * so it never clashes with real manufacturer barcodes).
 */
export async function generateBarcode(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    let d12 = "2" + String(randomInt(0, 10));
    for (let i = 0; i < 10; i++) d12 += String(randomInt(0, 10));
    const code = d12 + ean13Check(d12);
    const exists = await db.part.findUnique({ where: { barcode: code }, select: { id: true } });
    if (!exists) return code;
  }
  throw new Error("Could not generate a unique barcode");
}
