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
 * panah pindah sel, Alt/⌥+Enter menambah baris spesifikasi, F2 menyunting isi sel, Esc keluar dari sel.
 * Daftar yang disalin dari Excel / Google Sheets bisa langsung ditempel (Ctrl/⌘+V) mulai dari sel yang dipilih:
 * baris "- spesifikasi" otomatis menjadi spesifikasi barang di atasnya, baris judul kolom dan baris
 * JUMLAH/PPN/TOTAL/TERBILANG dilewati.
 * Batas sama dengan database (app.rapikan_item_paket): 50 barang/jasa, 20 baris spesifikasi per barang.
 */
import { useEffect, useLayoutEffect, useRef, type ClipboardEvent, type KeyboardEvent, type RefObject } from "react";
import Icon from "./Icon";
import { InputRupiah, digitTempel } from "./ui";
import { rupiah } from "@/lib/format";
import { angka, hitungPpn, terbilangRupiah } from "@/lib/pengadaan";
import type { ItemPaket } from "@/lib/types";

export const MAKS_BARANG = 50;
export const MAKS_SPEK = 20;
const MAKS_JUMLAH = 100_000;
const MAKS_HARGA = 10_000_000_000;
const SATUAN = ["pcs", "buah", "unit", "paket", "set", "rim", "lusin", "box", "dus", "kg", "liter", "lembar", "eksemplar", "orang", "kegiatan", "bulan"];
/** tanda awal baris spesifikasi di Excel: "- ", "• ", "* " */
const POIN = /^\s*[-–—•*·]\s*/;
const tanpaPoin = (s: string) => s.replace(POIN, "").trim();
const satuBaris = (s: string) => s.replace(/\s*\n\s*/g, " ").trim();
/** Teks salinan berisi lebih dari satu sel (ada tab atau baris baru selain baris baru penutup) */
const banyakSel = (teks: string) => /[\t\n\r]/.test(teks.replace(/[\r\n]+$/, ""));

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
   Tempel dari Excel / Google Sheets
   ===================================================================== */
/** Teks salinan spreadsheet (sel dipisah tab, baris dipisah baris baru, sel berkutip boleh berisi baris baru) → baris × sel */
export function bacaSalinan(teks: string): string[][] {
  const t = teks.replace(/\r\n?/g, "\n");
  const hasil: string[][] = [];
  let baris: string[] = [];
  let sel = "";
  let kutip = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (kutip) {
      if (c === '"' && t[i + 1] === '"') {
        sel += '"';
        i++;
      } else if (c === '"') kutip = false;
      else sel += c;
    } else if (c === '"' && sel === "") kutip = true;
    else if (c === "\t") {
      baris.push(sel);
      sel = "";
    } else if (c === "\n") {
      baris.push(sel);
      hasil.push(baris);
      baris = [];
      sel = "";
    } else sel += c;
  }
  if (sel !== "" || baris.length) {
    baris.push(sel);
    hasil.push(baris);
  }
  while (hasil.length && !hasil[hasil.length - 1].some((x) => x.trim())) hasil.pop();
  return hasil;
}

/** Urutan kolom sheet HPS / nota; "no" dan "total" tidak diisi (nomor & jumlah dihitung sendiri) */
const URUTAN_HPS = ["no", "uraian", "jumlah", "satuan", "harga", "total", "ket"] as const;
type KolomTempel = (typeof URUTAN_HPS)[number];
interface BarangTempel {
  uraian?: string;
  spek: string[];
  jumlah?: string;
  satuan?: string;
  harga?: string;
  ket?: string;
}
const JUDUL_KOLOM =
  /^(no\.?|nomor|uraian( barang(\/jasa)?)?|nama barang(\/jasa)?|satuan|ket\.?|keterangan|harga satuan( \(rp\))?|(total )?jumlah \(rp\))$/i;
const RINGKASAN = /^(jumlah|sub ?total|ppn( 11 ?%)?|total( jumlah| hps| harga)?)\s*:?$/i;
const NOMOR_URUT = /^\d{1,3}[.)]?$/;

/**
 * Tafsir salinan mulai dari kolom ke-`awal` susunan HPS (0 = No, 1 = Uraian, …):
 * baris barang, baris spesifikasi (diawali "-" atau tanpa jumlah/satuan/harga), judul kolom & ringkasan dilewati.
 */
