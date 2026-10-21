/**
 * Tempel dari Excel / Google Sheets → daftar barang/jasa HPS.
 *
 * Salinan tabel spreadsheet berupa teks bertab (sel dipisah tab, baris dipisah baris baru). Modul ini:
 *  - mengenali judul kolom dalam urutan apa pun (Uraian/Nama Barang, Spesifikasi, Volume/Qty/Jumlah, Satuan,
 *    Harga Satuan, Jumlah (Rp)/Total, Keterangan, No), termasuk judul dua baris dan baris nomor kolom (1, 2, 3 …);
 *  - menebak arti kolom dari isinya bila salinan tanpa judul (jumlah × harga = total, satuan umum, teks terpanjang = uraian);
 *  - melewati judul dokumen, baris kelompok/kode akun, subtotal, JUMLAH/PPN/TOTAL/TERBILANG, dan judul kolom yang berulang;
 *  - menjadikan baris "- …" (atau baris tanpa angka tepat di bawah barang) spesifikasi barang di atasnya, termasuk
 *    isi kolom Spesifikasi dan sel berbaris banyak;
 *  - membaca angka gaya Indonesia maupun Inggris ("Rp1.500.000,-", "1,500,000.00"), volume bersatuan ("10 pcs",
 *    "5 org x 2 hr"), dan menghitung harga satuan dari total ÷ jumlah bila kolom harga satuan tidak ada.
 * Murni (tanpa React) agar mudah diuji.
 */

export type Peran = "lewati" | "no" | "uraian" | "spek" | "jumlah" | "satuan" | "harga" | "total" | "ket";
export type JenisBaris = "barang" | "spek" | "lewati";

/** Pilihan arti kolom (urutan di menu) */
export const DAFTAR_PERAN: Peran[] = ["uraian", "spek", "jumlah", "satuan", "harga", "total", "ket", "no", "lewati"];
export const NAMA_PERAN: Record<Peran, string> = {
  uraian: "Uraian",
  spek: "Spesifikasi",
  jumlah: "Jumlah / volume",
  satuan: "Satuan",
  harga: "Harga satuan",
  total: "Total jumlah (Rp)",
  ket: "Keterangan",
  no: "No. (diabaikan)",
  lewati: "Abaikan",
};
/** Urutan kolom tabel HPS aplikasi — untuk tempel berurutan mulai dari sel yang dipilih */
export const URUTAN_TABEL: Peran[] = ["no", "uraian", "jumlah", "satuan", "harga", "total", "ket"];

const POIN = /^\s*[-–—•*·▪►]\s*/;
export const tanpaPoin = (s: string) => s.replace(POIN, "").trim();
const barisTeks = (s: string) =>
  s
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean);
const satuBaris = (s: string) => s.replace(/\s*\n\s*/g, " ").trim();
const adaHuruf = (s: string) => /\p{L}/u.test(s);

/** Teks salinan berisi lebih dari satu sel (ada tab atau baris baru selain baris baru penutup) */
export const banyakSel = (teks: string) => /[\t\n\r]/.test(teks.replace(/[\r\n]+$/, ""));

/* =====================================================================
   Membaca teks salinan
   ===================================================================== */
/** Teks salinan spreadsheet → baris × sel (sel berkutip boleh berisi tab/baris baru, "" = tanda kutip) */
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

/**
 * "Rp 1.500.000", "Rp1.500.000,-", "1,500,000.00", "1.500.000,50", "2,5", "12.000" → angka; null bila bukan angka.
 * Satu pemisah diikuti tepat 3 angka dianggap pemisah ribuan (12.000 / 12,000), selain itu desimal (2,5 / 1.25).
 */
export function angkaDari(teks: string): number | null {
  let t = (teks ?? "").trim();
  if (!t) return null;
  t = t
    .replace(/^(rp|idr)\.?\s*/i, "")
    .replace(/\s*(rp|idr)\.?$/i, "")
    .replace(/[,.]-+$/, "")
    .replace(/[\s ]+/g, "");
  let negatif = false;
  if (/^\(.*\)$/.test(t)) {
    negatif = true;
    t = t.slice(1, -1);
  }
  if (t.startsWith("-")) {
    negatif = true;
    t = t.slice(1);
  }
  if (!/^[\d.,]+$/.test(t) || !/\d/.test(t)) return null;
  const titik = (t.match(/\./g) ?? []).length;
  const koma = (t.match(/,/g) ?? []).length;
  let bulat = t;
  let pecahan = "";
  if (titik && koma) {
    const akhir = Math.max(t.lastIndexOf("."), t.lastIndexOf(","));
    bulat = t.slice(0, akhir);
    pecahan = t.slice(akhir + 1);
  } else if (titik + koma === 1) {
    const [a, b] = t.split(/[.,]/);
    if (b.length === 3 && a !== "" && a !== "0") bulat = a + b;
    else {
      bulat = a;
      pecahan = b;
    }
  }
  bulat = bulat.replace(/[.,]/g, "");
  if (!/^\d*$/.test(bulat) || !/^\d*$/.test(pecahan) || (!bulat && !pecahan)) return null;
  const n = Number(`${bulat || "0"}${pecahan ? "." + pecahan : ""}`);
  if (!Number.isFinite(n)) return null;
  return negatif ? -n : n;
}

