"use client";

/**
 * Penyimpanan state sementara (di memori browser) untuk seluruh modul.
 * State bertahan saat berpindah halaman, tetapi hilang saat halaman di-refresh.
 *
 * Inti datanya satu daftar KEGIATAN yang mengalir lintas modul:
 *   Belanja (Draf → Diajukan → Diverifikasi → Disetujui)
 *   → Pencairan (SPP → Verifikasi → SPM → SP2D)
 *   → Pengesahan (disahkan pada SP3B BLU periode berjalan)
 *
 * Setiap aksi yang mengubah data dicatat ke RIWAYAT AKTIVITAS (jejak audit):
 * siapa, kapan, aksi apa, dokumen mana, dan kolom apa saja yang berubah.
 *
 * Sesi login & hak akses: lihat lib/akses.ts. Setiap aksi di bawah memeriksa izin peran
 * pengguna yang sedang masuk, sehingga tombol yang tersembunyi pun tidak bisa "diakali".
 *
 * Titik integrasi Supabase: ganti nilai awal useState dengan hasil query,
 * panggil insert/update Supabase di dalam fungsi aksi di bawah,
 * dan simpan log aktivitas ke tabel tersendiri (mis. "aktivitas") lewat fungsi catat().
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AKSI_STATUS,
  AKSI_TAHAP,
  AKTIVITAS_AWAL,
  KEGIATAN_AWAL,
  NAMA_TAHAP,
  PENGESAHAN_AWAL,
  PENGGUNA_AWAL,
  PERIODE_BERJALAN,
  REFERENSI_AWAL,
  labelJenisAkun,
} from "@/lib/data";
import { SANDI_DEMO, TAHAP_PENCAIRAN, bolehIzin, bolehModul, type Izin, type Modul } from "@/lib/akses";
import { desimal, hariIni, rupiah, sekarang, tanggal } from "@/lib/format";
import { POK_BAWAAN, susunBarisPok, susunDaftarMak, type BarisPok, type DataPok, type InfoMak } from "@/lib/mak";
import type {
  Aktivitas,
  JenisSpp,
  Kegiatan,
  Pengguna,
  PerubahanKolom,
  Referensi,
  Sp3bBlu,
  StatusBelanja,
} from "@/lib/types";

export type KegiatanBaru = Omit<Kegiatan, "id" | "status" | "spp" | "disahkan" | "dibuatOleh">;
export type AktivitasBaru = Omit<Aktivitas, "id" | "waktu" | "oleh">;

/** Hasil pemeriksaan hak ubah/hapus sebuah dokumen oleh pengguna yang sedang masuk */
export interface IzinUbah {
  boleh: boolean;
  alasan?: string;
}

interface StoreValue {
  kegiatan: Kegiatan[];
  pengesahan: Sp3bBlu[];
  pengguna: Pengguna[];
  referensi: Referensi;
  aktivitas: Aktivitas[];

  /* Sesi & hak akses */
  /** sesi sudah dibaca dari penyimpanan browser (mencegah halaman login berkedip) */
  siap: boolean;
  /** ada pengguna aktif yang sedang masuk */
  sudahMasuk: boolean;
  penggunaAktif: Pengguna;
  masuk: (email: string, sandi: string) => { ok: true; nama: string } | { ok: false; pesan: string };
  keluar: () => void;
  /** pengguna yang sedang masuk punya izin ini? */
  boleh: (izin: Izin) => boolean;
  /** pengguna yang sedang masuk boleh membuka modul ini? */
  bolehBuka: (modul: Modul) => boolean;
  catat: (a: AktivitasBaru) => void;

  /* Belanja */
  tambahKegiatan: (k: KegiatanBaru) => Kegiatan | null;
  editKegiatan: (id: string, data: KegiatanBaru, catatan?: string) => { berubah: number; kembaliKeDraf: boolean };
  hapusKegiatan: (id: string, alasan: string) => void;
  izinUbah: (k: Kegiatan) => IzinUbah;
  ubahStatus: (id: string, status: StatusBelanja) => void;

