/**
 * PEMBACA "LAPORAN REALISASI — FA DETAIL 16 SEGMEN" (GLP039) DARI SAKTI (.xlsx)
 * -------------------------------------------------------------------------------
 * Berjalan sepenuhnya di browser, tanpa library tambahan:
 *   1. File .xlsx (arsip zip) dibuka dengan DecompressionStream("deflate-raw").
 *   2. Sheet pertama dibaca menjadi baris-baris sel.
 *   3. Tiap baris dikenali dari pola kodenya (bukan dari nomor kolom, karena posisi kolom
 *      bisa bergeser antar-ekspor):
 *        DL / WA                program
 *        DL.1975                kegiatan
 *        DAB                    KRO
 *        DAB.002                RO
 *        051                    komponen
 *        051.0A                 sub komponen  (dipakai sebagai "A")
 *        521211                 akun  → satu MAK: 1975.DAB.002.051.A.521211
 *        000001. Uraian item    item  (rincian di bawah akun, bila laporan memuat level Item)
 *      Teks yang terpotong pergantian halaman (mis. "…Bagi Tenaga" + "Dosen") digabung ke baris sebelumnya.
 *   4. Kolom angka (pagu, lock pagu, realisasi periode lalu, realisasi periode ini) diambil dari
 *      posisi angka pada baris "JUMLAH SELURUHNYA". Realisasi = periode lalu + periode ini,
 *      sisa = pagu − lock pagu − realisasi (sama dengan kolom SISA ANGGARAN di SAKTI).
 *   5. Sumber dana tidak ada di laporan; ditentukan dari kode akun (525xxx & 537xxx = BLU, selain itu RM).
 *   6. Hasil divalidasi: total baris MAK dibandingkan dengan baris JUMLAH SELURUHNYA,
 *      dan jumlah item dibandingkan dengan nilai akunnya.
 */
import { danaDariAkun, type DataPok, type ItemMentah, type BarisMakMentah } from "./mak";

export interface RingkasanFa {
  file: string;
  periode: string;
  satker: string;
  kodeSatker: string;
  /** "item" bila laporan memuat rincian item, "akun" bila hanya sampai akun */
  tingkat: "item" | "akun";
  jumlahMak: number;
  jumlahItem: number;
  /** jumlah MAK per sumber dana (hasil validasi dari kode akun) */
  makRm: number;
  makBlu: number;
  total: { pagu: number; lock: number; realisasi: number; sisa: number };
  /** angka baris JUMLAH SELURUHNYA pada laporan (bila ada) */
  totalLaporan: { pagu: number; lock: number; realisasi: number } | null;
  /** total baris MAK sama persis dengan baris JUMLAH SELURUHNYA */
  totalCocok: boolean;
  /** jumlah akun yang nilai itemnya tidak sama dengan nilai akun */
  itemTidakCocok: number;
  /** jumlah baris terpotong halaman yang digabungkan */
  barisSambungan: number;
  peringatan: string[];
}

export type HasilFa = { ok: true; data: DataPok; ringkasan: RingkasanFa } | { ok: false; pesan: string };

type Sel = string | number;
type Baris = (Sel | undefined)[];

/* =========================================================
   1. Arsip zip (.xlsx)
   ========================================================= */
const u16 = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8);
const u32 = (b: Uint8Array, o: number) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

interface EntriZip {
  metode: number;
  ukuran: number;
  offset: number;
}

