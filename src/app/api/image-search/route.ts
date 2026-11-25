import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getActiveStoreId, getCurrentUser } from "@/lib/auth";
import { getLang } from "@/lib/i18n/server";
import { partName } from "@/lib/format";
import { partSearchWhere } from "@/lib/parts";

/** Returns photographed parts in inventory so the client can compute visual similarity. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const lang = await getLang();
  const storeId = await getActiveStoreId(user);

  const parts = await db.part.findMany({
    where: {
      imageUrl: { not: "" },
      ...(storeId ? { stocks: { some: { storeId } } } : {}),
    },
    take: 500,
    orderBy: { updatedAt: "desc" },
    include: {
      stocks: {
        where: { store: { active: true }, ...(storeId ? { storeId } : {}) },
        select: { quantity: true, location: true },
      },
    },
  });

  return NextResponse.json({
    parts: parts.map((p) => ({
      id: p.id,
      name: partName(p, lang),
      reference: p.reference,
      brand: p.brand,
      salePrice: Number(p.salePrice),
      quantity: p.stocks.reduce((a, s) => a + s.quantity, 0),
      location: storeId ? (p.stocks[0]?.location ?? "") : "",
      imageUrl: p.imageUrl,
    })),
  });
}

/**
 * Optional AI Vision / OCR search: when GEMINI_API_KEY is configured in .env,
 * reads OEM part numbers, brand, and part category from a snapped/WhatsApp photo.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ aiUsed: false, detectedText: "", matchedIds: [] });
  }

  try {
    const body = (await req.json()) as { imageUrl?: string };
    const m = String(body.imageUrl ?? "").match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (!m || m[2].length > 900_000) {
      return NextResponse.json({ aiUsed: false, detectedText: "", matchedIds: [] });
    }

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: 'Extract spare-part identifiers from this image as JSON ONLY: {"reference":"","brand":"","partTypeEn":"","partTypeAr":""}. If a field is not visible, leave it "".',
                },
                { inline_data: { mime_type: m[1], data: m[2] } },
              ],
            },
          ],
          generationConfig: { responseMimeType: "application/json" },
        }),
      },
    );

    if (!res.ok) return NextResponse.json({ aiUsed: false, detectedText: "", matchedIds: [] });
    const json = await res.json();
    const rawText = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
    const parsed = JSON.parse(rawText) as {
      reference?: string;
      brand?: string;
      partTypeEn?: string;
      partTypeAr?: string;
    };

    const queries = [parsed.reference, parsed.brand, parsed.partTypeAr, parsed.partTypeEn]
      .map((s) => (s ?? "").trim())
      .filter(Boolean);

    const matchedIds = new Set<string>();
    for (const q of queries) {
      const hits = await db.part.findMany({ where: partSearchWhere(q), select: { id: true }, take: 10 });
      for (const h of hits) matchedIds.add(h.id);
    }

    return NextResponse.json({
      aiUsed: true,
      detectedText: queries.join(" · "),
      matchedIds: [...matchedIds],
    });
  } catch {
    return NextResponse.json({ aiUsed: false, detectedText: "", matchedIds: [] });
  }
}
