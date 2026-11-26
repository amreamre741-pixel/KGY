import type { Metadata } from "next";
import Link from "next/link";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { formatDA, formatInt } from "@/lib/format";
import FormDialog from "@/components/FormDialog";
import { IconPin, IconPlus, IconSearch, IconWallet } from "@/components/icons";
import { saveCustomer } from "./actions";

export const metadata: Metadata = { title: "دفتر الكريدي" };

type SP = Promise<{ q?: string; debt?: string }>;

export default async function CustomersPage({ searchParams }: { searchParams: SP }) {
  await requireUser();
  const { t, lang } = await getI18n();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 80);
  const debtOnly = sp.debt === "1";

  const where: Prisma.CustomerWhereInput = {
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

  const [agg, debtorsCount, customers] = await Promise.all([
    db.customer.aggregate({ where: { active: true, balance: { gt: 0 } }, _sum: { balance: true } }),
    db.customer.count({ where: { active: true, balance: { gt: 0 } } }),
    db.customer.findMany({ where, orderBy: [{ balance: "desc" }, { name: "asc" }], take: 200 }),
  ]);

  const totalDebt = Number(agg._sum.balance ?? 0);

  const toggleDebtHref = (() => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (!debtOnly) p.set("debt", "1");
    return `/customers${p.size ? `?${p}` : ""}`;
  })();

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t.customers.title}</h1>
        </div>
        <div className="page-head-actions">
          <FormDialog
            title={t.customers.add}
            action={saveCustomer}
            triggerClass="btn btn-primary"
            triggerId="add-customer-btn"
            trigger={
              <>
                <IconPlus />
                {t.customers.add}
              </>
            }
          >
            <div className="field">
              <label className="label" htmlFor="cn-new">
                {t.customers.name} *
              </label>
              <input className="input" id="cn-new" name="name" required />
            </div>
            <div className="form-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <div className="field">
                <label className="label" htmlFor="cp-new">
                  {t.customers.phone}
                </label>
                <input className="input num" id="cp-new" name="phone" dir="ltr" inputMode="tel" />
              </div>
              <div className="field">
                <label className="label" htmlFor="ca-new">
                  {t.customers.address}
                </label>
                <input className="input" id="ca-new" name="address" />
              </div>
            </div>
            <div className="field">
              <label className="label" htmlFor="cno-new">
                {t.partForm.notes}
              </label>
              <input className="input" id="cno-new" name="notes" />
            </div>
          </FormDialog>
        </div>
      </div>

      <section className="stats">
        <div className={`card stat ${totalDebt > 0 ? "is-alert" : ""}`}>
          <div className="stat-label">
            <IconWallet />
            {t.customers.totalReceivable}
          </div>
          <div className="stat-value num">{formatDA(totalDebt, lang)}</div>
        </div>
        <div className="card stat">
          <div className="stat-label">{t.customers.debtorsCount}</div>
          <div className="stat-value num">{formatInt(debtorsCount)}</div>
        </div>
      </section>

      <div className="stack">
        <form className="toolbar" action="/customers" method="get">
          {debtOnly && <input type="hidden" name="debt" value="1" />}
          <div className="input-group">
            <IconSearch />
            <input className="input" type="search" name="q" defaultValue={q} placeholder={t.customers.name} />
          </div>
          <button className="btn btn-secondary" type="submit">
            {t.common.search}
          </button>
        </form>
        <div className="row">
          <Link href={toggleDebtHref} className={`btn btn-sm ${debtOnly ? "btn-navy" : "btn-secondary"}`}>
            {t.customers.debtorsOnly}
          </Link>
        </div>
      </div>

      {customers.length === 0 ? (
        <div className="card empty">
          <div className="empty-icon">
            <IconWallet />
          </div>
          <span>{t.customers.empty}</span>
        </div>
      ) : (
        <div className="card">
          <div className="table-wrap">
            <table className="table responsive">
              <thead>
                <tr>
                  <th>{t.customers.name}</th>
                  <th>{t.customers.phone}</th>
                  <th className="end">{t.customers.balance}</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => {
                  const bal = Number(c.balance);
                  return (
                    <tr key={c.id}>
                      <td className="cell-main">
                        <Link href={`/customers/${c.id}`} className="part-name">
                          {c.name}
                        </Link>
                        {c.address && (
                          <div className="part-sub">
                            <IconPin width={13} height={13} />
                            <span>{c.address}</span>
                          </div>
                        )}
                      </td>
                      <td data-label={t.customers.phone} className="num">
                        {c.phone || <span className="muted">—</span>}
                      </td>
                      <td className="end" data-label={t.customers.balance}>
                        {bal > 0 ? (
                          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                            <span className="badge badge-low num" style={{ fontSize: "0.86rem" }}>
                              {formatDA(bal, lang)}
                            </span>
                            {(() => {
                              const digits = (c.phone || "").replace(/\D/g, "");
                              const intlPhone = digits.startsWith("0") ? `213${digits.slice(1)}` : digits;
                              const msg = `السلام عليكم أخي ${c.name}، نذكركم بلطف بالرصيد المتبقي لديكم لدى محل KGY لقطع الغيار بقيمة ${formatDA(bal, lang)}. شكراً لتعاملكم معنا.`;
                              const waUrl = `https://wa.me/${intlPhone}?text=${encodeURIComponent(msg)}`;
                              return (
                                <a
                                  href={waUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="btn btn-sm btn-secondary"
                                  title="إرسال تذكير بالكريدي عبر واتساب"
                                >
                                  📲 واتساب
                                </a>
                              );
                            })()}
                          </div>
                        ) : (
                          <span className="badge badge-ok">{t.customers.clean}</span>
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