function daftarIsiZip(b: Uint8Array): Map<string, EntriZip> {
  // Cari "end of central directory" dari belakang (komentar zip maks. 65535 byte)
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 22 - 65535); i--) {
    if (u32(b, i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("File bukan berkas Excel .xlsx");
  const jumlah = u16(b, eocd + 10);
  let p = u32(b, eocd + 16);
  const td = new TextDecoder();
  const isi = new Map<string, EntriZip>();
  for (let i = 0; i < jumlah; i++) {
    if (u32(b, p) !== 0x02014b50) throw new Error("Struktur berkas .xlsx rusak");
    const n = u16(b, p + 28);
    const m = u16(b, p + 30);
    const k = u16(b, p + 32);
    isi.set(td.decode(b.subarray(p + 46, p + 46 + n)), { metode: u16(b, p + 10), ukuran: u32(b, p + 20), offset: u32(b, p + 42) });
    p += 46 + n + m + k;
  }
  return isi;
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === "undefined") throw new Error("Browser ini belum mendukung pembacaan .xlsx. Gunakan Chrome, Edge, Firefox, atau Safari versi terbaru.");
  const aliran = new Blob([new Uint8Array(data)]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(aliran).arrayBuffer());
}

async function bacaTeks(b: Uint8Array, isi: Map<string, EntriZip>, nama: string): Promise<string | null> {
  const e = isi.get(nama);
  if (!e) return null;
  if (u32(b, e.offset) !== 0x04034b50) throw new Error("Struktur berkas .xlsx rusak");
  const mulai = e.offset + 30 + u16(b, e.offset + 26) + u16(b, e.offset + 28);
  const mentah = b.subarray(mulai, mulai + e.ukuran);
  const data = e.metode === 0 ? mentah : e.metode === 8 ? await inflateRaw(mentah) : null;
  if (!data) throw new Error("Metode kompresi berkas tidak didukung");
  return new TextDecoder("utf-8").decode(data);
}

/* =========================================================
   2. Lembar kerja (XML) → baris sel
   ========================================================= */
const ENTITAS: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const dekode = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) =>
    e[0] === "#" ? String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : (ENTITAS[e] ?? m),
  );
const gabungTeks = (xml: string) => Array.from(xml.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g), (m) => dekode(m[1])).join("");
const indeksKolom = (huruf: string) => huruf.split("").reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;

