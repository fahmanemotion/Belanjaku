"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import GantiSandi from "./GantiSandi";
import Icon, { type IconName } from "./Icon";
import Login from "./Login";
import Logo, { Wordmark } from "./Logo";
import { useStore } from "./StoreProvider";
import { AKSES, modulDariPath, type Modul } from "@/lib/akses";
import { inisial } from "@/lib/format";

export const MODUL: { kode: Modul; href: string; label: string; icon: IconName }[] = [
  { kode: "dashboard", href: "/dashboard", label: "Dashboard", icon: "grid" },
  { kode: "pengadaan", href: "/pengadaan", label: "Pengadaan", icon: "box" },
  { kode: "belanja", href: "/belanja", label: "Belanja", icon: "cart" },
  { kode: "aktivitas", href: "/aktivitas", label: "Aktivitas", icon: "history" },
  { kode: "pencairan", href: "/pencairan", label: "Pencairan", icon: "wallet" },
  { kode: "pengesahan", href: "/pengesahan", label: "Pengesahan", icon: "stamp" },
  { kode: "referensi", href: "/referensi", label: "Referensi", icon: "book" },
  { kode: "pengguna", href: "/pengguna", label: "Pengguna", icon: "users" },
];

type Theme = "light" | "dark" | null;

function useTheme(): [Theme, (t: "light" | "dark") => void] {
  const [theme, setThemeState] = useState<Theme>(null);

  useEffect(() => {
    const t = document.documentElement.getAttribute("data-theme");
    setThemeState(t === "dark" || t === "light" ? t : null);
  }, []);

  const setTheme = (t: "light" | "dark") => {
    document.documentElement.setAttribute("data-theme", t);
    try {
      localStorage.setItem("belanjaku-theme", t);
    } catch {
      /* penyimpanan diblokir — abaikan */
    }
    setThemeState(t);
  };

  return [theme, setTheme];
}

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { siap, terkonfigurasi, sudahMasuk, memuat, bolehBuka, penggunaAktif, keluar, toast } = useStore();
  const [theme, setTheme] = useTheme();
  const [scrolled, setScrolled] = useState(false);

  // Beri bayangan halus pada navbar saat halaman sudah di-scroll
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Sesi belum terbaca → layar pembuka singkat; belum masuk → halaman login
  if (!terkonfigurasi) return <BelumTerkonfigurasi />;
  if (!siap || (sudahMasuk && memuat)) {
    return (
      <div className="pembuka" aria-busy="true" aria-label="Memuat Belanjaku">
        <Logo size={52} />
        {sudahMasuk && <span className="pembuka-teks">Memuat data…</span>}
      </div>
    );
  }
  if (!sudahMasuk) return <Login />;

  const aktif = (href: string) => pathname === href || pathname.startsWith(href + "/");
  // Menu hanya berisi modul yang boleh dibuka peran ini
  const menu = MODUL.filter((m) => bolehBuka(m.kode));
  const modulHalaman = modulDariPath(pathname);
  const ditolak = modulHalaman !== null && !bolehBuka(modulHalaman);

  const keluarAplikasi = async () => {
    await keluar();
    toast("Anda sudah keluar");
  };

  return (
    <div className="shell">
      <aside className="rail" aria-label="Menu samping">
        <div className="rail-group">
          <button
            type="button"
            className={`ibtn ${theme === "light" ? "on" : ""}`}
            onClick={() => setTheme("light")}
            title="Tema terang"
            aria-label="Tema terang"
          >
            <Icon name="sun" />
          </button>
          <button
            type="button"
            className={`ibtn ${theme === "dark" ? "on" : ""}`}
            onClick={() => setTheme("dark")}
            title="Tema gelap"
            aria-label="Tema gelap"
          >
            <Icon name="moon" />
          </button>
        </div>

        <nav className="rail-group grow" aria-label="Modul (ikon)">
          {menu.map((m) => (
            <Link key={m.href} href={m.href} className={`ibtn ${aktif(m.href) ? "on" : ""}`} title={m.label} aria-label={m.label}>
              <Icon name={m.icon} />
            </Link>
          ))}
        </nav>

        <div className="rail-group">
          <button type="button" className="ibtn" title="Bantuan" aria-label="Bantuan">
            <Icon name="help" />
          </button>
          <button type="button" className="ibtn" title="Keluar" aria-label="Keluar" onClick={keluarAplikasi}>
            <Icon name="logout" />
          </button>
        </div>
      </aside>

      <div className="konten">
        <header className={`top ${scrolled ? "scrolled" : ""}`}>
          <Link href="/dashboard" className="brand" aria-label="Belanjaku — beranda">
            <Logo />
            <span>
              <Wordmark />
              <small>PIP Makassar</small>
            </span>
          </Link>

          <div className="navwrap">
            <nav className="nav" aria-label="Modul">
              {menu.map((m) => (
                <Link key={m.href} href={m.href} className={aktif(m.href) ? "on" : ""} aria-current={aktif(m.href) ? "page" : undefined}>
                  {m.label}
                </Link>
              ))}
            </nav>
          </div>

          <div className="tools">
            <button type="button" className="ibtn" title="Notifikasi" aria-label="Notifikasi">
              <Icon name="bell" />
              <span className="dot" />
            </button>
            <button
              type="button"
              className="ibtn theme-mobile"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              title="Ganti tema"
              aria-label="Ganti tema"
            >
              <Icon name={theme === "dark" ? "sun" : "moon"} />
            </button>
          </div>

          <MenuAkun onKeluar={keluarAplikasi} />
        </header>

        <main key={pathname} className="view">
          {ditolak ? <AksesDitolak peran={penggunaAktif.peran} /> : children}
        </main>
      </div>

      {/* Navigasi bawah — hanya tampil di HP (≤767px) */}
      <nav className="bottomnav" aria-label="Menu utama">
        {menu.map((m) => (
          <Link key={m.href} href={m.href} className={aktif(m.href) ? "on" : ""} aria-current={aktif(m.href) ? "page" : undefined}>
            <span className="bi">
              <Icon name={m.icon} />
            </span>
            <span>{m.label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}

/** Akun yang sedang masuk: cukup avatar + nama; menu berisi peran, tugas, dan tombol keluar */
function MenuAkun({ onKeluar }: { onKeluar: () => void }) {
  const { penggunaAktif } = useStore();
  const [buka, setBuka] = useState(false);
  const [gantiSandi, setGantiSandi] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!buka) return;
    const klik = (e: MouseEvent) => !wrap.current?.contains(e.target as Node) && setBuka(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setBuka(false);
    document.addEventListener("mousedown", klik);
    window.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", klik);
      window.removeEventListener("keydown", esc);
    };
  }, [buka]);

  return (
    <div className="me-wrap" ref={wrap}>
      <button
        type="button"
        className={`me ${buka ? "buka" : ""}`}
        aria-haspopup="menu"
        aria-expanded={buka}
        aria-label={`Akun ${penggunaAktif.nama}, ${penggunaAktif.peran}`}
        title={`${penggunaAktif.nama} · ${penggunaAktif.peran}`}
        onClick={() => setBuka((b) => !b)}
      >
        <span className="av">{inisial(penggunaAktif.nama)}</span>
        <b className="me-nama">{penggunaAktif.nama}</b>
        <Icon name="chevron" className="me-chev" />
      </button>

      {buka && (
        <div className="menu-akun" role="menu" aria-label="Akun">
          <div className="menu-profil">
            <span className="av">{inisial(penggunaAktif.nama)}</span>
            <span>
              <b>{penggunaAktif.nama}</b>
              <small>{penggunaAktif.peran}</small>
            </span>
          </div>
          <dl className="menu-info">
            <div>
              <dt>Tugas</dt>
              <dd>{AKSES[penggunaAktif.peran]?.tugas}</dd>
            </div>
          </dl>
          <button
            type="button"
            role="menuitem"
            className="menu-sandi"
            onClick={() => {
              setBuka(false);
              setGantiSandi(true);
            }}
          >
            <Icon name="lock" />
            Ganti kata sandi
          </button>
          <button
            type="button"
            role="menuitem"
            className="menu-keluar"
            onClick={() => {
              setBuka(false);
              onKeluar();
            }}
          >
            <Icon name="logout" />
            Keluar / ganti akun
          </button>
        </div>
      )}
      {gantiSandi && <GantiSandi onClose={() => setGantiSandi(false)} />}
    </div>
  );
}

/** Ditampilkan bila variabel lingkungan Supabase belum diisi (.env.local / Vercel) */
function BelumTerkonfigurasi() {
  return (
    <div className="pembuka pembuka-galat" role="alert">
      <Logo size={52} />
      <h1>Belanjaku belum tersambung ke database</h1>
      <p>
        Isi <code>NEXT_PUBLIC_SUPABASE_URL</code> dan <code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> di file <code>.env.local</code> (komputer)
        atau di <b>Environment Variables</b> Vercel, lalu jalankan ulang / deploy ulang aplikasi.
      </p>
    </div>
  );
}

/** Ditampilkan bila peran membuka alamat modul yang tidak menjadi haknya */
function AksesDitolak({ peran }: { peran: string }) {
  return (
    <section className="panel akses-ditolak" role="alert">
      <span className="akses-ikon">
        <Icon name="lock" />
      </span>
      <h1>Halaman ini bukan untuk peran {peran}</h1>
      <p>Hubungi Administrator bila Anda memerlukan akses ke modul ini, atau kembali ke Dashboard.</p>
      <Link href="/dashboard" className="btn acc">
        <Icon name="grid" />
        Ke Dashboard
      </Link>
    </section>
  );
}