/** "10 pcs" → 10 · pcs; "5 org x 2 hr" → 10 · org x hr; "2x3" → 6; "12" → 12; teks tanpa angka di depan → null */
export function volumeDari(teks: string): { n: number; satuan: string } | null {
  const t = (teks ?? "").trim().replace(/(\d)\s*[x×*]\s*(?=\d)/gi, "$1 x ");
  if (!t || !/^[-(]?\d/.test(t)) return null;
  let n = 1;
  const satuan: string[] = [];
  for (const bagian of t.split(/\s+[x×*]\s+/i)) {
    const m = bagian.trim().match(/^(\(?-?[\d.,]*\d\)?)\s*(.*)$/);
    if (!m) return null;
    const a = angkaDari(m[1]);
    if (a === null) return null;
    n *= a;
    const s = m[2].trim().replace(/^[.,]\s*/, "");
    if (s) satuan.push(s);
  }
  return { n, satuan: satuan.join(" x ") };
}
const nilaiVolume = (teks: string | undefined) => {
  const t = (teks ?? "").trim();
  if (!t) return null;
  return angkaDari(t) ?? volumeDari(t)?.n ?? null;
};

/* =====================================================================
   Judul kolom
   ===================================================================== */
const kunciJudul = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9@%#]+/g, " ")
    .trim();

/** Arti kolom menurut teks judulnya; "jumlah?" = judul "Jumlah" yang bisa berarti banyaknya atau total rupiah */
export function peranJudul(teks: string): Peran | "jumlah?" | null {
  const k = kunciJudul(teks ?? "");
  if (!k || /^\d+$/.test(k) || k.length > 40) return null;
  const ada = (...xs: string[]) => xs.some((x) => k.includes(x));
  const awal = (...xs: string[]) => xs.some((x) => k === x || k.startsWith(x + " "));
  if (
    ada("total", "subtotal", "sub total") ||
    (awal("jumlah", "jml", "jlh") && ada("harga", "biaya", "rp", "nilai", "rupiah", "dana")) ||
    awal("nilai", "amount", "line total", "extended price")
  )
    return "total";
  if (awal("harga", "hrg", "biaya satuan", "price", "unit price", "unit cost", "cost", "rate") || k === "@" || ada("harga satuan", "harga per", "harga @", "price per"))
    return "harga";
  if (ada("uraian", "nama barang", "nama item", "nama jasa", "nama pekerjaan")) return "uraian";
  if (awal("spesifikasi", "spek", "spec", "specs", "specification", "merk", "merek", "tipe", "type")) return "spek";
  if (awal("unit kerja")) return null;
  if (awal("satuan", "sat", "unit", "uom")) return "satuan";
  if (
    awal("volume", "vol", "qty", "quantity", "kuantitas", "banyaknya", "banyak", "kebutuhan") ||
    ["jml", "jlh", "jumlah barang", "jumlah unit", "jumlah kebutuhan", "jumlah item", "jumlah volume"].includes(k)
  )
    return "jumlah";
  if (k === "jumlah") return "jumlah?";
  if (awal("keterangan", "ket", "catatan", "note", "notes", "remark", "remarks")) return "ket";
  if ((awal("no", "nomor", "nmr") || k === "#") && k.length <= 9) return "no";
  if (awal("barang", "item", "items", "deskripsi", "description", "komponen", "rincian", "jenis", "pekerjaan", "nama", "produk", "material", "bahan"))
    return "uraian";
  return null;
}

/** Baris berisi judul kolom: tanpa sel angka, ≥ 2 judul dikenali dan setidaknya separuh sel yang terisi */
function barisJudul(r: string[]): boolean {
  const isi = r.map((c) => c.trim()).filter(Boolean);
  if (isi.length < 2 || isi.some((c) => angkaDari(c) !== null || volumeDari(c) !== null)) return false;
  const kenal = isi.filter((c) => peranJudul(c) !== null).length;
  return kenal >= 3 || (kenal >= 2 && kenal * 2 >= isi.length);
}

/** Baris nomor kolom di bawah judul: 1 | 2 | 3 … atau (1) | (2) | 6 = 4 x 5 */
function barisNomorKolom(r: string[]): boolean {
  const isi = r.map((c) => c.trim()).filter(Boolean);
  return isi.length >= 2 && isi.every((c) => /^[([]?\d{1,2}[)\]]?(\s*[=x×*:+/-]\s*[([]?\d{1,2}[)\]]?)*$/i.test(c));
}

/* =====================================================================
   Menebak arti kolom
   ===================================================================== */
interface Statistik {
  isi: number;
  angka: number;
  vol: number;
  teks: number;
  panjang: number;
  nilai: number[];
  bulat: number;
  satuanKenal: number;
  nomor: number;
  unik: number;
}
const SATUAN_KENAL = new Set(
  (
    "pcs pc buah bh unit unt paket pkt set rim lusin box dus dos kardus karton kg gram gr ons liter ltr l ml lembar lbr eksemplar eks " +
    "orang org kegiatan keg bulan bln hari hr oh ok ob oj ot kotak botol btl pak pack roll rol meter mtr m m2 m3 cm batang btg kodi " +
    "tabung galon sak zak karung ekor porsi tahun thn jam sesi kali ls lumpsum lot titik psg pasang stel setel buku bks bungkus biji " +
    "tube kaleng ikat gross tablet strip layanan jasa trip pp kamar malam mobil peserta siswa taruna kelas modul judul lisensi user " +
    "minggu kursi meja pintu lusin keping kpg sachet pouch pail drum can"
  ).split(" "),
);
const NOMOR = /^(\d{1,3}(\.\d{1,3})*[.)]?|[A-Za-z][.)]?|[IVXLC]{1,6}[.)]?)$/;
const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const a = [...xs].sort((x, y) => x - y);
  return a[Math.floor(a.length / 2)];
};

