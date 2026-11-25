import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import FormDialog from "@/components/FormDialog";
import { IconEdit, IconPlus } from "@/components/icons";
import { saveUser } from "../admin-actions";

export const metadata: Metadata = { title: "العمال" };

export default async function UsersPage() {
  const me = await requireRole("OWNER");
  const { t } = await getI18n();
  const [users, stores] = await Promise.all([
    db.user.findMany({ orderBy: [{ role: "asc" }, { name: "asc" }], include: { store: { select: { name: true } } } }),
    db.store.findMany({ where: { active: true }, orderBy: { createdAt: "asc" }, select: { id: true, name: true } }),
  ]);

  const fields = (u?: (typeof users)[number]) => {
    const k = u?.id ?? "new";
    return (
      <>
        {u && <input type="hidden" name="id" value={u.id} />}
        <div className="field">
          <label className="label" htmlFor={`un-${k}`}>
            {t.users.name} *
          </label>
          <input className="input" id={`un-${k}`} name="name" defaultValue={u?.name} required />
        </div>
        <div className="form-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <div className="field">
            <label className="label" htmlFor={`uu-${k}`}>
              {t.users.username} *
            </label>
            <input
              className="input"
              id={`uu-${k}`}
              name="username"
              defaultValue={u?.username}
              required
              dir="ltr"
              autoCapitalize="none"
              pattern="[a-zA-Z0-9._\-]{3,40}"
            />
            <span className="hint">a-z 0-9 . _ -</span>
          </div>
          <div className="field">
            <label className="label" htmlFor={`up-${k}`}>
              {t.users.password} {u ? "" : "*"}
            </label>
            <input
              className="input"
              id={`up-${k}`}
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={6}
              required={!u}
              dir="ltr"
            />
            {u && <span className="hint">{t.users.passwordKeep}</span>}
          </div>
        </div>
        <div className="form-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <div className="field">
            <label className="label" htmlFor={`ur-${k}`}>
              {t.users.role}
            </label>
            <select className="select" id={`ur-${k}`} name="role" defaultValue={u?.role ?? "SELLER"}>
              <option value="SELLER">{t.roles.SELLER}</option>
              <option value="MANAGER">{t.roles.MANAGER}</option>
              <option value="OWNER">{t.roles.OWNER}</option>
            </select>
          </div>
          <div className="field">
            <label className="label" htmlFor={`us-${k}`}>
              {t.users.store}
            </label>
            <select className="select" id={`us-${k}`} name="storeId" defaultValue={u?.storeId ?? stores[0]?.id ?? ""}>
              <option value="">{t.store.none}</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        {u && (
          <label className="checkbox">
            <input type="checkbox" name="active" defaultChecked={u.active} />
            {t.common.active}
          </label>
        )}
      </>
    );
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t.users.title}</h1>
        </div>
        <div className="page-head-actions">
          <FormDialog
            title={t.users.add}
            action={saveUser}
            triggerClass="btn btn-primary"
            triggerId="add-user"
            trigger={
              <>
                <IconPlus />
                {t.users.add}
              </>
            }
          >
            {fields()}
          </FormDialog>
        </div>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table className="table responsive">
            <thead>
              <tr>
                <th>{t.users.name}</th>
                <th>{t.users.role}</th>
                <th>{t.users.store}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} style={{ opacity: u.active ? 1 : 0.55 }}>
                  <td className="cell-main">
                    <div className="row" style={{ flexWrap: "nowrap" }}>
                      <span className="avatar">{u.name.trim().charAt(0).toUpperCase()}</span>
                      <div>
                        <div className="part-name">
                          {u.name}
                          {u.id === me.id && <span className="muted small"> ({t.users.you})</span>}
                        </div>
                        <div className="part-sub">
                          <span className="mono">@{u.username}</span>
                          {!u.active && <span className="badge badge-out">{t.common.inactive}</span>}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td data-label={t.users.role}>
                    <span className={`badge ${u.role === "OWNER" ? "badge-orange" : ""}`}>{t.roles[u.role]}</span>
                  </td>
                  <td data-label={t.users.store}>{u.store?.name ?? <span className="muted">—</span>}</td>
                  <td className="end" data-label="">
                    <FormDialog
                      title={t.common.edit}
                      action={saveUser}
                      triggerClass="btn btn-ghost btn-icon btn-sm"
                      trigger={<IconEdit />}
                    >
                      {fields(u)}
                    </FormDialog>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
