"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
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
  IconMenu,
  IconParts,
  IconReceipt,
  IconStore,
  IconTransfer,
  IconTruck,
  IconUpload,
  IconUsers,
  IconWallet,
  IconX,
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
  const [menuOpen, setMenuOpen] = useState(false);

  const links = [
    { href: "/", label: t.nav.home, icon: <IconHome />, show: true, mobile: true },
    { href: "/pos", label: t.nav.pos, icon: <IconCart />, show: true, mobile: true },
    { href: "/parts", label: t.nav.parts, icon: <IconParts />, show: true, mobile: true },
    { href: "/sales", label: t.nav.sales, icon: <IconReceipt />, show: true, mobile: true },
    { href: "/customers", label: t.nav.customers, icon: <IconWallet />, show: true, mobile: false },
    { href: "/alerts", label: t.nav.alerts, icon: <IconAlert />, show: true, mobile: false },
    { href: "/order-notes", label: t.nav.orderNotes, icon: <IconClipboard />, show: true, mobile: false },
    { href: "/reports", label: t.nav.reports, icon: <IconChart />, show: perms.import, mobile: false },
    { href: "/purchases", label: t.nav.purchases, icon: <IconBoxIn />, show: perms.import, mobile: false },
    { href: "/suppliers", label: t.nav.suppliers, icon: <IconTruck />, show: perms.import, mobile: false },
    { href: "/transfers", label: t.nav.transfers, icon: <IconTransfer />, show: perms.import, mobile: false },
    { href: "/audit", label: "جرد المخزون", icon: <IconClipboard />, show: perms.import, mobile: false },
    { href: "/zakat", label: t.nav.zakat, icon: <IconCoins />, show: perms.stores, mobile: false },
    { href: "/import", label: t.nav.import, icon: <IconUpload />, show: perms.import, mobile: false },
    { href: "/stores", label: t.nav.stores, icon: <IconStore />, show: perms.stores, mobile: false },
    { href: "/users", label: t.nav.users, icon: <IconUsers />, show: perms.users, mobile: false },
  ].filter((l) => l.show);

  const mobileLinks = links.filter((l) => l.mobile);
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  const selectedStoreId = activeStoreId ?? stores[0]?.id ?? "";

  const storePicker =
    stores.length > 0 ? (
      <select
        className="select store-select"
        aria-label={t.store.label}
        value={selectedStoreId}
        disabled={pending}
        onChange={(e) => {
          const v = e.target.value;
          startTransition(() => setActiveStore(v));
        }}
      >
        {stores.map((s) => (
          <option key={s.id} value={s.id}>
            🏪 {s.name}
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
            <span style={{ paddingInline: 8, color: "#fff", fontWeight: 600 }}>🏪 {user.storeName}</span>
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
        <div className="topbar-store">
          {storePicker ?? <strong className="topbar-store-name">🏪 {user.storeName ?? "KGY"}</strong>}
        </div>
        <button
          type="button"
          className="topbar-menu-btn"
          onClick={() => setMenuOpen(true)}
          aria-label={t.nav.menu}
        >
          <IconMenu />
          <span>{t.nav.menu}</span>
        </button>
      </header>

      {/* Store switcher quick tabs when Owner has multiple stores */}
      {stores.length > 1 && (
        <div className="mobile-store-tabs no-print">
          {stores.map((s) => {
            const active = s.id === selectedStoreId;
            return (
              <button
                key={s.id}
                type="button"
                disabled={pending}
                onClick={() => startTransition(() => setActiveStore(s.id))}
                className={`mobile-store-tab ${active ? "is-active" : ""}`}
              >
                <IconStore width={15} height={15} />
                <span>{s.name}</span>
              </button>
            );
          })}
        </div>
      )}

      {menuOpen && (
        <div className="mobile-drawer-backdrop" onClick={() => setMenuOpen(false)}>
          <div className="mobile-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="mobile-drawer-head">
              <div className="user-chip" style={{ padding: 0 }}>
                <div className="avatar">{user.name.trim().charAt(0).toUpperCase()}</div>
                <div>
                  <div className="name">{user.name}</div>
                  <div className="role">{t.roles[user.role]}</div>
                </div>
              </div>
              <button type="button" className="side-btn" style={{ width: "auto" }} onClick={() => setMenuOpen(false)}>
                <IconX />
              </button>
            </div>

            <nav className="mobile-drawer-nav">
              {links.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={() => setMenuOpen(false)}
                  className="nav-link"
                  aria-current={isActive(l.href) ? "page" : undefined}
                >
                  {l.icon}
                  {l.label}
                </Link>
              ))}
            </nav>

            <div className="sidebar-actions" style={{ marginTop: "auto", paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.1)" }}>
              <form action={toggleLang}>
                <button className="side-btn" type="submit">
                  <IconGlobe />
                  {t.nav.language}
                </button>
              </form>
              <form action={logout}>
                <button className="side-btn" type="submit">
                  <IconLogout />
                  {t.nav.logout}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

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
        <button type="button" className="nav-link" onClick={() => setMenuOpen(true)} style={{ border: 0, background: "transparent", cursor: "pointer" }}>
          <IconMenu />
          {t.nav.menu}
        </button>
      </nav>
    </div>
  );
}