function statistik(rows: string[][], lebar: number): Statistik[] {
  return Array.from({ length: lebar }, (_, k) => {
    const s: Statistik = { isi: 0, angka: 0, vol: 0, teks: 0, panjang: 0, nilai: [], bulat: 0, satuanKenal: 0, nomor: 0, unik: 0 };
    const beda = new Set<string>();
    let panjang = 0;
    for (const r of rows) {
      const c = (r[k] ?? "").trim();
      if (!c) continue;
      s.isi++;
      beda.add(c.toLowerCase());
      const a = angkaDari(c);
      if (a !== null) {
        s.angka++;
        s.nilai.push(a);
        if (Number.isInteger(a)) s.bulat++;
      } else if (volumeDari(c)?.satuan) s.vol++;
      else if (adaHuruf(c)) {
        s.teks++;
        panjang += c.length;
      }
      if (SATUAN_KENAL.has(c.toLowerCase().replace(/\.$/, ""))) s.satuanKenal++;
      if (NOMOR.test(c)) s.nomor++;
    }
    s.panjang = s.teks ? panjang / s.teks : 0;
    s.unik = beda.size;
    return s;
  });
}

/** Tiga kolom angka dengan jumlah × harga = total pada sebagian besar baris → [jumlah, harga, total] */
function cariTiga(rows: string[][], kolom: number[], stat: Statistik[], peran: Peran[]): [number, number, number] | null {
  let terbaik: [number, number, number] | null = null;
  let skorTerbaik = 0;
  // angka tiap sel dihitung sekali saja (volume "10 pcs" untuk jumlah, angka murni untuk total)
  const vol = new Map(kolom.map((k) => [k, rows.map((r) => nilaiVolume(r[k]))]));
  const murni = new Map(kolom.map((k) => [k, rows.map((r) => angkaDari(r[k] ?? ""))]));
  for (const q of kolom)
    for (const p of kolom) {
      if (p <= q) continue; // pasangan tanpa urutan; urutannya ditentukan di bawah
      const vq = vol.get(q)!;
      const vp = vol.get(p)!;
      for (const t of kolom) {
        if (t === q || t === p) continue;
        const vt = murni.get(t)!;
        let uji = 0;
        let cocok = 0;
        for (let i = 0; i < rows.length; i++) {
          const a = vq[i];
          const b = vp[i];
          const c = vt[i];
          if (a === null || b === null || c === null) continue;
          uji++;
          if (Math.abs(a * b - c) <= Math.max(1, Math.abs(c) * 0.005)) cocok++;
        }
        if (uji && cocok / uji >= 0.6 && cocok > skorTerbaik) {
          skorTerbaik = cocok;
          terbaik = [q, p, t];
        }
      }
    }
  if (!terbaik) return null;
  // jumlah × harga = harga × jumlah: jumlah = kolom yang sudah berjudul volume, yang bersatuan ("10 pcs"),
  // yang nilainya bulat kecil (< 1000) sementara pasangannya tidak, atau yang lebih kiri
  const [a, b, t] = terbaik;
  const kecil = (k: number) => stat[k].bulat >= stat[k].angka * 0.9 && median(stat[k].nilai) < 1000;
  let jumlahDulu = true;
  if (peran[a] === "jumlah" || peran[b] === "harga") jumlahDulu = true;
  else if (peran[b] === "jumlah" || peran[a] === "harga") jumlahDulu = false;
  else if (stat[a].vol !== stat[b].vol) jumlahDulu = stat[a].vol > stat[b].vol;
  else if (kecil(a) !== kecil(b)) jumlahDulu = kecil(a);
  return jumlahDulu ? [a, b, t] : [b, a, t];
}

