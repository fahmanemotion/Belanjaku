"use client";

/**
 * Halaman masuk (login) — Supabase Auth, email + kata sandi.
 * Akun dibuat Administrator di modul Pengguna; akun pertama dibuat di dashboard Supabase (lihat README).
 */
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import Icon from "./Icon";
import Logo, { Wordmark } from "./Logo";
import { useStore } from "./StoreProvider";

/** Alur dokumen per peran, ditampilkan di panel kiri */
const ALUR = [
  { peran: "Operator Pengadaan", aksi: "Catat dokumen belanja" },
  { peran: "Operator Keuangan", aksi: "Centang & cairkan" },
  { peran: "Operator Pengesahan", aksi: "Centang & sahkan" },
  { peran: "PPK & PPSPM", aksi: "Pantau dokumen" },
  { peran: "Administrator", aksi: "Kelola pengguna & referensi" },
];

export default function Login() {
  const { masuk, toast } = useStore();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [sandi, setSandi] = useState("");
  const [lihat, setLihat] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const [sedang, setSedang] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => emailRef.current?.focus(), []);

  const kirim = async (e: FormEvent) => {
    e.preventDefault();
    if (sedang) return;
    if (!email.trim() || !sandi) {
      setGalat("Isi email dan kata sandi terlebih dahulu");
      return;
    }
    setSedang(true);
    const hasil = await masuk(email, sandi);
    setSedang(false);
    if (!hasil.ok) {
      setGalat(hasil.pesan);
      return;
    }
    toast(`Selamat datang, ${hasil.nama}`);
    router.replace("/dashboard");
  };

  return (
    <div className="login">
      <aside className="login-brand">
        <div className="login-logo">
          <Logo size={44} />
          <span>
            <Wordmark />
            <small>PIP Makassar</small>
          </span>
        </div>

        <div className="login-hero">
          <h1>Belanja tertib, dari pencatatan sampai pengesahan.</h1>
          <p>Dokumen belanja dicatat terpusat oleh bagian pengadaan, lalu direkap keuangan saat dicairkan dan disahkan. Setiap langkah tercatat di riwayat aktivitas.</p>
        </div>

        <ol className="login-alur" aria-label="Alur dokumen per peran">
          {ALUR.map((a, i) => (
            <li key={i}>
              <span>{i + 1}</span>
              <b>{a.peran}</b>
              <em>{a.aksi}</em>
            </li>
          ))}
        </ol>

        <p className="login-kaki">Politeknik Ilmu Pelayaran Makassar · Tahun Anggaran 2026</p>
      </aside>

      <main className="login-isi">
        <div className="login-kartu">
          <div className="login-logo login-logo-hp">
            <Logo size={40} />
            <span>
              <Wordmark />
              <small>PIP Makassar</small>
            </span>
          </div>

          <form className="login-form" onSubmit={kirim} noValidate>
            <h2>Masuk</h2>
            <p className="sub">Gunakan email kantor dan kata sandi Anda.</p>

            <label className="login-field">
              <span>Email</span>
              <input
                ref={emailRef}
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setGalat(null);
                }}
                placeholder="nama@pipmakassar.ac.id"
              />
            </label>

            <label className="login-field">
              <span>Kata sandi</span>
              <span className="login-sandi">
                <input
                  type={lihat ? "text" : "password"}
                  autoComplete="current-password"
                  value={sandi}
                  onChange={(e) => {
                    setSandi(e.target.value);
                    setGalat(null);
                  }}
                  placeholder="Kata sandi"
                />
                <button type="button" onClick={() => setLihat((v) => !v)} aria-label={lihat ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"} title={lihat ? "Sembunyikan" : "Tampilkan"}>
                  <Icon name={lihat ? "eyeOff" : "eye"} />
                </button>
              </span>
            </label>

            {galat && (
              <p className="login-galat" role="alert">
                <Icon name="info" />
                {galat}
              </p>
            )}

            <button type="submit" className="btn acc login-btn" disabled={sedang} aria-busy={sedang}>
              {sedang ? "Memeriksa…" : "Masuk"}
              {!sedang && <Icon name="send" />}
            </button>

            <p className="login-catatan">
              <Icon name="shield" />
              <span>Akun dibuat oleh Administrator. Lupa kata sandi? Minta Administrator mengatur ulang lewat modul Pengguna.</span>
            </p>
          </form>
        </div>
      </main>
    </div>
  );
}
