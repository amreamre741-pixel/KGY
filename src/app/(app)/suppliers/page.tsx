import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { can, requireUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { formatDA, formatInt } from "@/lib/format";
import FormDialog from "@/components/FormDialog";
import { IconBoxIn, IconPin, IconPlus, IconSearch, IconTruck } from "@/components/icons";
import { saveSupplier } from "./actions";

export const metadata: Metadata = { title: "الموردين" };

type SP = Promise<{ q?: string; debt?: string }>;

export default async function SuppliersPage({ searchParams }: { searchParams: SP }) {
  const user = await requireUser();
  if (!can.seeCost(user)) redirect("/");
  const { t, lang } = await getI18n();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 80);
  const debtOnly = sp.debt === "1";

  const where: Prisma.SupplierWhereInput = {
    active: true,
    ...(debtOnly ? { balance: { gt: 0 } } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { phone: { contains: q, mode: "insensitive" } },
            { address: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [agg, owedCount, suppliers] = await Promise.all([
    db.supplier.aggregate({ where: { active: true, balance: { gt: 0 } }, _sum: { balance: true } }),
    db.supplier.count({ where: { active: true, balance: { gt: 0 } } }),
    db.supplier.findMany({ where, orderBy: [{ balance: "desc" }, { name: "asc" }], take: 200 }),
  ]);

  const totalPayable = Number(agg._sum.balance ?? 0);

  const toggleDebtHref = (() => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (!debtOnly) p.set("debt", "1");
    return `/suppliers${p.size ? `?${p}` : ""}`;
  })();

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t.suppliers.title}</h1>
        </div>
        <div className="page-head-actions">
          <Link href="/purchases/new" className="btn btn-secondary">
            <IconBoxIn />
            {t.purchases.newBtn}
          </Link>
          <FormDialog
            title={t.suppliers.add}
            action={saveSupplier}
            triggerClass="btn btn-primary"
            triggerId="add-supplier-btn"
            trigger={
              <>
                <IconPlus />
                {t.suppliers.add}
              </>
            }
          >
            <div className="field">
              <label className="label" htmlFor="sn-new">
                {t.suppliers.name} *
              </label>
              <input className="input" id="sn-new" name="name" required />
            </div>
            <div className="form-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <div className="field">
                <label className="label" htmlFor="sp-new">
                  {t.suppliers.phone}
                </label>
                <input className="input num" id="sp-new" name="phone" dir="ltr" inputMode="tel" />
              </div>
              <div className="field">
                <label className="label" htmlFor="sa-new">
                  {t.suppliers.address}
                </label>
                <input className="input" id="sa-new" name="address" />
              </div>
            </div>
            <div className="field">
              <label className="label" htmlFor="sno-new">
                {t.partForm.notes}
              </label>
              <input className="input" id="sno-new" name="notes" />
            </div>
          </FormDialog>
        </div>
      </div>

      <section className="stats">
        <div className={`card stat ${totalPayable > 0 ? "is-alert" : ""}`}>
          <div className="stat-label">
            <IconTruck />
            {t.suppliers.totalPayable}
          </div>
          <div className="stat-value num">{formatDA(totalPayable, lang)}</div>
        </div>
        <div className="card stat">
          <div className="stat-label">{t.suppliers.creditorsCount}</div>
          <div className="stat-value num">{formatInt(owedCount)}</div>
        </div>
      </section>

      <div className="stack">
        <form className="toolbar" action="/suppliers" method="get">
          {debtOnly && <input type="hidden" name="debt" value="1" />}
          <div className="input-group">
            <IconSearch />
            <input className="input" type="search" name="q" defaultValue={q} placeholder={t.suppliers.name} />
          </div>
          <button className="btn btn-secondary" type="submit">
            {t.common.search}
          </button>
        </form>
        <div className="row">
          <Link href={toggleDebtHref} className={`btn btn-sm ${debtOnly ? "btn-navy" : "btn-secondary"}`}>
            {t.suppliers.creditorsOnly}
          </Link>
        </div>
      </div>

      {suppliers.length === 0 ? (
        <div className="card empty">
          <div className="empty-icon">
            <IconTruck />
          </div>
          <span>{t.suppliers.empty}</span>
        </div>
      ) : (
        <div className="card">
          <div className="table-wrap">
            <table className="table responsive">
              <thead>
                <tr>
                  <th>{t.suppliers.name}</th>
                  <th>{t.suppliers.phone}</th>
                  <th className="end">{t.suppliers.balance}</th>
                </tr>
              </thead>
              <tbody>
                {suppliers.map((s) => {
                  const bal = Number(s.balance);
                  return (
                    <tr key={s.id}>
                      <td className="cell-main">
                        <Link href={`/suppliers/${s.id}`} className="part-name">
                          {s.name}
                        </Link>
                        {s.address && (
                          <div className="part-sub">
                            <IconPin width={13} height={13} />
                            <span>{s.address}</span>
                          </div>
                        )}
                      </td>
                      <td data-label={t.suppliers.phone} className="num">
                        {s.phone || <span className="muted">—</span>}
                      </td>
                      <td className="end" data-label={t.suppliers.balance}>
                        {bal > 0 ? (
                          <span className="badge badge-low num" style={{ fontSize: "0.86rem" }}>
                            {formatDA(bal, lang)}
                          </span>
                        ) : (
                          <span className="badge badge-ok">{t.suppliers.clean}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