/** Isi arti kolom yang masih "lewati" (kolom `bebas`) dari isi salinan; mengembalikan true bila hubungan jumlah × harga = total ditemukan */
function tebakDariIsi(rows: string[][], stat: Statistik[], peran: Peran[], bebas: number[]): boolean {
  const ada = (p: Peran) => peran.includes(p);
  const lepas = (k: number) => bebas.includes(k) && peran[k] === "lewati" && stat[k].isi > 0;
  const rasio = (k: number, x: number) => (stat[k].isi ? x / stat[k].isi : 0);
  const kolomAngka = (k: number) => rasio(k, stat[k].angka + stat[k].vol) >= 0.6;
  const kolomTeks = (k: number) => rasio(k, stat[k].teks) >= 0.5;

  // No.: kolom paling kiri berisi nomor urut kecil, di kiri sebuah kolom teks
  if (!ada("no")) {
    const k0 = bebas.find((k) => stat[k].isi > 0);
    if (k0 !== undefined && lepas(k0) && rasio(k0, stat[k0].nomor) >= 0.7 && median(stat[k0].nilai) <= 500) {
      if (stat.some((s, k) => k > k0 && kolomTeks(k))) peran[k0] = "no";
    }
  }
  // Jumlah × harga = total
  const angkaK = stat.map((_, k) => k).filter((k) => (lepas(k) && kolomAngka(k)) || ["jumlah", "harga", "total"].includes(peran[k]));
  let tiga = false;
  const t3 = cariTiga(rows, angkaK, stat, peran);
  if (t3) {
    const [q, p, t] = t3;
    const boleh = (k: number, x: Peran) => peran[k] === x || (lepas(k) && !ada(x));
    if (boleh(q, "jumlah") && boleh(p, "harga") && boleh(t, "total")) {
      peran[q] = "jumlah";
      peran[p] = "harga";
      peran[t] = "total";
      tiga = true;
    }
  }
  const sisa = () =>
    stat
      .map((_, k) => k)
      .filter((k) => lepas(k) && kolomAngka(k))
      .sort((a, b) => median(stat[a].nilai) - median(stat[b].nilai) || a - b);
  if (!ada("jumlah")) {
    const s = sisa();
    const k =
      s.find((k) => stat[k].vol > 0) ??
      s.find((k) => median(stat[k].nilai) < 1000 && stat[k].bulat >= stat[k].angka * 0.9) ??
      (s.length >= 2 && !ada("harga") ? s[0] : undefined);
    if (k !== undefined) peran[k] = "jumlah";
  }
  if (!ada("harga")) {
    const k = sisa()[0];
    if (k !== undefined) peran[k] = "harga";
  }
  if (!ada("total")) {
    const k = sisa()[0];
    if (k !== undefined) peran[k] = "total";
  }

  // Kolom teks
  const posAngka = peran.flatMap((p, k) => (["jumlah", "harga", "total"].includes(p) ? [k] : []));
  const kiriAngka = posAngka.length ? Math.min(...posAngka) : Infinity;
  const teksK = () => stat.map((_, k) => k).filter((k) => lepas(k) && kolomTeks(k));
  if (!ada("uraian")) {
    // kolom teks paling kiri yang isinya cukup panjang (bukan satuan / kode kelompok pendek)
    const calon = teksK().filter((k) => rasio(k, stat[k].satuanKenal) < 0.5);
    const terpanjang = Math.max(0, ...calon.map((k) => stat[k].panjang));
    const k = calon.find((k) => stat[k].panjang >= terpanjang * 0.6);
    if (k !== undefined) peran[k] = "uraian";
  }
  if (!ada("satuan")) {
    const pJumlah = peran.indexOf("jumlah");
    const calon = teksK()
      .filter((k) => rasio(k, stat[k].satuanKenal) >= 0.4 || (stat[k].panjang <= 8 && stat[k].unik / stat[k].isi <= 0.8 && stat[k].isi >= 2))
      .sort((a, b) => Math.abs(a - pJumlah) - Math.abs(b - pJumlah));
    if (calon[0] !== undefined) peran[calon[0]] = "satuan";
  }
  if (!ada("spek")) {
    const pUraian = peran.indexOf("uraian");
    const k = teksK().find((k) => k > pUraian && k < kiriAngka && stat[k].panjang >= 3);
    if (k !== undefined) peran[k] = "spek";
  }
  if (!ada("ket")) {
    const k = teksK().find((k) => k > kiriAngka);
    if (k !== undefined) peran[k] = "ket";
  }
  return tiga;
}

/* =====================================================================
   Tafsir salinan
   ===================================================================== */
