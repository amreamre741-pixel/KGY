import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import FormDialog from "@/components/FormDialog";
import { IconEdit, IconPin, IconPlus, IconStore } from "@/components/icons";
import { saveStore } from "../admin-actions";

export const metadata: Metadata = { title: "المحلات" };

export default async function StoresPage() {
  await requireRole("OWNER");
  const { t } = await getI18n();
  const stores = await db.store.findMany({
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { users: true, stocks: { where: { quantity: { gt: 0 } } } } } },
  });

  const fields = (s?: (typeof stores)[number]) => (
    <>
      {s && <input type="hidden" name="id" value={s.id} />}
      <div className="field">
        <label className="label" htmlFor={`sn-${s?.id ?? "new"}`}>
          {t.stores.name} *
        </label>
        <input className="input" id={`sn-${s?.id ?? "new"}`} name="name" defaultValue={s?.name} required />
      </div>
      <div className="field">
        <label className="label" htmlFor={`sa-${s?.id ?? "new"}`}>
          {t.stores.address}
        </label>
        <input className="input" id={`sa-${s?.id ?? "new"}`} name="address" defaultValue={s?.address} />
      </div>
      <div className="field">
        <label className="label" htmlFor={`sp-${s?.id ?? "new"}`}>
          {t.stores.phone}
        </label>
        <input className="input num" id={`sp-${s?.id ?? "new"}`} name="phone" defaultValue={s?.phone} inputMode="tel" dir="ltr" />
      </div>
      {s && (
        <label className="checkbox">
          <input type="checkbox" name="active" defaultChecked={s.active} />
          {t.common.active}
        </label>
      )}
    </>
  );

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t.stores.title}</h1>
        </div>
        <div className="page-head-actions">
          <FormDialog
            title={t.stores.add}
            action={saveStore}
            triggerClass="btn btn-primary"
            triggerId="add-store"
            trigger={
              <>
                <IconPlus />
                {t.stores.add}
              </>
            }
          >
            {fields()}
          </FormDialog>
        </div>
      </div>

      {stores.length === 0 ? (
        <div className="card empty">
          <div className="empty-icon">
            <IconStore />
          </div>
          <span>{t.stores.empty}</span>
        </div>
      ) : (
        <div className="stats" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
          {stores.map((s) => (
            <article className="card card-pad stack" key={s.id} style={{ gap: 12, opacity: s.active ? 1 : 0.6 }}>
              <div className="row spread" style={{ flexWrap: "nowrap" }}>
                <div className="row" style={{ flexWrap: "nowrap" }}>
                  <span className="empty-icon" style={{ width: 44, height: 44, borderRadius: 12 }}>
                    <IconStore width={22} height={22} />
                  </span>
                  <div>
                    <h2>{s.name}</h2>
                    {!s.active && <span className="badge badge-out">{t.common.inactive}</span>}
                  </div>
                </div>
                <FormDialog
                  title={t.common.edit}
                  action={saveStore}
                  triggerClass="btn btn-ghost btn-icon btn-sm"
                  trigger={<IconEdit />}
                >
                  {fields(s)}
                </FormDialog>
              </div>
              {(s.address || s.phone) && (
                <div className="part-sub">
                  {s.address && (
                    <span className="chip">
                      <IconPin />
                      {s.address}
                    </span>
                  )}
                  {s.phone && <span className="chip num">{s.phone}</span>}
                </div>
              )}
              <div className="row" style={{ gap: 18 }}>
                <span className="muted small">
                  {t.stores.users}: <strong className="num">{s._count.users}</strong>
                </span>
                <span className="muted small">
                  {t.stores.parts}: <strong className="num">{s._count.stocks}</strong>
                </span>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