  /* Pencairan */
  buatSpp: (id: string, jenis: JenisSpp, tanggal: string) => string;
  majukanTahap: (id: string) => Kegiatan | undefined;

  /* Pengesahan */
  sahkan: (ids: string[]) => void;

  /* Pengguna */
  tambahPengguna: (p: Omit<Pengguna, "id" | "aktif">) => void;
  ubahPengguna: (id: string, data: Omit<Pengguna, "id">) => void;
  toggleAktifPengguna: (id: string) => void;
  hapusPengguna: (id: string) => void;

  /* Referensi */
  setReferensi: (fn: (r: Referensi) => Referensi) => void;

  /* Kertas Kerja POK (dari FA Detail SAKTI) */
  dataPok: DataPok;
  /** daftar MAK beserta pagu, realisasi, sisa (dipakai form pengajuan, tabel, dan cetak) */
  daftarMak: InfoMak[];
  /** baris tabel Kertas Kerja POK (per item, atau per MAK bila laporan tanpa item) */
  barisPok: BarisPok[];
  cariMak: (kode: string) => InfoMak | undefined;
  /** ganti data POK dengan hasil upload FA Detail */
  terapkanPok: (data: DataPok) => boolean;

  namaUnit: (kode: string) => string;
  namaAkun: (kode: string) => string;
  /** nama & peran pengguna, termasuk yang sudah dihapus (untuk riwayat) */
  infoPengguna: (id: string) => { nama: string; peran: string };

  toast: (pesan: string) => void;
}

const StoreContext = createContext<StoreValue | null>(null);

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore harus dipakai di dalam <StoreProvider>");
  return ctx;
}

/** Kunci penyimpanan sesi di sessionStorage (per tab browser) */
const KUNCI_SESI = "belanjaku-sesi";
/** Kunci penyimpanan data FA Detail hasil upload di localStorage */
const KUNCI_POK = "belanjaku-pok";

/** Status yang otomatis kembali ke Draf bila dokumennya diubah (perlu diverifikasi ulang) */
export const STATUS_PERLU_ULANG: StatusBelanja[] = ["Diajukan", "Diverifikasi", "Disetujui", "Ditolak"];

