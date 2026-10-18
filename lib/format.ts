/**
 * Formatter angka & tanggal Indonesia.
 * Ditulis manual (bukan Intl) agar hasil server dan browser selalu sama,
 * sehingga tidak muncul hydration mismatch di Next.js.
 */

const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

function ribuan(n: number): string {
  return Math.round(Math.abs(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** Desimal gaya Indonesia: 12,5 */
export function desimal(n: number, digit = 1): string {
  const fixed = Math.abs(n).toFixed(digit);
  const [bulat, pecahan] = fixed.split(".");
  const hasil = ribuan(Number(bulat)) + (pecahan && Number(pecahan) !== 0 ? "," + pecahan.replace(/0+$/, "") : "");
  return (n < 0 ? "−" : "") + hasil;
}

/** Rp1.234.567 */
export function rupiah(n: number): string {
  return (n < 0 ? "−" : "") + "Rp" + ribuan(n);
}

/** Rp1,23 M / Rp24,8 jt — untuk kartu ringkas */
export function rupiahSingkat(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e12) return "Rp" + desimal(n / 1e12, 2) + " T";
  if (a >= 1e9) return "Rp" + desimal(n / 1e9, 2) + " M";
  if (a >= 1e6) return "Rp" + desimal(n / 1e6, 1) + " jt";
  return rupiah(n);
}

/** 2026-10-18 → 18 Okt 2026 */
export function tanggal(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${String(d).padStart(2, "0")} ${BULAN[m - 1]} ${y}`;
}

export function hariIni(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function inisial(nama: string): string {
  return nama
    .replace(/^(Capt\.|Ir\.|Dr\.|Muh\.|Hj?\.)\s*/i, "")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/** Waktu lokal saat ini dalam ISO tanpa zona: 2026-10-18T13:38:05 */
export function sekarang(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** 2026-10-18T13:38:05 → 13.38 */
export function jam(iso: string): string {
  const t = iso.split("T")[1] ?? "";
  return t.slice(0, 5).replace(":", ".");
}

/** 2026-10-18T13:38:05 → 18 Okt 2026, 13.38 */
export function tanggalJam(iso: string): string {
  return `${tanggal(iso.slice(0, 10))}, ${jam(iso)}`;
}

const HARI = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const BULAN_PANJANG = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

/** 2026-10-18 → Minggu, 18 Oktober 2026 */
export function tanggalPanjang(iso: string, denganHari = true): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return iso;
  const hari = HARI[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${denganHari ? hari + ", " : ""}${d} ${BULAN_PANJANG[m - 1]} ${y}`;
}

/** Selisih hari kalender antara dua tanggal ISO (b − a) */
export function selisihHari(a: string, b: string): number {
  const ke = (s: string) => {
    const [y, m, d] = s.slice(0, 10).split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((ke(b) - ke(a)) / 86_400_000);
}

/** Angka → kalimat rupiah: 12500000 → "dua belas juta lima ratus ribu rupiah" */
export function terbilang(n: number): string {
  const satuan = ["", "satu", "dua", "tiga", "empat", "lima", "enam", "tujuh", "delapan", "sembilan", "sepuluh", "sebelas"];
  const eja = (x: number): string => {
    if (x < 12) return satuan[x];
    if (x < 20) return eja(x - 10) + " belas";
    if (x < 100) return eja(Math.floor(x / 10)) + " puluh" + (x % 10 ? " " + eja(x % 10) : "");
    if (x < 200) return "seratus" + (x - 100 ? " " + eja(x - 100) : "");
    if (x < 1000) return eja(Math.floor(x / 100)) + " ratus" + (x % 100 ? " " + eja(x % 100) : "");
    if (x < 2000) return "seribu" + (x - 1000 ? " " + eja(x - 1000) : "");
    if (x < 1e6) return eja(Math.floor(x / 1000)) + " ribu" + (x % 1000 ? " " + eja(x % 1000) : "");
    if (x < 1e9) return eja(Math.floor(x / 1e6)) + " juta" + (x % 1e6 ? " " + eja(x % 1e6) : "");
    if (x < 1e12) return eja(Math.floor(x / 1e9)) + " miliar" + (x % 1e9 ? " " + eja(x % 1e9) : "");
    return eja(Math.floor(x / 1e12)) + " triliun" + (x % 1e12 ? " " + eja(x % 1e12) : "");
  };
  const bulat = Math.round(Math.abs(n));
  return (bulat === 0 ? "nol" : eja(bulat)) + " rupiah";
}
