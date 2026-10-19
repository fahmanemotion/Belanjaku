"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ClipboardEvent as ClipboardReact, type FormEvent, type KeyboardEvent as KeyboardReact, type ReactNode } from "react";
import Icon from "./Icon";
import { desimal } from "@/lib/format";

/* ---------- Judul halaman ---------- */
export function PageHead({ title, subtitle, actions }: { title: ReactNode; subtitle: string; actions?: ReactNode }) {
  return (
    <div className="head">
      <div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      {actions && <div className="tbar">{actions}</div>}
    </div>
  );
}

/* ---------- Status & badge ---------- */
export type Tone = "g" | "w" | "b" | "i" | "m" | "p" | "";

export function Status({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={`st ${tone}`}>{children}</span>;
}

export function Badge({ tone = "", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

/* ---------- Badge sumber dana ----------
   Warna tetap per dana agar langsung terbedakan di semua tabel:
   RM gelap, BLU oranye — sama dengan kartu RM & BLU di Dashboard dan warna di Referensi. */
const NAMA_DANA: Record<string, string> = { RM: "Rupiah Murni", BLU: "PNBP BLU" };

export function BadgeDana({ dana }: { dana: string }) {
  const kelas = dana === "RM" ? "dana-rm" : dana === "BLU" ? "dana-blu" : "";
  return (
    <span className={`badge dana ${kelas}`} title={NAMA_DANA[dana]}>
      {dana}
    </span>
  );
}

/* ---------- Kolom pencarian ---------- */
export function SearchBox({
  id,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <label className="search" htmlFor={id}>
      <Icon name="search" />
      <input id={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </label>
  );
}

/* ---------- Tab pill ---------- */
export function Tabs<T extends string>({
  items,
  value,
  onChange,
  label,
}: {
  items: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {items.map((it) => (
        <button
          key={it.value}
          type="button"
          role="tab"
          aria-selected={it.value === value}
          className={it.value === value ? "on" : ""}
          onClick={() => onChange(it.value)}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

/* ---------- Modal dengan form ---------- */
export function Modal({
  title,
  description,
  submitLabel,
  onSubmit,
  onClose,
  children,
  bahaya = false,
  nonaktif = false,
  lebar = false,
}: {
  title: string;
  description: string;
  submitLabel: string;
  /** boleh async: selama berjalan tombol simpan terkunci agar data tidak terkirim dua kali */
  onSubmit: () => void | Promise<void>;
  onClose: () => void;
  children: ReactNode;
  /** tombol konfirmasi berwarna merah untuk tindakan yang tidak bisa dibatalkan */
  bahaya?: boolean;
  /** kunci tombol simpan (alasannya ditampilkan di isi form) */
  nonaktif?: boolean;
  /** modal lebar untuk form panjang (mis. daftar barang HPS) */
  lebar?: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [sedang, setSedang] = useState(false);
  const tutupRef = useRef(onClose);
  tutupRef.current = onClose;

  // Fokus ke isian pertama hanya sekali saat modal dibuka
  useEffect(() => {
    formRef.current?.querySelector<HTMLElement>("input:not([type=file]),select,textarea")?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !sedang && tutupRef.current();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sedang]);

  const handle = async (e: FormEvent) => {
    e.preventDefault();
    if (sedang || nonaktif) return;
    setSedang(true);
    try {
      await onSubmit();
    } finally {
      setSedang(false);
    }
  };

  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && !sedang && onClose()}>
      <form ref={formRef} className={`modal ${lebar ? "lebar" : ""}`} role="dialog" aria-modal="true" aria-label={title} aria-busy={sedang} onSubmit={handle}>
        <div className="mhead">
          <h3>{title}</h3>
          <button type="button" className="more" onClick={onClose} aria-label="Tutup" disabled={sedang}>
            <Icon name="close" size={16} />
          </button>
        </div>
        <p>{description}</p>
        <div className="form">{children}</div>
        <div className="mfoot">
          <button type="button" className="btn soft" onClick={onClose} disabled={sedang}>
            Batal
          </button>
          <button type="submit" className={`btn ${bahaya ? "danger-solid" : "dark"}`} disabled={sedang || nonaktif}>
            {sedang ? "Menyimpan…" : submitLabel}
          </button>
        </div>
      </form>
    </div>
  );
}

/* ---------- Dialog tampilan (bukan form), mis. rincian paket ---------- */
export function Dialog({
  title,
  subtitle,
  onClose,
  children,
  aksi,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  /** tombol di kanan judul */
  aksi?: ReactNode;
}) {
  const tutupRef = useRef(onClose);
  tutupRef.current = onClose;
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
    // Esc hanya menutup dialog paling atas (form di atas dialog menangani Esc-nya sendiri)
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || document.querySelector(".pratinjau")) return;
      const semua = document.querySelectorAll(".scrim");
      if (semua[semua.length - 1] === ref.current?.parentElement) tutupRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className="modal lebar dialog" role="dialog" aria-modal="true" aria-label={typeof title === "string" ? title : undefined} tabIndex={-1}>
        <div className="mhead">
          <div className="dialog-judul">
            <h3>{title}</h3>
            {subtitle && <div className="dialog-sub">{subtitle}</div>}
          </div>
          <div className="dialog-aksi">
            {aksi}
            <button type="button" className="more" onClick={onClose} aria-label="Tutup">
              <Icon name="close" size={16} />
            </button>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, full, children }: { label: string; full?: boolean; children: ReactNode }) {
  return (
    <label className={full ? "full" : undefined}>
      {label}
      {children}
    </label>
  );
}

/* ---------- Isian rupiah: tampil 5.000.000 saat diketik; yang disimpan hanya digit ---------- */
const MAKS_DIGIT_RUPIAH = 15;
const titikRibuan = (digit: string) => digit.replace(/\B(?=(\d{3})+(?!\d))/g, ".");

/** Teks → digit nilai rupiah (tanpa nol di depan, maksimal 15 digit) */
const digitRupiah = (teks: string) => teks.replace(/\D/g, "").replace(/^0+/, "").slice(0, MAKS_DIGIT_RUPIAH);
/**
 * Teks dari clipboard ("Rp 5.000.000,00", "5,000,000.00") → digit saja. Desimal 1–2 angka di akhir dibuang
 * karena nilai belanja selalu bilangan bulat.
 */
const digitTempel = (teks: string) => teks.replace(/[^\d.,]/g, "").replace(/[.,]\d{1,2}$/, "").replace(/\D/g, "");

/** Posisi kursor di teks berformat tepat setelah digit ke-`kiri` */
function posisiSetelahDigit(teks: string, kiri: number): number {
  if (kiri <= 0) return 0;
  let n = 0;
  for (let i = 0; i < teks.length; i++) if (teks[i] >= "0" && teks[i] <= "9" && ++n === kiri) return i + 1;
  return teks.length;
}

export function InputRupiah({ value, onChange, placeholder = "0" }: { value: string; onChange: (digit: string) => void; placeholder?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const kursor = useRef<number | null>(null);
  const tampil = titikRibuan(value);

  // Setelah titik ribuan disusun ulang, kursor dikembalikan ke posisi digit yang sama
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && kursor.current !== null && document.activeElement === el) el.setSelectionRange(kursor.current, kursor.current);
    kursor.current = null;
  }, [tampil]);

  const terapkan = (teks: string, posisi: number) => {
    const digit = digitRupiah(teks);
    const semua = teks.replace(/\D/g, "");
    const nolDepan = semua.length - semua.replace(/^0+/, "").length;
    const kiri = Math.min(Math.max(0, teks.slice(0, posisi).replace(/\D/g, "").length - nolDepan), digit.length);
    const p = posisiSetelahDigit(titikRibuan(digit), kiri);
    if (digit === value) {
      // nilai tidak berubah (mis. mengetik huruf/titik): tampilan dikembalikan, kursor tetap di tempatnya
      kursor.current = null;
      requestAnimationFrame(() => {
        const el = ref.current;
        if (el && document.activeElement === el) el.setSelectionRange(p, p);
      });
    } else {
      kursor.current = p;
    }
    onChange(digit);
  };

  // Backspace/Delete tepat di samping titik ribuan menghapus digit di sebelahnya, bukan titiknya saja
  const onKeyDown = (e: KeyboardReact<HTMLInputElement>) => {
    const el = e.currentTarget;
    const s = el.selectionStart ?? 0;
    if (s !== el.selectionEnd) return;
    if (e.key === "Backspace" && s >= 2 && el.value[s - 1] === ".") {
      e.preventDefault();
      terapkan(el.value.slice(0, s - 2) + el.value.slice(s - 1), s - 2);
    } else if (e.key === "Delete" && el.value[s] === "." && s + 1 < el.value.length) {
      e.preventDefault();
      terapkan(el.value.slice(0, s + 1) + el.value.slice(s + 2), s);
    }
  };

  const onPaste = (e: ClipboardReact<HTMLInputElement>) => {
    e.preventDefault();
    const el = e.currentTarget;
    const s = el.selectionStart ?? el.value.length;
    const akhir = el.selectionEnd ?? s;
    const tempel = digitTempel(e.clipboardData.getData("text"));
    terapkan(el.value.slice(0, s) + tempel + el.value.slice(akhir), s + tempel.length);
  };

  return (
    <input
      ref={ref}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      className="isian-rupiah num"
      value={tampil}
      placeholder={placeholder}
      onChange={(e) => terapkan(e.target.value, e.target.selectionStart ?? e.target.value.length)}
      onKeyDown={onKeyDown}
      onPaste={onPaste}
    />
  );
}

/* ---------- Dropdown penyaring ringkas (nilai "Semua" = tidak menyaring) ---------- */
export function Saring<T extends string>({
  label,
  value,
  onChange,
  opsi,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  opsi: { value: T; label: string }[];
}) {
  return (
    <label className={`sel saring ${value !== "Semua" ? "aktif" : ""}`}>
      <span className="sr">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value as T)} aria-label={label}>
        {opsi.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}

/* ---------- Pagination tabel ---------- */
export const BARIS_PER_HALAMAN = 30;

/**
 * Membagi baris tabel per halaman (30 baris).
 * Panggil `awal()` saat filter berubah; halaman otomatis disesuaikan bila jumlah baris berkurang.
 * Pasang `ref` di panel tabel agar layar kembali ke judul tabel saat pindah halaman.
 */
export function useHalaman<T>(baris: T[], ukuran = BARIS_PER_HALAMAN) {
  const [halaman, setHalaman] = useState(1);
  const ref = useRef<HTMLElement>(null);
  const jumlahHalaman = Math.max(1, Math.ceil(baris.length / ukuran));
  const aktif = Math.min(halaman, jumlahHalaman);
  const tampil = useMemo(() => baris.slice((aktif - 1) * ukuran, aktif * ukuran), [baris, aktif, ukuran]);
  const pindah = (h: number) => {
    setHalaman(Math.min(Math.max(1, h), jumlahHalaman));
    const el = ref.current;
    if (el && el.getBoundingClientRect().top < 0) {
      const halus = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      el.scrollIntoView({ behavior: halus ? "smooth" : "auto", block: "start" });
    }
  };
  return { halaman: aktif, jumlahHalaman, tampil, ukuran, ref, pindah, awal: () => setHalaman(1) };
}

/** Nomor halaman yang ditampilkan, mis. 1 … 4 5 6 … 39 (0 = elipsis) */
function nomorHalaman(aktif: number, jumlah: number): number[] {
  if (jumlah <= 7) return Array.from({ length: jumlah }, (_, i) => i + 1);
  const pilih = new Set([1, jumlah, aktif - 1, aktif, aktif + 1]);
  if (aktif <= 3) [2, 3, 4].forEach((n) => pilih.add(n));
  if (aktif >= jumlah - 2) [jumlah - 3, jumlah - 2, jumlah - 1].forEach((n) => pilih.add(n));
  const urut = Array.from(pilih).filter((n) => n >= 1 && n <= jumlah).sort((a, b) => a - b);
  const hasil: number[] = [];
  urut.forEach((n, i) => {
    const sebelum = urut[i - 1];
    if (i > 0 && n - sebelum === 2) hasil.push(sebelum + 1);
    else if (i > 0 && n - sebelum > 2) hasil.push(0);
    hasil.push(n);
  });
  return hasil;
}

export function Paginasi({
  halaman,
  jumlahHalaman,
  total,
  ukuran,
  satuan,
  onPindah,
}: {
  halaman: number;
  jumlahHalaman: number;
  total: number;
  ukuran: number;
  /** "kegiatan", "item", … */
  satuan: string;
  onPindah: (h: number) => void;
}) {
  if (total === 0) return null;
  const dari = (halaman - 1) * ukuran + 1;
  const sampai = Math.min(total, halaman * ukuran);
  return (
    <nav className="paginasi" aria-label={`Halaman tabel ${satuan}`}>
      <p className="paginasi-info">
        Menampilkan{" "}
        <b>
          {desimal(dari, 0)}–{desimal(sampai, 0)}
        </b>{" "}
        dari <b>{desimal(total, 0)}</b> {satuan}
      </p>
      {jumlahHalaman > 1 && (
        <div className="paginasi-nav">
          <button type="button" className="pg pg-panah" onClick={() => onPindah(halaman - 1)} disabled={halaman === 1} aria-label="Halaman sebelumnya">
            <Icon name="chevron" className="kiri" />
          </button>
          {nomorHalaman(halaman, jumlahHalaman).map((n, i) =>
            n === 0 ? (
              <span key={`elipsis-${i}`} className="pg-elipsis" aria-hidden="true">
                …
              </span>
            ) : (
              <button
                key={n}
                type="button"
                className={`pg pg-angka ${n === halaman ? "on" : ""}`}
                aria-current={n === halaman ? "page" : undefined}
                aria-label={`Halaman ${n}`}
                onClick={() => onPindah(n)}
              >
                {n}
              </button>
            ),
          )}
          {/* HP: nomor halaman diganti dropdown agar muat dan bisa lompat ke halaman mana pun */}
          <label className="sel pg-ringkas">
            <span className="sr">Pilih halaman</span>
            <select value={halaman} onChange={(e) => onPindah(Number(e.target.value))} aria-label="Pilih halaman">
              {Array.from({ length: jumlahHalaman }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  Halaman {i + 1} dari {jumlahHalaman}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="pg pg-panah"
            onClick={() => onPindah(halaman + 1)}
            disabled={halaman === jumlahHalaman}
            aria-label="Halaman berikutnya"
          >
            <Icon name="chevron" className="kanan" />
          </button>
        </div>
      )}
    </nav>
  );
}

/* ---------- Baris kosong tabel ---------- */
export function EmptyRow({ cols, children }: { cols: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={cols} className="empty">
        {children}
      </td>
    </tr>
  );
}
