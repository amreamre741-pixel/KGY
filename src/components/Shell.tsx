"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTransition, type ReactNode } from "react";
import type { Role } from "@prisma/client";
import { useI18n } from "@/lib/i18n/client";
import { logout, setActiveStore, toggleLang } from "@/app/actions";
import {
  IconAlert,
  IconBoxIn,
  IconCart,
  IconChart,
  IconClipboard,
  IconCoins,
  IconGlobe,
  IconHome,
  IconLogout,
  IconParts,
  IconReceipt,
  IconStore,
  IconTransfer,
  IconTruck,
  IconUpload,
  IconUsers,
  IconWallet,
} from "./icons";

type Props = {
  user: { name: string; role: Role; storeName: string | null };
  perms: { import: boolean; stores: boolean; users: boolean };
  stores: { id: string; name: string }[];
  activeStoreId: string | null;
  children: ReactNode;
};

export default function Shell({ user, perms, stores, activeStoreId, children }: Props) {
  const { t } = useI18n();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  const links = [
    { href: "/", label: t.nav.home, icon: <IconHome />, show: true, mobile: true },
    { href: "/pos", label: t.nav.pos, icon: <IconCart />, show: true, mobile: true },
    { href: "/parts", label: t.nav.parts, icon: <IconParts />, show: true, mobile: true },
    { href: "/sales", label: t.nav.sales, icon: <IconReceipt />, show: true, mobile: true },
    { href: "/customers", label: t.nav.customers, icon: <IconWallet />, show: true, mobile: true },
    { href: "/alerts", label: t.nav.alerts, icon: <IconAlert />, show: true, mobile: false },
    { href: "/order-notes", label: t.nav.orderNotes, icon: <IconClipboard />, show: true, mobile: false },
    { href: "/reports", label: t.nav.reports, icon: <IconChart />, show: perms.import, mobile: false },
    { href: "/purchases", label: t.nav.purchases, icon: <IconBoxIn />, show: perms.import, mobile: false },
    { href: "/suppliers", label: t.nav.suppliers, icon: <IconTruck />, show: perms.import, mobile: false },
    { href: "/transfers", label: t.nav.transfers, icon: <IconTransfer />, show: perms.import, mobile: false },
    { href: "/zakat", label: t.nav.zakat, icon: <IconCoins />, show: perms.stores, mobile: false },
    { href: "/import", label: t.nav.import, icon: <IconUpload />, show: perms.import, mobile: false },
    { href: "/stores", label: t.nav.stores, icon: <IconStore />, show: perms.stores, mobile: false },
    { href: "/users", label: t.nav.users, icon: <IconUsers />, show: perms.users, mobile: false },
  ].filter((l) => l.show);

  const mobileLinks = links.filter((l) => l.mobile);
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  const storePicker =
    stores.length > 0 ? (
      <select
        className="select"
        aria-label={t.store.label}
        id="store-switcher"
        value={activeStoreId ?? "all"}
        disabled={pending}
        onChange={(e) => {
          const v = e.target.value;
          startTransition(() => setActiveStore(v));
        }}
      >
        <option value="all">{t.store.all}</option>
        {stores.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
    ) : null;

  const logo = (
    <div className="brand-logo">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.png" alt="KGY" />
    </div>
  );

  return (
    <div className="shell">
      <aside className="sidebar">
        <Link href="/" className="brand">
          {logo}
          <div>
            <div className="brand-name">KGY</div>
            <div className="brand-tag">{t.common.tagline}</div>
          </div>
        </Link>

        {storePicker ? (
          <div className="sidebar-section">
            <span className="sidebar-label">{t.store.label}</span>
            {storePicker}
          </div>
        ) : user.storeName ? (
          <div className="sidebar-section">
            <span className="sidebar-label">{t.store.label}</span>
            <span style={{ paddingInline: 8, color: "#fff", fontWeight: 600 }}>{user.storeName}</span>
          </div>
        ) : null}

        <nav className="nav" aria-label={t.nav.menu}>
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="nav-link" aria-current={isActive(l.href) ? "page" : undefined}>
              {l.icon}
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="sidebar-foot">
          <div className="user-chip">
            <div className="avatar">{user.name.trim().charAt(0).toUpperCase()}</div>
            <div>
              <div className="name">{user.name}</div>
              <div className="role">{t.roles[user.role]}</div>
            </div>
          </div>
          <div className="sidebar-actions">
            <form action={toggleLang}>
              <button className="side-btn" type="submit" id="lang-toggle">
                <IconGlobe />
                {t.nav.language}
              </button>
            </form>
            <form action={logout}>
              <button className="side-btn" type="submit" id="logout-btn">
                <IconLogout />
                {t.nav.logout}
              </button>
            </form>
          </div>
        </div>
      </aside>

      <header className="topbar">
        <Link href="/">{logo}</Link>
        {storePicker ?? <strong>{user.storeName ?? "KGY"}</strong>}
        <span className="topbar-spacer" />
        <Link href="/alerts" className="side-btn" aria-label={t.nav.alerts} title={t.nav.alerts}>
          <IconAlert />
        </Link>
        <Link href="/order-notes" className="side-btn" aria-label={t.nav.orderNotes} title={t.nav.orderNotes}>
          <IconClipboard />
        </Link>
        {perms.import && (
          <Link href="/reports" className="side-btn" aria-label={t.nav.reports} title={t.nav.reports}>
            <IconChart />
          </Link>
        )}
        {perms.stores && (
          <Link href="/stores" className="side-btn" aria-label={t.nav.stores} title={t.nav.stores}>
            <IconStore />
          </Link>
        )}
        {perms.users && (
          <Link href="/users" className="side-btn" aria-label={t.nav.users} title={t.nav.users}>
            <IconUsers />
          </Link>
        )}
        <form action={toggleLang}>
          <button className="side-btn" type="submit" aria-label={t.nav.language}>
            <IconGlobe />
          </button>
        </form>
        <form action={logout}>
          <button className="side-btn" type="submit" aria-label={t.nav.logout}>
            <IconLogout />
          </button>
        </form>
      </header>

      <main className="main">
        <div className="container">{children}</div>
      </main>

      <nav className="bottom-nav" aria-label={t.nav.menu}>
        {mobileLinks.map((l) => (
          <Link key={l.href} href={l.href} className="nav-link" aria-current={isActive(l.href) ? "page" : undefined}>
            {l.icon}
            {l.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
