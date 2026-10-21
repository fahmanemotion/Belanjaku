"use client";

/**
 * Tabel barang/jasa bergaya Excel untuk form dokumen pengadaan (Nota Dinas & HPS s.d. Kwitansi, BAP & BAST).
 *
 *  - TabelHps      : isian daftar barang/jasa di form Nota Dinas & HPS, susunannya sama dengan sheet HPS:
 *                    No · Uraian · Jumlah · Satuan · Harga Satuan · Total Jumlah · Ket, baris spesifikasi "- …" di bawah
 *                    uraiannya, lalu JUMLAH · PPN 11% · TOTAL JUMLAH · TERBILANG.
 *  - TabelBeli     : harga satuan pembelian per barang di form Nota Pembelian.
 *  - TabelLampiran : tampilan tanpa isian di form Surat Pesanan dan Kwitansi, BAP & BAST.
 *
 * Seperti Excel: Tab/Shift+Tab pindah kolom, Enter turun ke baris berikutnya (di baris terakhir menambah baris baru),
 * panah pindah sel, Alt/⌥+Enter menambah baris spesifikasi, F2 menyunting isi sel, Esc keluar dari sel,
 * Ctrl/⌘+Z urungkan, Ctrl/⌘+Shift+Z atau Ctrl+Y ulangi.
 * Tempel dari Excel / Google Sheets (Ctrl/⌘+V): salinan draft dengan susunan kolom apa pun dikenali dari judul kolomnya
 * atau ditebak dari isinya (lib/tempelExcel.ts); hasilnya bisa diatur ulang lewat "Atur kolom & baris…" atau diurungkan.
 * Batas sama dengan database (app.rapikan_item_paket): 50 barang/jasa, 20 baris spesifikasi per barang.
 */
import { useEffect, useLayoutEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent, type RefObject } from "react";
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
  tanpaPoin,
  tsvBarang,
  type Golongan,
  type JenisBaris,
  type KodeCatatan,
  type Susunan,
  type Tafsir,
} from "@/lib/tempelExcel";
import type { ItemPaket } from "@/lib/types";

export const MAKS_BARANG = 50;
export const MAKS_SPEK = 20;
const MAKS_JUMLAH = 100_000;
const MAKS_HARGA = 10_000_000_000;
const SATUAN = ["pcs", "buah", "unit", "paket", "set", "rim", "lusin", "box", "dus", "kg", "liter", "lembar", "eksemplar", "orang", "kegiatan", "bulan"];

/* =====================================================================
   Data isian
   ===================================================================== */
export interface BarisBarang {
  kunci: number;
  uraian: string;
  /** satu baris spesifikasi per elemen */
  spek: string[];
  /** digit */
  jumlah: string;
  satuan: string;
  /** harga satuan HPS (digit) */
  harga: string;
  ket: string;
}
export type KolomBarang = "uraian" | "jumlah" | "satuan" | "harga" | "ket";
const KOLOM_BARANG: KolomBarang[] = ["uraian", "jumlah", "satuan", "harga", "ket"];

let kunciBaris = 0;
export const barisKosong = (): BarisBarang => ({ kunci: ++kunciBaris, uraian: "", spek: [], jumlah: "", satuan: "", harga: "", ket: "" });
export const barisDariItem = (x: ItemPaket): BarisBarang => ({
  kunci: ++kunciBaris,
  uraian: x.uraian,
  spek: [...x.spesifikasi],
  jumlah: String(x.jumlah),
  satuan: x.satuan,
  harga: String(x.hargaHps),
  ket: x.ket,
});
/** Baris yang sama sekali kosong tidak ikut disimpan */
export const barisTerisi = (b: BarisBarang) =>
  Boolean(b.uraian.trim() || b.spek.some((s) => s.trim()) || b.jumlah || b.satuan.trim() || b.harga || b.ket.trim());

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

/** Baris tabel → item untuk database (baris kosong dibuang) */
export const itemDariBaris = (xs: BarisBarang[]) =>
  xs.filter(barisTerisi).map((b) => ({
    uraian: b.uraian.trim(),
    spesifikasi: b.spek.map(tanpaPoin).filter(Boolean),
    jumlah: Number(b.jumlah),
    satuan: b.satuan.trim(),
    hargaHps: Number(b.harga),
    ket: b.ket.trim(),
  }));

/* =====================================================================
   Bantuan bersama
   ===================================================================== */
type Baris = { jenis: "barang"; i: number } | { jenis: "spek"; i: number; j: number };
/** Baris tampilan: tiap barang diikuti baris-baris spesifikasinya */
const susunBaris = (nSpek: number[]): Baris[] =>
  nSpek.flatMap((n, i): Baris[] => [{ jenis: "barang", i }, ...Array.from({ length: n }, (_, j): Baris => ({ jenis: "spek", i, j }))]);
