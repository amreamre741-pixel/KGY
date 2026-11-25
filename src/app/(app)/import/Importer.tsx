"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n/client";
import { IconAlert, IconCheck, IconDownload, IconInfo, IconSheet, IconUpload } from "@/components/icons";
import { importParts, type ImportResult, type ImportRow } from "./actions";

const FIELDS = [
  "reference",
  "nameAr",
  "nameEn",
  "brand",
  "barcode",
  "category",
  "purchasePrice",
  "salePrice",
  "quantity",
  "minQuantity",
  "location",
  "vehicles",
] as const;
type Field = (typeof FIELDS)[number];

/** Header names we recognise automatically (Arabic / French / English, Zinostoke-style exports). */
const SYNONYMS: Record<Field, string[]> = {
  reference: ["reference", "ref", "refe", "oem", "code", "codearticle", "partnumber", "المرجع", "مرجع", "الرمز", "الكود"],
  nameAr: ["الاسم", "اسم", "الاسمبالعربية", "التسمية", "nameAr", "designationarabe", "nomarabe"],
  nameEn: ["designation", "libelle", "name", "nom", "description", "article", "nameen", "produit", "الاسمبالإنجليزية", "الاسمبالفرنسية"],
  brand: ["marque", "brand", "fabricant", "manufacturer", "الماركة", "ماركة"],
  barcode: ["barcode", "codebarre", "codebarres", "codeabarre", "ean", "ean13", "الباركود"],
  category: ["categorie", "famille", "category", "family", "groupe", "الصنف", "النوع"],
  purchasePrice: ["prixachat", "prixdachat", "pa", "pachat", "purchaseprice", "cost", "costprice", "سعرالشراء"],
  salePrice: ["prixvente", "prixdevente", "pv", "pvente", "saleprice", "price", "prix", "prixttc", "سعرالبيع", "السعر"],
  quantity: ["quantite", "qte", "qty", "stock", "quantity", "stockactuel", "الكمية", "الكميه"],
  minQuantity: ["stockmin", "min", "minimum", "seuil", "stockalerte", "stockminimum", "minquantity", "الحدالأدنى", "الحدالادنى"],
  location: ["emplacement", "location", "rayon", "casier", "etagere", "البلاصة", "المكان", "الرف"],
  vehicles: ["vehicule", "vehicules", "compatibilite", "vehicles", "fits", "modele", "modeles", "المركبات", "السيارات", "تركبعلى"],
};

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s'’._\-()*:]/g, "");

function autoMap(headers: string[]): Record<Field, number> {
  const map = Object.fromEntries(FIELDS.map((f) => [f, -1])) as Record<Field, number>;
  const used = new Set<number>();
  // exact matches first, then "contains"
  for (const pass of ["exact", "contains"] as const) {
    for (const f of FIELDS) {
      if (map[f] !== -1) continue;
      const syn = SYNONYMS[f].map(norm);
      const idx = headers.findIndex((h, i) => {
        if (used.has(i)) return false;
        const parts = h.split("/").map(norm).filter(Boolean);
        return parts.some((p) => (pass === "exact" ? syn.includes(p) : syn.some((s) => s.length > 3 && p.includes(s))));
      });
      if (idx !== -1) {
        map[f] = idx;
        used.add(idx);
      }
    }
  }
  return map;
}

function cellText(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if ("result" in o) return cellText(o.result);
    if ("richText" in o && Array.isArray(o.richText)) return o.richText.map((r: { text: string }) => r.text).join("");
    if ("text" in o) return cellText(o.text);
    if ("error" in o) return "";
    return "";
  }
  return String(v).trim();
}

function parseCSV(text: string): string[][] {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const delim = [";", ",", "\t"].sort((a, b) => firstLine.split(b).length - firstLine.split(a).length)[0];
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delim) {
      row.push(cell.trim());
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell.trim());
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(cell.trim());
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c !== ""));
}