export interface Tafsir {
  /** arti tiap kolom salinan */
  peran: Peran[];
  /** teks judul tiap kolom ("" bila tidak ada) */
  judul: string[];
  /** baris judul kolom pertama & terakhir (−1 bila salinan tanpa judul kolom) */
  awalJudul: number;
  akhirJudul: number;
  /** dasar penentuan arti kolom */
  sumber: "judul" | "posisi" | "isi";
  /** arti kolom belum meyakinkan (mis. kolom uraian tidak ditemukan) → sebaiknya diperiksa pengguna */
  ragu: boolean;
}

/**
 * Tentukan arti kolom salinan. `posisi` = indeks kolom tabel aplikasi (URUTAN_TABEL) tempat menempel; dipakai bila
 * salinan tanpa judul kolom dan isinya cocok dengan urutan kolom aplikasi (perilaku tempel Excel biasa).
 */
export function tafsirTabel(data: string[][], opsi: { posisi?: number } = {}): Tafsir {
  const lebar = Math.max(0, ...data.map((r) => r.length));
  const judul: string[] = Array(lebar).fill("");
  const peran: Peran[] = Array(lebar).fill("lewati");

  // Judul kolom (boleh dua baris) di 20 baris pertama, lalu baris nomor kolom
  let awalJudul = data.slice(0, 20).findIndex(barisJudul);
  let akhirJudul = awalJudul;
  if (awalJudul >= 0) {
    const bawah = data[awalJudul + 1];
    if (bawah && !barisNomorKolom(bawah)) {
      const isi = bawah.map((c) => c.trim()).filter(Boolean);
      if (isi.length && isi.every((c) => angkaDari(c) === null) && isi.some((c) => peranJudul(c) !== null)) akhirJudul = awalJudul + 1;
    }
    for (let i = awalJudul; i <= akhirJudul; i++)
      data[i].forEach((c, k) => {
        const t = c.replace(/\s+/g, " ").trim();
        if (!t || angkaDari(t) !== null) return;
        if (!judul[k] || (peranJudul(judul[k]) === null && peranJudul(t) !== null)) judul[k] = t;
      });
    if (data[akhirJudul + 1] && barisNomorKolom(data[akhirJudul + 1])) akhirJudul++;
  } else awalJudul = akhirJudul = -1;

  // Baris data untuk statistik: sesudah judul, bukan baris kosong/ringkasan/judul berulang
  const rows = data
    .slice(akhirJudul + 1)
    .filter((r) => r.some((c) => c.trim()) && !barisJudul(r) && !RINGKASAN.test(teksPertama(r)))
    .slice(0, 500); // cukup untuk menebak; salinan sangat panjang tetap diproses seluruhnya
  const stat = statistik(rows, lebar);
  const semua = Array.from({ length: lebar }, (_, k) => k);

  let sumber: Tafsir["sumber"] = "isi";
  let tiga = false;
  if (awalJudul >= 0) {
    sumber = "judul";
    const mentah = judul.map((j) => (j ? peranJudul(j) : null));
    const sudah = (p: Peran) => mentah.includes(p);
    mentah.forEach((p, k) => {
      if (p === "jumlah?") {
        // "Jumlah" = total rupiah bila ada kolom banyaknya (Volume/Qty), = banyaknya bila ada kolom total
        if (sudah("jumlah")) mentah[k] = "total";
        else if (sudah("total")) mentah[k] = "jumlah";
        else {
          const s = stat[k];
          const lain = mentah.some((x, m) => m !== k && x === "harga");
          mentah[k] = s.isi && median(s.nilai) < 1000 && s.bulat >= s.angka * 0.9 && lain ? "jumlah" : lain ? "total" : "jumlah";
        }
      }
    });
    // satu kolom per arti, kecuali volume (dikalikan), satuan & keterangan (digabung)
    const dipakai = new Set<Peran>();
    mentah.forEach((p, k) => {
      if (!p || p === "jumlah?") return;
      if (dipakai.has(p) && !["jumlah", "satuan", "ket"].includes(p)) {
        if (p === "uraian" && !dipakai.has("spek")) {
          peran[k] = "spek";
          dipakai.add("spek");
        }
        return;
      }
      peran[k] = p;
      dipakai.add(p);
    });
    const bebas = semua.filter((k) => !mentah[k] && stat[k].isi > 0);
    if (bebas.length) tiga = tebakDariIsi(rows, stat, peran, bebas);
  } else if (opsi.posisi !== undefined && opsi.posisi >= 0 && cocokPosisi(stat, opsi.posisi)) {
    sumber = "posisi";
    semua.forEach((k) => (peran[k] = URUTAN_TABEL[opsi.posisi! + k] ?? "lewati"));
  } else tiga = tebakDariIsi(rows, stat, peran, semua);

  const jumlahAngka = peran.filter((p) => p === "jumlah" || p === "harga" || p === "total").length;
  const ragu =
    sumber !== "posisi" &&
    (!peran.includes("uraian") ||
      (sumber === "isi" && (jumlahAngka === 0 || (!tiga && stat.filter((s) => s.isi && (s.angka + s.vol) / s.isi >= 0.6).length >= 3))));
  return { peran, judul, awalJudul, akhirJudul, sumber, ragu };
}