/** Nomor baris tampilan barang ke-i (atau spesifikasi ke-j-nya) */
const indeksBaris = (nSpek: number[], i: number, j?: number) => nSpek.slice(0, i).reduce((s, n) => s + 1 + n, 0) + (j === undefined ? 0 : 1 + j);

/** Seluruh isi sel sedang terpilih (baru dipindah ke sel itu) → panah memindah sel seperti Excel */
const seluruh = (el: HTMLInputElement) => el.value.length > 0 && el.selectionStart === 0 && el.selectionEnd === el.value.length;
const tombolUrung = (e: KeyboardEvent) => (e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "z" && !e.shiftKey;
const tombolUlang = (e: KeyboardEvent) =>
  (e.ctrlKey || e.metaKey) && !e.altKey && ((e.key.toLowerCase() === "z" && e.shiftKey) || (e.ctrlKey && !e.metaKey && e.key.toLowerCase() === "y"));

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

interface HasilPasang {
  xs: BarisBarang[];
  masuk: number;
  lewat: number;
  kunci: number[];
  /** spesifikasi di awal salinan yang tidak punya barang */
  spekLepas: number;
}
/**
 * timpa: mulai baris `mulai` (seperti tempel di Excel; isian yang tidak dimuat salinan tetap),
 * tambah: sesudah baris terisi terakhir, ganti: seluruh tabel diganti.
 */
function pasangTempel(nilai: BarisBarang[], s: Susunan, mode: ModeTempel, mulai: number, fokusBarang: number | null): HasilPasang {
  let xs = nilai.map((x) => ({ ...x, spek: [...x.spek] }));
  let awal = mulai;
  if (mode === "ganti") {
    xs = [];
    awal = 0;
  } else if (mode === "tambah") {
    awal = xs.length;
    while (awal > 0 && !barisTerisi(xs[awal - 1])) awal--;
  }
  let spekLepas = 0;
  if (s.spekAwal.length) {
    const tujuan = !s.barang.length && fokusBarang !== null ? fokusBarang : awal - 1;
    if (tujuan >= 0 && xs[tujuan]) xs[tujuan].spek = [...xs[tujuan].spek, ...s.spekAwal].slice(0, MAKS_SPEK).map((t) => t.slice(0, 200));
    else spekLepas = s.spekAwal.length;
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
    if (s.cakup.uraian && s.cakup.spek) x.spek = m.spek.slice(0, MAKS_SPEK).map((t) => t.slice(0, 200));
    if (s.cakup.jumlah) x.jumlah = m.jumlah;
    if (s.cakup.satuan) x.satuan = m.satuan.slice(0, 30);
    if (s.cakup.harga) x.harga = m.harga;
    if (s.cakup.ket) x.ket = m.ket.slice(0, 100);
    kunci.push(x.kunci);
    masuk++;
  });
  if (mode === "ganti" && xs.length < MAKS_BARANG) xs.push(barisKosong());
  if (!xs.length) xs.push(barisKosong());
  return { xs, masuk, lewat, kunci, spekLepas };
}

const CATATAN: Record<KodeCatatan, (n: number) => string> = {
  hargaDariTotal: (n) => `harga satuan ${n} barang dihitung dari total ÷ jumlah`,
  jumlahBulat: (n) => `jumlah ${n} barang dibulatkan`,
  hargaBulat: (n) => `harga ${n} barang dibulatkan ke rupiah`,
  totalBeda: (n) => `total di salinan untuk ${n} barang tidak sama dengan jumlah × harga — periksa kolomnya`,
};

/** Ringkasan untuk bilah hasil tempel */
function isiBilahHps(data: string[][], t: Tafsir, g: Golongan, s: Susunan, h: HasilPasang, ppnDicentang: boolean): IsiBilah {
  const nSpek = s.barang.reduce((n, b) => n + b.spek.length, 0) + (h.spekLepas ? 0 : s.spekAwal.length);
  const alasan = g.jenis.flatMap((j, i) => (j === "lewati" && data[i].some((c) => c.trim()) ? [g.alasan[i]] : []));
  const judul =
    (h.masuk ? `${h.masuk} barang/jasa ditempel` : `${nSpek} spesifikasi ditempel`) +
    (h.masuk && nSpek ? ` · ${nSpek} spesifikasi` : "") +
    (alasan.length ? ` · ${alasan.length} baris dilewati (${[...new Set(alasan)].join(", ")})` : "");
  const catatan: string[] = [];
  const belum = h.xs.filter((x) => h.kunci.includes(x.kunci) && salahBarang(x).length > 0).length;
  if (belum) catatan.push(`${belum} barang belum lengkap — lengkapi sel merah`);
  const hitung = new Map<KodeCatatan, number>();
  s.barang.forEach((b) => new Set(b.catatan.map((c) => c.kode)).forEach((k) => hitung.set(k, (hitung.get(k) ?? 0) + 1)));
  hitung.forEach((n, k) => catatan.push(CATATAN[k](n)));
  if (ppnDicentang) catatan.push("PPN 11% dicentang karena salinan memuat baris PPN");
  if (h.lewat) catatan.push(`${h.lewat} barang tidak masuk (maksimal ${MAKS_BARANG} barang/jasa per paket)`);
  if (h.spekLepas) catatan.push(`${h.spekLepas} spesifikasi di awal salinan tidak punya barang dan diabaikan`);
  return { jenis: "hasil", judul, kolom: uraianKolom(t), catatan };
}

