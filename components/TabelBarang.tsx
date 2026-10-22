"use client";

/**
 * Tabel barang/jasa bergaya Excel untuk form dokumen pengadaan (Nota Dinas & HPS s.d. Kwitansi, BAP & BAST).
 *
 *  - TabelHps      : isian daftar barang/jasa di form Nota Dinas & HPS: No · Uraian · Jumlah · Satuan · Harga Satuan ·
 *                    Total Jumlah · Ket, lalu JUMLAH · PPN 11% · TOTAL JUMLAH · TERBILANG. Satu baris = satu barang/jasa;
 *                    tidak ada baris spesifikasi terpisah — keterangan barang ditulis di teks Uraian (mis. "Solar non subsidi").
 *  - TabelBeli     : harga satuan pembelian per barang di form Nota Pembelian.
 *  - TabelLampiran : tampilan tanpa isian di form Surat Pesanan dan Kwitansi, BAP & BAST.
 *  Spesifikasi paket lama (sebelum v29) masih tampil sebagai baris di bawah barangnya pada tabel nota & lampiran;
 *  saat Nota Dinas-nya diubah, tiap spesifikasi menjadi baris uraian tersendiri.
 *
 * Seperti Excel:
 *  - Blok sel: seret mouse, Shift+klik, Shift+panah, klik nomor baris (baris penuh), klik judul kolom (kolom penuh),
 *    klik judul "No." atau Ctrl/⌘+A (semua sel). Ctrl/⌘+C menyalin blok sebagai sel-sel Excel (bergaris putus-putus),
 *    Ctrl/⌘+X memotong, Delete mengosongkan, Ctrl/⌘+V menempel mulai sel kiri-atas blok — satu nilai mengisi semua sel blok,
 *    satu baris diulang ke tiap baris blok, blok semua sel = daftar diganti. Sesudah tempel, sel hasilnya terblok.
 *  - Klik sekali memilih sel (ketikan mengganti isinya), klik dua kali / F2 menyunting isi sel.
 *  - Tab/Shift+Tab pindah kolom, Enter turun ke baris berikutnya (di baris terakhir menambah baris baru), Shift+Enter naik,
 *    Alt/⌥+Enter atau tombol + menyisipkan baris di bawah, panah pindah sel, Esc keluar dari sel, Ctrl/⌘+Z urungkan,
 *    Ctrl/⌘+Shift+Z atau Ctrl+Y ulangi.
 *  - Salinan draft dengan susunan kolom lain dikenali dari judul kolomnya atau ditebak dari isinya (lib/tempelExcel.ts);
 *    baris "- …" dan baris tanpa angka ditempel sebagai baris uraian tersendiri, kolom Spesifikasi digabung ke Uraian;
 *    hasilnya bisa diatur ulang lewat "Atur kolom & baris…" atau diurungkan.
 * Batas sama dengan database (app.rapikan_item_paket): 50 barang/jasa.
 */
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type RefObject,
} from "react";
import Icon from "./Icon";
import { BilahTempel, DialogTempel, bacaClipboard, salinTeks, uraianKolom, type IsiBilah, type ModeTempel } from "./TempelExcel";
import { InputRupiah } from "./ui";
import { rupiah } from "@/lib/format";
import { angka, hitungPpn, terbilangRupiah } from "@/lib/pengadaan";
import {
  URUTAN_TABEL,
  angkaDari,
  bacaSalinan,
  banyakSel,
  cocokkanNama,
  golongkan,
  peranJudul,
  susunBarang,
  tafsirTabel,
  tsvBarang,
  type Golongan,
  type JenisBaris,
  type KodeCatatan,
  type Susunan,
  type Tafsir,
} from "@/lib/tempelExcel";
import type { ItemPaket } from "@/lib/types";

export const MAKS_BARANG = 50;
const MAKS_JUMLAH = 100_000;
const MAKS_HARGA = 10_000_000_000;
const SATUAN = ["pcs", "buah", "unit", "paket", "set", "rim", "lusin", "box", "dus", "kg", "liter", "lembar", "eksemplar", "orang", "kegiatan", "bulan"];

/* =====================================================================
   Data isian
   ===================================================================== */
export interface BarisBarang {
  kunci: number;
  uraian: string;
  /** digit */
  jumlah: string;
  satuan: string;
  /** harga satuan HPS (digit) */
  harga: string;
  ket: string;
}
export type KolomBarang = "uraian" | "jumlah" | "satuan" | "harga" | "ket";
const KOLOM_BARANG: KolomBarang[] = ["uraian", "jumlah", "satuan", "harga", "ket"];
/** Nomor kolom tabel HPS (sama dengan URUTAN_TABEL): 0 No · 1 Uraian · 2 Jumlah · 3 Satuan · 4 Harga · 5 Total · 6 Ket */
const INDEKS_KOLOM: Record<KolomBarang, number> = { uraian: 1, jumlah: 2, satuan: 3, harga: 4, ket: 6 };
/** Kolom isian menurut nomor kolom (null = No. & Total Jumlah, terisi otomatis) */
const KOLOM_DI: (KolomBarang | null)[] = [null, "uraian", "jumlah", "satuan", "harga", null, "ket"];

let kunciBaris = 0;
export const barisKosong = (): BarisBarang => ({ kunci: ++kunciBaris, uraian: "", jumlah: "", satuan: "", harga: "", ket: "" });
/**
 * Barang dari database → baris tabel. Spesifikasi paket lama (baris "- …" di bawah uraian) menjadi baris uraian
 * tersendiri di bawahnya — jumlah, satuan, dan harga satuannya bisa diisi (atau barisnya dihapus).
 */
export const barisDariItem = (x: ItemPaket): BarisBarang[] => [
  { kunci: ++kunciBaris, uraian: x.uraian, jumlah: String(x.jumlah), satuan: x.satuan, harga: String(x.hargaHps), ket: x.ket },
  ...x.spesifikasi.map((s) => ({ ...barisKosong(), uraian: s })),
];
/** Baris yang sama sekali kosong tidak ikut disimpan */
export const barisTerisi = (b: BarisBarang) => Boolean(b.uraian.trim() || b.jumlah || b.satuan.trim() || b.harga || b.ket.trim());
const samaBaris = (x: BarisBarang, y: BarisBarang) =>
  x.uraian === y.uraian && x.jumlah === y.jumlah && x.satuan === y.satuan && x.harga === y.harga && x.ket === y.ket;

/** Kolom wajib yang belum benar (aturan sama dengan database) */
export function salahBarang(b: BarisBarang): KolomBarang[] {
  const salah: KolomBarang[] = [];
  if (b.uraian.trim().length < 2) salah.push("uraian");
  const j = Number(b.jumlah);
  if (!(j >= 1 && j <= MAKS_JUMLAH)) salah.push("jumlah");
  if (!b.satuan.trim()) salah.push("satuan");
  const h = Number(b.harga);
  if (!(h >= 1 && h <= MAKS_HARGA)) salah.push("harga");
  return salah;
}
/** "uraian, harga satuan" — untuk pesan simpan gagal */
export const pesanSalah = (b: BarisBarang) =>
  salahBarang(b)
    .map((k) => {
      if (k === "uraian") return b.uraian.trim() ? "uraian (minimal 2 huruf)" : "uraian";
      if (k === "jumlah") return b.jumlah ? `jumlah (maksimal ${angka(MAKS_JUMLAH)})` : "jumlah";
      if (k === "harga") return b.harga ? "harga satuan (maksimal Rp10 miliar)" : "harga satuan";
      return k;
    })
    .join(", ");

/** Baris tabel → item untuk database (baris kosong dibuang; tanpa baris spesifikasi) */
export const itemDariBaris = (xs: BarisBarang[]) =>
  xs.filter(barisTerisi).map((b) => ({
    uraian: b.uraian.trim(),
    spesifikasi: [] as string[],
    jumlah: Number(b.jumlah),
    satuan: b.satuan.trim(),
    hargaHps: Number(b.harga),
    ket: b.ket.trim(),
  }));

/* =====================================================================
   Bantuan bersama
   ===================================================================== */
type Baris = { jenis: "barang"; i: number } | { jenis: "spek"; i: number; j: number };
/** Baris tampilan tabel nota & lampiran: tiap barang diikuti baris-baris spesifikasinya (paket lama) */
const susunBaris = (nSpek: number[]): Baris[] =>
  nSpek.flatMap((n, i): Baris[] => [{ jenis: "barang", i }, ...Array.from({ length: n }, (_, j): Baris => ({ jenis: "spek", i, j }))]);
/** Nomor baris tampilan barang ke-i (atau spesifikasi ke-j-nya) */
const indeksBaris = (nSpek: number[], i: number, j?: number) => nSpek.slice(0, i).reduce((s, n) => s + 1 + n, 0) + (j === undefined ? 0 : 1 + j);