function bacaLembar(xml: string, teksBersama: string[]): Baris[] {
  const hasil: Baris[] = [];
  for (const mBaris of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const baris: Baris = [];
    let urut = 0;
    for (const mSel of mBaris[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const atr = mSel[1];
      const isi = mSel[2] ?? "";
      const ref = /\br="([A-Z]+)\d+"/.exec(atr);
      const kol = ref ? indeksKolom(ref[1]) : urut;
      urut = kol + 1;
      const tipe = /\bt="(\w+)"/.exec(atr)?.[1] ?? "n";
      const v = /<v>([\s\S]*?)<\/v>/.exec(isi)?.[1];
      let nilai: Sel | undefined;
      if (tipe === "inlineStr") nilai = gabungTeks(isi);
      else if (tipe === "s") nilai = v !== undefined ? teksBersama[Number(v)] : undefined;
      else if (tipe === "str") nilai = v !== undefined ? dekode(v) : undefined;
      else if (tipe === "n" && v !== undefined && v !== "") nilai = Number(v);
      if (typeof nilai === "string") nilai = nilai.replace(/\s+/g, " ").trim();
      if (nilai !== undefined && nilai !== "" && !(typeof nilai === "number" && Number.isNaN(nilai))) baris[kol] = nilai;
    }
    hasil.push(baris);
  }
  return hasil;
}

async function bacaXlsx(file: Blob): Promise<Baris[]> {
  const b = new Uint8Array(await file.arrayBuffer());
  const isi = daftarIsiZip(b);
  // Lembar pertama sesuai urutan di workbook.xml (cadangan: sheet1.xml)
  let lembar = "xl/worksheets/sheet1.xml";
  const wb = await bacaTeks(b, isi, "xl/workbook.xml");
  const rels = await bacaTeks(b, isi, "xl/_rels/workbook.xml.rels");
  const rid = wb && /<sheet\b[^>]*\br:id="([^"]+)"/.exec(wb)?.[1];
  if (rid && rels) {
    const target = new RegExp(`<Relationship\\b[^>]*\\bId="${rid}"[^>]*\\bTarget="([^"]+)"`).exec(rels)?.[1]
      ?? new RegExp(`<Relationship\\b[^>]*\\bTarget="([^"]+)"[^>]*\\bId="${rid}"`).exec(rels)?.[1];
    if (target) lembar = target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`;
  }
  const xml = await bacaTeks(b, isi, lembar);
  if (!xml) throw new Error("Lembar kerja tidak ditemukan di dalam berkas");
  const ss = await bacaTeks(b, isi, "xl/sharedStrings.xml");
  const teksBersama = ss ? Array.from(ss.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g), (m) => gabungTeks(m[1])) : [];
  return bacaLembar(xml, teksBersama);
}

/* =========================================================
   3. Tafsir isi laporan FA Detail
   ========================================================= */
type Level = "program" | "kegiatan" | "kro" | "ro" | "komponen" | "sub" | "akun";
const POLA_LEVEL: [Level, RegExp][] = [
  ["program", /^[A-Z]{2}$/],
  ["kegiatan", /^[A-Z]{2}\.\d{4}$/],
  ["kro", /^[A-Z]{3}$/],
  ["ro", /^[A-Z]{3}\.\d{3}$/],
  ["komponen", /^\d{3}$/],
  ["sub", /^\d{3}\.[0-9A-Z]{1,3}$/],
  ["akun", /^\d{6}$/],
];
const POLA_ITEM = /^(\d{6})\.\s*(\S[\s\S]*)$/;

export function tafsirFaDetail(baris: Baris[], namaFile: string): HasilFa {
  const uraian: Record<string, string> = {};
  const akunNama: Record<string, string> = {};
  const mak = new Map<string, BarisMakMentah>();
  const item: Record<string, ItemMentah[]> = {};
  const peringatan: string[] = [];

  let periode = "";
  let satker = "";
  let kodeSatker = "";
  let adaKepala = false;
  let kolom: number[] | null = null; // kolom pagu, lock, realisasi lalu, realisasi ini
  let totalLaporan: RingkasanFa["totalLaporan"] = null;
  let sambungan = 0;
  const akunAneh = new Set<string>();

  // posisi kode yang sedang berlaku
  const kode: Partial<Record<Level, string>> = {};
  /** baris terakhir yang dibaca, untuk menyambung teks yang terpotong halaman */
  let terakhir: { jenis: "uraian"; kunci: string } | { jenis: "akun"; kode: string } | { jenis: "item"; mak: string; i: number } | null = null;

  const angkaDari = (b: Baris): [number, number, number, number] => {
    if (kolom) return kolom.map((k) => (typeof b[k] === "number" ? (b[k] as number) : 0)) as [number, number, number, number];
    const n = b.filter((x): x is number => typeof x === "number");
    return [n[0] ?? 0, n[1] ?? 0, n[2] ?? 0, n[3] ?? 0];
  };

  for (const b of baris) {
    const sel = b.map((v, k) => ({ v, k })).filter((x) => x.v !== undefined) as { v: Sel; k: number }[];
    const teks = sel.filter((x) => typeof x.v === "string") as { v: string; k: number }[];
    if (teks.length === 0) continue;
    const t0 = teks[0].v;

    if (/^LAPORAN REALISASI/i.test(t0)) { adaKepala = true; continue; }
    if (/^Per Program\s*;/i.test(t0)) continue;
    if (/^Periode\s+\S+\s+\d{4}$/i.test(t0)) { periode = t0.replace(/^Periode\s+/i, ""); continue; }
    if (/^Satuan Kerja/i.test(t0)) {
      kodeSatker = teks[1]?.v ?? "";
      satker = [teks[1]?.v, teks[2]?.v].filter(Boolean).join(" ");
      continue;
    }
    if (/^JUMLAH SELURUHNYA/i.test(t0)) {
      const kAngka = sel.filter((x) => typeof x.v === "number").map((x) => x.k);
      if (kAngka.length >= 4) {
        kolom = kAngka.slice(0, 4);
        const [p, l, a, c] = angkaDari(b);
        totalLaporan = { pagu: p, lock: l, realisasi: a + c };
      }
      continue;
    }
    if (/^\*?Lock Pagu adalah/i.test(t0)) continue; // catatan kaki tiap halaman

    const iMatch = POLA_ITEM.exec(t0);
    const level = teks.length >= 2 ? POLA_LEVEL.find(([, p]) => p.test(t0))?.[0] : undefined;

    if (iMatch && teks.length === 1 && kode.akun) {
      // ---------- item ----------
      const kodeMak = makSekarang();
      if (!kodeMak) continue;
      const [p, l, a, c] = angkaDari(b);
      (item[kodeMak] ??= []).push([iMatch[1], iMatch[2].replace(/\s+/g, " ").trim(), p, l, a + c]);
      terakhir = { jenis: "item", mak: kodeMak, i: item[kodeMak].length - 1 };
      continue;
    }

    if (!level) {
      // ---------- sambungan teks dari halaman sebelumnya ----------
      if (terakhir && (kolom || Object.keys(kode).length)) {
        const tambahan = teks.map((x) => x.v).join(" ");
        if (terakhir.jenis === "uraian") uraian[terakhir.kunci] = `${uraian[terakhir.kunci] ?? ""} ${tambahan}`.replace(/\s+/g, " ").trim();
        else if (terakhir.jenis === "akun") akunNama[terakhir.kode] = `${akunNama[terakhir.kode] ?? ""} ${tambahan}`.replace(/\s+/g, " ").trim();
        else {
          const it = item[terakhir.mak][terakhir.i];
          it[1] = `${it[1]} ${tambahan}`.replace(/\s+/g, " ").trim();
        }
        sambungan++;
      }
      continue;
    }

    const ur = teks[1].v;
    switch (level) {
      case "program":
        Object.keys(kode).forEach((k) => delete kode[k as Level]);
        kode.program = t0;
        terakhir = null;
        break;
      case "kegiatan":
        kode.kegiatan = t0.split(".")[1];
        delete kode.kro; delete kode.ro; delete kode.komponen; delete kode.sub; delete kode.akun;
        uraian[kode.kegiatan] = ur;
        terakhir = { jenis: "uraian", kunci: kode.kegiatan };
        break;
      case "kro":
        kode.kro = t0;
        delete kode.ro; delete kode.komponen; delete kode.sub; delete kode.akun;
        uraian[`${kode.kegiatan}.${t0}`] = ur;
        terakhir = { jenis: "uraian", kunci: `${kode.kegiatan}.${t0}` };
        break;
      case "ro":
        kode.ro = t0.split(".")[1];
        delete kode.komponen; delete kode.sub; delete kode.akun;
        uraian[`${kode.kegiatan}.${kode.kro}.${kode.ro}`] = ur;
        terakhir = { jenis: "uraian", kunci: `${kode.kegiatan}.${kode.kro}.${kode.ro}` };
        break;
      case "komponen":
        kode.komponen = t0;
        delete kode.sub; delete kode.akun;
        uraian[`${kode.kegiatan}.${kode.kro}.${kode.ro}.${t0}`] = ur;
        terakhir = { jenis: "uraian", kunci: `${kode.kegiatan}.${kode.kro}.${kode.ro}.${t0}` };
        break;
      case "sub": {
        const s = t0.split(".")[1];
        kode.sub = s.length > 1 && s.startsWith("0") ? s.slice(1) : s;
        delete kode.akun;
        const kunci = `${kode.kegiatan}.${kode.kro}.${kode.ro}.${kode.komponen}.${kode.sub}`;
        uraian[kunci] = ur;
        terakhir = { jenis: "uraian", kunci };
        break;
      }
      case "akun": {
        kode.akun = t0;
        akunNama[t0] ??= ur;
        if (!/^5[123]/.test(t0)) akunAneh.add(t0);
        const kodeMak = makSekarang();
        if (!kodeMak) {
          peringatan.push(`Akun ${t0} tidak berada di bawah komponen/sub komponen yang lengkap dan dilewati`);
          break;
        }
        const [p, l, a, c] = angkaDari(b);
        const lama = mak.get(kodeMak);
        if (lama) {
          lama[1] += p; lama[2] += l; lama[3] += a + c;
          peringatan.push(`MAK ${kodeMak} muncul lebih dari sekali; nilainya dijumlahkan`);
        } else mak.set(kodeMak, [kodeMak, p, l, a + c]);
        terakhir = { jenis: "akun", kode: t0 };
        break;
      }
    }
  }

  function makSekarang(): string | null {
    const { kegiatan, kro, ro, komponen, sub, akun } = kode;
    return kegiatan && kro && ro && komponen && sub && akun ? `${kegiatan}.${kro}.${ro}.${komponen}.${sub}.${akun}` : null;
  }

  const daftar = Array.from(mak.values());
  if (daftar.length === 0) {
    return {
      ok: false,
      pesan: adaKepala
        ? "Tidak ada baris akun yang terbaca. Pastikan laporan diekspor per Program sampai Akun (atau Item)."
        : "File ini bukan Laporan FA Detail 16 Segmen dari SAKTI.",
    };
  }
  if (!adaKepala) peringatan.push("Judul laporan tidak dikenali; pastikan file berasal dari menu Laporan FA Detail SAKTI");
  if (kodeSatker && kodeSatker !== "287494") peringatan.push(`Kode satker pada file (${kodeSatker}) berbeda dengan PIP Makassar (287494)`);
  if (akunAneh.size) peringatan.push(`Akun di luar belanja 51/52/53: ${Array.from(akunAneh).join(", ")} (sumber dana dianggap RM)`);

  // Validasi rincian item terhadap nilai akunnya
  let itemTidakCocok = 0;
  const jumlahItem = Object.values(item).reduce((n, x) => n + x.length, 0);
  if (jumlahItem) {
    for (const [k, p, l, r] of daftar) {
      const it = item[k];
      if (!it) continue;
      const s = it.reduce((a, x) => [a[0] + x[2], a[1] + x[3], a[2] + x[4]], [0, 0, 0]);
      if (Math.abs(s[0] - p) > 0.5 || Math.abs(s[1] - l) > 0.5 || Math.abs(s[2] - r) > 0.5) itemTidakCocok++;
    }
  }

  const total = daftar.reduce((a, [, p, l, r]) => ({ pagu: a.pagu + p, lock: a.lock + l, realisasi: a.realisasi + r, sisa: 0 }), { pagu: 0, lock: 0, realisasi: 0, sisa: 0 });
  total.sisa = total.pagu - total.lock - total.realisasi;
  const totalCocok =
    !!totalLaporan &&
    Math.abs(totalLaporan.pagu - total.pagu) < 1 &&
    Math.abs(totalLaporan.lock - total.lock) < 1 &&
    Math.abs(totalLaporan.realisasi - total.realisasi) < 1;
  if (!totalLaporan) peringatan.push("Baris JUMLAH SELURUHNYA tidak ditemukan, total tidak dapat dicocokkan");

  const makRm = daftar.filter(([k]) => danaDariAkun(k.split(".").pop() ?? "") === "RM").length;

  return {
    ok: true,
    data: {
      sumber: { file: namaFile, periode, satker },
      uraian,
      akun: akunNama,
      mak: daftar,
      item: jumlahItem ? item : {},
    },
    ringkasan: {
      file: namaFile,
      periode,
      satker,
      kodeSatker,
      tingkat: jumlahItem ? "item" : "akun",
      jumlahMak: daftar.length,
      jumlahItem,
      makRm,
      makBlu: daftar.length - makRm,
      total,
      totalLaporan,
      totalCocok,
      itemTidakCocok,
      barisSambungan: sambungan,
      peringatan,
    },
  };
}

/** Baca berkas FA Detail (.xlsx) dari input file / seret-lepas */
export async function bacaFaDetail(file: File): Promise<HasilFa> {
  if (!/\.xlsx$/i.test(file.name)) return { ok: false, pesan: "Pilih berkas Excel berformat .xlsx hasil unduhan SAKTI" };
  try {
    return tafsirFaDetail(await bacaXlsx(file), file.name);
  } catch (e) {
    return { ok: false, pesan: e instanceof Error ? e.message : "Berkas tidak dapat dibaca" };
  }
}
