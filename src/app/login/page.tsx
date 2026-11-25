import type { Metadata } from "next";
import { getI18n } from "@/lib/i18n/server";
import { ensureInitialSetup } from "@/lib/bootstrap";
import { IconBarcode, IconSearch, IconStore, IconGlobe } from "@/components/icons";
import { toggleLang } from "../actions";
import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "دخول" };

export default async function LoginPage() {
  await ensureInitialSetup();
  const { t, lang } = await getI18n();
  const points =
    lang === "ar"
      ? [
          { icon: <IconSearch />, text: "لقى أي قطعة في ثواني: بالمرجع، الاسم ولا السيارة" },
          { icon: <IconBarcode />, text: "امسح الباركود بكاميرا التلفون" },
          { icon: <IconStore />, text: "كامل المحلات تاعك في بلاصة وحدة" },
        ]
      : [
          { icon: <IconSearch />, text: "Find any part in seconds: by reference, name or vehicle" },
          { icon: <IconBarcode />, text: "Scan barcodes with your phone camera" },
          { icon: <IconStore />, text: "All your stores in one place" },
        ];

  return (
    <main className="login">
      <section className="login-art" aria-hidden="true">
        <div className="brand" style={{ position: "relative", zIndex: 1 }}>
          <div className="brand-logo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="" />
          </div>
          <div>
            <div className="brand-name">KGY</div>
            <div className="brand-tag">{t.common.tagline}</div>
          </div>
        </div>
        <div style={{ position: "relative", zIndex: 1 }}>
          <h2>{lang === "ar" ? "المخزون تاعك، منظم وواضح." : "Your inventory, organized and clear."}</h2>
          <p>
            {lang === "ar"
              ? "تسيير السلعة، العمال والمحلات لقطع غيار السيارات والشاحنات."
              : "Stock, staff and stores management for car & truck spare parts."}
          </p>
        </div>
        <div className="login-points">
          {points.map((p) => (
            <div className="login-point" key={p.text}>
              <span>{p.icon}</span>
              {p.text}
            </div>
          ))}
        </div>
      </section>

      <section className="login-form-wrap">
        <div className="login-card fade-in">
          <div className="row spread">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="login-logo" src="/logo.png" alt="KGY" />
            <form action={toggleLang}>
              <button className="btn btn-ghost btn-sm" type="submit" id="login-lang">
                <IconGlobe />
                {t.nav.language}
              </button>
            </form>
          </div>
          <div>
            <h1>{t.login.title}</h1>
            <p className="muted">{t.login.subtitle}</p>
          </div>
          <LoginForm />
        </div>
      </section>
    </main>
  );
}