/** Salinan tanpa judul cocok dengan urutan kolom aplikasi mulai dari kolom `posisi`? */
function cocokPosisi(stat: Statistik[], posisi: number): boolean {
  return stat.every((s, k) => {
    if (!s.isi) return true;
    const p = URUTAN_TABEL[posisi + k];
    if (!p) return false;
    const angka = (s.angka + s.vol) / s.isi;
    if (p === "jumlah") return angka >= 0.6;
    if (p === "harga" || p === "total") return s.angka / s.isi >= 0.6;
    if (p === "no") return s.nomor / s.isi >= 0.6;
    return angka <= 0.5;
  });
}

/* =====================================================================
   Jenis tiap baris
   ===================================================================== */
const RINGKASAN = /^(sub\s*-?\s*total|total|jumlah|grand\s*total|ppn|pph|pajak|terbilang|dibulatkan|pembulatan)\b/i;
const KODE_AKUN = /^(\d{6}|\d{3,4}(\.[A-Z0-9]{2,4}){1,6})\b/;
const NOMOR_KELOMPOK = /^([A-Za-z]|[IVXLC]{1,6})$/;
/** Teks pertama di baris (bukan angka) — label baris ringkasan sering ada di kolom mana saja */
function teksPertama(r: string[]): string {
  for (const c of r) {
    const t = c.trim();
    if (t && angkaDari(t) === null && adaHuruf(t)) return barisTeks(t)[0] ?? "";
  }
  return "";
}

export interface Golongan {
  jenis: JenisBaris[];
  /** alasan baris dilewati */
  alasan: string[];
  /** salinan memuat baris PPN */
  adaPpn: boolean;
}

/** Golongkan tiap baris: barang, spesifikasi (milik barang di atasnya), atau dilewati. `paksa` = pilihan pengguna per baris. */
export function golongkan(data: string[][], t: Pick<Tafsir, "peran" | "awalJudul" | "akhirJudul">, paksa: Record<number, JenisBaris> = {}): Golongan {
  const kolom = (p: Peran) => t.peran.flatMap((x, k) => (x === p ? [k] : []));
  const K = { no: kolom("no"), uraian: kolom("uraian"), spek: kolom("spek"), jumlah: kolom("jumlah"), satuan: kolom("satuan"), harga: kolom("harga"), total: kolom("total") };
  const adaKolomAngka = K.jumlah.length + K.satuan.length + K.harga.length > 0;
  const nilai = (r: string[], ks: number[]) => ks.map((k) => (r[k] ?? "").trim()).filter(Boolean);
  const semuaNo = data.map((r) => (nilai(r, K.no)[0] ?? "").replace(/[.)]$/, ""));
  const jenis: JenisBaris[] = [];
  const alasan: string[] = [];
  let adaPpn = false;
  let sebelum: JenisBaris | null = null;

  data.forEach((r, i) => {
    let j: JenisBaris = "lewati";
    let a = "";
    const kosong = !r.some((c) => c.trim());
    if (t.awalJudul >= 0 && i < t.awalJudul) a = "judul dokumen";
    else if (t.awalJudul >= 0 && i <= t.akhirJudul) a = "judul kolom";
    else if (kosong) a = "kosong";
    else if (barisJudul(r)) a = "judul kolom";
    else {
      const urBaris = barisTeks(nilai(r, K.uraian).join("\n"));
      const ur = urBaris[0] ?? "";
      const sp = nilai(r, K.spek).join("\n");
      const jv = nilai(r, K.jumlah);
      const hv = nilai(r, K.harga);
      const adaJ = jv.some((v) => nilaiVolume(v) !== null);
      const adaS = nilai(r, K.satuan).length > 0;
      const adaH = hv.some((v) => angkaDari(v) !== null);
      const no = nilai(r, K.no)[0]?.replace(/[.)]$/, "") ?? "";
      const label = ur || teksPertama(r);
      if (RINGKASAN.test(label) && !adaS && !adaJ) {
        a = "jumlah / total";
        if (/^ppn/i.test(label)) adaPpn = true;
      } else if (!K.uraian.length) {
        // tempel kolom tanpa uraian (mis. satu kolom Jumlah): tiap baris berisi = satu barang
        const judulAngka = [...jv, ...hv].some((v) => adaHuruf(v) && !/\d/.test(v));
        const berisi = t.peran.some((p, k) => p !== "lewati" && p !== "no" && (r[k] ?? "").trim());
        if (judulAngka) a = "judul kolom";
        else if (berisi) j = "barang";
        else a = "kosong";
      } else if (!ur) {
        if (sp && (sebelum === "barang" || sebelum === "spek")) j = "spek";
        else a = "tanpa uraian";
      } else if (adaJ || adaS || adaH) j = "barang";
      else if (POIN.test(ur)) j = "spek";
      else if (KODE_AKUN.test(ur)) a = "kode akun / kelompok";
      else if (!adaKolomAngka) {
        if (no && NOMOR_KELOMPOK.test(no)) a = "kelompok";
        else j = "barang";
      } else if (no) {
        // baris bernomor tanpa angka: kelompok (A, B, I, II, atau "1" yang punya anak "1.1"), selain itu barang yang belum berharga
        const punyaAnak = semuaNo.some((x, m) => m > i && x.startsWith(no + "."));
        if (NOMOR_KELOMPOK.test(no) || punyaAnak) a = "kelompok";
        else j = "barang";
      } else if (nilai(r, K.total).some((v) => angkaDari(v) !== null)) a = "kelompok / subjumlah";
      else if (sebelum === "barang" || sebelum === "spek") j = "spek";
      else a = "judul / kelompok";
    }
    if (paksa[i] !== undefined && !kosong) j = paksa[i];
    jenis.push(j);
    alasan.push(j === "lewati" ? a || "dipilih untuk dilewati" : "");
    if (!kosong) sebelum = j;
  });
  return { jenis, alasan, adaPpn };
}