export function tafsirSalinan(data: string[][], awal: number): { barang: BarangTempel[]; spekAwal: string[] } {
  const rows = data.filter((r) => r.some((c) => c.trim()) && !r.some((c) => JUDUL_KOLOM.test(c.trim())));
  // Kolom No ikut tersalin? (kolom pertama hanya nomor urut, kolom kedua berisi teks)
  let mulai = awal;
  if (mulai === 1) {
    const pertama = rows.filter((r) => r.length > 1).map((r) => r[0].trim()).filter(Boolean);
    if (pertama.length > 0 && pertama.every((v) => NOMOR_URUT.test(v)) && rows.some((r) => /\p{L}/u.test(r[1] ?? ""))) mulai = 0;
  }
  const kolomKe = (k: number): KolomTempel | undefined => URUTAN_HPS[mulai + k];
  const lebar = Math.max(0, ...rows.map((r) => r.length));
  const tercakup = new Set(Array.from({ length: lebar }, (_, k) => kolomKe(k)));
  const adaAngka = tercakup.has("jumlah") || tercakup.has("satuan") || tercakup.has("harga");
  const barang: BarangTempel[] = [];
  const spekAwal: string[] = [];
  for (const r of rows) {
    const v: Partial<Record<KolomTempel, string>> = {};
    r.forEach((sel, k) => {
      const kol = kolomKe(k);
      if (kol && kol !== "no" && kol !== "total") v[kol] = sel.trim();
    });
    const teks = (v.uraian ?? "").split("\n").map((s) => s.trim()).filter(Boolean);
    const ur = teks[0] ?? "";
    // baris ringkasan HPS (JUMLAH, PPN 11%, TOTAL JUMLAH, TERBILANG)
    if ((RINGKASAN.test(ur) || /^terbilang\b/i.test(ur)) && !v.satuan) continue;
    // judul kolom angka yang ikut tersalin, mis. hanya kolom "Jumlah" / "Harga Satuan"
    if ([v.jumlah, v.harga].some((x) => x && /\p{L}/u.test(x) && !/\d/.test(x))) continue;
    const tanpaAngka = !v.jumlah && !v.satuan && !v.harga;
    if (!ur && tanpaAngka && !v.ket) continue;
    if (ur && tanpaAngka && (POIN.test(ur) || adaAngka)) {
      const spek = teks.map(tanpaPoin).filter(Boolean);
      if (barang.length) barang[barang.length - 1].spek.push(...spek);
      else spekAwal.push(...spek);
      continue;
    }
    barang.push({
      uraian: v.uraian === undefined ? undefined : tanpaPoin(ur),
      // isi sel berbaris banyak: baris pertama uraian, sisanya spesifikasi
      spek: teks.slice(1).map(tanpaPoin).filter(Boolean),
      jumlah: v.jumlah,
      satuan: v.satuan === undefined ? undefined : satuBaris(v.satuan),
      harga: v.harga,
      ket: v.ket === undefined ? undefined : satuBaris(v.ket),
    });
  }
  return { barang, spekAwal };
}

