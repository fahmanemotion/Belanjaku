"use client";

/**
 * Halaman masuk (login).
 * Prototipe: akun diambil dari modul Pengguna dan semua memakai kata sandi demo (lib/akses.ts).
 * Klik salah satu akun demo untuk mengisi form, lalu tekan Masuk — cara cepat berpindah peran.
 */
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import Icon from "./Icon";
import Logo, { Wordmark } from "./Logo";
import { useStore } from "./StoreProvider";
import { AKSES, SANDI_DEMO } from "@/lib/akses";
import { inisial } from "@/lib/format";

/** Alur dokumen per peran, ditampilkan di panel kiri */
const ALUR = [
  { peran: "Operator Unit", aksi: "Ajukan belanja" },
  { peran: "Administrator", aksi: "Verifikasi pagu" },
  { peran: "PPK", aksi: "Setujui & terbitkan SPP" },
  { peran: "PPSPM", aksi: "Uji SPP & terbitkan SPM" },
  { peran: "Bendahara", aksi: "Catat SP2D & sahkan" },
];

export default function Login() {
  const { pengguna, masuk, toast } = useStore();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [sandi, setSandi] = useState("");
  const [lihat, setLihat] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const tombolRef = useRef<HTMLButtonElement>(null);

  useEffect(() => emailRef.current?.focus(), []);

  const kirim = (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !sandi) {
      setGalat("Isi email dan kata sandi terlebih dahulu");
      return;
    }
    const hasil = masuk(email, sandi);
    if (!hasil.ok) {
      setGalat(hasil.pesan);
      return;
    }
    toast(`Selamat datang, ${hasil.nama}`);
    router.replace("/dashboard");
  };

  const pilihDemo = (em: string) => {
    setEmail(em);
    setSandi(SANDI_DEMO);
    setGalat(null);
    tombolRef.current?.focus();
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
          <h1>Belanja tertib, dari pengajuan sampai pengesahan.</h1>
          <p>Setiap peran mengerjakan bagiannya, dan setiap langkah tercatat di riwayat aktivitas.</p>
        </div>

        <ol className="login-alur" aria-label="Alur dokumen per peran">
          {ALUR.map((a, i) => (
            <li key={a.peran}>
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

            <button ref={tombolRef} type="submit" className="btn acc login-btn">
              Masuk
              <Icon name="send" />
            </button>
          </form>

          <section className="login-demo" aria-label="Akun demo">
            <div className="login-demo-head">
              <b>Akun demo</b>
              <span>
                Klik untuk mengisi · kata sandi <code>{SANDI_DEMO}</code>
              </span>
            </div>
            <div className="login-demo-list">
              {pengguna
                .filter((u) => u.aktif)
                .map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    className={`login-akun ${email.trim().toLowerCase() === u.email.toLowerCase() ? "pilih" : ""}`}
                    onClick={() => pilihDemo(u.email)}
                  >
                    <span className="av">{inisial(u.nama)}</span>
                    <span className="login-akun-teks">
                      <b>{u.nama}</b>
                      <small>{u.peran}</small>
                      <em>{AKSES[u.peran]?.tugas}</em>
                    </span>
                  </button>
                ))}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