/* =====================================================================
   Susun barang
   ===================================================================== */
export type KodeCatatan = "hargaDariTotal" | "jumlahBulat" | "hargaBulat" | "totalBeda";
export interface BarangTempel {
  /** indeks baris salinan */
  baris: number;
  uraian: string;
  spek: string[];
  /** angka bulat sebagai teks digit ("" bila tidak ada) */
  jumlah: string;
  satuan: string;
  harga: string;
  ket: string;
  /** catatan untuk pengguna, mis. harga satuan dihitung dari total ÷ jumlah */
  catatan: { kode: KodeCatatan; teks: string }[];
}
export type Cakupan = Record<"uraian" | "spek" | "jumlah" | "satuan" | "harga" | "ket", boolean>;
export interface Susunan {
  barang: BarangTempel[];
  /** spesifikasi sebelum barang pertama (milik barang di atas bagian yang disalin) */
  spekAwal: string[];
  /** isian yang dimuat salinan — isian lain pada baris yang ditimpa tidak diubah */
  cakup: Cakupan;
}

const formatAngka = (n: number) => String(Math.round(n * 100) / 100).replace(".", ",");
const formatRp = (n: number) => "Rp" + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");

export function susunBarang(data: string[][], peran: Peran[], jenis: JenisBaris[]): Susunan {
  const kolom = (p: Peran) => peran.flatMap((x, k) => (x === p ? [k] : []));
  const K = { uraian: kolom("uraian"), spek: kolom("spek"), jumlah: kolom("jumlah"), satuan: kolom("satuan"), harga: kolom("harga"), total: kolom("total"), ket: kolom("ket") };
  const nilai = (r: string[], ks: number[]) => ks.map((k) => (r[k] ?? "").trim()).filter(Boolean);
  const barang: BarangTempel[] = [];
  const spekAwal: string[] = [];
  const angkaPertama = (xs: string[]) => {
    for (const x of xs) {
      const n = angkaDari(x);
      if (n !== null) return n;
    }
    return null;
  };

  data.forEach((r, i) => {
    if (jenis[i] === "barang") {
      const ur = barisTeks(nilai(r, K.uraian).join("\n")).map(tanpaPoin).filter(Boolean);
      const b: BarangTempel = { baris: i, uraian: ur[0] ?? "", spek: [], jumlah: "", satuan: "", harga: "", ket: "", catatan: [] };
      b.spek = [...ur.slice(1), ...barisTeks(nilai(r, K.spek).join("\n")).map(tanpaPoin)].filter(Boolean);
      // jumlah: hasil kali semua kolom volume; satuan dari kolom satuan atau dari "10 pcs"
      const vol = nilai(r, K.jumlah)
        .map((v) => volumeDari(v))
        .filter((v): v is { n: number; satuan: string } => v !== null);
      let n: number | null = vol.length ? vol.reduce((s, v) => s * v.n, 1) : null;
      if (n !== null && !Number.isInteger(n)) {
        const bulat = Math.round(n);
        b.catatan.push({ kode: "jumlahBulat", teks: `jumlah ${formatAngka(n)} dibulatkan menjadi ${bulat}` });
        n = bulat;
      }
      if (n !== null && n > 0) b.jumlah = String(n);
      b.satuan = satuBaris(nilai(r, K.satuan).join(" x ")) || vol.map((v) => v.satuan).filter(Boolean).join(" x ");
      // harga satuan; bila tidak ada, dari total ÷ jumlah
      let h = angkaPertama(nilai(r, K.harga));
      const t = angkaPertama(nilai(r, K.total));
      if (h === null && t !== null && n) {
        h = t / n;
        b.catatan.push({ kode: "hargaDariTotal", teks: "harga satuan dihitung dari total ÷ jumlah" });
      }
      if (h !== null) {
        const bulat = Math.round(h);
        if (Math.abs(bulat - h) > 0.001 && !b.catatan.some((c) => c.kode === "hargaDariTotal"))
          b.catatan.push({ kode: "hargaBulat", teks: `harga ${formatAngka(h)} dibulatkan menjadi ${bulat}` });
        if (bulat > 0) b.harga = String(bulat);
      }
      if (h !== null && t !== null && n && K.harga.length && Math.abs(n * Math.round(h) - t) > Math.max(1, Math.abs(t) * 0.005))
        b.catatan.push({ kode: "totalBeda", teks: `total di salinan ${formatRp(t)} tidak sama dengan jumlah × harga` });
      b.ket = satuBaris(nilai(r, K.ket).join("; "));
      barang.push(b);
    } else if (jenis[i] === "spek") {
      const teks = [...barisTeks(nilai(r, K.uraian).join("\n")), ...barisTeks(nilai(r, K.spek).join("\n"))].map(tanpaPoin).filter(Boolean);
      (barang.length ? barang[barang.length - 1].spek : spekAwal).push(...teks);
    }
  });

  const cakup: Cakupan = {
    uraian: K.uraian.length > 0,
    spek: K.spek.length > 0 || spekAwal.length > 0 || barang.some((b) => b.spek.length > 0),
    jumlah: K.jumlah.length > 0,
    satuan: K.satuan.length > 0 || barang.some((b) => b.satuan),
    harga: K.harga.length > 0 || (K.total.length > 0 && K.jumlah.length > 0),
    ket: K.ket.length > 0,
  };
  return { barang, spekAwal, cakup };
}