export default function StoreProvider({ children }: { children: ReactNode }) {
  const [kegiatan, setKegiatan] = useState<Kegiatan[]>(KEGIATAN_AWAL);
  const [pengesahan] = useState<Sp3bBlu[]>(PENGESAHAN_AWAL);
  const [pengguna, setPengguna] = useState<Pengguna[]>(PENGGUNA_AWAL);
  const [arsipPengguna, setArsipPengguna] = useState<Record<string, Pengguna>>({});
  const [referensi, setRef] = useState<Referensi>(REFERENSI_AWAL);
  const [aktivitas, setAktivitas] = useState<Aktivitas[]>(AKTIVITAS_AWAL);
  const [dataPok, setDataPok] = useState<DataPok>(POK_BAWAAN);
  const [sesi, setSesi] = useState<string | null>(null);
  const [siap, setSiap] = useState(false);
  const urutLog = useRef(AKTIVITAS_AWAL.length);

  const [pesan, setPesan] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toast = useCallback((m: string) => {
    setPesan(m);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setPesan(null), 2800);
  }, []);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  // Pulihkan sesi dari penyimpanan tab browser (tetap masuk setelah halaman di-refresh)
  useEffect(() => {
    try {
      const id = sessionStorage.getItem(KUNCI_SESI);
      if (id && PENGGUNA_AWAL.some((u) => u.id === id && u.aktif)) setSesi(id);
    } catch {
      /* penyimpanan diblokir — mulai dari halaman login */
    }
    // Data FA Detail terakhir yang diunggah di browser ini (bila ada)
    try {
      const simpan = localStorage.getItem(KUNCI_POK);
      if (simpan) {
        const d = JSON.parse(simpan) as DataPok;
        if (Array.isArray(d?.mak) && d.mak.length > 0 && d.uraian && d.akun && d.sumber) setDataPok({ ...d, item: d.item ?? {} });
      }
    } catch {
      /* data rusak / penyimpanan diblokir — pakai data bawaan */
    }
    setSiap(true);
  }, []);

  const penggunaAktif = pengguna.find((u) => u.id === sesi) ?? PENGGUNA_AWAL[0];
  const sudahMasuk = sesi !== null && pengguna.some((u) => u.id === sesi && u.aktif);
  const boleh = (izin: Izin) => sudahMasuk && bolehIzin(penggunaAktif.peran, izin);
  const bolehBuka = (modul: Modul) => sudahMasuk && bolehModul(penggunaAktif.peran, modul);
  /** Penjaga aksi: tampilkan pesan dan batalkan bila peran tidak berwenang */
  const wajib = (izin: Izin, aksi: string) => {
    if (boleh(izin)) return true;
    toast(`Peran ${penggunaAktif.peran} tidak berwenang ${aksi}`);
    return false;
  };

  const namaUnit = useCallback(
    (kode: string) => referensi.unit.find((u) => u.kode === kode)?.nama ?? kode,
    [referensi.unit],
  );
  const namaAkun = useCallback(
    (kode: string) => referensi.akun.find((a) => a.kode === kode)?.uraian ?? "-",
    [referensi.akun],
  );
  const infoPengguna = useCallback(
    (id: string) => {
      const u = pengguna.find((x) => x.id === id) ?? arsipPengguna[id];
      return u ? { nama: u.nama, peran: u.peran } : { nama: "Pengguna tidak dikenal", peran: "-" };
    },
    [pengguna, arsipPengguna],
  );

  /* ---------- Log aktivitas ---------- */
  const catatSebagai = (oleh: string, a: AktivitasBaru) => {
    urutLog.current += 1;
    const baris: Aktivitas = { ...a, id: `A${String(urutLog.current).padStart(5, "0")}`, waktu: sekarang(), oleh };
    setAktivitas((prev) => [baris, ...prev]);
  };
  const catat: StoreValue["catat"] = (a) => catatSebagai(penggunaAktif.id, a);

  /* ---------- Sesi ---------- */
  const masuk: StoreValue["masuk"] = (email, sandi) => {
    const u = pengguna.find((x) => x.email.toLowerCase() === email.trim().toLowerCase());
    if (!u) return { ok: false, pesan: "Email tidak terdaftar di Belanjaku" };
    if (!u.aktif) return { ok: false, pesan: "Akun ini nonaktif. Hubungi Administrator." };
    if (sandi !== SANDI_DEMO) return { ok: false, pesan: "Kata sandi salah" };
    setSesi(u.id);
    try {
      sessionStorage.setItem(KUNCI_SESI, u.id);
    } catch {
      /* abaikan */
    }
    catatSebagai(u.id, { jenis: "Sesi", modul: "Sistem", aksi: "masuk ke aplikasi", catatan: `Peran ${u.peran}` });
    return { ok: true, nama: u.nama };
  };

  const keluar: StoreValue["keluar"] = () => {
    if (sudahMasuk) catatSebagai(penggunaAktif.id, { jenis: "Sesi", modul: "Sistem", aksi: "keluar dari aplikasi" });
    setSesi(null);
    try {
      sessionStorage.removeItem(KUNCI_SESI);
    } catch {
      /* abaikan */
    }
  };

  const ubahKegiatan = (id: string, fn: (k: Kegiatan) => Kegiatan) =>
    setKegiatan((prev) => prev.map((k) => (k.id === id ? fn(k) : k)));

  /* ---------- Belanja ---------- */
  const nomorBerikut = () => {
    // Nomor tidak pernah dipakai ulang, termasuk nomor dokumen yang sudah dihapus
    const dariKegiatan = kegiatan.map((k) => Number(k.id.split("-").pop()) || 0);
    const dariLog = aktivitas.filter((a) => a.objekId?.startsWith("BLJ-")).map((a) => Number(a.objekId!.split("-").pop()) || 0);
    return `BLJ-2026-${String(Math.max(0, ...dariKegiatan, ...dariLog) + 1).padStart(4, "0")}`;
  };

  const tambahKegiatan: StoreValue["tambahKegiatan"] = (data) => {
    if (!wajib("belanja.buat", "membuat pengajuan")) return null;
    const baru: Kegiatan = { ...data, id: nomorBerikut(), status: "Draf", dibuatOleh: penggunaAktif.id };
    setKegiatan((prev) => [baru, ...prev]);
    catat({
      jenis: "Buat",
      modul: "Belanja",
      aksi: "membuat pengajuan",
      objekId: baru.id,
      objekLabel: baru.uraian,
      catatan: `${baru.jenisDokumen} · ${rupiah(baru.nilai)} · MAK ${baru.mak}`,
    });
    return baru;
  };

  const izinUbah: StoreValue["izinUbah"] = (k) => {
    if (!boleh("belanja.buat")) return { boleh: false, alasan: `Peran ${penggunaAktif.peran} tidak dapat mengubah atau menghapus pengajuan` };
    if (k.dibuatOleh !== penggunaAktif.id)
      return { boleh: false, alasan: `Hanya ${infoPengguna(k.dibuatOleh).nama} (pembuat dokumen) yang dapat mengubah atau menghapus ${k.id}` };
    if (k.disahkan) return { boleh: false, alasan: `${k.id} sudah disahkan sehingga tidak bisa diubah atau dihapus` };
    if (k.spp) return { boleh: false, alasan: `${k.id} sudah masuk proses pencairan (${k.spp.no}) sehingga tidak bisa diubah atau dihapus` };
    return { boleh: true };
  };

  /** Daftar kolom yang dibandingkan saat dokumen diubah, beserta cara menampilkannya */
  const tampilKolom = (key: keyof KegiatanBaru, v: string | number): string => {
    if (key === "nilai") return rupiah(Number(v));
    if (key === "tanggal") return tanggal(String(v));
    if (key === "unit") return namaUnit(String(v));
    if (key === "akun") return `${v} ${namaAkun(String(v))}`;
    return String(v);
  };
  const LABEL_KOLOM: Record<keyof KegiatanBaru, string> = {
    uraian: "Uraian",
    jenisDokumen: "Jenis dokumen",
    noDokumen: "No. dokumen",
    penyedia: "Penyedia",
    unit: "Unit kerja",
    dana: "Sumber dana",
    mak: "MAK",
    akun: "Akun",
    nilai: "Nilai",
    tanggal: "Tanggal dokumen",
  };

  const editKegiatan: StoreValue["editKegiatan"] = (id, data, catatan) => {
    const lama = kegiatan.find((k) => k.id === id);
    if (!lama || !izinUbah(lama).boleh) return { berubah: 0, kembaliKeDraf: false };
    const perubahan: PerubahanKolom[] = (Object.keys(LABEL_KOLOM) as (keyof KegiatanBaru)[])
      .filter((key) => String(lama[key]) !== String(data[key]))
      .map((key) => ({ kolom: LABEL_KOLOM[key], dari: tampilKolom(key, lama[key]), ke: tampilKolom(key, data[key]) }));
    if (perubahan.length === 0) return { berubah: 0, kembaliKeDraf: false };
    const kembaliKeDraf = STATUS_PERLU_ULANG.includes(lama.status);
    if (kembaliKeDraf) perubahan.push({ kolom: "Status", dari: lama.status, ke: "Draf" });
    ubahKegiatan(id, (k) => ({ ...k, ...data, status: kembaliKeDraf ? "Draf" : k.status }));
    catat({
      jenis: "Ubah",
      modul: "Belanja",
      aksi: "mengubah pengajuan",
      objekId: id,
      objekLabel: data.uraian,
      perubahan,
      catatan: catatan?.trim() || undefined,
    });
    return { berubah: perubahan.length - (kembaliKeDraf ? 1 : 0), kembaliKeDraf };
  };

  const hapusKegiatan: StoreValue["hapusKegiatan"] = (id, alasan) => {
    const k = kegiatan.find((x) => x.id === id);
    if (!k || !izinUbah(k).boleh) return;
    setKegiatan((prev) => prev.filter((x) => x.id !== id));
    // Simpan isi dokumen pada log agar tetap bisa ditelusuri setelah dihapus
    catat({
      jenis: "Hapus",
      modul: "Belanja",
      aksi: "menghapus pengajuan",
      objekId: id,
      objekLabel: k.uraian,
      perubahan: [
        { kolom: "No. dokumen", dari: `${k.jenisDokumen} ${k.noDokumen}`, ke: "dihapus" },
        { kolom: "Penyedia", dari: k.penyedia, ke: "dihapus" },
        { kolom: "MAK", dari: k.mak, ke: "dihapus" },
        { kolom: "Akun", dari: `${k.akun} ${namaAkun(k.akun)}`, ke: "dihapus" },
        { kolom: "Nilai", dari: rupiah(k.nilai), ke: "dihapus" },
        { kolom: "Status", dari: k.status, ke: "dihapus" },
      ],
      catatan: alasan.trim(),
    });
  };

  const ubahStatus: StoreValue["ubahStatus"] = (id, status) => {
    const k = kegiatan.find((x) => x.id === id);
    if (!k || k.status === status) return;
    if (status === "Diajukan" || status === "Draf") {
      if (!wajib("belanja.buat", "mengajukan pengajuan")) return;
      if (k.dibuatOleh !== penggunaAktif.id) {
        toast(`Hanya ${infoPengguna(k.dibuatOleh).nama} (pembuat dokumen) yang dapat mengajukan ${k.id}`);
        return;
      }
    }
    if (status === "Diverifikasi" && !wajib("belanja.verifikasi", "memverifikasi pengajuan")) return;
    if ((status === "Disetujui" || status === "Ditolak") && !wajib("belanja.setujui", "menyetujui atau menolak pengajuan")) return;
    ubahKegiatan(id, (x) => ({ ...x, status }));
    catat({
      jenis: "Status",
      modul: "Belanja",
      aksi: AKSI_STATUS[status],
      objekId: id,
      objekLabel: k.uraian,
      perubahan: [{ kolom: "Status", dari: k.status, ke: status }],
    });
  };

  /* ---------- Pencairan ---------- */
  const buatSpp: StoreValue["buatSpp"] = (id, jenis, tgl) => {
    if (!wajib("pencairan.spp", "menerbitkan SPP")) return "";
    const maks = kegiatan.reduce((m, k) => Math.max(m, k.spp ? parseInt(k.spp.no, 10) || 0 : 0), 0);
    const no = `${String(maks + 1).padStart(5, "0")}/SPP-${jenis}/2026`;
    const k = kegiatan.find((x) => x.id === id);
    ubahKegiatan(id, (x) => ({ ...x, spp: { no, jenis, tahap: 1, tanggal: tgl } }));
    catat({ jenis: "Pencairan", modul: "Pencairan", aksi: `membuat SPP-${jenis}`, objekId: id, objekLabel: k?.uraian, catatan: `No. ${no}` });
    return no;
  };

  const majukanTahap: StoreValue["majukanTahap"] = (id) => {
    const k = kegiatan.find((x) => x.id === id);
    if (!k?.spp || k.spp.tahap >= 4) return undefined;
    const t = (k.spp.tahap + 1) as 2 | 3 | 4;
    if (!wajib(TAHAP_PENCAIRAN[t].izin, `memproses tahap ${NAMA_TAHAP[t]}`)) return undefined;
    const next: Kegiatan = { ...k, spp: { ...k.spp, tahap: t } };
    ubahKegiatan(id, () => next);
    catat({
      jenis: "Pencairan",
      modul: "Pencairan",
      aksi: AKSI_TAHAP[t].aksi,
      objekId: id,
      objekLabel: k.uraian,
      perubahan: [{ kolom: "Tahap", dari: NAMA_TAHAP[t - 1], ke: NAMA_TAHAP[t] }],
      catatan: k.spp.no,
    });
    return next;
  };

  /* ---------- Pengesahan ---------- */
  const sahkan: StoreValue["sahkan"] = (ids) => {
    if (!wajib("pengesahan.sahkan", "mengesahkan belanja")) return;
    const tgl = hariIni();
    setKegiatan((prev) =>
      prev.map((k) => (ids.includes(k.id) ? { ...k, disahkan: { nomor: PERIODE_BERJALAN.nomor, tanggal: tgl } } : k)),
    );
    kegiatan
      .filter((k) => ids.includes(k.id))
      .forEach((k) =>
        catat({
          jenis: "Pengesahan",
          modul: "Pengesahan",
          aksi: `mengesahkan pada ${PERIODE_BERJALAN.nomor}`,
          objekId: k.id,
          objekLabel: k.uraian,
          catatan: rupiah(k.nilai),
        }),
      );
  };

  /* ---------- Pengguna ---------- */
  const tambahPengguna: StoreValue["tambahPengguna"] = (p) => {
    if (!wajib("pengguna.kelola", "mengelola pengguna")) return;
    const id = `u${Date.now()}`;
    setPengguna((prev) => [...prev, { ...p, id, aktif: true }]);
    catat({ jenis: "Pengguna", modul: "Pengguna", aksi: "menambah pengguna", objekId: id, objekLabel: p.nama, catatan: `${p.peran} · ${p.email}` });
  };

  const ubahPengguna: StoreValue["ubahPengguna"] = (id, data) => {
    if (!wajib("pengguna.kelola", "mengelola pengguna")) return;
    const lama = pengguna.find((u) => u.id === id);
    if (!lama) return;
    const kolom: [string, string, string][] = [
      ["Nama", lama.nama, data.nama],
      ["Email", lama.email, data.email],
      ["Peran", lama.peran, data.peran],
      ["Unit kerja", namaUnit(lama.unit), namaUnit(data.unit)],
      ["Status", lama.aktif ? "Aktif" : "Nonaktif", data.aktif ? "Aktif" : "Nonaktif"],
    ];
    const perubahan = kolom.filter(([, a, b]) => a !== b).map(([k, a, b]) => ({ kolom: k, dari: a, ke: b }));
    setPengguna((prev) => prev.map((u) => (u.id === id ? { ...data, id } : u)));
    if (perubahan.length)
      catat({ jenis: "Pengguna", modul: "Pengguna", aksi: "mengubah data pengguna", objekId: id, objekLabel: data.nama, perubahan });
  };

  const toggleAktifPengguna: StoreValue["toggleAktifPengguna"] = (id) => {
    if (!wajib("pengguna.kelola", "mengelola pengguna")) return;
    const u = pengguna.find((x) => x.id === id);
    if (!u) return;
    setPengguna((prev) => prev.map((x) => (x.id === id ? { ...x, aktif: !x.aktif } : x)));
    catat({
      jenis: "Pengguna",
      modul: "Pengguna",
      aksi: u.aktif ? "menonaktifkan pengguna" : "mengaktifkan pengguna",
      objekId: id,
      objekLabel: u.nama,
      perubahan: [{ kolom: "Status", dari: u.aktif ? "Aktif" : "Nonaktif", ke: u.aktif ? "Nonaktif" : "Aktif" }],
    });
  };

  const hapusPengguna: StoreValue["hapusPengguna"] = (id) => {
    if (!wajib("pengguna.kelola", "mengelola pengguna")) return;
    const u = pengguna.find((x) => x.id === id);
    if (!u) return;
    setArsipPengguna((a) => ({ ...a, [id]: u }));
    setPengguna((prev) => prev.filter((x) => x.id !== id));
    catat({ jenis: "Pengguna", modul: "Pengguna", aksi: "menghapus pengguna", objekId: id, objekLabel: u.nama, catatan: `${u.peran} · ${u.email}` });
  };

  /* ---------- Kertas Kerja POK ---------- */
  const daftarMak = useMemo(() => susunDaftarMak(dataPok), [dataPok]);
  const petaMak = useMemo(() => new Map(daftarMak.map((m) => [m.kode, m])), [daftarMak]);
  const barisPok = useMemo(() => susunBarisPok(dataPok, daftarMak), [dataPok, daftarMak]);
  const cariMak = useCallback((kode: string) => petaMak.get(kode), [petaMak]);

  const terapkanPok: StoreValue["terapkanPok"] = (data) => {
    if (!wajib("pok.unggah", "mengunggah FA Detail")) return false;
    const baru: DataPok = { ...data, sumber: { ...data.sumber, diunggah: sekarang(), oleh: penggunaAktif.nama } };
    setDataPok(baru);
    try {
      localStorage.setItem(KUNCI_POK, JSON.stringify(baru));
    } catch {
      toast("Data dipakai, tetapi tidak dapat disimpan di browser ini (penyimpanan penuh/diblokir)");
    }
    // Akun baru dari FA Detail ikut ditambahkan ke daftar akun referensi
    setRef((r) => {
      const ada = new Set(r.akun.map((a) => a.kode));
      const tambah = Object.entries(baru.akun)
        .filter(([k]) => !ada.has(k))
        .map(([kode, uraian]) => ({ kode, uraian, jenis: labelJenisAkun(kode) }));
      return tambah.length ? { ...r, akun: [...r.akun, ...tambah] } : r;
    });
    const jumlahItem = Object.values(baru.item).reduce((n, x) => n + x.length, 0);
    const pagu = baru.mak.reduce((a, m) => a + m[1], 0);
    const realisasi = baru.mak.reduce((a, m) => a + m[3], 0);
    catat({
      jenis: "Referensi",
      modul: "Referensi",
      aksi: "mengunggah FA Detail (Kertas Kerja POK)",
      objekLabel: baru.sumber.file,
      catatan: `Periode ${baru.sumber.periode || "-"} · ${desimal(baru.mak.length, 0)} MAK${jumlahItem ? ` · ${desimal(jumlahItem, 0)} item` : ""} · pagu ${rupiah(pagu)} · realisasi ${rupiah(realisasi)}`,
    });
    return true;
  };

  /* ---------- Referensi ---------- */
  const setReferensi: StoreValue["setReferensi"] = (fn) => {
    if (!wajib("referensi.kelola", "mengubah referensi")) return;
    setRef((r) => fn(r));
  };

  const value: StoreValue = {
    kegiatan,
    pengesahan,
    pengguna,
    referensi,
    aktivitas,
    siap,
    sudahMasuk,
    penggunaAktif,
    masuk,
    keluar,
    boleh,
    bolehBuka,
    catat,
    tambahKegiatan,
    editKegiatan,
    hapusKegiatan,
    izinUbah,
    ubahStatus,
    buatSpp,
    majukanTahap,
    sahkan,
    tambahPengguna,
    ubahPengguna,
    toggleAktifPengguna,
    hapusPengguna,
    setReferensi,
    dataPok,
    daftarMak,
    barisPok,
    cariMak,
    terapkanPok,
    namaUnit,
    namaAkun,
    infoPengguna,
    toast,
  };

  return (
    <StoreContext.Provider value={value}>
      {children}
      {pesan && (
        <div className="toast" role="status" aria-live="polite">
          {pesan}
        </div>
      )}
    </StoreContext.Provider>
  );
}
