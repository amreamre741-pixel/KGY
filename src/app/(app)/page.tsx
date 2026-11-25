import Link from "next/link";
import { can, getActiveStoreId, requireUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n/server";
import { homeStats, lowStockList, outOfStockList, recentMovements } from "@/lib/parts";
import { formatDA, formatDateTime, formatInt, partName } from "@/lib/format";
import SearchBar from "@/components/SearchBar";
import {
  IconAlert,
  IconBoxIn,
  IconCart,
  IconChart,
  IconCheck,
  IconClipboard,
  IconCoins,
  IconHistory,
  IconLayers,
  IconParts,
  IconPlus,
  IconStore,
  IconTransfer,
  IconTruck,
  IconUpload,
  IconWallet,
} from "@/components/icons";

import { db } from "@/lib/db";

export default async function HomePage() {
  const user = await requireUser();
  const { t, lang } = await getI18n();
  const storeId = await getActiveStoreId(user);
  const showCost = can.seeCost(user);

  const [stats, outList, low, recent, currentStore] = await Promise.all([
    homeStats(storeId),
    outOfStockList(storeId, 8),
    lowStockList(storeId, 8),
    recentMovements(storeId),
    storeId ? db.store.findUnique({ where: { id: storeId }, select: { name: true } }) : Promise.resolve(null),
  ]);

  return (
    <>
      <section className="hero fade-in">
        <div className="row spread" style={{ marginBottom: 4 }}>
          <p className="greet" style={{ margin: 0 }}>
            {t.home.greeting}، {user.name} 👋
          </p>
          {currentStore && (
            <span
              className="badge"
              style={{
                background: "rgba(242, 107, 29, 0.22)",
                color: "#fff",
                border: "1px solid rgba(242, 107, 29, 0.45)",
                padding: "4px 10px",
                fontSize: "0.82rem",
              }}
            >
              <IconStore width={14} height={14} />
              {currentStore.name}
            </span>
          )}
        </div>
        <h1>{t.home.searchTitle}</h1>
        <SearchBar variant="hero" />
      </section>

      <section className="stats" aria-label="stats">
        <div className="card stat">
          <div className="stat-label">
            <IconParts />
            {t.home.statParts}
          </div>
          <div className="stat-value num">{formatInt(stats.partCount)}</div>
        </div>
        <div className="card stat">
          <div className="stat-label">
            <IconLayers />
            {t.home.statUnits}
          </div>
          <div className="stat-value num">{formatInt(stats.units)}</div>
        </div>
        {showCost && (
          <>
            <div className="card stat">
              <div className="stat-label">
                <IconCoins />
                {t.home.statValue}
              </div>
              <div className="stat-value num">{formatDA(stats.value, lang)}</div>
            </div>
            <div className="card stat">
              <div className="stat-label">
                <IconCoins />
                {t.home.statSaleValue}
              </div>
              <div className="stat-value num" style={{ color: "var(--ok)" }}>
                {formatDA(stats.saleValue, lang)}
              </div>
            </div>
          </>
        )}
        <Link href="/alerts?tab=out" className={`card stat ${stats.outCount ? "is-alert" : ""}`}>
          <div className="stat-label">
            <IconAlert />
            {t.home.statOut}
          </div>
          <div className="stat-value num" style={stats.outCount ? { color: "var(--danger)" } : undefined}>
            {formatInt(stats.outCount)}
          </div>
        </Link>
        <Link href="/alerts?tab=low" className={`card stat ${stats.lowCount ? "is-alert" : ""}`}>
          <div className="stat-label">
            <IconAlert />
            {t.home.statLow}
          </div>
          <div className="stat-value num">{formatInt(stats.lowCount)}</div>
        </Link>
      </section>

      <div className="row">
        <Link href="/pos" className="btn btn-primary" id="home-pos">
          <IconCart />
          {t.nav.pos}
        </Link>
        <Link href="/order-notes" className="btn btn-navy" id="home-order-notes">
          <IconClipboard />
          {t.nav.orderNotes}
          {stats.pendingOrders > 0 && (
            <span className="badge badge-orange num" style={{ marginInlineStart: 4 }}>
              {stats.pendingOrders}
            </span>
          )}
        </Link>
        <Link href="/alerts" className="btn btn-secondary" id="home-alerts">
          <IconAlert />
          {t.nav.alerts}
        </Link>
        <Link href="/customers" className="btn btn-secondary" id="home-customers">
          <IconWallet />
          {t.nav.customers}
        </Link>
        {showCost && (
          <Link href="/reports" className="btn btn-secondary" id="home-reports">
            <IconChart />
            {t.home.reportsBtn}
          </Link>
        )}
        {user.role === "OWNER" && (
          <Link href="/zakat" className="btn btn-secondary" id="home-zakat">
            <IconCoins />
            {t.home.zakatBtn}
          </Link>
        )}
        {can.editParts(user) && (
          <>
            <Link href="/purchases/new" className="btn btn-secondary" id="home-new-purchase">
              <IconBoxIn />
              {t.purchases.newBtn}
            </Link>
            <Link href="/suppliers" className="btn btn-secondary" id="home-suppliers">
              <IconTruck />
              {t.nav.suppliers}
            </Link>
            <Link href="/transfers/new" className="btn btn-secondary" id="home-transfer">
              <IconTransfer />
              {t.nav.transfers}
            </Link>
            <Link href="/parts/new" className="btn btn-navy" id="home-new-part">
              <IconPlus />
              {t.home.newPart}
            </Link>
          </>
        )}
        {can.importData(user) && (
          <Link href="/import" className="btn btn-secondary" id="home-import">
            <IconUpload />
            {t.home.importExcel}
          </Link>
        )}
      </div>

      {/* Out of stock & Running low side-by-side */}
      <div className="report-split">
        <section className="card">
          <div className="card-head">
            <div className="row" style={{ gap: 8 }}>
              <IconAlert style={{ width: 18, height: 18, color: "var(--danger)" }} />
              <h2>{t.home.outTitle}</h2>
            </div>
            <Link href="/alerts?tab=out" className="btn btn-ghost btn-sm">
              {t.home.viewAll}
            </Link>
          </div>
          {outList.length === 0 ? (
            <div className="empty">
              <div className="empty-icon" style={{ background: "var(--ok-bg)", color: "var(--ok)" }}>
                <IconCheck />
              </div>
              <span>{t.home.outEmpty}</span>
            </div>
          ) : (
            <div className="list">
              {outList.map((s) => (
                <Link key={s.id} href={`/parts/${s.part.id}`} className="list-item">
                  <div className="grow">
                    <div className="title">{partName(s.part, lang)}</div>
                    <div className="part-sub">
                      <span className="ref">{s.part.reference}</span>
                      {s.part.dimensions && <span dir="ltr">· {s.part.dimensions}</span>}
                      <span className="badge badge-out">
                        <IconStore width={12} height={12} /> {s.store.name}
                      </span>
                    </div>
                  </div>
                  <span className="badge badge-out num">0</span>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="card">
          <div className="card-head">
            <div className="row" style={{ gap: 8 }}>
              <IconAlert style={{ width: 18, height: 18, color: "var(--warn)" }} />
              <h2>{t.home.lowTitle}</h2>
            </div>
            <Link href="/alerts?tab=low" className="btn btn-ghost btn-sm">
              {t.home.viewAll}
            </Link>
          </div>
          {low.length === 0 ? (
            <div className="empty">
              <div className="empty-icon" style={{ background: "var(--ok-bg)", color: "var(--ok)" }}>
                <IconCheck />
              </div>
              <span>{t.home.lowEmpty}</span>
            </div>
          ) : (
            <div className="list">
              {low.map((s) => (
                <Link key={s.id} href={`/parts/${s.part.id}`} className="list-item">
                  <div className="grow">
                    <div className="title">{partName(s.part, lang)}</div>
                    <div className="part-sub">
                      <span className="ref">{s.part.reference}</span>
                      {s.part.dimensions && <span dir="ltr">· {s.part.dimensions}</span>}
                      <span className="badge badge-low">
                        <IconStore width={12} height={12} /> {s.store.name}
                      </span>
                    </div>
                  </div>
                  <span className="badge badge-low num">
                    {s.quantity} / {s.minQuantity}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Recent movements */}
      <section className="card">
        <div className="card-head">
          <h2>{t.home.recentTitle}</h2>
        </div>
        {recent.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">
              <IconHistory />
            </div>
            <span>{t.home.recentEmpty}</span>
          </div>
        ) : (
          <div className="list">
            {recent.map((m) => (
              <Link key={m.id} href={`/parts/${m.part.id}`} className="list-item">
                <span
                  className={`mv-icon num ${m.type === "ADJUST" ? "mv-adj" : m.quantity >= 0 ? "mv-in" : "mv-out"}`}
                >
                  {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                </span>
                <div className="grow">
                  <div className="title">{partName(m.part, lang)}</div>
                  <div className="part-sub">
                    <span>{t.movement[m.type]}</span>
                    {!storeId && <span>· {m.store.name}</span>}
                    <span>· {formatDateTime(m.createdAt, lang)}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
