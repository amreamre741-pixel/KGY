import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "ميزانية",
  description: "تطبيق شخصي لتسيير المصاريف اليومية، قفة الدار، الديون وأهداف الادخار",
  applicationName: "ميزانية",
  manifest: "/mizaniya.webmanifest",
  icons: {
    icon: "/mizaniya-icon.svg",
    apple: "/mizaniya-icon.svg",
  },
  appleWebApp: {
    capable: true,
    title: "ميزانية",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#0f766e",
  width: "device-width",
  initialScale: 1,
};

export default function MasroufLayout({ children }: { children: React.ReactNode }) {
  return (
    <div dir="rtl" lang="ar" style={{ margin: 0, padding: 0, width: "100%", height: "100dvh", overflow: "hidden" }}>
      {children}
    </div>
  );
}