/* =====================================================================
   Tahap 1 — tabel HPS yang bisa diisi
   ===================================================================== */
interface AsalTempel {
  mode: ModeTempel;
  /** baris barang tempat menimpa */
  mulai: number;
  /** kolom aplikasi tempat menempel (URUTAN_TABEL) untuk tempel berurutan; kosong = kenali dari judul/isi */
  posisi?: number;
  /** barang yang sedang dipilih (untuk salinan berisi spesifikasi saja) */
  fokusBarang: number | null;
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
  /** hasil tempel terakhir (bilah ringkasan) & dialog atur kolom/baris */
  const [bilah, setBilah] = useState<{ isi: IsiBilah; tempel?: TempelAktif } | null>(null);
  const [dialog, setDialog] = useState<TempelAktif | null>(null);
  /** baris hasil tempel: sel wajibnya yang kosong langsung ditandai merah */
  const [sorot, setSorot] = useState<Set<number>>(() => new Set());
  const riwayat = useRiwayat({ nilai, ppn }, (v) => {
    if (v.ppn !== ppn) onPpn(v.ppn);
    onChange(v.nilai);
    setBilah(null);
  });
  const tandai = coba > 0;
  const nSpek = nilai.map((b) => b.spek.length);
  const baris = susunBaris(nSpek);

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
    if (i >= 0) fokus(indeksBaris(nSpek, i), salahBarang(nilai[i])[0]);
    else if (!nilai.some(barisTerisi)) fokus(0, "uraian");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coba]);

  /** semua perubahan isi tabel lewat sini agar tercatat di riwayat urungkan */
  const ganti = (xs: BarisBarang[], aksi = "ubah") => {
    riwayat.catat(aksi);
    if (bilah) setBilah(null);
    onChange(xs);
  };
  const gantiPpn = (v: boolean) => {
    riwayat.catat("ppn");
    onPpn(v);
  };
  const jumlahSpek = (xs: BarisBarang[]) => xs.map((x) => x.spek.length);
  const ubah = (i: number, kolom: KolomBarang, v: string) => ganti(nilai.map((x, k) => (k === i ? { ...x, [kolom]: v } : x)), `ketik:${nilai[i].kunci}:${kolom}`);
  /** tanda "- " yang diketik di awal spesifikasi dibuang karena tanda "-" sudah tampil di depan sel */
  const ubahSpek = (i: number, j: number, teks: string) => {
    const bersih = teks.replace(/^\s*[-–—•*·]\s+/, "");
    ganti(nilai.map((x, k) => (k === i ? { ...x, spek: x.spek.map((s, m) => (m === j ? bersih : s)) } : x)), `ketik:${nilai[i].kunci}:s${j}`);
  };

  const tambahBaris = (setelah: number, kolom: KolomBarang = "uraian") => {
    if (nilai.length >= MAKS_BARANG) return onInfo?.(`Maksimal ${MAKS_BARANG} barang/jasa dalam satu paket`);
    const xs = [...nilai.slice(0, setelah + 1), barisKosong(), ...nilai.slice(setelah + 1)];
    nanti(indeksBaris(jumlahSpek(xs), setelah + 1), kolom);
    ganti(xs, "baris+");
  };
  const hapusBaris = (i: number) => {
    const sisa = nilai.filter((_, k) => k !== i);
    const xs = sisa.length ? sisa : [barisKosong()];
    nanti(indeksBaris(jumlahSpek(xs), Math.min(i, xs.length - 1)), "uraian");
    ganti(xs, "baris-");
  };
  /** baris spesifikasi baru di bawah spesifikasi ke-`setelah` (atau di akhir daftar spesifikasinya) */
  const tambahSpek = (i: number, setelah?: number) => {
    const x = nilai[i];
    if (x.spek.length >= MAKS_SPEK) return onInfo?.(`Maksimal ${MAKS_SPEK} baris spesifikasi per barang/jasa`);
    const j = setelah === undefined ? x.spek.length : setelah + 1;
    const xs = nilai.map((y, k) => (k === i ? { ...y, spek: [...y.spek.slice(0, j), "", ...y.spek.slice(j)] } : y));
    nanti(indeksBaris(jumlahSpek(xs), i, j), "uraian");
    ganti(xs, "spek+");
  };
  /** hapus spesifikasi ke-j; fokus pindah ke baris sebelumnya, ke barang berikutnya, atau tetap di posisi yang sama */
  const hapusSpek = (i: number, j: number, ke: "sebelum" | "berikut" | "tetap") => {
    const xs = nilai.map((y, k) => (k === i ? { ...y, spek: y.spek.filter((_, m) => m !== j) } : y));
    if (ke === "berikut" && i + 1 >= xs.length && xs.length < MAKS_BARANG) xs.push(barisKosong());
    const ns = jumlahSpek(xs);
    if (ke === "berikut") nanti(indeksBaris(ns, Math.min(i + 1, xs.length - 1)), "uraian");
    else if (ke === "tetap" && j < xs[i].spek.length) nanti(indeksBaris(ns, i, j), "uraian");
    else nanti(j > 0 ? indeksBaris(ns, i, j - 1) : indeksBaris(ns, i), "uraian");
    ganti(xs, "spek-");
  };

  /* ---------- Tempel dari Excel ---------- */
  const pasang = (tp: TempelAktif, g: Golongan, s: Susunan) => {
    const dasar = tp.sebelum ?? { nilai, ppn };
    const h = pasangTempel(dasar.nilai, s, tp.asal.mode, tp.asal.mulai, tp.asal.fokusBarang);
    if (!h.masuk && !s.spekAwal.length) return onInfo?.("Tidak ada baris barang/jasa yang bisa ditempel");
    // tempel ulang dari "Atur kolom & baris…" memakai isi tabel sebelum tempel; riwayatnya sudah tercatat
    if (!tp.sebelum) riwayat.catat("tempel");
    const ppnDicentang = g.adaPpn && !dasar.ppn;
    if ((ppnDicentang || dasar.ppn) !== ppn) onPpn(ppnDicentang || dasar.ppn);
    onChange(h.xs);
    setSorot(new Set(h.kunci));
    setBilah({ isi: isiBilahHps(tp.data, tp.tafsir, g, s, h, ppnDicentang), tempel: { ...tp, sebelum: dasar } });
  };

  const prosesTempel = (teks: string, asal: AsalTempel) => {
    const data = bacaSalinan(teks);
    if (!data.length) return;
    const satuKolom = Math.max(...data.map((r) => r.length)) <= 1;
    const tafsir = satuKolom && asal.posisi !== undefined ? tafsirSatuKolom(data, asal.posisi) : tafsirTabel(data, { posisi: asal.posisi });
    const tp: TempelAktif = { data, tafsir, paksa: {}, asal, sebelum: null };
    if (asal.dialog || tafsir.ragu) return setDialog(tp);
    const g = golongkan(data, tafsir);
    pasang(tp, g, susunBarang(data, tafsir.peran, g.jenis));
  };

  // Ctrl/⌘+V di sel tabel
  const onPasteCapture = (e: ClipboardEvent<HTMLTableElement>) => {
    const el = e.target as HTMLInputElement;
    if (el.tagName !== "INPUT" || el.dataset.r === undefined) return;
    const mentah = e.clipboardData.getData("text/plain");
    if (!banyakSel(mentah)) return; // satu sel biasa ditangani isian itu sendiri
    e.preventDefault();
    e.stopPropagation();
    const b = baris[Number(el.dataset.r)];
    if (!b) return;
    if (b.jenis === "spek") {
      // di baris spesifikasi: salinan satu kolom = beberapa baris spesifikasi
      const data = bacaSalinan(mentah);
      if (data.every((d) => d.filter((x) => x.trim()).length <= 1)) {
        const x = nilai[b.i];
        const teks = data
          .flatMap((d) => (d.find((y) => y.trim()) ?? "").split("\n"))
          .map((s) => tanpaPoin(s).slice(0, 200))
          .filter(Boolean)
          .slice(0, MAKS_SPEK - x.spek.length + 1);
        ganti(nilai.map((y, k) => (k === b.i ? { ...y, spek: [...x.spek.slice(0, b.j), ...teks, ...x.spek.slice(b.j + 1)] } : y)), "tempel");
        setBilah({ isi: { jenis: "hasil", judul: `${teks.length} baris spesifikasi ditempel` } });
        return;
      }
      return prosesTempel(mentah, { mode: "timpa", mulai: b.i + 1, posisi: 1, fokusBarang: b.i });
    }
    prosesTempel(mentah, { mode: "timpa", mulai: b.i, posisi: URUTAN_TABEL.indexOf(el.dataset.c as KolomBarang), fokusBarang: b.i });
  };

  // Ctrl/⌘+V saat kursor tidak di sel mana pun (mis. sesudah Esc atau klik tombol) → ditambahkan di bawah barang yang ada
  const tempelLuar = useRef<(teks: string) => void>(() => {});
  tempelLuar.current = (teks) => prosesTempel(teks, { mode: "tambah", mulai: akhirIsi, fokusBarang: null });
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
      if (e.defaultPrevented || !bebas()) return;
      const teks = e.clipboardData?.getData("text/plain") ?? "";
      if (!banyakSel(teks)) return;
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
    prosesTempel(teks, { mode: akhirIsi > 0 ? "tambah" : "ganti", mulai: akhirIsi, fokusBarang: null, dialog: true });
  };

  const salinExcel = async () => {
    const isi = nilai.filter(barisTerisi);
    if (!isi.length) return onInfo?.("Tabel masih kosong");
    const ok = await salinTeks(
      tsvBarang(
        isi.map((b) => ({ uraian: b.uraian.trim(), spek: b.spek.map(tanpaPoin).filter(Boolean), jumlah: Number(b.jumlah) || 0, satuan: b.satuan.trim(), harga: Number(b.harga) || 0, ket: b.ket.trim() })),
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

  const onKeyDown = (e: KeyboardEvent<HTMLTableElement>) => {
    const el = e.target as HTMLInputElement;
    if (el.tagName !== "INPUT" || el.dataset.r === undefined || e.nativeEvent.isComposing) return;
    if (tombolUrung(e) || tombolUlang(e)) {
      e.preventDefault();
      return tombolUrung(e) ? urungkan() : ulangi();
    }
    const r = Number(el.dataset.r);
    const c = el.dataset.c as KolomBarang;
    const b = baris[r];
    if (!b) return;
    const kosong = el.value.length === 0;
    switch (e.key) {
      case "Escape":
        // keluar dari sel saja (isian tabel tidak hilang karena salah tekan)
        e.preventDefault();
        e.stopPropagation();
        el.blur();
        return;
      case "F2":
        e.preventDefault();
        el.setSelectionRange(el.value.length, el.value.length);
        return;
      case "Enter": {
        e.preventDefault(); // jangan mengirim form
        if (e.altKey || e.shiftKey || e.ctrlKey || e.metaKey) return tambahSpek(b.i, b.jenis === "spek" ? b.j : undefined);
        if (b.jenis === "spek") {
          // Enter di baris spesifikasi yang masih kosong mengakhiri daftar spesifikasi
          if (!nilai[b.i].spek[b.j].trim()) return hapusSpek(b.i, b.j, "berikut");
          return tambahSpek(b.i, b.j);
        }
        const kolom = tabAwal.current?.r === r ? tabAwal.current.c : c;
        tabAwal.current = null;
        if (b.i + 1 < nilai.length) fokus(indeksBaris(nSpek, b.i + 1), kolom);
        else if (barisTerisi(nilai[b.i])) tambahBaris(b.i, kolom);
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
        const arah = e.key === "ArrowDown" ? 1 : -1;
        for (let k = r + arah; k >= 0 && k < baris.length; k += arah) {
          if (baris[k].jenis === "barang" || c === "uraian") {
            fokus(k, c);
            return;
          }
        }
        return;
      }
      case "ArrowLeft":
      case "ArrowRight": {
        if (e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return;
        const kiri = e.key === "ArrowLeft";
        const s = el.selectionStart ?? 0;
        const t = el.selectionEnd ?? 0;
        if (!(seluruh(el) || (kiri ? s === 0 && t === 0 : s === el.value.length && t === el.value.length))) return;
        const kolomBaris = b.jenis === "barang" ? KOLOM_BARANG : (["uraian"] as KolomBarang[]);
        const k = kolomBaris.indexOf(c) + (kiri ? -1 : 1);
        if (k < 0 || k >= kolomBaris.length) return;
        e.preventDefault();
        fokus(r, kolomBaris[k]);
        return;
      }
      case "Backspace":
        if (b.jenis === "spek" && kosong) {
          e.preventDefault();
          hapusSpek(b.i, b.j, "sebelum");
        }
        return;
    }
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
          <button type="button" className="btn soft sm" onClick={salinExcel} disabled={!n} title="Salin tabel ini untuk ditempel di Excel">
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
          className="grid-excel"
          ref={ref}
          onKeyDown={onKeyDown}
          onPasteCapture={onPasteCapture}
          onMouseDown={() => (tabAwal.current = null)}
          onFocus={() => riwayat.putus()}
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
              <th className="g-no">No.</th>
              <th>Uraian</th>
              <th className="r">Jumlah</th>
              <th>Satuan</th>
              <th className="r">Harga Satuan (Rp)</th>
              <th className="r">Total Jumlah (Rp)</th>
              <th>Ket</th>
              <th className="g-aksi">
                <span className="sr">Aksi</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {baris.map((b, r) => {
              const x = nilai[b.i];
              if (b.jenis === "spek")
                return (
                  <tr key={`${x.kunci}-s${b.j}`} className="g-spek">
                    <td className="g-no" />
                    <td className="g-sel" colSpan={3}>
                      <div className="g-spek-isi">
                        <span className="g-poin" aria-hidden="true">
                          -
                        </span>
                        <input
                          data-r={r}
                          data-c="uraian"
                          value={x.spek[b.j]}
                          maxLength={200}
                          onChange={(e) => ubahSpek(b.i, b.j, e.target.value)}
                          placeholder="spesifikasi"
                          aria-label={`Spesifikasi ${b.j + 1} barang/jasa baris ${b.i + 1}`}
                          autoComplete="off"
                        />
                      </div>
                    </td>
                    <td colSpan={3} className="g-mati" />
                    <td className="g-aksi">
                      <button
                        type="button"
                        tabIndex={-1}
                        className="g-ib bahaya"
                        title="Hapus baris spesifikasi"
                        aria-label={`Hapus spesifikasi ${b.j + 1} barang/jasa baris ${b.i + 1}`}
                        onClick={() => hapusSpek(b.i, b.j, "tetap")}
                      >
                        <Icon name="close" size={14} />
                      </button>
                    </td>
                  </tr>
                );
              const total = (Number(x.jumlah) || 0) * (Number(x.harga) || 0);
              const label = `baris ${b.i + 1}`;
              return (
                <tr key={x.kunci} className="g-barang">
                  <td className="g-no num">{nomor[b.i] || ""}</td>
                  <td className={kelasSel(x, "uraian")}>
                    <input
                      data-r={r}
                      data-c="uraian"
                      value={x.uraian}
                      maxLength={200}
                      onChange={(e) => ubah(b.i, "uraian", e.target.value)}
                      placeholder={b.i === 0 && kosongSemua ? "Ketik uraian, atau tempel daftar dari Excel (⌘V / Ctrl+V)" : undefined}
                      aria-label={`Uraian ${label}`}
                      autoComplete="off"
                    />
                  </td>
                  <td className={kelasSel(x, "jumlah", " r")}>
                    <InputRupiah
                      data-r={r}
                      data-c="jumlah"
                      value={x.jumlah}
                      onChange={(v) => ubah(b.i, "jumlah", v)}
                      maks={6}
                      placeholder=""
                      aria-label={`Jumlah ${label}`}
                    />
                  </td>
                  <td className={kelasSel(x, "satuan")}>
                    <input
                      data-r={r}
                      data-c="satuan"
                      list="satuan-umum"
                      value={x.satuan}
                      maxLength={30}
                      onChange={(e) => ubah(b.i, "satuan", e.target.value)}
                      aria-label={`Satuan ${label}`}
                      autoComplete="off"
                    />
                  </td>
                  <td className={kelasSel(x, "harga", " r")}>
                    <InputRupiah
                      data-r={r}
                      data-c="harga"
                      value={x.harga}
                      onChange={(v) => ubah(b.i, "harga", v)}
                      maks={11}
                      placeholder=""
                      aria-label={`Harga satuan ${label}`}
                    />
                  </td>
                  <td className="g-hasil num">{total > 0 ? angka(total) : ""}</td>
                  <td className="g-sel">
                    <input
                      data-r={r}
                      data-c="ket"
                      value={x.ket}
                      maxLength={100}
                      onChange={(e) => ubah(b.i, "ket", e.target.value)}
                      aria-label={`Keterangan ${label}`}
                      autoComplete="off"
                    />
                  </td>
                  <td className="g-aksi">
                    <button
                      type="button"
                      tabIndex={-1}
                      className="g-ib"
                      title="Tambah baris spesifikasi (Alt+Enter)"
                      aria-label={`Tambah spesifikasi ${label}`}
                      onClick={() => tambahSpek(b.i)}
                    >
                      <Icon name="plus" size={14} />
                    </button>
                    <button type="button" tabIndex={-1} className="g-ib bahaya" title="Hapus baris" aria-label={`Hapus ${label}`} onClick={() => hapusBaris(b.i)}>
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
          <kbd>Tab</kbd> / <kbd>Enter</kbd> pindah sel · <kbd>Alt/⌥</kbd>+<kbd>Enter</kbd> tambah spesifikasi · <kbd>Ctrl/⌘</kbd>+<kbd>V</kbd>{" "}
          tempel daftar dari Excel — susunan kolom draft Anda dikenali otomatis · <kbd>Ctrl/⌘</kbd>+<kbd>Z</kbd> urungkan. Baris kosong tidak ikut
          disimpan · maksimal {MAKS_BARANG} barang/jasa.
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
            pasang(tp, golongkan(dialog.data, p.tafsir, p.paksa), p.susunan);
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
  const riwayat = useRiwayat({ harga, ppn }, (v) => {
    onHarga(v.harga);
    if (v.ppn !== ppn) onPpn(v.ppn);
    setBilah(null);
  });
  const nSpek = item.map((x) => x.spesifikasi.length);
  const baris = susunBaris(nSpek);
  const jumlahRp = item.reduce((s, x, i) => s + x.jumlah * (Number(harga[i]) || 0), 0);
  const total = jumlahRp + (ppn ? hitungPpn(jumlahRp) : 0);

  const ubahHarga = (i: number, v: string) => {
    riwayat.catat(`ketik:${i}`);
    if (bilah) setBilah(null);
    onHarga(harga.map((y, k) => (k === i ? v : y)));
  };
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
  const onKeyDown = (e: KeyboardEvent<HTMLTableElement>) => {
    const el = e.target as HTMLInputElement;
    if (el.tagName !== "INPUT" || el.dataset.i === undefined || e.nativeEvent.isComposing) return;
    const i = Number(el.dataset.i);
    if (tombolUrung(e) || tombolUlang(e)) {
      e.preventDefault();
      return tombolUrung(e) ? urungkan() : ulangi();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
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
    }
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
    if (Math.max(...data.map((r) => r.length)) <= 1) {
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
      if (s.cakup.uraian && nama.some(Boolean)) {
        const cocok = cocokkanNama(
          item.map((x) => x.uraian),
          nama,
        );
        if (cocok.filter((x) => x !== null).length * 2 >= nama.length) {
          tujuan = cocok;
          cara = "dicocokkan menurut nama barang";
          nama.forEach((x, k) => cocok[k] === null && lepas.push(x));
        }
      }
      berharga.forEach((b, k) => {
        const i = tujuan[k];
        if (i !== null && i !== undefined) pasang.push({ i, harga: b.harga, jumlah: b.jumlah });
      });
    }
    if (!pasang.length) return onInfo?.("Tidak ada harga yang bisa ditempel");
    riwayat.catat("tempel");
    const h = [...harga];
    pasang.forEach((p) => (h[p.i] = p.harga));
    onHarga(h);
    const catatan: string[] = [];
    const beda = pasang.filter((p) => p.jumlah && Number(p.jumlah) !== item[p.i].jumlah);
    if (beda.length) catatan.push(`jumlah berbeda dengan HPS: ${beda.map((p) => `${item[p.i].uraian} ${p.jumlah} (HPS ${item[p.i].jumlah})`).join(", ")}`);
    if (lepas.length) catatan.push(`${lepas.length} baris tidak cocok dengan barang paket: ${lepas.slice(0, 3).join(", ")}${lepas.length > 3 ? ", …" : ""}`);
    setBilah({ jenis: "hasil", judul: `${pasang.length} harga satuan ditempel (${cara})`, catatan });
  };

  const onPasteCapture = (e: ClipboardEvent<HTMLTableElement>) => {
    const el = e.target as HTMLInputElement;
    if (el.tagName !== "INPUT" || el.dataset.i === undefined) return;
    const mentah = e.clipboardData.getData("text/plain");
    if (!banyakSel(mentah)) return;
    e.preventDefault();
    e.stopPropagation();
    prosesTempel(mentah, Number(el.dataset.i));
  };
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
        <table className="grid-excel" ref={ref} onKeyDown={onKeyDown} onPasteCapture={onPasteCapture} onFocus={() => riwayat.putus()}>
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
              <th className="g-no">No.</th>
              <th>Uraian</th>
              <th className="r">Jumlah</th>
              <th>Satuan</th>
              <th className="r">Harga HPS (Rp)</th>
              <th className="r g-kunci">Harga Satuan (Rp)</th>
              <th className="r">Jumlah (Rp)</th>
            </tr>
          </thead>
          <tbody>
            {baris.map((b, r) => {
              const x = item[b.i];
              if (b.jenis === "spek")
                return (
                  <tr key={`${b.i}-s${b.j}`} className="g-spek">
                    <td className="g-no" />
                    <td className="g-teks g-teks-spek" colSpan={3}>
                      - {x.spesifikasi[b.j]}
                    </td>
                    <td colSpan={3} className="g-mati" />
                  </tr>
                );
              const h = Number(harga[b.i]) || 0;
              const diAtas = h > x.hargaHps;
              return (
                <tr key={b.i} className="g-barang">
                  <td className="g-no num">{b.i + 1}</td>
                  <td className="g-teks">{x.uraian}</td>
                  <td className="g-teks r num">{angka(x.jumlah)}</td>
                  <td className="g-teks">{x.satuan}</td>
                  <td className="g-teks r num g-redup">{angka(x.hargaHps)}</td>
                  <td className={`g-sel r${diAtas ? " g-ingat" : ""}${!h ? " g-salah" : ""}`}>
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
                  <td className="g-hasil num">{h > 0 ? angka(x.jumlah * h) : ""}</td>
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
        Isi kolom <b>Harga Satuan</b> sesuai nota (bawaan: harga HPS) · <kbd>Enter</kbd> barang berikutnya · tempel kolom harga atau tabel
        nota/penawaran dari Excel dengan <kbd>Ctrl/⌘</kbd>+<kbd>V</kbd> — barisnya dicocokkan menurut nama barang · <kbd>Ctrl/⌘</kbd>+<kbd>Z</kbd>{" "}
        urungkan.
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
  const nSpek = item.map((x) => x.spesifikasi.length);
  const baris = susunBaris(nSpek);
  const satuan = (x: ItemPaket) => (harga === "beli" ? (x.harga ?? x.hargaHps) : x.hargaHps);
  const jumlahRp = harga ? item.reduce((s, x) => s + x.jumlah * satuan(x), 0) : 0;
  const periksa = centang !== undefined;
  const adaKet = item.some((x) => x.ket.trim());
  const kolomSisa = (periksa ? 1 : 0) + (adaKet ? 1 : 0);
  const kolom = 4 + (harga ? 2 : 0) + kolomSisa;
  const salinExcel = async () => {
    const ok = await salinTeks(
      tsvBarang(
        item.map((x) => ({ uraian: x.uraian, spek: x.spesifikasi, jumlah: x.jumlah, satuan: x.satuan, harga: satuan(x), ket: x.ket })),
        { ppn, judulHarga: harga === "beli" ? "Harga Satuan Pembelian (Rp)" : "Harga Satuan (Rp)", ket: adaKet },
      ),
    );
    onInfo?.(ok ? `${item.length} barang/jasa disalin — tempel di Excel dengan ⌘V / Ctrl+V` : "Browser menolak menyalin ke clipboard");
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
          <button type="button" className="btn soft sm" onClick={salinExcel} title="Salin daftar ini untuk ditempel di Excel">
            <Icon name="copy" />
            <span>
              Salin<span className="tik-lengkap"> ke Excel</span>
            </span>
          </button>
        </div>
      </div>
      <div className="grid-excel-wrap">
        <table className="grid-excel g-baca">
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
              <th className="g-no">No.</th>
              <th>Nama Barang/Jasa</th>
              <th className="r">Jumlah</th>
              <th>Satuan</th>
              {harga && <th className="r">Harga Satuan (Rp)</th>}
              {harga && <th className="r">Total Jumlah (Rp)</th>}
              {periksa && <th className="g-tengah">Memenuhi</th>}
              {adaKet && <th>Ket</th>}
            </tr>
          </thead>
          <tbody>
            {baris.map((b) => {
              const x = item[b.i];
              if (b.jenis === "spek")
                return (
                  <tr key={`${b.i}-s${b.j}`} className="g-spek">
                    <td className="g-no" />
                    <td className="g-teks g-teks-spek" colSpan={3}>
                      - {x.spesifikasi[b.j]}
                    </td>
                    {kolom > 4 && <td colSpan={kolom - 4} className="g-mati" />}
                  </tr>
                );
              return (
                <tr key={b.i} className="g-barang">
                  <td className="g-no num">{b.i + 1}</td>
                  <td className="g-teks">{x.uraian}</td>
                  <td className="g-teks r num">{angka(x.jumlah)}</td>
                  <td className="g-teks">{x.satuan}</td>
                  {harga && <td className="g-teks r num">{angka(satuan(x))}</td>}
                  {harga && <td className="g-hasil num">{angka(x.jumlah * satuan(x))}</td>}
                  {periksa && <td className="g-teks g-tengah g-centang">{centang ? "√" : ""}</td>}
                  {adaKet && <td className="g-teks">{x.ket}</td>}
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
