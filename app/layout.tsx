import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import AppShell from "@/components/AppShell";
import StoreProvider from "@/components/StoreProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Belanjaku — PIP Makassar", template: "%s · Belanjaku" },
  description: "Belanjaku — aplikasi pengelolaan belanja Politeknik Ilmu Pelayaran Makassar",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover", // agar area aman (notch & home bar) di iPhone terpakai dengan benar
  themeColor: "#f05a1a",
};

/** Terapkan tema tersimpan sebelum halaman tampil, agar tidak berkedip. */
const themeScript = `try{var t=localStorage.getItem('belanjaku-theme');if(t==='dark'||t==='light')document.documentElement.setAttribute('data-theme',t)}catch(e){}`;

/** Bricolage Grotesque (judul & angka besar) + Onest (teks) + JetBrains Mono (nomor dokumen) */
const FONTS =
  "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500..800&family=Onest:wght@400;500;600;700&family=JetBrains+Mono:wght@500&display=swap";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="id" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link rel="stylesheet" href={FONTS} />
      </head>
      <body>
        <StoreProvider>
          <AppShell>{children}</AppShell>
        </StoreProvider>
      </body>
    </html>
  );
}