async function readFile(file: File): Promise<string[][]> {
  const name = file.name.toLowerCase();
  const buf = await file.arrayBuffer();
  if (name.endsWith(".csv") || name.endsWith(".txt")) {
    let text = new TextDecoder("utf-8").decode(buf);
    if (text.includes("\uFFFD")) text = new TextDecoder("windows-1252").decode(buf);
    return parseCSV(text.replace(/^\uFEFF/, ""));
  }
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const ws = wb.worksheets.find((w) => w.rowCount > 0) ?? wb.worksheets[0];
  const out: string[][] = [];
  ws?.eachRow({ includeEmpty: false }, (r) => {
    const values = r.values as unknown[]; // 1-based
    const cells: string[] = [];
    for (let i = 1; i < values.length; i++) cells.push(cellText(values[i]));
    if (cells.some((c) => c !== "")) out.push(cells);
  });
  return out;
}

async function downloadTemplate(lang: "ar" | "en") {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("KGY", { views: [{ rightToLeft: lang === "ar", state: "frozen", ySplit: 1 }] });
  ws.columns = [
    { header: "المرجع / Reference", key: "reference", width: 20 },
    { header: "الاسم / Nom arabe", key: "nameAr", width: 28 },
    { header: "Désignation / Name", key: "nameEn", width: 28 },
    { header: "الماركة / Marque", key: "brand", width: 14 },
    { header: "الصنف / Famille", key: "category", width: 16 },
    { header: "سعر الشراء / Prix achat", key: "purchasePrice", width: 16 },
    { header: "سعر البيع / Prix vente", key: "salePrice", width: 16 },
    { header: "الكمية / Quantité", key: "quantity", width: 12 },
    { header: "الحد الأدنى / Stock min", key: "minQuantity", width: 14 },
    { header: "البلاصة / Emplacement", key: "location", width: 14 },
    { header: "المركبات / Véhicules", key: "vehicles", width: 40 },
    { header: "الباركود / Code barre", key: "barcode", width: 18 },
  ];
  ws.addRow({
    reference: "0986494294",
    nameAr: "بلاكيت فرام قدام",
    nameEn: "Plaquettes de frein avant",
    brand: "Bosch",
    category: "فرامات",
    purchasePrice: 2800,
    salePrice: 3600,
    quantity: 12,
    minQuantity: 4,
    location: "A-3",
    vehicles: "Renault Symbol 2013-2020; Dacia Logan 2012-2020",
  });
  ws.addRow({
    reference: "A0004201220",
    nameAr: "بلاكيت فرام شاحنة",
    nameEn: "Plaquettes de frein camion",
    brand: "Mercedes",
    category: "فرامات",
    purchasePrice: 9500,
    salePrice: 12500,
    quantity: 6,
    minQuantity: 2,
    location: "T-1",
    vehicles: "Mercedes Actros 2003-2018",
  });
  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F2A44" } };
  header.height = 22;
  const blob = new Blob([await wb.xlsx.writeBuffer()], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "KGY-modele-stock.xlsx";
  a.click();
  URL.revokeObjectURL(a.href);
}

const CHUNK = 300;

export default function Importer({ stores, defaultStoreId }: { stores: { id: string; name: string }[]; defaultStoreId: string }) {
  const { t, lang } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [over, setOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [data, setData] = useState<string[][]>([]);
  const [map, setMap] = useState<Record<Field, number>>(() => autoMap([]));
  const [storeId, setStoreId] = useState(defaultStoreId);
  const [qtyMode, setQtyMode] = useState<"replace" | "add">("replace");
  const [progress, setProgress] = useState<number | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    try {
      if (file.name.toLowerCase().endsWith(".xls")) {
        setError(t.import.xlsHint);
        return;
      }
      const rows = await readFile(file);
      if (rows.length < 2) {
        setError(t.import.errEmpty);
        return;
      }
      const hdr = rows[0].map((h, i) => h || `#${i + 1}`);
      setFileName(file.name);
      setHeaders(hdr);
      setData(rows.slice(1));
      setMap(autoMap(hdr));
      setStep(2);
    } catch {
      setError(t.import.errFile);
    }
  };

  const mapped: ImportRow[] = useMemo(
    () =>
      data.map((r, i) => {
        const o: ImportRow = { _row: i + 2 };
        for (const f of FIELDS) if (map[f] >= 0) o[f] = r[map[f]] ?? "";
        return o;
      }),
    [data, map],
  );

  const canImport = map.reference >= 0 && (map.nameAr >= 0 || map.nameEn >= 0) && Boolean(storeId);

  const run = async () => {
    setStep(3);
    setProgress(0);
    const total: ImportResult = { created: 0, updated: 0, skipped: 0, errors: [] };
    try {
      for (let i = 0; i < mapped.length; i += CHUNK) {
        const r = await importParts(storeId, qtyMode, mapped.slice(i, i + CHUNK));
        total.created += r.created;
        total.updated += r.updated;
        total.skipped += r.skipped;
        total.errors.push(...r.errors);
        setProgress(Math.min(100, Math.round(((i + CHUNK) / mapped.length) * 100)));
      }
    } catch {
      total.errors.push({ row: 0, message: t.common.error });
    }
    setResult(total);
    setProgress(null);
  };

  const reset = () => {
    setStep(1);
    setResult(null);
    setHeaders([]);
    setData([]);
    setFileName("");
    if (inputRef.current) inputRef.current.value = "";
  };

  const steps = [t.import.step1, t.import.step2, t.import.step3];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t.import.title}</h1>
          <p className="sub">{t.import.subtitle}</p>
        </div>
        <div className="page-head-actions">
          <button className="btn btn-secondary" type="button" onClick={() => downloadTemplate(lang)} id="download-template">
            <IconDownload />
            {t.import.template}
          </button>
        </div>
      </div>

      <ol className="steps" style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {steps.map((s, i) => (
          <li key={s} className={`step ${step === i + 1 ? "is-current" : step > i + 1 ? "is-done" : ""}`}>
            <span className="step-n">{step > i + 1 ? <IconCheck width={14} /> : i + 1}</span>
            {s}
          </li>
        ))}
      </ol>

      {error && (
        <div className="alert alert-error" role="alert">
          <IconAlert />
          {error}
        </div>
      )}

      {step === 1 && (
        <div className="grid-main">
          <label
            className={`dropzone card ${over ? "is-over" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setOver(false);
              onFile(e.dataTransfer.files[0]);
            }}
          >
            <IconSheet />
            <strong style={{ color: "var(--navy-900)", fontSize: "1.05rem" }}>{t.import.choose}</strong>
            <span className="muted">{t.import.drop}</span>
            <span className="badge">{t.import.formats}</span>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.csv,.txt,.xls"
              className="sr-only"
              id="import-file"
              onChange={(e) => onFile(e.target.files?.[0])}
            />
          </label>
          <div className="card card-pad tips">
            <div className="tip">
              <IconInfo />
              <span>{t.import.zinostoke}</span>
            </div>
            <div className="tip">
              <IconInfo />
              <span>{t.import.paper}</span>
            </div>
            <div className="tip">
              <IconInfo />
              <span>{t.import.xlsHint}</span>
            </div>
            <div className="tip">
              <IconInfo />
              <span>{t.import.compatFormat}</span>
            </div>
          </div>
        </div>
      )}

      {step === 2 && (
        <>
          <section className="card">
            <div className="card-head">
              <div>
                <h2>{t.import.step2}</h2>
                <p className="hint">
                  <span className="mono">{fileName}</span> · <span className="num">{data.length}</span> {t.import.rows}
                </p>
              </div>
            </div>
            <div className="card-body stack">
              <div className="map-grid">
                {FIELDS.map((f) => {
                  const required = f === "reference" || f === "nameAr";
                  return (
                    <div className="field" key={f}>
                      <label className="label" htmlFor={`map-${f}`}>
                        {t.importFields[f]} {required && <span className="opt">({t.import.required})</span>}
                      </label>
                      <select
                        className="select"
                        id={`map-${f}`}
                        value={map[f]}
                        onChange={(e) => setMap((m) => ({ ...m, [f]: Number(e.target.value) }))}
                      >
                        <option value={-1}>{t.import.ignore}</option>
                        {headers.map((h, i) => (
                          <option key={i} value={i}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
              <div className="form-grid" style={{ borderTop: "1px solid var(--line)", paddingTop: 16 }}>
                <div className="field">
                  <label className="label" htmlFor="import-store">
                    {t.import.targetStore}
                  </label>
                  <select className="select" id="import-store" value={storeId} onChange={(e) => setStoreId(e.target.value)}>
                    {stores.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <span className="label">{t.import.qtyMode}</span>
                  <div className="segmented" role="radiogroup">
                    <label>
                      <input type="radio" name="qtyMode" checked={qtyMode === "replace"} onChange={() => setQtyMode("replace")} />
                      {t.import.qtyReplace}
                    </label>
                    <label>
                      <input type="radio" name="qtyMode" checked={qtyMode === "add"} onChange={() => setQtyMode("add")} />
                      {t.import.qtyAdd}
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="card">
            <div className="card-head">
              <h2>{t.import.preview}</h2>
              <span className="muted small">
                5 / <span className="num">{data.length}</span>
              </span>
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    {FIELDS.filter((f) => map[f] >= 0).map((f) => (
                      <th key={f}>{t.importFields[f]}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {mapped.slice(0, 5).map((r) => (
                    <tr key={r._row}>
                      {FIELDS.filter((f) => map[f] >= 0).map((f) => (
                        <td key={f} className={f === "reference" ? "ref" : ""}>
                          {r[f] || <span className="muted">—</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {!canImport && (
            <div className="alert alert-error">
              <IconAlert />
              {t.import.errMap}
            </div>
          )}
          <div className="form-actions">
            <button className="btn btn-ghost" type="button" onClick={reset}>
              {t.common.back}
            </button>
            <button className="btn btn-primary btn-lg" type="button" disabled={!canImport} onClick={run} id="run-import">
              <IconUpload />
              {t.import.run} (<span className="num">{data.length}</span>)
            </button>
          </div>
        </>
      )}

      {step === 3 && (
        <section className="card card-pad stack fade-in">
          {progress !== null ? (
            <>
              <h2>{t.import.running}</h2>
              <div style={{ height: 10, borderRadius: 99, background: "var(--navy-50)", overflow: "hidden" }}>
                <div
                  style={{
                    width: `${progress}%`,
                    height: "100%",
                    background: "linear-gradient(90deg, var(--orange-500), var(--orange-400))",
                    transition: "width .3s",
                  }}
                />
              </div>
              <span className="num muted">{progress}%</span>
            </>
          ) : result ? (
            <>
              <div className="row">
                <span className="empty-icon" style={{ background: "var(--ok-bg)", color: "var(--ok)", width: 48, height: 48 }}>
                  <IconCheck />
                </span>
                <h2>{t.import.done}</h2>
              </div>
              <div className="result-grid">
                <div className="card stat">
                  <div className="stat-label">{t.import.created}</div>
                  <div className="stat-value num" style={{ color: "var(--ok)" }}>
                    {result.created}
                  </div>
                </div>
                <div className="card stat">
                  <div className="stat-label">{t.import.updated}</div>
                  <div className="stat-value num">{result.updated}</div>
                </div>
                <div className="card stat">
                  <div className="stat-label">{t.import.skipped}</div>
                  <div className="stat-value num" style={{ color: "var(--muted)" }}>
                    {result.skipped}
                  </div>
                </div>
              </div>
              {result.errors.length > 0 && (
                <div className="alert alert-error" style={{ flexDirection: "column" }}>
                  <strong>
                    {t.import.errors} ({result.errors.length})
                  </strong>
                  <ul style={{ margin: 0, paddingInlineStart: 18 }}>
                    {result.errors.slice(0, 20).map((e, i) => (
                      <li key={i}>
                        {e.row > 0 && (
                          <>
                            {t.import.rowN} <span className="num">{e.row}</span>:{" "}
                          </>
                        )}
                        {e.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="row">
                <Link href="/parts" className="btn btn-primary">
                  {t.import.goParts}
                </Link>
                <button className="btn btn-secondary" type="button" onClick={reset}>
                  {t.import.again}
                </button>
              </div>
            </>
          ) : null}
        </section>
      )}
    </>
  );
}
