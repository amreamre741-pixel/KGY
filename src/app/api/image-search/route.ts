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
 * AI Vision visual matching: when GEMINI_API_KEY is configured in .env,
 * compares the snapped/uploaded photo directly against photographed parts in the active store
 * (ignoring camera angle, lighting, and background) and returns ranked matches.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ aiUsed: false, detectedText: "", matchedIds: [], matches: [] });
  }

  try {
    const body = (await req.json()) as { imageUrl?: string };
    const m = String(body.imageUrl ?? "").match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (!m || m[2].length > 900_000) {
      return NextResponse.json({ aiUsed: false, detectedText: "", matchedIds: [], matches: [] });
    }

    const storeId = await getActiveStoreId(user);
    const storeParts = await db.part.findMany({
      where: {
        imageUrl: { not: "" },
        ...(storeId ? { stocks: { some: { storeId } } } : {}),
      },
      take: 30,
      orderBy: { updatedAt: "desc" },
      select: { id: true, nameAr: true, nameEn: true, reference: true, brand: true, imageUrl: true },
    });

    const geminiParts: Array<{ text: string } | { inline_data: { mime_type: string; data: string } }> = [
      {
        text: [
          "You are an expert auto spare-parts visual matcher.",
          "The FIRST image is the QUERY part photo taken by the user.",
          "The FOLLOWING images are CANDIDATE parts from the store inventory, each preceded by its ID.",
          "Compare the QUERY part visually against EVERY CANDIDATE part, IGNORING background, lighting, and camera angle/orientation.",
          "Only include candidates that are genuinely the SAME mechanical/auto part (even from a different angle or background). Do NOT match different part types just because they share a similar color or background.",
          "Also identify the query part name in Arabic/French and any visible reference/brand.",
          'Return JSON ONLY in this exact format: {"detectedText":"","reference":"","matches":[{"id":"<candidate_id>","score":95}]}',
          "Score must be an integer 70-100 for true matches. If no candidate is the same part, return an empty matches array [].",
          "QUERY PHOTO:",
        ].join("\n"),
      },
      { inline_data: { mime_type: m[1], data: m[2] } },
    ];

    let totalBytes = m[2].length;
    const validIds = new Set<string>();
    for (const p of storeParts) {
      const cm = p.imageUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
      if (!cm) continue;
      if (totalBytes + cm[2].length > 3_500_000) break;
      totalBytes += cm[2].length;
      validIds.add(p.id);
      geminiParts.push({ text: `CANDIDATE ID=${p.id} (${p.nameAr || p.nameEn || ""} ${p.reference || ""}):` });
      geminiParts.push({ inline_data: { mime_type: cm[1], data: cm[2] } });
    }

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: geminiParts }],
          generationConfig: { responseMimeType: "application/json", temperature: 0.1 },
        }),
      },
    );

    if (!res.ok) return NextResponse.json({ aiUsed: false, detectedText: "", matchedIds: [], matches: [] });
    const json = await res.json();
    const rawText = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
    const parsed = JSON.parse(rawText) as {
      detectedText?: string;
      reference?: string;
      matches?: Array<{ id?: string; score?: number }>;
    };

    const matchMap = new Map<string, number>();
    for (const item of parsed.matches ?? []) {
      const id = String(item.id ?? "");
      const score = Math.max(0, Math.min(100, Math.round(Number(item.score ?? 0))));
      if (id && validIds.has(id) && score >= 70) {
        matchMap.set(id, Math.max(matchMap.get(id) ?? 0, score));
      }
    }

    // Also match by detected reference number if visible on the part/box
    const ref = (parsed.reference ?? "").trim();
    if (ref) {
      const hits = await db.part.findMany({
        where: {
          AND: [partSearchWhere(ref), storeId ? { stocks: { some: { storeId } } } : {}],
        },
        select: { id: true },
        take: 5,
      });
      for (const h of hits) {
        matchMap.set(h.id, Math.max(matchMap.get(h.id) ?? 0, 96));
      }
    }

    const matches = [...matchMap.entries()]
      .map(([id, score]) => ({ id, score }))
      .sort((a, b) => b.score - a.score);

    return NextResponse.json({
      aiUsed: true,
      detectedText: [parsed.detectedText, ref].filter(Boolean).join(" · "),
      matchedIds: matches.map((x) => x.id),
      matches,
    });
  } catch {
    return NextResponse.json({ aiUsed: false, detectedText: "", matchedIds: [], matches: [] });
  }
}