/** Seluruh isi sel sedang terpilih (baru dipindah ke sel itu) → panah memindah sel seperti Excel */
const seluruh = (el: HTMLInputElement) => el.value.length > 0 && el.selectionStart === 0 && el.selectionEnd === el.value.length;
const tombolUrung = (e: KeyboardEvent) => (e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "z" && !e.shiftKey;
const tombolUlang = (e: KeyboardEvent) =>
  (e.ctrlKey || e.metaKey) && !e.altKey && ((e.key.toLowerCase() === "z" && e.shiftKey) || (e.ctrlKey && !e.metaKey && e.key.toLowerCase() === "y"));
const tombolSemua = (e: KeyboardEvent) => (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "a";
/** tanda poin + spasi di awal teks salinan ("- ", "• ", "* ") dibuang — uraian tanpa garis datar */
const tanpaTanda = (s: string) => s.replace(/^\s*[-–—•*·▪►]\s+/, "").trim();
/** angka dari teks salinan sebagai digit ("" bila bukan angka positif) */
const digitDari = (teks: string) => {
  const n = angkaDari(teks);
  return n !== null && n > 0 ? String(Math.round(n)) : "";
};

function useFokusSel(ref: RefObject<HTMLTableElement | null>) {
  const tunda = useRef<{ r: number; c: string; pilih: boolean } | null>(null);
  const fokus = (r: number, c: string, pilih = true) => {
    const el = ref.current?.querySelector<HTMLInputElement>(`input[data-r="${r}"][data-c="${c}"]`);
    if (!el) return false;
    el.focus();
    el.scrollIntoView({ block: "nearest", inline: "nearest" });
    if (pilih) el.select();
    else el.setSelectionRange(el.value.length, el.value.length);
    return true;
  };
  // Sel baru (baris yang baru ditambahkan) difokuskan setelah tabel digambar ulang
  useLayoutEffect(() => {
    const t = tunda.current;
    if (!t) return;
    tunda.current = null;
    fokus(t.r, t.c, t.pilih);
  });
  const nanti = (r: number, c: string, pilih = false) => {
    tunda.current = { r, c, pilih };
  };
  return { fokus, nanti };
}

/**
 * Riwayat urungkan/ulangi seperti Excel. Ketikan beruntun di sel yang sama digabung menjadi satu langkah
 * (aksi berawalan "ketik:"); `putus` dipanggil saat pindah sel agar ketikan berikutnya menjadi langkah baru.
 */
function useRiwayat<T>(sekarang: T, pulihkan: (v: T) => void) {
  const r = useRef<{ mundur: { v: T; aksi: string }[]; maju: { v: T; aksi: string }[]; terakhir: string | null }>({ mundur: [], maju: [], terakhir: null });
  const catat = (aksi: string) => {
    const h = r.current;
    if (aksi.startsWith("ketik:") && h.terakhir === aksi) return;
    h.mundur.push({ v: sekarang, aksi });
    if (h.mundur.length > 100) h.mundur.shift();
    h.maju = [];
    h.terakhir = aksi;
  };
  const geser = (dari: "mundur" | "maju", ke: "mundur" | "maju") => {
    const h = r.current;
    const l = h[dari].pop();
    if (!l) return false;
    h[ke].push({ v: sekarang, aksi: l.aksi });
    h.terakhir = null;
    pulihkan(l.v);
    return true;
  };
  return {
    catat,
    urungkan: () => geser("mundur", "maju"),
    ulangi: () => geser("maju", "mundur"),
    putus: () => {
      r.current.terakhir = null;
    },
    bisaUrung: r.current.mundur.length > 0,
    bisaUlang: r.current.maju.length > 0,
  };
}

/* =====================================================================
   Blok sel seperti Excel
   ===================================================================== */
interface Titik {
  r: number;
  c: number;
}
export interface Rentang {
  r1: number;
  r2: number;
  c1: number;
  c2: number;
}
/** jangkar `a` (sel aktif, salah satu sudut blok) dan ujung `f` */
interface Pilihan {
  a: Titik;
  f: Titik;
}
type ModeBlok = "sel" | "baris" | "kolom";
const ARAH: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
const jepit = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
const samaTitik = (x: Titik, y: Titik) => x.r === y.r && x.c === y.c;
const rentangDari = (p: Pilihan): Rentang => ({
  r1: Math.min(p.a.r, p.f.r),
  r2: Math.max(p.a.r, p.f.r),
  c1: Math.min(p.a.c, p.f.c),
  c2: Math.max(p.a.c, p.f.c),
});
const kenaRentang = (g: Rentang, r: number, c1: number, c2: number) => r >= g.r1 && r <= g.r2 && c2 >= g.c1 && c1 <= g.c2;
/** kelas tepi blok: <awalan>a (atas), b (bawah), ki (kiri), ka (kanan) */
const tepi = (g: Rentang, r: number, c1: number, c2: number, awalan: string) =>
  (r === g.r1 ? ` ${awalan}a` : "") + (r === g.r2 ? ` ${awalan}b` : "") + (c1 <= g.c1 ? ` ${awalan}ki` : "") + (c2 >= g.c2 ? ` ${awalan}ka` : "");
const kutipSel = (t: string) => (/["\t\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t);
/** Isi blok → teks bertab untuk clipboard (Excel & Google Sheets menempelkannya kembali sebagai sel-sel) */
const tsvRentang = (g: Rentang, nilaiSel: (r: number, c: number) => string) =>
  Array.from({ length: g.r2 - g.r1 + 1 }, (_, i) =>
    Array.from({ length: g.c2 - g.c1 + 1 }, (_, j) => kutipSel(nilaiSel(g.r1 + i, g.c1 + j))).join("\t"),
  ).join("\n");
/** nilai salinan satu sel (tanda kutip & baris baru penutup dari Excel dibuang) */
const nilaiTunggal = (teks: string) => (bacaSalinan(teks)[0]?.[0] ?? "").trim();
/** kolom pertama salinan berisi nomor urut (1, 2, 3 …)? */
const kolomNomor = (data: string[][]) => {
  const isi = data.map((d) => (d[0] ?? "").trim()).filter(Boolean);
  return isi.length > 0 && isi.filter((x) => /^\d{1,3}[.)]?$/.test(x)).length >= isi.length * 0.6;
};
/** sel isian di dalam sel tabel (kolom nomor tidak punya isian) */
const isianDi = (td: HTMLElement | null) => (td && !td.dataset.penuh ? td.querySelector<HTMLInputElement>("input[data-r]") : null);
/** bagian elemen yang benar-benar terlihat (dipotong layar & kotak bergulir di atasnya, mis. isi form) */
const bagianTerlihat = (el: HTMLElement) => {
  let { top, bottom, left, right } = el.getBoundingClientRect();
  for (let p = el.parentElement; p; p = p.parentElement) {
    const s = getComputedStyle(p);
    if (s.overflowX === "visible" && s.overflowY === "visible") continue;
    const q = p.getBoundingClientRect();
    top = Math.max(top, q.top);
    bottom = Math.min(bottom, q.bottom);
    left = Math.max(left, q.left);
    right = Math.min(right, q.right);
  }
  return { top: Math.max(top, 0), bottom: Math.min(bottom, window.innerHeight), left: Math.max(left, 0), right: Math.min(right, window.innerWidth) };
};
/** atribut sel tabel untuk blok: baris tampilan & kolom awal/akhir (sel gabungan) */
const atributSel = (r: number, c1: number, c2?: number) => ({ "data-sr": r, "data-sc": c1, ...(c2 !== undefined ? { "data-sce": c2 } : {}) });

/**
 * Blok sel seperti Excel. Sel tabel diberi data-sr, data-sc/data-sce dan data-penuh (kolom nomor: klik = baris penuh);
 * judul kolom diberi data-hc (klik = kolom penuh; judul "No." = semua sel). Sel aktif yang berisian memegang fokus
 * (ketikan langsung mengganti isinya); sel aktif hanya-baca (No., Total, spesifikasi lampiran) → fokus di tabel.
 */
function useBlok(ref: RefObject<HTMLTableElement | null>, jumlahBaris: number, kolomAkhir: number) {
  const [pilihan, setPilihan] = useState<Pilihan | null>(null);
  /** pilihan terbaru untuk kejadian beruntun sebelum tabel digambar ulang */
  const pilihRef = useRef<Pilihan | null>(null);
  const [fokusTabel, setFokusTabel] = useState(false);
  /** blok yang baru disalin (bergaris putus-putus seperti Excel) */
  const [salinan, setSalinan] = useState<Rentang | null>(null);
  const salinanRef = useRef<Rentang | null>(null);
  const seret = useRef<{ mode: ModeBlok; a: Titik } | null>(null);
  const penunjuk = useRef("mouse");
  const posisi = useRef({ x: 0, y: 0 });
  const bingkai = useRef<number | null>(null);
  const fokusNanti = useRef(false);
  const pilihUlang = useRef(false);

  const sah = (v: Pilihan | null) => (v && v.a.r < jumlahBaris && v.f.r < jumlahBaris ? v : null);
  const ubah = (v: Pilihan | null) => {
    pilihRef.current = v;
    setPilihan(v);
  };
  /** pilihan terbaru untuk penangan kejadian (state baru terbaca setelah tabel digambar ulang) */
  const terkini = () => {
    const q = sah(pilihRef.current);
    const g = q ? rentangDari(q) : null;
    return { pilih: q, rentang: g, banyak: !!g && (g.r1 !== g.r2 || g.c1 !== g.c2) };
  };
  const p = sah(pilihan);
  const rentang = p ? rentangDari(p) : null;
  const banyak = !!rentang && (rentang.r1 !== rentang.r2 || rentang.c1 !== rentang.c2);
  const tampil = !!rentang && (banyak || fokusTabel);
  const tanda = salinan && salinan.r2 < jumlahBaris ? salinan : null;

  const tdDi = (t: Titik) =>
    Array.from(ref.current?.querySelectorAll<HTMLElement>(`td[data-sr="${t.r}"]`) ?? []).find(
      (td) => Number(td.dataset.sc) <= t.c && t.c <= Number(td.dataset.sce ?? td.dataset.sc),
    ) ?? null;
  const tunjukkan = (t: Titik) => tdDi(t)?.scrollIntoView({ block: "nearest", inline: "nearest" });
  /** fokus ke sel aktif: isiannya (seluruh isi terpilih) atau tabel bila selnya hanya-baca */
  const fokuskan = (t: Titik) => {
    const input = isianDi(tdDi(t));
    if (input) {
      if (document.activeElement !== input) input.focus({ preventScroll: true });
      input.select();
    } else ref.current?.focus({ preventScroll: true });
  };
  // blok hasil tempel: sel aktifnya difokuskan setelah tabel digambar ulang. Sesudah urungkan / hapus / isi blok,
  // isi sel aktif dipilih lagi (mode siap seperti Excel: ketikan mengganti isinya, seret mulai blok baru)
  useLayoutEffect(() => {
    const ulang = pilihUlang.current;
    pilihUlang.current = false;
    if (fokusNanti.current) {
      fokusNanti.current = false;
      const q = sah(pilihRef.current);
      if (!q) return;
      fokuskan(q.a);
      tunjukkan(q.a);
    } else if (ulang) {
      const a = document.activeElement;
      if (a instanceof HTMLInputElement && a.dataset.r !== undefined && ref.current?.contains(a)) a.select();
    }
  });

  /** pilih blok a..f (a = sel aktif); `fokus` = pindahkan fokus ke sel aktif setelah tabel digambar ulang */
  const tetapkan = (a: Titik | null, f?: Titik, fokus = false) => {
    ubah(a ? { a, f: f ?? a } : null);
    if (a && fokus) fokusNanti.current = true;
  };
  /** blok kembali satu sel (mis. mulai mengetik di sel aktif) */
  const kumpul = (t: Titik) => {
    const q = pilihRef.current;
    if (!q || !samaTitik(q.a, t) || !samaTitik(q.f, t)) ubah({ a: t, f: t });
  };
  const semua = () => {
    if (jumlahBaris) ubah({ a: { r: 0, c: 0 }, f: { r: jumlahBaris - 1, c: kolomAkhir } });
  };
  /** Shift+panah: ujung blok bergeser satu sel */
  const perluas = (dr: number, dc: number, aktif: Titik) => {
    const q0 = sah(pilihRef.current);
    const q = q0 && (!samaTitik(q0.a, q0.f) || samaTitik(q0.a, aktif)) ? q0 : { a: aktif, f: aktif };
    const f = { r: jepit(q.f.r + dr, 0, jumlahBaris - 1), c: jepit(q.f.c + dc, 0, kolomAkhir) };
    ubah({ a: q.a, f });
    requestAnimationFrame(() => tunjukkan(f));
  };
  /** isi tabel diubah bukan oleh ketikan → isi sel aktif dipilih lagi setelah digambar ulang */
  const segarkan = () => {
    pilihUlang.current = true;
  };
  const tandaiSalinan = (g: Rentang) => {
    salinanRef.current = g;
    setSalinan(g);
  };
  const adaSalinan = () => salinanRef.current !== null;
  const hapusSalinan = () => {
    if (!salinanRef.current) return;
    salinanRef.current = null;
    setSalinan(null);
  };
  const lepas = () => {
    ubah(null);
    hapusSalinan();
  };

  const sasaran = (el: Element | null): { t: Titik; mode: ModeBlok } | null => {
    const tabel = ref.current;
    if (!el || !tabel) return null;
    const th = el.closest<HTMLElement>("th[data-hc]");
    if (th && tabel.contains(th)) return { t: { r: 0, c: Number(th.dataset.hc) }, mode: "kolom" };
    const td = el.closest<HTMLElement>("td[data-sr]");
    if (!td || !tabel.contains(td)) return null;
    return { t: { r: Number(td.dataset.sr), c: Number(td.dataset.sc) }, mode: td.dataset.penuh ? "baris" : "sel" };
  };
  /** blok dari jangkar `a` ke `t` menurut cara memilih: sel, baris penuh, atau kolom penuh */
  const bentang = (mode: ModeBlok, a: Titik, t: Titik): Pilihan => {
    const akhir = Math.max(0, jumlahBaris - 1);
    if (mode === "kolom")
      return a.c === 0 && t.c === 0
        ? { a: { r: 0, c: 0 }, f: { r: akhir, c: kolomAkhir } } // judul "No." = semua sel
        : { a: { r: 0, c: a.c }, f: { r: akhir, c: t.c } };
    if (mode === "baris") return { a: { r: a.r, c: 0 }, f: { r: t.r, c: kolomAkhir } };
    return { a, f: t };
  };

  const onPointerDown = (e: PointerEvent<HTMLTableElement>) => {
    penunjuk.current = e.pointerType;
  };
  /** klik sel: pilih sel itu (seluruh isinya terpilih, ketikan menggantinya); seret = blok; Shift+klik = perluas blok */
  const onMouseDown = (e: MouseEvent<HTMLTableElement>) => {
    const el = e.target as HTMLElement;
    if (e.button !== 0 || el.closest("button, label, a, select, textarea")) return;
    const hit = sasaran(el);
    if (!hit || !jumlahBaris) return;
    const input = hit.mode === "sel" ? isianDi(el.closest<HTMLElement>("td[data-sr]")) : null;
    if (penunjuk.current !== "mouse") {
      // layar sentuh: ketukan memilih satu sel (isian & papan ketik layar berjalan seperti biasa)
      if (hit.mode === "sel") ubah({ a: hit.t, f: hit.t });
      return;
    }
    // sel sedang disunting (kursor di dalam teks): klik menggeser kursor seperti biasa
    if (input && !e.shiftKey && document.activeElement === input && input.value && !seluruh(input)) return;
    e.preventDefault();
    const q = sah(pilihRef.current);
    if (e.shiftKey && q) {
      if (hit.mode === "kolom") ubah({ a: { r: 0, c: q.a.c }, f: { r: jumlahBaris - 1, c: hit.t.c } });
      else if (hit.mode === "baris") ubah({ a: { r: q.a.r, c: 0 }, f: { r: hit.t.r, c: kolomAkhir } });
      else ubah({ a: q.a, f: hit.t });
      if (!ref.current?.contains(document.activeElement)) fokuskan(q.a);
      return;
    }
    const b = bentang(hit.mode, hit.t, hit.t);
    seret.current = { mode: hit.mode, a: hit.t };
    ubah(b);
    fokuskan(b.a);
  };

  // Menyeret: blok mengikuti penunjuk; di tepi bingkai tabel (atau di luarnya) tabel bergulir sendiri seperti Excel
  const langkah = useRef<() => void>(() => {});
  langkah.current = () => {
    bingkai.current = null;
    const s = seret.current;
    const tabel = ref.current;
    const wrap = tabel?.parentElement;
    if (!s || !tabel || !wrap) return;
    const { x, y } = posisi.current;
    const k = wrap.getBoundingClientRect();
    const v = bagianTerlihat(wrap);
    const atas = Math.max(v.top, k.top + (tabel.tHead?.offsetHeight ?? 0));
    if (v.bottom - atas < 8 || v.right - v.left < 8) return;
    // zona tepi lebih lebar bila bingkai terpotong layar/form (penunjuk tidak bisa keluar melewatinya)
    const zAtas = v.top > k.top + 1 ? 24 : 6;
    const zBawah = v.bottom < k.bottom - 1 ? 24 : 6;
    const zKiri = v.left > k.left + 1 ? 24 : 6;
    const zKanan = v.right < k.right - 1 ? 24 : 6;
    const laju = (d: number) => Math.sign(d) * Math.min(28, 3 + Math.abs(d) / 2.5);
    const dy = y < atas + zAtas ? y - (atas + zAtas) : y > v.bottom - zBawah ? y - (v.bottom - zBawah) : 0;
    const dx = x < v.left + zKiri ? x - (v.left + zKiri) : x > v.right - zKanan ? x - (v.right - zKanan) : 0;
    const sebelum = [wrap.scrollTop, wrap.scrollLeft];
    if (dy) wrap.scrollTop += laju(dy);
    if (dx) wrap.scrollLeft += laju(dx);
    const bergulir = wrap.scrollTop !== sebelum[0] || wrap.scrollLeft !== sebelum[1];
    const hit = sasaran(document.elementFromPoint(jepit(x, v.left + 2, v.right - 3), jepit(y, atas + 2, v.bottom - 3)));
    if (hit) {
      const b = bentang(s.mode, s.a, hit.t);
      const q = pilihRef.current;
      if (!q || !samaTitik(q.a, b.a) || !samaTitik(q.f, b.f)) ubah(b);
    }
    // penunjuk diam di tepi: terus bergulir selama tombol mouse ditahan (berhenti di ujung tabel)
    if ((dx || dy) && bergulir) bingkai.current = requestAnimationFrame(() => langkah.current());
  };
  useEffect(() => {
    const gerak = (e: globalThis.MouseEvent) => {
      if (!seret.current) return;
      if (!(e.buttons & 1)) {
        seret.current = null;
        return;
      }
      posisi.current = { x: e.clientX, y: e.clientY };
      if (bingkai.current === null) bingkai.current = requestAnimationFrame(() => langkah.current());
    };
    const lepasSeret = () => {
      seret.current = null;
    };
    window.addEventListener("mousemove", gerak);
    window.addEventListener("mouseup", lepasSeret);
    window.addEventListener("blur", lepasSeret);
    return () => {
      window.removeEventListener("mousemove", gerak);
      window.removeEventListener("mouseup", lepasSeret);
      window.removeEventListener("blur", lepasSeret);
      if (bingkai.current !== null) cancelAnimationFrame(bingkai.current);
    };
  }, []);

  /** fokus pindah ke isian lain (Tab, Enter, panah, ketukan) → blok kembali satu sel di sana */
  const onFocus = (e: FocusEvent<HTMLTableElement>, titikIsian: (el: HTMLElement) => Titik | null) => {
    if (e.target === ref.current) return setFokusTabel(true);
    setFokusTabel(false);
    const t = titikIsian(e.target as HTMLElement);
    const q = pilihRef.current;
    if (t && !seret.current && !(q && samaTitik(q.a, t))) ubah({ a: t, f: t });
  };
  /** fokus keluar tabel (klik di luar, tombol lain) → blok dilepas; berpindah jendela (mis. ke Excel) → blok tetap */
  const onBlur = (e: FocusEvent<HTMLTableElement>) => {
    if (e.target === ref.current) setFokusTabel(false);
    const ke = e.relatedTarget as Node | null;
    if (ke) {
      if (!ref.current?.contains(ke)) lepas();
      return;
    }
    setTimeout(() => {
      const a = document.activeElement;
      if (document.hasFocus() && !(a && ref.current?.contains(a))) lepas();
    }, 0);
  };

  /** kelas sorotan untuk sel di baris r yang menempati kolom c1..c2 */
  const kelas = (r: number, c1: number, c2 = c1) => {
    let s = "";
    if (tampil && rentang && p && kenaRentang(rentang, r, c1, c2)) {
      s = " g-pilih" + tepi(rentang, r, c1, c2, "g-p");
      if (banyak && p.a.r === r && p.a.c >= c1 && p.a.c <= c2) s += " g-aktif";
    }
    if (tanda && kenaRentang(tanda, r, c1, c2)) s += " g-salin" + tepi(tanda, r, c1, c2, "g-s");
    return s;
  };
  /** sorotan nomor baris & judul kolom yang tercakup blok */
  const kelasBaris = (r: number) => (tampil && rentang && r >= rentang.r1 && r <= rentang.r2 ? " g-pilih-baris" : "");
  const kelasKolom = (c: number) => (tampil && rentang && c >= rentang.c1 && c <= rentang.c2 ? " g-pilih-kolom" : "");

  return {
    terkini,
    adaSalinan,
    kelas,
    kelasBaris,
    kelasKolom,
    tetapkan,
    kumpul,
    segarkan,
    semua,
    perluas,
    tunjukkan,
    tandaiSalinan,
    hapusSalinan,
    onPointerDown,
    onMouseDown,
    onFocus,
    onBlur,
  };
}

/**
 * Cadangan salin/potong/tempel: sebagian browser mengirim kejadian clipboard ke <body> — bukan ke tabel — saat yang aktif sel
 * hanya-baca (fokus di tabel tanpa teks terpilih). Kejadian seperti itu diteruskan ke penangan tabel.
 */
function useClipboardTabel(
  ref: RefObject<HTMLTableElement | null>,
  salin: (data: DataTransfer, potong: boolean) => boolean,
  tempel?: (teks: string) => boolean,
) {
  const h = useRef({ salin, tempel });
  h.current = { salin, tempel };
  useEffect(() => {
    const keBody = (e: globalThis.ClipboardEvent) => {
      const t = ref.current;
      return !!t && !!e.clipboardData && !e.defaultPrevented && document.activeElement === t && !t.contains(e.target as Node);
    };
    const salinan = (potong: boolean) => (e: globalThis.ClipboardEvent) => {
      if (keBody(e) && h.current.salin(e.clipboardData!, potong)) e.preventDefault();
    };
    const onCopy = salinan(false);
    const onCut = salinan(true);
    const onPaste = (e: globalThis.ClipboardEvent) => {
      if (keBody(e) && h.current.tempel?.(e.clipboardData!.getData("text/plain"))) e.preventDefault();
    };
    document.addEventListener("copy", onCopy);
    document.addEventListener("cut", onCut);
    document.addEventListener("paste", onPaste);
    return () => {
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("cut", onCut);
      document.removeEventListener("paste", onPaste);
    };
  }, [ref]);
}

/** Baris JUMLAH · PPN 11% · TOTAL · Terbilang di bawah tabel */
function Ringkasan({
  kolomLabel,
  kolomSisa,
  jumlah,
  ppn,
  onPpn,
  label = "TOTAL JUMLAH",
  banding,
}: {
  kolomLabel: number;
  kolomSisa: number;
  jumlah: number;
  ppn: boolean;
  onPpn?: (v: boolean) => void;
  label?: string;
  /** baris pembanding di bawah total, mis. TOTAL HPS pada nota pembelian */
  banding?: { label: string; nilai: number; lebih: boolean };
}) {
  const p = ppn ? hitungPpn(jumlah) : 0;
  const total = jumlah + p;
  const sisa = kolomSisa > 0 ? <td colSpan={kolomSisa} className="g-sisa" /> : null;
  return (
    <tfoot>
      <tr>
        <td colSpan={kolomLabel} className="g-label">
          JUMLAH
        </td>
        <td className="g-angka num">{angka(jumlah)}</td>
        {sisa}
      </tr>
      <tr className={ppn ? undefined : "g-redup"}>
        <td colSpan={kolomLabel} className="g-label">
          {onPpn ? (
            <label className="g-ppn">
              <input type="checkbox" checked={ppn} onChange={(e) => onPpn(e.target.checked)} aria-label="Termasuk PPN 11%" />
              PPN 11%
            </label>
          ) : (
            "PPN 11%"
          )}
        </td>
        <td className="g-angka num">{ppn ? angka(p) : "–"}</td>
        {sisa}
      </tr>
      <tr className="g-total">
        <td colSpan={kolomLabel} className="g-label">
          {label}
        </td>
        <td className="g-angka num">{angka(total)}</td>
        {sisa}
      </tr>
      {banding && (
        <tr className={banding.lebih ? "g-lebih" : "g-banding"}>
          <td colSpan={kolomLabel} className="g-label">
            {banding.label}
          </td>
          <td className="g-angka num">{angka(banding.nilai)}</td>
          {sisa}
        </tr>
      )}
      <tr>
        <td colSpan={kolomLabel + 1 + kolomSisa} className="g-terbilang">
          <b>Terbilang:</b> <i>{total > 0 ? terbilangRupiah(total) : "–"}</i>
        </td>
      </tr>
    </tfoot>
  );
}

/* =====================================================================
   Memasang hasil tempel ke baris tabel HPS
   ===================================================================== */
/** Kolom tabel aplikasi untuk tempel satu kolom (mis. hanya kolom Jumlah) */
const JUDUL_SATU_KOLOM = /^(no\.?|nomor|uraian( barang(\/jasa)?)?|nama barang(\/jasa)?|barang|item|satuan|sat\.?|keterangan|ket\.?|spesifikasi|volume|vol\.?|qty|jumlah|harga( satuan)?( \(rp\))?)$/i;

/** Tafsir salinan satu kolom: selalu ke kolom yang dipilih, judul kolomnya (bila ikut tersalin) dilewati */
function tafsirSatuKolom(data: string[][], posisi: number): Tafsir {
  const pertama = data.findIndex((r) => (r[0] ?? "").trim());
  const judul = pertama >= 0 && JUDUL_SATU_KOLOM.test(data[pertama][0].trim()) && peranJudul(data[pertama][0]) !== null;
  return {
    peran: [URUTAN_TABEL[posisi] ?? "uraian"],
    judul: [judul ? data[pertama][0].trim() : ""],
    awalJudul: judul ? pertama : -1,
    akhirJudul: judul ? pertama : -1,
    sumber: "posisi",
    ragu: false,
  };
}

/** Tabel HPS tanpa baris spesifikasi: baris "- …" / tanpa angka menjadi baris sendiri, spesifikasi sebaris digabung ke uraian */
const golongkanHps = (data: string[][], t: Tafsir, paksa: Record<number, JenisBaris> = {}) => golongkan(data, t, paksa, { tanpaSpek: true });
const susunHps = (data: string[][], t: Tafsir, g: Golongan) => susunBarang(data, t.peran, g.jenis, { gabungSpek: true });

interface HasilPasang {
  xs: BarisBarang[];
  masuk: number;
  lewat: number;
  kunci: number[];
}
/**
 * timpa: mulai baris `mulai` (seperti tempel di Excel; isian yang tidak dimuat salinan tetap),
 * tambah: sesudah baris terisi terakhir, ganti: seluruh tabel diganti.
 */
function pasangTempel(nilai: BarisBarang[], s: Susunan, mode: ModeTempel, mulai: number): HasilPasang {
  let xs = nilai.map((x) => ({ ...x }));
  let awal = mulai;
  if (mode === "ganti") {
    xs = [];
    awal = 0;
  } else if (mode === "tambah") {
    awal = xs.length;
    while (awal > 0 && !barisTerisi(xs[awal - 1])) awal--;
  }
  const kunci: number[] = [];
  let masuk = 0;
  let lewat = 0;
  s.barang.forEach((m, k) => {
    const i = awal + k;
    if (i >= MAKS_BARANG) return void lewat++;
    while (xs.length <= i) xs.push(barisKosong());
    const x = xs[i];
    if (s.cakup.uraian) x.uraian = m.uraian.slice(0, 200);
    if (s.cakup.jumlah) x.jumlah = m.jumlah;
    if (s.cakup.satuan) x.satuan = m.satuan.slice(0, 30);
    if (s.cakup.harga) x.harga = m.harga;
    if (s.cakup.ket) x.ket = m.ket.slice(0, 100);
    kunci.push(x.kunci);
    masuk++;
  });
  if (mode === "ganti" && xs.length < MAKS_BARANG) xs.push(barisKosong());
  if (!xs.length) xs.push(barisKosong());
  return { xs, masuk, lewat, kunci };
}

const CATATAN: Record<KodeCatatan, (n: number) => string> = {
  hargaDariTotal: (n) => `harga satuan ${n} barang dihitung dari total ÷ jumlah`,
  jumlahBulat: (n) => `jumlah ${n} barang dibulatkan`,
  hargaBulat: (n) => `harga ${n} barang dibulatkan ke rupiah`,
  totalBeda: (n) => `total di salinan untuk ${n} barang tidak sama dengan jumlah × harga — periksa kolomnya`,
};

/**
 * Ringkasan untuk bilah hasil tempel. null bila tempel blok biasa (susunan kolom sama, tanpa baris dilewati/catatan):
 * cukup ditandai blok hasil tempel seperti Excel. `selalu` = tetap tampil (dari dialog atau daftar diganti).
 */
function isiBilahHps(data: string[][], t: Tafsir, g: Golongan, s: Susunan, h: HasilPasang, ppnDicentang: boolean, selalu: boolean, ganti: boolean): IsiBilah | null {
  const alasan = g.jenis.flatMap((j, i) => (j === "lewati" && data[i].some((c) => c.trim()) ? [g.alasan[i]] : []));
  const catatan: string[] = [];
  const hitung = new Map<KodeCatatan, number>();
  s.barang.forEach((b) => new Set(b.catatan.map((c) => c.kode)).forEach((k) => hitung.set(k, (hitung.get(k) ?? 0) + 1)));
  hitung.forEach((n, k) => catatan.push(CATATAN[k](n)));
  const panjang = s.barang.filter((b) => b.uraian.length > 200).length;
  if (panjang) catatan.push(`uraian ${panjang} barang dipotong menjadi 200 huruf`);
  if (ppnDicentang) catatan.push("PPN 11% dicentang karena salinan memuat baris PPN");
  if (h.lewat) catatan.push(`${h.lewat} barang tidak masuk (maksimal ${MAKS_BARANG} barang/jasa per paket)`);
  if (!selalu && t.sumber === "posisi" && !alasan.length && !catatan.length) return null;
  const belum = h.xs.filter((x) => h.kunci.includes(x.kunci) && salahBarang(x).length > 0).length;
  if (belum) catatan.unshift(`${belum} barang belum lengkap — lengkapi sel merah`);
  const judul =
    (ganti ? "Daftar diganti: " : "") +
    `${h.masuk} barang/jasa ditempel` +
    (alasan.length ? ` · ${alasan.length} baris dilewati (${[...new Set(alasan)].join(", ")})` : "");
  return { jenis: "hasil", judul, kolom: uraianKolom(t), catatan };
}

/* =====================================================================
   Tahap 1 — tabel HPS yang bisa diisi (satu baris = satu barang/jasa)
   ===================================================================== */
interface AsalTempel {
  mode: ModeTempel;
  /** baris tempat menimpa */
  mulai: number;
  /** kolom aplikasi tempat menempel (URUTAN_TABEL) untuk tempel berurutan; kosong = kenali dari judul/isi */
  posisi?: number;
  /** selalu tampilkan dialog atur kolom & baris (tombol Tempel dari Excel) */
  dialog?: boolean;
}
interface TempelAktif {
  data: string[][];
  tafsir: Tafsir;
  paksa: Record<number, JenisBaris>;
  asal: AsalTempel;
  /** isi tabel sebelum tempel (null = tempel belum dipasang) */
  sebelum: { nilai: BarisBarang[]; ppn: boolean } | null;
}

export function TabelHps({
  nilai,
  onChange,
  ppn,
  onPpn,
  coba = 0,
  onInfo,
}: {
  nilai: BarisBarang[];
  onChange: (xs: BarisBarang[]) => void;
  ppn: boolean;
  onPpn: (v: boolean) => void;
  /** bertambah setiap kali simpan gagal karena isian tabel → sel yang salah ditandai merah & sel pertama difokuskan */
  coba?: number;
  /** pesan singkat (toast) */
  onInfo?: (pesan: string) => void;
}) {
  const ref = useRef<HTMLTableElement>(null);
  const { fokus, nanti } = useFokusSel(ref);
  /** kolom tempat mulai menekan Tab → Enter kembali ke kolom itu di baris berikutnya (seperti Excel) */
  const tabAwal = useRef<{ r: number; c: KolomBarang } | null>(null);
  /**
   * Ubah paket lama: spesifikasinya kini menjadi baris uraian tersendiri yang belum berjumlah/berharga
   * (barang yang sudah tersimpan selalu lengkap) → langsung ditandai merah & diberi petunjuk.
   */
  const [awalBelum] = useState(() => nilai.filter((b) => barisTerisi(b) && salahBarang(b).length > 0).map((b) => b.kunci));
  /** hasil tempel terakhir (bilah ringkasan) & dialog atur kolom/baris */
  const [bilah, setBilah] = useState<{ isi: IsiBilah; tempel?: TempelAktif } | null>(() =>
    awalBelum.length
      ? {
          isi: {
            jenis: "info",
            judul: `${awalBelum.length} baris uraian belum lengkap (dulu spesifikasi barang di atasnya)`,
            catatan: ["isi jumlah, satuan, dan harga satuannya — bila hanya keterangan barang, tulis di Uraian barangnya (mis. Solar non subsidi) lalu hapus barisnya"],
          },
        }
      : null,
  );
  const [dialog, setDialog] = useState<TempelAktif | null>(null);
  /** baris hasil tempel (dan baris bekas spesifikasi paket lama): sel wajibnya yang kosong langsung ditandai merah */
  const [sorot, setSorot] = useState<Set<number>>(() => new Set(awalBelum));
  // satu baris tabel = satu barang/jasa: nomor baris tampilan sama dengan indeks barang
  const blok = useBlok(ref, nilai.length, 6);
  const riwayat = useRiwayat({ nilai, ppn }, (v) => {
    if (v.ppn !== ppn) onPpn(v.ppn);
    onChange(v.nilai);
    setBilah(null);
    blok.tetapkan(null);
    blok.hapusSalinan();
    blok.segarkan();
  });
  const tandai = coba > 0;

  // Nomor urut hanya untuk baris yang terisi (sama dengan nomor yang tercetak)
  let n = 0;
  const nomor = nilai.map((b) => (barisTerisi(b) ? ++n : 0));
  const jumlahRp = nilai.reduce((s, b) => s + (Number(b.jumlah) || 0) * (Number(b.harga) || 0), 0);
  const totalRp = jumlahRp + (ppn ? hitungPpn(jumlahRp) : 0);
  let akhirIsi = nilai.length;
  while (akhirIsi > 0 && !barisTerisi(nilai[akhirIsi - 1])) akhirIsi--;

  // Simpan gagal → fokus ke sel pertama yang belum benar
  useEffect(() => {
    if (coba <= 0) return;
    const i = nilai.findIndex((b) => barisTerisi(b) && salahBarang(b).length > 0);
    if (i >= 0) fokus(i, salahBarang(nilai[i])[0]);
    else if (!nilai.some(barisTerisi)) fokus(0, "uraian");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coba]);

  /**
   * Semua perubahan isi tabel lewat sini agar tercatat di riwayat urungkan.
   * `sel` = sel yang sedang diketik → blok kembali satu sel di sana (seperti Excel).
   */
  const ganti = (xs: BarisBarang[], aksi = "ubah", sel?: Titik) => {
    riwayat.catat(aksi);
    if (bilah) setBilah(null);
    blok.hapusSalinan();
    if (sel) blok.kumpul(sel);
    else if (/^baris[+-]$/.test(aksi)) blok.tetapkan(null);
    else blok.segarkan();
    onChange(xs);
  };
  const gantiPpn = (v: boolean) => {
    riwayat.catat("ppn");
    onPpn(v);
  };
  const ubah = (i: number, kolom: KolomBarang, v: string) =>
    ganti(
      nilai.map((x, k) => (k === i ? { ...x, [kolom]: v } : x)),
      `ketik:${nilai[i].kunci}:${kolom}`,
      { r: i, c: INDEKS_KOLOM[kolom] },
    );

  /** baris kosong baru sesudah baris ke-`setelah`, lalu kursor ke sana */
  const tambahBaris = (setelah: number, kolom: KolomBarang = "uraian") => {
    if (nilai.length >= MAKS_BARANG) return onInfo?.(`Maksimal ${MAKS_BARANG} barang/jasa dalam satu paket`);
    const xs = [...nilai.slice(0, setelah + 1), barisKosong(), ...nilai.slice(setelah + 1)];
    nanti(setelah + 1, kolom);
    ganti(xs, "baris+");
  };
  const hapusBaris = (i: number) => {
    const sisa = nilai.filter((_, k) => k !== i);
    const xs = sisa.length ? sisa : [barisKosong()];
    nanti(Math.min(i, xs.length - 1), "uraian");
    ganti(xs, "baris-");
  };

  /* ---------- Blok sel ---------- */
  const titikIsian = (el: HTMLElement): Titik | null =>
    el.tagName === "INPUT" && el.dataset.r !== undefined ? { r: Number(el.dataset.r), c: INDEKS_KOLOM[el.dataset.c as KolomBarang] ?? 1 } : null;
  /** isi sel (r, c) untuk disalin; angka tanpa titik ribuan agar terbaca sebagai angka di Excel */
  const nilaiSel = (r: number, c: number): string => {
    const x = nilai[r];
    if (!x) return "";
    if (c === 0) return nomor[r] ? String(nomor[r]) : "";
    if (c === 5) {
      const t = (Number(x.jumlah) || 0) * (Number(x.harga) || 0);
      return t ? String(t) : "";
    }
    const k = KOLOM_DI[c];
    return k ? x[k] : "";
  };
  const adaIsian = (g: Rentang) => KOLOM_DI.slice(g.c1, g.c2 + 1).some(Boolean);
  /** isi satu sel dengan teks (angka untuk kolom Jumlah & Harga); kolom No. & Total dilewati */
  const isiSel = (x: BarisBarang, c: number, teks: string) => {
    const k = KOLOM_DI[c];
    if (!k) return;
    const v = teks.replace(/\s*\n\s*/g, " ").trim();
    if (k === "jumlah" || k === "harga") x[k] = digitDari(v);
    else if (k === "uraian") x.uraian = tanpaTanda(v).slice(0, 200);
    else x[k] = v.slice(0, k === "satuan" ? 30 : 100);
  };
  /** ubah semua sel blok; false bila tidak ada yang berubah */
  const ubahRentang = (g: Rentang, aksi: string, isi: (x: BarisBarang, c: number) => void) => {
    const xs = nilai.map((x) => ({ ...x }));
    for (let r = g.r1; r <= g.r2; r++) {
      const x = xs[r];
      if (x) for (let c = g.c1; c <= g.c2; c++) isi(x, c);
    }
    if (xs.every((x, i) => samaBaris(x, nilai[i]))) return false;
    ganti(xs, aksi);
    return true;
  };
  const kosongkanRentang = (g: Rentang) => ubahRentang(g, "hapus", (x, c) => isiSel(x, c, ""));
  /** satu nilai salinan → semua sel blok (seperti Excel) */
  const isiRentang = (g: Rentang, teks: string) => {
    if (!adaIsian(g)) return onInfo?.("Kolom No. dan Total Jumlah terisi otomatis");
    ubahRentang(g, "isi", (x, c) => isiSel(x, c, teks));
  };
  /** satu baris salinan → diulang ke tiap baris blok (lebar blok kelipatan lebar salinan) */
  const ulangBaris = (g: Rentang, sel: string[]) => ubahRentang(g, "isi", (x, c) => isiSel(x, c, sel[(c - g.c1) % sel.length] ?? ""));
  /** Ctrl/⌘+C / X: blok (atau sel aktif yang belum disunting) → clipboard sebagai sel-sel Excel; false = salin biasa */
  const salinKe = (data: DataTransfer, sasaran: EventTarget | null, potong: boolean) => {
    const { rentang: g, banyak } = blok.terkini();
    if (!g) return false;
    // sedang menyunting dengan sebagian teks terpilih: salin teks itu saja seperti biasa
    if (!banyak && sasaran instanceof HTMLInputElement && sasaran.selectionStart !== sasaran.selectionEnd && !seluruh(sasaran)) return false;
    data.setData("text/plain", tsvRentang(g, nilaiSel));
    if (potong) kosongkanRentang(g);
    else blok.tandaiSalinan(g);
    return true;
  };
  const salinBlok = (e: ClipboardEvent<HTMLTableElement>, potong: boolean) => {
    if (salinKe(e.clipboardData, e.target, potong)) e.preventDefault();
  };

  /* ---------- Tempel dari Excel ---------- */
  /** `dariDialog` = hasil "Atur kolom & baris…" → bilah selalu tampil agar pilihannya bisa diatur ulang */
  const pasang = (tp: TempelAktif, g: Golongan, s: Susunan, dariDialog = false) => {
    const dasar = tp.sebelum ?? { nilai, ppn };
    const h = pasangTempel(dasar.nilai, s, tp.asal.mode, tp.asal.mulai);
    if (!h.masuk) return onInfo?.("Tidak ada baris barang/jasa yang bisa ditempel");
    // tempel ulang dari "Atur kolom & baris…" memakai isi tabel sebelum tempel; riwayatnya sudah tercatat
    if (!tp.sebelum) riwayat.catat("tempel");
    blok.hapusSalinan();
    const ppnDicentang = g.adaPpn && !dasar.ppn;
    if ((ppnDicentang || dasar.ppn) !== ppn) onPpn(ppnDicentang || dasar.ppn);
    onChange(h.xs);
    setSorot(new Set(h.kunci));
    const diganti = tp.asal.mode === "ganti" && dasar.nilai.some(barisTerisi);
    const isi = isiBilahHps(tp.data, tp.tafsir, g, s, h, ppnDicentang, dariDialog || diganti, diganti);
    setBilah(isi ? { isi, tempel: { ...tp, sebelum: dasar } } : null);
    // sel hasil tempel menjadi blok terpilih, seperti sesudah tempel di Excel (kolom Spesifikasi masuk ke Uraian)
    const idx = h.kunci.map((k) => h.xs.findIndex((x) => x.kunci === k)).filter((i) => i >= 0);
    const kolom = tp.tafsir.peran.map((p) => URUTAN_TABEL.indexOf(p === "spek" ? "uraian" : p)).filter((c) => c > 0);
    if (idx.length && kolom.length) blok.tetapkan({ r: Math.min(...idx), c: Math.min(...kolom) }, { r: Math.max(...idx), c: Math.max(...kolom) }, true);
    else blok.tetapkan(null);
  };

  const prosesTempel = (teks: string, asal: AsalTempel) => {
    const data = bacaSalinan(teks);
    if (!data.length) return;
    const satuKolom = Math.max(...data.map((r) => r.length)) <= 1;
    const tafsir = satuKolom && asal.posisi !== undefined ? tafsirSatuKolom(data, asal.posisi) : tafsirTabel(data, { posisi: asal.posisi });
    const tp: TempelAktif = { data, tafsir, paksa: {}, asal, sebelum: null };
    if (asal.dialog || tafsir.ragu) return setDialog(tp);
    const g = golongkanHps(data, tafsir);
    pasang(tp, g, susunHps(data, tafsir, g));
  };

  /** salinan beberapa sel → mulai sel kiri-atas blok, seperti Excel; susunan kolom lain dikenali dari judul/isinya */
  const tempelBlok = (mentah: string, g: Rentang) => {
    const data = bacaSalinan(mentah);
    if (!data.length) return;
    const lebarData = Math.max(...data.map((d) => d.length));
    const lebarBlok = g.c2 - g.c1 + 1;
    const semuaSel = g.r1 === 0 && g.r2 === nilai.length - 1 && g.c1 === 0 && g.c2 === 6;
    // satu baris salinan ke blok beberapa baris yang lebarnya kelipatan salinan → diulang ke tiap baris (seperti Excel)
    if (data.length === 1 && g.r2 > g.r1 && !semuaSel && lebarBlok % lebarData === 0) return void ulangBaris(g, data[0]);
    // blok mulai di kolom No. (baris penuh / semua sel): salinan tanpa kolom nomor masuk mulai kolom Uraian
    const posisi = g.c1 === 0 && !kolomNomor(data) ? 1 : g.c1;
    if (lebarData === 1 && (posisi === 0 || posisi === 5)) return onInfo?.("Kolom No. dan Total Jumlah terisi otomatis — tempel ke kolom lain");
    prosesTempel(mentah, { mode: semuaSel ? "ganti" : "timpa", mulai: g.r1, posisi });
  };

  /**
   * Ctrl/⌘+V di tabel: mulai sel kiri-atas blok (atau sel isian aktif); satu nilai ke semua sel blok.
   * `isian` = sel isian tempat menempel (null = fokus di tabel). false = bukan urusan tabel (tempel biasa / ditambahkan di bawah).
   */
  const tempelKe = (mentah: string, isian: Titik | null) => {
    const { rentang: g, banyak } = blok.terkini();
    const keBlok = !!g && (banyak || !isian);
    if (!banyakSel(mentah)) {
      if (!keBlok || !g) return false; // satu nilai ke satu sel isian: ditempel isian itu sendiri
      isiRentang(g, nilaiTunggal(mentah));
      return true;
    }
    const tujuan = keBlok && g ? g : isian ? { r1: isian.r, r2: isian.r, c1: isian.c, c2: isian.c } : null;
    if (!tujuan) return false;
    tempelBlok(mentah, tujuan);
    return true;
  };
  const onPasteCapture = (e: ClipboardEvent<HTMLTableElement>) => {
    const naTabel = e.target === ref.current;
    const isian = naTabel ? null : titikIsian(e.target as HTMLElement);
    if (!naTabel && !isian) return;
    if (!tempelKe(e.clipboardData.getData("text/plain"), isian)) return;
    e.preventDefault();
    e.stopPropagation();
  };

  // Ctrl/⌘+V saat kursor tidak di tabel / isian mana pun (mis. sesudah Esc atau klik tombol) → ditambahkan di bawah barang yang ada
  const tempelLuar = useRef<(teks: string) => void>(() => {});
  tempelLuar.current = (teks) => prosesTempel(teks, { mode: "tambah", mulai: akhirIsi });
  const tempelTabel = useRef<(teks: string) => boolean>(() => false);
  tempelTabel.current = (teks) => tempelKe(teks, null);
  useClipboardTabel(ref, (data, potong) => salinKe(data, null, potong));
  const urungLuar = useRef<(ulang: boolean) => void>(() => {});
  urungLuar.current = (ulang) => (ulang ? riwayat.ulangi() : riwayat.urungkan());
  const adaDialog = dialog !== null;
  useEffect(() => {
    if (adaDialog) return;
    const bebas = () => {
      const a = document.activeElement as HTMLElement | null;
      return !(a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.tagName === "SELECT" || a.isContentEditable));
    };
    const onPaste = (e: globalThis.ClipboardEvent) => {
      if (e.defaultPrevented) return;
      const teks = e.clipboardData?.getData("text/plain") ?? "";
      // fokus di tabel (sel hanya-baca aktif) tetapi browser mengirim kejadian ke <body>: tempel ke blok
      const t = ref.current;
      if (t && document.activeElement === t && !t.contains(e.target as Node) && tempelTabel.current(teks)) return e.preventDefault();
      if (!bebas() || !banyakSel(teks)) return;
      e.preventDefault();
      tempelLuar.current(teks);
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.defaultPrevented || !bebas() || !(e.ctrlKey || e.metaKey) || e.altKey) return;
      const k = e.key.toLowerCase();
      const ulang = (k === "z" && e.shiftKey) || (k === "y" && e.ctrlKey && !e.metaKey);
      if (k !== "z" && !ulang) return;
      e.preventDefault();
      urungLuar.current(ulang);
    };
    document.addEventListener("paste", onPaste);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("paste", onPaste);
      document.removeEventListener("keydown", onKey);
    };
  }, [adaDialog]);

  const tempelTombol = async () => {
    const teks = await bacaClipboard();
    if (!banyakSel(teks))
      return setBilah({
        isi: {
          jenis: "info",
          judul: teks.trim()
            ? "Salinan hanya berisi satu sel. Blok baris-baris barang di Excel (boleh termasuk judul kolom), salin, lalu klik Tempel dari Excel lagi."
            : "Browser belum mengizinkan membaca salinan. Blok baris-baris barang di Excel lalu salin (⌘C / Ctrl+C), klik sel Uraian di tabel, kemudian tekan ⌘V / Ctrl+V.",
        },
      });
    prosesTempel(teks, { mode: akhirIsi > 0 ? "tambah" : "ganti", mulai: akhirIsi, dialog: true });
  };

  const salinExcel = async () => {
    const isi = nilai.filter(barisTerisi);
    if (!isi.length) return onInfo?.("Tabel masih kosong");
    const ok = await salinTeks(
      tsvBarang(
        isi.map((b) => ({ uraian: b.uraian.trim(), spek: [], jumlah: Number(b.jumlah) || 0, satuan: b.satuan.trim(), harga: Number(b.harga) || 0, ket: b.ket.trim() })),
        { ppn },
      ),
    );
    onInfo?.(ok ? `${isi.length} barang/jasa disalin — tempel di Excel dengan ⌘V / Ctrl+V` : "Browser menolak menyalin ke clipboard");
  };

  const urungkan = () => {
    if (!riwayat.urungkan()) onInfo?.("Tidak ada yang bisa diurungkan");
  };
  const ulangi = () => {
    if (!riwayat.ulangi()) onInfo?.("Tidak ada yang bisa diulangi");
  };

  /** pindah sel aktif: sel berisian difokuskan, sel hanya-baca (No., Total Jumlah) dipilih dengan fokus tetap di tabel */
  const pindahSel = (t: Titik) => {
    const k = KOLOM_DI[t.c];
    if (k && fokus(t.r, k)) return;
    blok.tetapkan(t);
    blok.tunjukkan(t);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTableElement>) => {
    const el = e.target as HTMLInputElement;
    const naTabel = e.target === ref.current;
    const isian = naTabel ? null : titikIsian(el);
    if ((!naTabel && !isian) || e.nativeEvent.isComposing) return;
    if (tombolUrung(e) || tombolUlang(e)) {
      e.preventDefault();
      return tombolUrung(e) ? urungkan() : ulangi();
    }
    const { pilih, rentang: g, banyak } = blok.terkini();
    const aktif: Titik = isian ?? pilih?.a ?? { r: 0, c: 1 };
    // "siap" = sel terpilih tetapi belum disunting (mode Ready di Excel): Shift+panah & Ctrl/⌘+A memblok sel
    const siap = naTabel || banyak || !el.value || seluruh(el);
    if (e.key === "Escape" && blok.adaSalinan()) {
      // Esc pertama menghapus garis putus-putus blok yang disalin (seperti Excel)
      e.preventDefault();
      e.stopPropagation();
      return blok.hapusSalinan();
    }
    if (ARAH[e.key] && e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey && siap) {
      e.preventDefault();
      const [dr, dc] = ARAH[e.key];
      return blok.perluas(dr, dc, aktif);
    }
    if (tombolSemua(e) && siap) {
      e.preventDefault();
      return blok.semua();
    }
    if (g && (banyak || naTabel)) {
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        return void kosongkanRentang(g);
      }
      if (banyak && e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        return blok.kumpul(aktif);
      }
      if (banyak && (ARAH[e.key] || e.key === "Enter" || e.key === "Tab")) blok.kumpul(aktif);
    }
    if (naTabel) {
      // sel aktif hanya-baca (No., Total Jumlah): panah/Enter/Tab memindah sel aktif
      const gerak: [number, number] | undefined =
        ARAH[e.key] && !e.shiftKey ? ARAH[e.key] : e.key === "Enter" ? [e.shiftKey ? -1 : 1, 0] : e.key === "Tab" ? [0, e.shiftKey ? -1 : 1] : undefined;
      if (gerak && !e.altKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        return pindahSel({ r: jepit(aktif.r + gerak[0], 0, nilai.length - 1), c: jepit(aktif.c + gerak[1], 0, 6) });
      }
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        blok.tetapkan(null);
        ref.current?.blur();
      }
      return;
    }
    const r = Number(el.dataset.r);
    const c = el.dataset.c as KolomBarang;
    const x = nilai[r];
    if (!x) return;
    const kosong = el.value.length === 0;
    switch (e.key) {
      case "Escape":
        // keluar dari sel saja (isian tabel tidak hilang karena salah tekan)
        e.preventDefault();
        e.stopPropagation();
        blok.tetapkan(null);
        el.blur();
        return;
      case "F2":
        e.preventDefault();
        el.setSelectionRange(el.value.length, el.value.length);
        return;
      case "Enter": {
        e.preventDefault(); // jangan mengirim form
        // Alt/⌥+Enter: sisipkan baris kosong di bawah baris ini
        if (e.altKey) return tambahBaris(r, "uraian");
        if (e.ctrlKey || e.metaKey) return;
        if (e.shiftKey) {
          tabAwal.current = null;
          if (r > 0) fokus(r - 1, c);
          return;
        }
        const kolom = tabAwal.current?.r === r ? tabAwal.current.c : c;
        tabAwal.current = null;
        if (r + 1 < nilai.length) fokus(r + 1, kolom);
        else if (barisTerisi(x)) tambahBaris(r, kolom);
        return;
      }
      case "Tab":
        if (!e.shiftKey && tabAwal.current?.r !== r) tabAwal.current = { r, c };
        return;
      case "ArrowDown":
      case "ArrowUp": {
        // di kolom Satuan panah dipakai memilih saran satuan selama sedang mengetik
        if (c === "satuan" && !kosong && !seluruh(el)) return;
        if (e.altKey || e.shiftKey) return;
        e.preventDefault();
        const k = r + (e.key === "ArrowDown" ? 1 : -1);
        if (k >= 0 && k < nilai.length) fokus(k, c);
        return;
      }
      case "ArrowLeft":
      case "ArrowRight": {
        if (e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return;
        const kiri = e.key === "ArrowLeft";
        const s = el.selectionStart ?? 0;
        const t = el.selectionEnd ?? 0;
        if (!(seluruh(el) || (kiri ? s === 0 && t === 0 : s === el.value.length && t === el.value.length))) return;
        const k = KOLOM_BARANG.indexOf(c) + (kiri ? -1 : 1);
        if (k < 0 || k >= KOLOM_BARANG.length) return;
        e.preventDefault();
        fokus(r, KOLOM_BARANG[k]);
        return;
      }
    }
  };

  /** klik dua kali di sel isian: sunting isinya (kursor di akhir teks) */
  const onDoubleClick = (e: MouseEvent<HTMLTableElement>) => {
    const input = isianDi((e.target as HTMLElement).closest<HTMLElement>("td[data-sr]"));
    if (!input) return;
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  };

  const kelasSel = (x: BarisBarang, kolom: KolomBarang, tambahan = "") =>
    `g-sel${tambahan}${(tandai || sorot.has(x.kunci)) && barisTerisi(x) && salahBarang(x).includes(kolom) ? " g-salah" : ""}`;
  const kosongSemua = n === 0;

  return (
    <div className="full tabel-isian">
      <div className="tabel-isian-kepala">
        <div className="tik-judul">
          <b>Daftar barang/jasa (HPS)</b>
          <small>
            {n} barang/jasa · total <b className="num">{rupiah(totalRp)}</b>
          </small>
        </div>
        <div className="tik-alat">
          <button type="button" className="btn soft sm" onClick={tempelTombol} title="Tempel daftar barang yang sudah disalin dari Excel / Google Sheets">
            <Icon name="clipboard" />
            <span>
              Tempel<span className="tik-lengkap"> dari Excel</span>
            </span>
          </button>
          <button type="button" className="btn soft sm" onClick={salinExcel} disabled={!n} title="Salin seluruh tabel untuk ditempel di Excel">
            <Icon name="copy" />
            <span>
              Salin<span className="tik-lengkap"> ke Excel</span>
            </span>
          </button>
          <button type="button" className="btn soft sm ikon" onClick={urungkan} disabled={!riwayat.bisaUrung} title="Urungkan (⌘/Ctrl+Z)" aria-label="Urungkan">
            <Icon name="undo" />
          </button>
          <button type="button" className="btn soft sm ikon" onClick={ulangi} disabled={!riwayat.bisaUlang} title="Ulangi (⌘/Ctrl+Shift+Z)" aria-label="Ulangi">
            <Icon name="redo" />
          </button>
        </div>
      </div>
      {bilah && (
        <BilahTempel
          isi={bilah.isi}
          onAtur={bilah.tempel ? () => setDialog(bilah.tempel!) : undefined}
          onUrungkan={bilah.isi.jenis === "hasil" ? urungkan : undefined}
          onTutup={() => setBilah(null)}
        />
      )}
      <div className="grid-excel-wrap">
        <table
          className="grid-excel g-blok"
          ref={ref}
          tabIndex={-1}
          onKeyDown={onKeyDown}
          onPasteCapture={onPasteCapture}
          onCopy={(e) => salinBlok(e, false)}
          onCut={(e) => salinBlok(e, true)}
          onPointerDown={blok.onPointerDown}
          onMouseDown={(e) => {
            tabAwal.current = null;
            blok.onMouseDown(e);
          }}
          onDoubleClick={onDoubleClick}
          onFocus={(e) => {
            riwayat.putus();
            blok.onFocus(e, titikIsian);
          }}
          onBlur={blok.onBlur}
        >
          <colgroup>
            <col className="k-no" />
            <col className="k-uraian" />
            <col className="k-jumlah" />
            <col className="k-satuan" />
            <col className="k-harga" />
            <col className="k-total" />
            <col className="k-ket" />
            <col className="k-aksi" />
          </colgroup>
          <thead>
            <tr>
              <th className={"g-no" + blok.kelasKolom(0)} data-hc={0} title="Pilih semua sel">
                No.
              </th>
              <th data-hc={1} className={blok.kelasKolom(1)}>
                Uraian
              </th>
              <th data-hc={2} className={"r" + blok.kelasKolom(2)}>
                Jumlah
              </th>
              <th data-hc={3} className={blok.kelasKolom(3)}>
                Satuan
              </th>
              <th data-hc={4} className={"r" + blok.kelasKolom(4)}>
                Harga Satuan (Rp)
              </th>
              <th data-hc={5} className={"r" + blok.kelasKolom(5)}>
                Total Jumlah (Rp)
              </th>
              <th data-hc={6} className={blok.kelasKolom(6)}>
                Ket
              </th>
              <th className="g-aksi">
                <span className="sr">Aksi</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {nilai.map((x, r) => {
              const total = (Number(x.jumlah) || 0) * (Number(x.harga) || 0);
              const label = `baris ${r + 1}`;
              return (
                <tr key={x.kunci} className="g-barang">
                  <td className={"g-no num" + blok.kelas(r, 0) + blok.kelasBaris(r)} {...atributSel(r, 0)} data-penuh="1" title="Pilih seluruh baris">
                    {nomor[r] || ""}
                  </td>
                  <td className={kelasSel(x, "uraian") + blok.kelas(r, 1)} {...atributSel(r, 1)}>
                    <input
                      data-r={r}
                      data-c="uraian"
                      value={x.uraian}
                      maxLength={200}
                      onChange={(e) => ubah(r, "uraian", e.target.value)}
                      placeholder={r === 0 && kosongSemua ? "Ketik uraian, atau tempel daftar dari Excel (⌘V / Ctrl+V)" : undefined}
                      aria-label={`Uraian ${label}`}
                      autoComplete="off"
                    />
                  </td>
                  <td className={kelasSel(x, "jumlah", " r") + blok.kelas(r, 2)} {...atributSel(r, 2)}>
                    <InputRupiah
                      data-r={r}
                      data-c="jumlah"
                      value={x.jumlah}
                      onChange={(v) => ubah(r, "jumlah", v)}
                      maks={6}
                      placeholder=""
                      aria-label={`Jumlah ${label}`}
                    />
                  </td>
                  <td className={kelasSel(x, "satuan") + blok.kelas(r, 3)} {...atributSel(r, 3)}>
                    <input
                      data-r={r}
                      data-c="satuan"
                      list="satuan-umum"
                      value={x.satuan}
                      maxLength={30}
                      onChange={(e) => ubah(r, "satuan", e.target.value)}
                      aria-label={`Satuan ${label}`}
                      autoComplete="off"
                    />
                  </td>
                  <td className={kelasSel(x, "harga", " r") + blok.kelas(r, 4)} {...atributSel(r, 4)}>
                    <InputRupiah
                      data-r={r}
                      data-c="harga"
                      value={x.harga}
                      onChange={(v) => ubah(r, "harga", v)}
                      maks={11}
                      placeholder=""
                      aria-label={`Harga satuan ${label}`}
                    />
                  </td>
                  <td className={"g-hasil num" + blok.kelas(r, 5)} {...atributSel(r, 5)}>
                    {total > 0 ? angka(total) : ""}
                  </td>
                  <td className={"g-sel" + blok.kelas(r, 6)} {...atributSel(r, 6)}>
                    <input
                      data-r={r}
                      data-c="ket"
                      value={x.ket}
                      maxLength={100}
                      onChange={(e) => ubah(r, "ket", e.target.value)}
                      aria-label={`Keterangan ${label}`}
                      autoComplete="off"
                    />
                  </td>
                  <td className="g-aksi">
                    <button
                      type="button"
                      tabIndex={-1}
                      className="g-ib"
                      title="Sisipkan baris di bawah (Alt+Enter)"
                      aria-label={`Sisipkan baris di bawah ${label}`}
                      onClick={() => tambahBaris(r)}
                    >
                      <Icon name="plus" size={14} />
                    </button>
                    <button type="button" tabIndex={-1} className="g-ib bahaya" title="Hapus baris" aria-label={`Hapus ${label}`} onClick={() => hapusBaris(r)}>
                      <Icon name="trash" size={14} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <Ringkasan kolomLabel={5} kolomSisa={2} jumlah={jumlahRp} ppn={ppn} onPpn={gantiPpn} />
        </table>
      </div>
      <datalist id="satuan-umum">
        {SATUAN.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      <div className="tabel-isian-bawah">
        <button type="button" className="btn soft sm" onClick={() => tambahBaris(nilai.length - 1)} disabled={nilai.length >= MAKS_BARANG}>
          <Icon name="plus" />
          Tambah baris
        </button>
        <p className="tabel-isian-petunjuk">
          Satu baris = satu barang/jasa; keterangan barang ditulis langsung di <b>Uraian</b> (mis. <i>Solar non subsidi</i>).{" "}
          <span className="tip-mouse">
            <b>Seperti Excel:</b> blok sel dengan seret mouse, <kbd>Shift</kbd>+klik, atau <kbd>Shift</kbd>+panah (klik nomor baris / judul kolom
            untuk baris / kolom penuh) · <kbd>Ctrl/⌘</kbd>+<kbd>C</kbd> salin · <kbd>Ctrl/⌘</kbd>+<kbd>V</kbd> tempel mulai sel kiri-atas blok ·{" "}
            <kbd>Delete</kbd> kosongkan · <kbd>Ctrl/⌘</kbd>+<kbd>Z</kbd> urungkan · klik dua kali / <kbd>F2</kbd> sunting sel ·{" "}
            <kbd>Alt/⌥</kbd>+<kbd>Enter</kbd> sisipkan baris.{" "}
          </span>
          Baris kosong tidak ikut disimpan · maksimal {MAKS_BARANG} barang/jasa.
        </p>
      </div>
      {dialog && (
        <DialogTempel
          data={dialog.data}
          tafsir={dialog.tafsir}
          paksaAwal={dialog.paksa}
          modeAwal={dialog.asal.mode}
          mulai={dialog.asal.mode === "timpa" ? dialog.asal.mulai : null}
          akhirIsi={(() => {
            const dasar = dialog.sebelum?.nilai ?? nilai;
            let k = dasar.length;
            while (k > 0 && !barisTerisi(dasar[k - 1])) k--;
            return k;
          })()}
          maksBarang={MAKS_BARANG}
          onBatal={() => setDialog(null)}
          onMasukkan={(p) => {
            const tp: TempelAktif = { ...dialog, tafsir: p.tafsir, paksa: p.paksa, asal: { ...dialog.asal, mode: p.mode } };
            setDialog(null);
            pasang(tp, golongkanHps(dialog.data, p.tafsir, p.paksa), p.susunan, true);
          }}
        />
      )}
    </div>
  );
}

/* =====================================================================
   Tahap 3 — tabel harga pembelian
   ===================================================================== */
export function TabelBeli({
  item,
  harga,
  onHarga,
  ppn,
  onPpn,
  totalHps,
  onInfo,
}: {
  item: ItemPaket[];
  /** harga satuan pembelian per barang (digit) */
  harga: string[];
  onHarga: (h: string[]) => void;
  ppn: boolean;
  onPpn: (v: boolean) => void;
  totalHps: number;
  onInfo?: (pesan: string) => void;
}) {
  const ref = useRef<HTMLTableElement>(null);
  const { fokus } = useFokusSel(ref);
  const [bilah, setBilah] = useState<IsiBilah | null>(null);
  const nSpek = item.map((x) => x.spesifikasi.length);
  const baris = susunBaris(nSpek);
  // kolom: 0 No · 1 Uraian · 2 Jumlah · 3 Satuan · 4 Harga HPS · 5 Harga Satuan (isian) · 6 Jumlah (Rp)
  const blok = useBlok(ref, baris.length, 6);
  const riwayat = useRiwayat({ harga, ppn }, (v) => {
    onHarga(v.harga);
    if (v.ppn !== ppn) onPpn(v.ppn);
    setBilah(null);
    blok.tetapkan(null);
    blok.hapusSalinan();
    blok.segarkan();
  });
  const jumlahRp = item.reduce((s, x, i) => s + x.jumlah * (Number(harga[i]) || 0), 0);
  const total = jumlahRp + (ppn ? hitungPpn(jumlahRp) : 0);

  const gantiHarga = (h: string[], aksi: string, sel?: Titik) => {
    riwayat.catat(aksi);
    if (bilah) setBilah(null);
    blok.hapusSalinan();
    if (sel) blok.kumpul(sel);
    else blok.segarkan();
    onHarga(h);
  };
  const ubahHarga = (i: number, v: string) =>
    gantiHarga(
      harga.map((y, k) => (k === i ? v : y)),
      `ketik:${i}`,
      { r: indeksBaris(nSpek, i), c: 5 },
    );
  const gantiPpn = (v: boolean) => {
    riwayat.catat("ppn");
    onPpn(v);
  };
  const urungkan = () => {
    if (!riwayat.urungkan()) onInfo?.("Tidak ada yang bisa diurungkan");
  };
  const ulangi = () => {
    if (!riwayat.ulangi()) onInfo?.("Tidak ada yang bisa diulangi");
  };
  const pindah = (i: number, arah: 1 | -1) => {
    const k = i + arah;
    if (k >= 0 && k < item.length) fokus(indeksBaris(nSpek, k), "beli");
  };

  /* ---------- Blok sel ---------- */
  const titikIsian = (el: HTMLElement): Titik | null => (el.tagName === "INPUT" && el.dataset.r !== undefined ? { r: Number(el.dataset.r), c: 5 } : null);
  const nilaiSel = (r: number, c: number): string => {
    const b = baris[r];
    if (!b) return "";
    const x = item[b.i];
    if (b.jenis === "spek") return c === 1 ? x.spesifikasi[b.j] : "";
    const h = Number(harga[b.i]) || 0;
    return [String(b.i + 1), x.uraian, String(x.jumlah), x.satuan, String(x.hargaHps), harga[b.i] ?? "", h ? String(x.jumlah * h) : ""][c] ?? "";
  };
  /** ubah harga barang yang kolom Harga Satuan-nya tercakup blok; false bila tidak ada yang berubah */
  const ubahRentang = (g: Rentang, aksi: string, nilaiBaru: (i: number) => string) => {
    if (g.c1 > 5 || g.c2 < 5) return false;
    const h = [...harga];
    for (let r = g.r1; r <= g.r2; r++) {
      const b = baris[r];
      if (b?.jenis === "barang") h[b.i] = nilaiBaru(b.i);
    }
    if (h.every((v, i) => v === harga[i])) return false;
    gantiHarga(h, aksi);
    return true;
  };
  const salinKe = (data: DataTransfer, sasaran: EventTarget | null, potong: boolean) => {
    const { rentang: g, banyak } = blok.terkini();
    if (!g) return false;
    if (!banyak && sasaran instanceof HTMLInputElement && sasaran.selectionStart !== sasaran.selectionEnd && !seluruh(sasaran)) return false;
    data.setData("text/plain", tsvRentang(g, nilaiSel));
    if (potong) ubahRentang(g, "hapus", () => "");
    else blok.tandaiSalinan(g);
    return true;
  };
  const salinBlok = (e: ClipboardEvent<HTMLTableElement>, potong: boolean) => {
    if (salinKe(e.clipboardData, e.target, potong)) e.preventDefault();
  };

  /**
   * Tempel harga dari Excel: satu kolom harga (mulai dari barang yang dipilih), atau tabel nota/penawaran dengan
   * susunan kolom apa pun — barisnya dicocokkan dengan barang paket menurut nama, bila tidak bisa menurut urutan.
   */
  const prosesTempel = (teks: string, mulai: number) => {
    const data = bacaSalinan(teks);
    if (!data.length) return;
    const pasang: { i: number; harga: string; jumlah?: string }[] = [];
    const lepas: string[] = [];
    let cara = "menurut urutan";
    let berurutan = false;
    if (Math.max(...data.map((r) => r.length)) <= 1) {
      berurutan = true;
      data
        .map((r) => (r[0] ?? "").trim())
        .filter((v) => v && angkaDari(v) !== null)
        .forEach((v, k) => {
          const h = Math.round(angkaDari(v)!);
          if (mulai + k < item.length && h > 0) pasang.push({ i: mulai + k, harga: String(h) });
        });
    } else {
      const t = tafsirTabel(data, { posisi: URUTAN_TABEL.indexOf("harga") });
      const g = golongkan(data, t);
      const s = susunBarang(data, t.peran, g.jenis);
      const berharga = s.barang.filter((b) => b.harga);
      const nama = berharga.map((b) => b.uraian);
      let tujuan: (number | null)[] = berharga.map((_, k) => (mulai + k < item.length ? mulai + k : null));
      berurutan = t.sumber === "posisi";
      if (s.cakup.uraian && nama.some(Boolean)) {
        const cocok = cocokkanNama(
          item.map((x) => x.uraian),
          nama,
        );
        if (cocok.filter((x) => x !== null).length * 2 >= nama.length) {
          tujuan = cocok;
          cara = "dicocokkan menurut nama barang";
          berurutan = false;
          nama.forEach((x, k) => cocok[k] === null && lepas.push(x));
        }
      }
      berharga.forEach((b, k) => {
        const i = tujuan[k];
        if (i !== null && i !== undefined) pasang.push({ i, harga: b.harga, jumlah: b.jumlah });
      });
    }
    if (!pasang.length) return onInfo?.("Tidak ada harga yang bisa ditempel");
    const h = [...harga];
    pasang.forEach((p) => (h[p.i] = p.harga));
    gantiHarga(h, "tempel");
    const catatan: string[] = [];
    const beda = pasang.filter((p) => p.jumlah && Number(p.jumlah) !== item[p.i].jumlah);
    if (beda.length) catatan.push(`jumlah berbeda dengan HPS: ${beda.map((p) => `${item[p.i].uraian} ${p.jumlah} (HPS ${item[p.i].jumlah})`).join(", ")}`);
    if (lepas.length) catatan.push(`${lepas.length} baris tidak cocok dengan barang paket: ${lepas.slice(0, 3).join(", ")}${lepas.length > 3 ? ", …" : ""}`);
    // sel harga yang terisi menjadi blok terpilih
    const idx = pasang.map((p) => p.i);
    blok.tetapkan({ r: indeksBaris(nSpek, Math.min(...idx)), c: 5 }, { r: indeksBaris(nSpek, Math.max(...idx)), c: 5 }, true);
    // tempel kolom harga berurutan cukup ditandai blok; selain itu tampilkan ringkasannya
    setBilah(berurutan && !catatan.length ? null : { jenis: "hasil", judul: `${pasang.length} harga satuan ditempel (${cara})`, catatan });
  };

  /** Ctrl/⌘+V: satu nilai → semua sel Harga Satuan di blok; beberapa sel → mulai barang di baris kiri-atas blok */
  const tempelKe = (mentah: string, isian: Titik | null) => {
    const { rentang: g, banyak } = blok.terkini();
    const keBlok = !!g && (banyak || !isian);
    if (!banyakSel(mentah)) {
      if (!keBlok || !g) return false;
      if (g.c1 > 5 || g.c2 < 5) onInfo?.("Hanya kolom Harga Satuan yang bisa diisi");
      else if (!digitDari(nilaiTunggal(mentah))) onInfo?.("Salinan bukan angka harga");
      else ubahRentang(g, "isi", () => digitDari(nilaiTunggal(mentah)));
      return true;
    }
    const r = keBlok && g ? g.r1 : isian?.r;
    if (r === undefined) return false;
    const b = baris[r];
    prosesTempel(mentah, b ? (b.jenis === "barang" ? b.i : b.i + 1) : 0);
    return true;
  };
  const onPasteCapture = (e: ClipboardEvent<HTMLTableElement>) => {
    const naTabel = e.target === ref.current;
    const isian = naTabel ? null : titikIsian(e.target as HTMLElement);
    if (!naTabel && !isian) return;
    if (!tempelKe(e.clipboardData.getData("text/plain"), isian)) return;
    e.preventDefault();
    e.stopPropagation();
  };
  useClipboardTabel(
    ref,
    (data, potong) => salinKe(data, null, potong),
    (teks) => tempelKe(teks, null),
  );
  const tempelTombol = async () => {
    const teks = await bacaClipboard();
    if (!banyakSel(teks))
      return setBilah({
        jenis: "info",
        judul: teks.trim()
          ? "Salinan hanya berisi satu sel. Salin kolom harga (atau tabel nota) di Excel, lalu klik Tempel dari Excel lagi."
          : "Browser belum mengizinkan membaca salinan. Salin kolom harga di Excel, klik sel Harga Satuan barang pertama, lalu tekan ⌘V / Ctrl+V.",
      });
    prosesTempel(teks, 0);
  };

  /** pindah sel aktif; kolom selain Harga Satuan hanya-baca (dipilih dengan fokus di tabel) */
  const pindahSel = (t: Titik) => {
    if (t.c === 5 && baris[t.r]?.jenis === "barang" && fokus(t.r, "beli")) return;
    blok.tetapkan(t);
    if (document.activeElement !== ref.current) ref.current?.focus({ preventScroll: true });
    blok.tunjukkan(t);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTableElement>) => {
    const el = e.target as HTMLInputElement;
    const naTabel = e.target === ref.current;
    const isian = naTabel ? null : titikIsian(el);
    if ((!naTabel && !isian) || e.nativeEvent.isComposing) return;
    if (tombolUrung(e) || tombolUlang(e)) {
      e.preventDefault();
      return tombolUrung(e) ? urungkan() : ulangi();
    }
    const { pilih, rentang: g, banyak } = blok.terkini();
    const aktif: Titik = isian ?? pilih?.a ?? { r: 0, c: 5 };
    const siap = naTabel || banyak || !el.value || seluruh(el);
    if (e.key === "Escape" && blok.adaSalinan()) {
      e.preventDefault();
      e.stopPropagation();
      return blok.hapusSalinan();
    }
    if (ARAH[e.key] && e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey && siap) {
      e.preventDefault();
      const [dr, dc] = ARAH[e.key];
      return blok.perluas(dr, dc, aktif);
    }
    if (tombolSemua(e) && siap) {
      e.preventDefault();
      return blok.semua();
    }
    if (g && (banyak || naTabel)) {
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        return void ubahRentang(g, "hapus", () => "");
      }
      if (banyak && e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        return blok.kumpul(aktif);
      }
      if (banyak && (ARAH[e.key] || e.key === "Enter" || e.key === "Tab")) blok.kumpul(aktif);
    }
    if (naTabel) {
      const gerak: [number, number] | undefined =
        ARAH[e.key] && !e.shiftKey ? ARAH[e.key] : e.key === "Enter" ? [e.shiftKey ? -1 : 1, 0] : e.key === "Tab" ? [0, e.shiftKey ? -1 : 1] : undefined;
      if (gerak && !e.altKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        return pindahSel({ r: jepit(aktif.r + gerak[0], 0, baris.length - 1), c: jepit(aktif.c + gerak[1], 0, 6) });
      }
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        blok.tetapkan(null);
        ref.current?.blur();
      }
      return;
    }
    const i = Number(el.dataset.i);
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      blok.tetapkan(null);
      el.blur();
    } else if (e.key === "F2") {
      e.preventDefault();
      el.setSelectionRange(el.value.length, el.value.length);
    } else if (e.key === "Enter" || e.key === "ArrowDown") {
      e.preventDefault(); // Enter jangan mengirim form
      pindah(i, e.key === "Enter" && e.shiftKey ? -1 : 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      pindah(i, -1);
    } else if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey) {
      // di tepi teks (atau seluruh isi terpilih) panah kiri/kanan pindah ke sel sebelah seperti Excel
      const kiri = e.key === "ArrowLeft";
      const s = el.selectionStart ?? 0;
      const t = el.selectionEnd ?? 0;
      if (!(seluruh(el) || (kiri ? s === 0 && t === 0 : s === el.value.length && t === el.value.length))) return;
      e.preventDefault();
      pindahSel({ r: aktif.r, c: kiri ? 4 : 6 });
    }
  };
  const onDoubleClick = (e: MouseEvent<HTMLTableElement>) => {
    const input = isianDi((e.target as HTMLElement).closest<HTMLElement>("td[data-sr]"));
    if (!input) return;
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  };

  return (
    <div className="full tabel-isian">
      <div className="tabel-isian-kepala">
        <div className="tik-judul">
          <b>Harga sesuai Nota / Bukti Pembelian</b>
          <small>
            {item.length} barang/jasa · total <b className="num">{rupiah(total)}</b>
          </small>
        </div>
        <div className="tik-alat">
          <button type="button" className="btn soft sm" onClick={tempelTombol} title="Tempel harga dari nota/penawaran yang disalin dari Excel">
            <Icon name="clipboard" />
            <span>
              Tempel<span className="tik-lengkap"> dari Excel</span>
            </span>
          </button>
          <button type="button" className="btn soft sm ikon" onClick={urungkan} disabled={!riwayat.bisaUrung} title="Urungkan (⌘/Ctrl+Z)" aria-label="Urungkan">
            <Icon name="undo" />
          </button>
          <button type="button" className="btn soft sm ikon" onClick={ulangi} disabled={!riwayat.bisaUlang} title="Ulangi (⌘/Ctrl+Shift+Z)" aria-label="Ulangi">
            <Icon name="redo" />
          </button>
        </div>
      </div>
      {bilah && <BilahTempel isi={bilah} onUrungkan={bilah.jenis === "hasil" ? urungkan : undefined} onTutup={() => setBilah(null)} />}
      <div className="grid-excel-wrap">
        <table
          className="grid-excel g-blok"
          ref={ref}
          tabIndex={-1}
          onKeyDown={onKeyDown}
          onPasteCapture={onPasteCapture}
          onCopy={(e) => salinBlok(e, false)}
          onCut={(e) => salinBlok(e, true)}
          onPointerDown={blok.onPointerDown}
          onMouseDown={blok.onMouseDown}
          onDoubleClick={onDoubleClick}
          onFocus={(e) => {
            riwayat.putus();
            blok.onFocus(e, titikIsian);
          }}
          onBlur={blok.onBlur}
        >
          <colgroup>
            <col className="k-no" />
            <col className="k-uraian" />
            <col className="k-jumlah" />
            <col className="k-satuan" />
            <col className="k-harga" />
            <col className="k-harga" />
            <col className="k-total" />
          </colgroup>
          <thead>
            <tr>
              <th className={"g-no" + blok.kelasKolom(0)} data-hc={0} title="Pilih semua sel">
                No.
              </th>
              <th data-hc={1} className={blok.kelasKolom(1)}>
                Uraian
              </th>
              <th data-hc={2} className={"r" + blok.kelasKolom(2)}>
                Jumlah
              </th>
              <th data-hc={3} className={blok.kelasKolom(3)}>
                Satuan
              </th>
              <th data-hc={4} className={"r" + blok.kelasKolom(4)}>
                Harga HPS (Rp)
              </th>
              <th data-hc={5} className={"r g-kunci" + blok.kelasKolom(5)}>
                Harga Satuan (Rp)
              </th>
              <th data-hc={6} className={"r" + blok.kelasKolom(6)}>
                Jumlah (Rp)
              </th>
            </tr>
          </thead>
          <tbody>
            {baris.map((b, r) => {
              const x = item[b.i];
              if (b.jenis === "spek")
                return (
                  <tr key={`${b.i}-s${b.j}`} className="g-spek">
                    <td className={"g-no" + blok.kelas(r, 0) + blok.kelasBaris(r)} {...atributSel(r, 0)} data-penuh="1" />
                    <td className={"g-teks g-teks-spek" + blok.kelas(r, 1)} {...atributSel(r, 1)}>
                      {x.spesifikasi[b.j]}
                    </td>
                    {[2, 3, 4, 5, 6].map((c) => (
                      <td key={c} className={"g-mati" + blok.kelas(r, c)} {...atributSel(r, c)} />
                    ))}
                  </tr>
                );
              const h = Number(harga[b.i]) || 0;
              const diAtas = h > x.hargaHps;
              return (
                <tr key={b.i} className="g-barang">
                  <td className={"g-no num" + blok.kelas(r, 0) + blok.kelasBaris(r)} {...atributSel(r, 0)} data-penuh="1" title="Pilih seluruh baris">
                    {b.i + 1}
                  </td>
                  <td className={"g-teks" + blok.kelas(r, 1)} {...atributSel(r, 1)}>
                    {x.uraian}
                  </td>
                  <td className={"g-teks r num" + blok.kelas(r, 2)} {...atributSel(r, 2)}>
                    {angka(x.jumlah)}
                  </td>
                  <td className={"g-teks" + blok.kelas(r, 3)} {...atributSel(r, 3)}>
                    {x.satuan}
                  </td>
                  <td className={"g-teks r num g-redup" + blok.kelas(r, 4)} {...atributSel(r, 4)}>
                    {angka(x.hargaHps)}
                  </td>
                  <td className={`g-sel r${diAtas ? " g-ingat" : ""}${!h ? " g-salah" : ""}` + blok.kelas(r, 5)} {...atributSel(r, 5)}>
                    <InputRupiah
                      data-r={r}
                      data-c="beli"
                      data-i={b.i}
                      value={harga[b.i] ?? ""}
                      onChange={(v) => ubahHarga(b.i, v)}
                      maks={11}
                      placeholder=""
                      aria-label={`Harga satuan pembelian barang/jasa ${b.i + 1}`}
                      title={diAtas ? "Di atas harga satuan HPS (boleh selama total pembelian tidak melebihi total HPS)" : undefined}
                    />
                  </td>
                  <td className={"g-hasil num" + blok.kelas(r, 6)} {...atributSel(r, 6)}>
                    {h > 0 ? angka(x.jumlah * h) : ""}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <Ringkasan
            kolomLabel={6}
            kolomSisa={0}
            jumlah={jumlahRp}
            ppn={ppn}
            onPpn={gantiPpn}
            label="TOTAL PEMBELIAN"
            banding={{ label: "TOTAL HPS", nilai: totalHps, lebih: total > totalHps }}
          />
        </table>
      </div>
      <p className="tabel-isian-petunjuk">
        Isi kolom <b>Harga Satuan</b> sesuai nota (bawaan: harga HPS)
        <span className="tip-mouse">
          {" "}
          · blok sel seperti Excel dengan seret mouse / <kbd>Shift</kbd>+panah · <kbd>Ctrl/⌘</kbd>+<kbd>V</kbd> tempel kolom harga atau tabel
          nota/penawaran dari Excel (dicocokkan menurut nama barang); satu harga yang ditempel ke blok mengisi semua selnya ·{" "}
          <kbd>Ctrl/⌘</kbd>+<kbd>C</kbd> salin · <kbd>Delete</kbd> kosongkan · <kbd>Ctrl/⌘</kbd>+<kbd>Z</kbd> urungkan
        </span>
        .
      </p>
    </div>
  );
}

/* =====================================================================
   Tahap 2 & 4 — tampilan lampiran (tanpa isian)
   ===================================================================== */
export function TabelLampiran({
  judul,
  item,
  harga,
  ppn = false,
  centang,
  onInfo,
}: {
  judul: string;
  item: ItemPaket[];
  /** kolom harga yang ditampilkan: HPS (Surat Pesanan) atau pembelian (Kwitansi); tanpa kolom harga bila kosong */
  harga?: "hps" | "beli";
  ppn?: boolean;
  /** kolom MEMENUHI Lampiran BAP: tanda √ untuk semua barang bila true */
  centang?: boolean;
  onInfo?: (pesan: string) => void;
}) {
  const ref = useRef<HTMLTableElement>(null);
  const nSpek = item.map((x) => x.spesifikasi.length);
  const baris = susunBaris(nSpek);
  const satuan = (x: ItemPaket) => (harga === "beli" ? (x.harga ?? x.hargaHps) : x.hargaHps);
  const jumlahRp = harga ? item.reduce((s, x) => s + x.jumlah * satuan(x), 0) : 0;
  const periksa = centang !== undefined;
  const adaKet = item.some((x) => x.ket.trim());
  const kolomSisa = (periksa ? 1 : 0) + (adaKet ? 1 : 0);
  const kolom = 4 + (harga ? 2 : 0) + kolomSisa;
  const jenisKolom = ["no", "uraian", "jumlah", "satuan", ...(harga ? ["harga", "total"] : []), ...(periksa ? ["periksa"] : []), ...(adaKet ? ["ket"] : [])];
  const kHarga = jenisKolom.indexOf("harga");
  const kTotal = jenisKolom.indexOf("total");
  const kPeriksa = jenisKolom.indexOf("periksa");
  const kKet = jenisKolom.indexOf("ket");
  const blok = useBlok(ref, baris.length, kolom - 1);
  const nilaiSel = (r: number, c: number): string => {
    const b = baris[r];
    if (!b) return "";
    const x = item[b.i];
    if (b.jenis === "spek") return c === 1 ? x.spesifikasi[b.j] : "";
    switch (jenisKolom[c]) {
      case "no":
        return String(b.i + 1);
      case "uraian":
        return x.uraian;
      case "jumlah":
        return String(x.jumlah);
      case "satuan":
        return x.satuan;
      case "harga":
        return String(satuan(x));
      case "total":
        return String(x.jumlah * satuan(x));
      case "periksa":
        return centang ? "√" : "";
      case "ket":
        return x.ket;
    }
    return "";
  };
  const salinExcel = async () => {
    const ok = await salinTeks(
      tsvBarang(
        item.map((x) => ({ uraian: x.uraian, spek: x.spesifikasi, jumlah: x.jumlah, satuan: x.satuan, harga: satuan(x), ket: x.ket })),
        { ppn, judulHarga: harga === "beli" ? "Harga Satuan Pembelian (Rp)" : "Harga Satuan (Rp)", ket: adaKet },
      ),
    );
    onInfo?.(ok ? `${item.length} barang/jasa disalin — tempel di Excel dengan ⌘V / Ctrl+V` : "Browser menolak menyalin ke clipboard");
  };
  const salinKe = (data: DataTransfer) => {
    const { rentang: g } = blok.terkini();
    if (!g) return false;
    data.setData("text/plain", tsvRentang(g, nilaiSel));
    blok.tandaiSalinan(g);
    return true;
  };
  const onCopy = (e: ClipboardEvent<HTMLTableElement>) => {
    if (salinKe(e.clipboardData)) e.preventDefault();
  };
  useClipboardTabel(ref, (data, potong) => !potong && salinKe(data));
  const onKeyDown = (e: KeyboardEvent<HTMLTableElement>) => {
    if (e.target !== ref.current) return;
    const { pilih, banyak } = blok.terkini();
    const aktif = pilih?.a ?? { r: 0, c: 1 };
    const gerak: [number, number] | undefined = ARAH[e.key] ? ARAH[e.key] : e.key === "Enter" ? [e.shiftKey ? -1 : 1, 0] : e.key === "Tab" ? [0, e.shiftKey ? -1 : 1] : undefined;
    if (gerak && !e.altKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      if (ARAH[e.key] && e.shiftKey) return blok.perluas(gerak[0], gerak[1], aktif);
      const t = { r: jepit(aktif.r + gerak[0], 0, baris.length - 1), c: jepit(aktif.c + gerak[1], 0, kolom - 1) };
      blok.tetapkan(t);
      blok.tunjukkan(t);
    } else if (tombolSemua(e)) {
      e.preventDefault();
      blok.semua();
    } else if (e.key === "Escape" && (blok.adaSalinan() || pilih)) {
      e.preventDefault();
      e.stopPropagation();
      if (blok.adaSalinan()) return blok.hapusSalinan();
      if (banyak) return blok.kumpul(aktif);
      blok.tetapkan(null);
      ref.current?.blur();
    }
  };
  return (
    <div className="full tabel-isian">
      <div className="tabel-isian-kepala">
        <div className="tik-judul">
          <b>{judul}</b>
          <small>
            {item.length} barang/jasa
            {harga && (
              <>
                {" "}
                · total <b className="num">{rupiah(jumlahRp + (ppn ? hitungPpn(jumlahRp) : 0))}</b>
              </>
            )}
          </small>
        </div>
        <div className="tik-alat">
          <button type="button" className="btn soft sm" onClick={salinExcel} title="Salin seluruh daftar untuk ditempel di Excel (atau blok sel lalu ⌘C / Ctrl+C)">
            <Icon name="copy" />
            <span>
              Salin<span className="tik-lengkap"> ke Excel</span>
            </span>
          </button>
        </div>
      </div>
      <div className="grid-excel-wrap">
        <table
          className="grid-excel g-baca g-blok"
          ref={ref}
          tabIndex={-1}
          onKeyDown={onKeyDown}
          onCopy={onCopy}
          onPointerDown={blok.onPointerDown}
          onMouseDown={blok.onMouseDown}
          onFocus={(e) => blok.onFocus(e, () => null)}
          onBlur={blok.onBlur}
        >
          <colgroup>
            <col className="k-no" />
            <col className="k-uraian" />
            <col className="k-jumlah" />
            <col className="k-satuan" />
            {harga && <col className="k-harga" />}
            {harga && <col className="k-total" />}
            {periksa && <col className="k-periksa" />}
            {adaKet && <col className="k-ket" />}
          </colgroup>
          <thead>
            <tr>
              <th className={"g-no" + blok.kelasKolom(0)} data-hc={0} title="Pilih semua sel">
                No.
              </th>
              <th data-hc={1} className={blok.kelasKolom(1)}>
                Nama Barang/Jasa
              </th>
              <th data-hc={2} className={"r" + blok.kelasKolom(2)}>
                Jumlah
              </th>
              <th data-hc={3} className={blok.kelasKolom(3)}>
                Satuan
              </th>
              {harga && (
                <th data-hc={kHarga} className={"r" + blok.kelasKolom(kHarga)}>
                  Harga Satuan (Rp)
                </th>
              )}
              {harga && (
                <th data-hc={kTotal} className={"r" + blok.kelasKolom(kTotal)}>
                  Total Jumlah (Rp)
                </th>
              )}
              {periksa && (
                <th data-hc={kPeriksa} className={"g-tengah" + blok.kelasKolom(kPeriksa)}>
                  Memenuhi
                </th>
              )}
              {adaKet && (
                <th data-hc={kKet} className={blok.kelasKolom(kKet)}>
                  Ket
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {baris.map((b, r) => {
              const x = item[b.i];
              if (b.jenis === "spek")
                return (
                  <tr key={`${b.i}-s${b.j}`} className="g-spek">
                    <td className={"g-no" + blok.kelas(r, 0) + blok.kelasBaris(r)} {...atributSel(r, 0)} data-penuh="1" />
                    <td className={"g-teks g-teks-spek" + blok.kelas(r, 1)} {...atributSel(r, 1)}>
                      {x.spesifikasi[b.j]}
                    </td>
                    {Array.from({ length: kolom - 2 }, (_, k) => k + 2).map((c) => (
                      <td key={c} className={"g-mati" + blok.kelas(r, c)} {...atributSel(r, c)} />
                    ))}
                  </tr>
                );
              return (
                <tr key={b.i} className="g-barang">
                  <td className={"g-no num" + blok.kelas(r, 0) + blok.kelasBaris(r)} {...atributSel(r, 0)} data-penuh="1" title="Pilih seluruh baris">
                    {b.i + 1}
                  </td>
                  <td className={"g-teks" + blok.kelas(r, 1)} {...atributSel(r, 1)}>
                    {x.uraian}
                  </td>
                  <td className={"g-teks r num" + blok.kelas(r, 2)} {...atributSel(r, 2)}>
                    {angka(x.jumlah)}
                  </td>
                  <td className={"g-teks" + blok.kelas(r, 3)} {...atributSel(r, 3)}>
                    {x.satuan}
                  </td>
                  {harga && (
                    <td className={"g-teks r num" + blok.kelas(r, kHarga)} {...atributSel(r, kHarga)}>
                      {angka(satuan(x))}
                    </td>
                  )}
                  {harga && (
                    <td className={"g-hasil num" + blok.kelas(r, kTotal)} {...atributSel(r, kTotal)}>
                      {angka(x.jumlah * satuan(x))}
                    </td>
                  )}
                  {periksa && (
                    <td className={"g-teks g-tengah g-centang" + blok.kelas(r, kPeriksa)} {...atributSel(r, kPeriksa)}>
                      {centang ? "√" : ""}
                    </td>
                  )}
                  {adaKet && (
                    <td className={"g-teks" + blok.kelas(r, kKet)} {...atributSel(r, kKet)}>
                      {x.ket}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
          {harga && <Ringkasan kolomLabel={5} kolomSisa={kolomSisa} jumlah={jumlahRp} ppn={ppn} />}
        </table>
      </div>
    </div>
  );
}