const digitJumlah = (s: string) => digitTempel(s).replace(/^0+/, "").slice(0, 6);
const digitHarga = (s: string) => digitTempel(s).replace(/^0+/, "").slice(0, 11);

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
   Tahap 1 — tabel HPS yang bisa diisi
   ===================================================================== */
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
  const tandai = coba > 0;
  const nSpek = nilai.map((b) => b.spek.length);
  const baris = susunBaris(nSpek);

  // Nomor urut hanya untuk baris yang terisi (sama dengan nomor yang tercetak)
  let n = 0;
  const nomor = nilai.map((b) => (barisTerisi(b) ? ++n : 0));
  const jumlahRp = nilai.reduce((s, b) => s + (Number(b.jumlah) || 0) * (Number(b.harga) || 0), 0);
  const totalRp = jumlahRp + (ppn ? hitungPpn(jumlahRp) : 0);

  // Simpan gagal → fokus ke sel pertama yang belum benar
  useEffect(() => {
    if (coba <= 0) return;
    const i = nilai.findIndex((b) => barisTerisi(b) && salahBarang(b).length > 0);
    if (i >= 0) fokus(indeksBaris(nSpek, i), salahBarang(nilai[i])[0]);
    else if (!nilai.some(barisTerisi)) fokus(0, "uraian");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coba]);

  const ganti = onChange;
  const jumlahSpek = (xs: BarisBarang[]) => xs.map((x) => x.spek.length);
  const ubah = (i: number, data: Partial<BarisBarang>) => ganti(nilai.map((x, k) => (k === i ? { ...x, ...data } : x)));
  /** tanda "- " yang diketik di awal spesifikasi dibuang karena tanda "-" sudah tampil di depan sel */
  const ubahSpek = (i: number, j: number, teks: string) => {
    const bersih = teks.replace(/^\s*[-–—•*·]\s+/, "");
    ganti(nilai.map((x, k) => (k === i ? { ...x, spek: x.spek.map((s, m) => (m === j ? bersih : s)) } : x)));
  };

  const tambahBaris = (setelah: number, kolom: KolomBarang = "uraian") => {
    if (nilai.length >= MAKS_BARANG) return onInfo?.(`Maksimal ${MAKS_BARANG} barang/jasa dalam satu paket`);
    const xs = [...nilai.slice(0, setelah + 1), barisKosong(), ...nilai.slice(setelah + 1)];
    nanti(indeksBaris(jumlahSpek(xs), setelah + 1), kolom);
    ganti(xs);
  };
  const hapusBaris = (i: number) => {
    const sisa = nilai.filter((_, k) => k !== i);
    const xs = sisa.length ? sisa : [barisKosong()];
    nanti(indeksBaris(jumlahSpek(xs), Math.min(i, xs.length - 1)), "uraian");
    ganti(xs);
  };
  /** baris spesifikasi baru di bawah spesifikasi ke-`setelah` (atau di akhir daftar spesifikasinya) */
  const tambahSpek = (i: number, setelah?: number) => {
    const x = nilai[i];
    if (x.spek.length >= MAKS_SPEK) return onInfo?.(`Maksimal ${MAKS_SPEK} baris spesifikasi per barang/jasa`);
    const j = setelah === undefined ? x.spek.length : setelah + 1;
    const xs = nilai.map((y, k) => (k === i ? { ...y, spek: [...y.spek.slice(0, j), "", ...y.spek.slice(j)] } : y));
    nanti(indeksBaris(jumlahSpek(xs), i, j), "uraian");
    ganti(xs);
  };
  /** hapus spesifikasi ke-j; fokus pindah ke baris sebelumnya, ke barang berikutnya, atau tetap di posisi yang sama */
  const hapusSpek = (i: number, j: number, ke: "sebelum" | "berikut" | "tetap") => {
    const xs = nilai.map((y, k) => (k === i ? { ...y, spek: y.spek.filter((_, m) => m !== j) } : y));
    if (ke === "berikut" && i + 1 >= xs.length && xs.length < MAKS_BARANG) xs.push(barisKosong());
    const ns = jumlahSpek(xs);
    if (ke === "berikut") nanti(indeksBaris(ns, Math.min(i + 1, xs.length - 1)), "uraian");
    else if (ke === "tetap" && j < xs[i].spek.length) nanti(indeksBaris(ns, i, j), "uraian");
    else nanti(j > 0 ? indeksBaris(ns, i, j - 1) : indeksBaris(ns, i), "uraian");
    ganti(xs);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTableElement>) => {
    const el = e.target as HTMLInputElement;
    if (el.tagName !== "INPUT" || el.dataset.r === undefined || e.nativeEvent.isComposing) return;
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

  // Tempel salinan beberapa sel (Excel / Google Sheets). Satu sel biasa ditangani isian itu sendiri.
  const onPasteCapture = (e: ClipboardEvent<HTMLTableElement>) => {
    const el = e.target as HTMLInputElement;
    if (el.tagName !== "INPUT" || el.dataset.r === undefined) return;
    const mentah = e.clipboardData.getData("text/plain");
    if (!banyakSel(mentah)) return;
    e.preventDefault();
    e.stopPropagation();
    const b = baris[Number(el.dataset.r)];
    const data = bacaSalinan(mentah);
    if (!b || !data.length) return;

    // Di baris spesifikasi, salinan satu kolom = beberapa baris spesifikasi
    if (b.jenis === "spek" && data.every((d) => d.filter((x) => x.trim()).length <= 1)) {
      const x = nilai[b.i];
      const teks = data
        .flatMap((d) => (d.find((y) => y.trim()) ?? "").split("\n"))
        .map((s) => tanpaPoin(s).slice(0, 200))
        .filter(Boolean)
        .slice(0, MAKS_SPEK - x.spek.length + 1);
      const spek = [...x.spek.slice(0, b.j), ...teks, ...x.spek.slice(b.j + 1)];
      ganti(nilai.map((y, k) => (k === b.i ? { ...y, spek } : y)));
      onInfo?.(`${teks.length} baris spesifikasi ditempel`);
      return;
    }

    const mulaiBarang = b.jenis === "barang" ? b.i : b.i + 1;
    const kolomAwal = b.jenis === "barang" ? URUTAN_HPS.indexOf(el.dataset.c as KolomBarang) : 1;
    const { barang, spekAwal } = tafsirSalinan(data, kolomAwal);
    if (!barang.length && !spekAwal.length) return onInfo?.("Tidak ada baris barang/jasa yang bisa ditempel");
    // spesifikasi ikut diganti hanya bila salinan memuat spesifikasi (salinan sheet HPS utuh)
    const adaSpek = spekAwal.length > 0 || barang.some((m) => m.spek.length > 0);
    const xs = nilai.map((x) => ({ ...x }));
    if (spekAwal.length && b.jenis === "barang") xs[b.i].spek = [...xs[b.i].spek, ...spekAwal].slice(0, MAKS_SPEK);
    let masuk = 0;
    let lewat = 0;
    barang.forEach((m, k) => {
      const i = mulaiBarang + k;
      if (i >= MAKS_BARANG) return void lewat++;
      while (xs.length <= i) xs.push(barisKosong());
      const x = xs[i];
      if (m.uraian !== undefined) x.uraian = m.uraian.slice(0, 200);
      if (m.uraian !== undefined && adaSpek) x.spek = m.spek.slice(0, MAKS_SPEK).map((s) => s.slice(0, 200));
      if (m.jumlah !== undefined) x.jumlah = digitJumlah(m.jumlah);
      if (m.satuan !== undefined) x.satuan = m.satuan.slice(0, 30);
      if (m.harga !== undefined) x.harga = digitHarga(m.harga);
      if (m.ket !== undefined) x.ket = m.ket.slice(0, 100);
      masuk++;
    });
    ganti(xs);
    const nSpekTempel = spekAwal.length + barang.reduce((s, m) => s + m.spek.length, 0);
    onInfo?.(
      `${masuk} baris barang/jasa ditempel` +
        (nSpekTempel ? ` · ${nSpekTempel} baris spesifikasi` : "") +
        (lewat ? ` · ${lewat} baris tidak masuk (maksimal ${MAKS_BARANG} barang/jasa)` : ""),
    );
  };

  const kelasSel = (x: BarisBarang, kolom: KolomBarang, tambahan = "") =>
    `g-sel${tambahan}${tandai && barisTerisi(x) && salahBarang(x).includes(kolom) ? " g-salah" : ""}`;
  const kosongSemua = n === 0;

  return (
    <div className="full tabel-isian">
      <div className="tabel-isian-kepala">
        <b>Daftar barang/jasa (HPS)</b>
        <small>
          {n} barang/jasa · total <b className="num">{rupiah(totalRp)}</b>
        </small>
      </div>
      <div className="grid-excel-wrap">
        <table className="grid-excel" ref={ref} onKeyDown={onKeyDown} onPasteCapture={onPasteCapture} onMouseDown={() => (tabAwal.current = null)}>
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
                      onChange={(e) => ubah(b.i, { uraian: e.target.value })}
                      placeholder={b.i === 0 && kosongSemua ? "Ketik uraian, atau tempel daftar dari Excel" : undefined}
                      aria-label={`Uraian ${label}`}
                      autoComplete="off"
                    />
                  </td>
                  <td className={kelasSel(x, "jumlah", " r")}>
                    <InputRupiah
                      data-r={r}
                      data-c="jumlah"
                      value={x.jumlah}
                      onChange={(v) => ubah(b.i, { jumlah: v })}
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
                      onChange={(e) => ubah(b.i, { satuan: e.target.value })}
                      aria-label={`Satuan ${label}`}
                      autoComplete="off"
                    />
                  </td>
                  <td className={kelasSel(x, "harga", " r")}>
                    <InputRupiah
                      data-r={r}
                      data-c="harga"
                      value={x.harga}
                      onChange={(v) => ubah(b.i, { harga: v })}
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
                      onChange={(e) => ubah(b.i, { ket: e.target.value })}
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
          <Ringkasan kolomLabel={5} kolomSisa={2} jumlah={jumlahRp} ppn={ppn} onPpn={onPpn} />
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
          <kbd>Tab</kbd> kolom berikutnya · <kbd>Enter</kbd> baris berikutnya · <kbd>Alt/⌥</kbd>+<kbd>Enter</kbd> tambah spesifikasi ·{" "}
          <kbd>Ctrl/⌘</kbd>+<kbd>V</kbd> tempel daftar dari Excel/Google Sheets. Baris kosong tidak ikut disimpan · maksimal {MAKS_BARANG} barang/jasa.
        </p>
      </div>
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
  const nSpek = item.map((x) => x.spesifikasi.length);
  const baris = susunBaris(nSpek);
  const jumlahRp = item.reduce((s, x, i) => s + x.jumlah * (Number(harga[i]) || 0), 0);
  const total = jumlahRp + (ppn ? hitungPpn(jumlahRp) : 0);

  const pindah = (i: number, arah: 1 | -1) => {
    const k = i + arah;
    if (k >= 0 && k < item.length) fokus(indeksBaris(nSpek, k), "beli");
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTableElement>) => {
    const el = e.target as HTMLInputElement;
    if (el.tagName !== "INPUT" || el.dataset.i === undefined || e.nativeEvent.isComposing) return;
    const i = Number(el.dataset.i);
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

  // Tempel harga dari Excel: satu kolom harga, atau baris lengkap No · Uraian · Jumlah · Satuan · Harga Satuan · Jumlah
  const onPasteCapture = (e: ClipboardEvent<HTMLTableElement>) => {
    const el = e.target as HTMLInputElement;
    if (el.tagName !== "INPUT" || el.dataset.i === undefined) return;
    const mentah = e.clipboardData.getData("text/plain");
    if (!banyakSel(mentah)) return;
    e.preventDefault();
    e.stopPropagation();
    const data = bacaSalinan(mentah);
    const adaTeks = data.some((d) => d.length > 1 && d.slice(0, 2).some((x) => /\p{L}/u.test(x)));
    const angkaTempel = adaTeks
      ? tafsirSalinan(data, 1).barang.map((m) => digitHarga(m.harga ?? ""))
      : data.filter((d) => d.some((x) => x.trim())).map((d) => digitHarga(d[0] ?? ""));
    const mulai = Number(el.dataset.i);
    const h = [...harga];
    let masuk = 0;
    angkaTempel.forEach((v, k) => {
      if (v && mulai + k < h.length) {
        h[mulai + k] = v;
        masuk++;
      }
    });
    onHarga(h);
    onInfo?.(masuk ? `${masuk} harga satuan ditempel` : "Tidak ada harga yang bisa ditempel");
  };

  return (
    <div className="full tabel-isian">
      <div className="tabel-isian-kepala">
        <b>Harga sesuai Nota / Bukti Pembelian</b>
        <small>
          {item.length} barang/jasa · total <b className="num">{rupiah(total)}</b>
        </small>
      </div>
      <div className="grid-excel-wrap">
        <table className="grid-excel" ref={ref} onKeyDown={onKeyDown} onPasteCapture={onPasteCapture}>
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
                      onChange={(v) => onHarga(harga.map((y, k) => (k === b.i ? v : y)))}
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
            onPpn={onPpn}
            label="TOTAL PEMBELIAN"
            banding={{ label: "TOTAL HPS", nilai: totalHps, lebih: total > totalHps }}
          />
        </table>
      </div>
      <p className="tabel-isian-petunjuk">
        Isi kolom <b>Harga Satuan</b> sesuai nota (bawaan: harga HPS) · <kbd>Enter</kbd> barang berikutnya · satu kolom harga dari Excel bisa
        langsung ditempel dengan <kbd>Ctrl/⌘</kbd>+<kbd>V</kbd>.
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
}: {
  judul: string;
  item: ItemPaket[];
  /** kolom harga yang ditampilkan: HPS (Surat Pesanan) atau pembelian (Kwitansi); tanpa kolom harga bila kosong */
  harga?: "hps" | "beli";
  ppn?: boolean;
  /** kolom MEMENUHI Lampiran BAP: tanda √ untuk semua barang bila true */
  centang?: boolean;
}) {
  const nSpek = item.map((x) => x.spesifikasi.length);
  const baris = susunBaris(nSpek);
  const satuan = (x: ItemPaket) => (harga === "beli" ? (x.harga ?? x.hargaHps) : x.hargaHps);
  const jumlahRp = harga ? item.reduce((s, x) => s + x.jumlah * satuan(x), 0) : 0;
  const periksa = centang !== undefined;
  const adaKet = item.some((x) => x.ket.trim());
  const kolomSisa = (periksa ? 1 : 0) + (adaKet ? 1 : 0);
  const kolom = 4 + (harga ? 2 : 0) + kolomSisa;
  return (
    <div className="full tabel-isian">
      <div className="tabel-isian-kepala">
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