/* =====================================================================
   Pencocokan nama (nota pembelian) & salin ke Excel
   ===================================================================== */
const normNama = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/**
 * Cocokkan baris salinan ke barang paket menurut nama: sama persis dulu, lalu salah satu memuat yang lain.
 * Hasil: indeks barang untuk tiap baris salinan (null bila tidak ada yang cocok).
 */
export function cocokkanNama(namaBarang: string[], namaSalinan: string[]): (number | null)[] {
  const nb = namaBarang.map(normNama);
  const dipakai = new Set<number>();
  const hasil: (number | null)[] = namaSalinan.map(() => null);
  const cari = (uji: (a: string, b: string) => boolean) =>
    namaSalinan.forEach((s, i) => {
      if (hasil[i] !== null) return;
      const ns = normNama(s);
      if (!ns) return;
      const k = nb.findIndex((b, m) => !dipakai.has(m) && uji(b, ns));
      if (k >= 0) {
        hasil[i] = k;
        dipakai.add(k);
      }
    });
  cari((a, b) => a === b);
  cari((a, b) => Math.min(a.length, b.length) >= 4 && (a.includes(b) || b.includes(a)));
  return hasil;
}

/** Baris barang → teks bertab untuk ditempel di Excel (angka tanpa titik ribuan agar terbaca sebagai angka) */
export function tsvBarang(
  rows: { uraian: string; spek: string[]; jumlah: number; satuan: string; harga: number; ket?: string }[],
  opsi: { ppn?: boolean; judulHarga?: string; ket?: boolean } = {},
): string {
  const sel = (s: string | number) => {
    const t = String(s);
    return /["\t\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const ket = opsi.ket ?? true;
  const kepala = ["No.", "Uraian", "Jumlah", "Satuan", opsi.judulHarga ?? "Harga Satuan (Rp)", "Total Jumlah (Rp)", ...(ket ? ["Ket"] : [])];
  const kosong = (n: number) => Array(n).fill("");
  const baris: (string | number)[][] = [kepala];
  let jumlah = 0;
  rows.forEach((x, i) => {
    jumlah += x.jumlah * x.harga;
    baris.push([i + 1, x.uraian, x.jumlah, x.satuan, x.harga, x.jumlah * x.harga, ...(ket ? [x.ket ?? ""] : [])]);
    x.spek.forEach((s) => baris.push(["", `- ${s}`, ...kosong(kepala.length - 2)]));
  });
  const ppn = opsi.ppn ? Math.floor((jumlah * 11 + 50) / 100) : 0;
  const ringkas = (label: string, n: number) => ["", label, "", "", "", n, ...(ket ? [""] : [])];
  baris.push(ringkas("JUMLAH", jumlah));
  if (opsi.ppn) baris.push(ringkas("PPN 11%", ppn));
  baris.push(ringkas("TOTAL JUMLAH", jumlah + ppn));
  return baris.map((r) => r.map(sel).join("\t")).join("\n") + "\n";
}
