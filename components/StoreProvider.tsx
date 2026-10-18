"use client";

/**
 * State bersama seluruh modul, tersambung ke database Supabase.
 *
 * - Login: Supabase Auth (email + kata sandi). Profil, peran, dan unit dibaca dari tabel `pengguna`.
 * - Membaca data: tabel/view Supabase yang dilindungi Row Level Security
 *   (Operator Unit otomatis hanya menerima data unitnya).
 * - Mengubah data: fungsi RPC di database (supabase/migrations) yang memeriksa peran, status dokumen,
 *   dan menulis Riwayat Aktivitas dalam satu transaksi. Pemeriksaan izin di sini hanya untuk tampilan.
 * - Kelola pengguna: API server app/api/pengguna (butuh kunci rahasia, hanya Administrator).
 * - Realtime: perubahan oleh pengguna lain langsung dimuat ulang; saat tab kembali aktif data disegarkan.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { NAMA_BULAN, periodeBerjalan } from "@/lib/data";
import { bolehModul, type Izin, type Modul } from "@/lib/akses";
import {
  muatAktivitas,
  muatIzin,
  muatKegiatan,
  muatPengguna,
  muatPok,
  muatReferensi,
  muatSp3b,
  pesanGalat,
  rapikanKegiatan,
  type BarisSp3b,
} from "@/lib/db";
import { susunBarisPok, susunDaftarMak, type BarisPok, type DataPok, type InfoMak } from "@/lib/mak";
import { supabase, supabaseTerkonfigurasi } from "@/lib/supabase";
import type { Aktivitas, JenisSpp, Kegiatan, Pengguna, Peran, Referensi, Sp3bBlu, StatusBelanja } from "@/lib/types";

export type KegiatanBaru = Omit<Kegiatan, "id" | "status" | "spp" | "disahkan" | "dibuatOleh">;
export type JenisReferensi = keyof Referensi;

/** Hasil pemeriksaan hak ubah/hapus sebuah dokumen oleh pengguna yang sedang masuk */
export interface IzinUbah {
  boleh: boolean;
  alasan?: string;
}

type Hasil = { ok: true; nama?: string } | { ok: false; pesan: string };

interface StoreValue {
  kegiatan: Kegiatan[];
  /** rekap SP3B BLU periode sebelum bulan berjalan (bulan berjalan dihitung di modul Pengesahan) */
  pengesahan: Sp3bBlu[];
  /** semua profil, termasuk yang sudah dihapus (untuk nama di riwayat) */
  pengguna: Pengguna[];
  referensi: Referensi;
  aktivitas: Aktivitas[];

  /* Sesi & hak akses */
  /** pemeriksaan sesi awal selesai (mencegah halaman login berkedip) */
  siap: boolean;
  /** variabel lingkungan Supabase sudah diisi */
  terkonfigurasi: boolean;
  sudahMasuk: boolean;
  /** data awal sedang dimuat setelah masuk */
  memuat: boolean;
  penggunaAktif: Pengguna;
  masuk: (email: string, sandi: string) => Promise<Hasil>;
  keluar: () => Promise<void>;
  gantiSandi: (lama: string, baru: string) => Promise<Hasil>;
  boleh: (izin: Izin) => boolean;
  bolehBuka: (modul: Modul) => boolean;
  muatUlang: () => Promise<void>;

  /* Riwayat aktivitas */
  catatCetak: (k: Kegiatan) => void;
  /** riwayat lengkap satu dokumen langsung dari database */
  jejakDokumen: (id: string) => Promise<Aktivitas[]>;

  /* Belanja */
  tambahKegiatan: (k: KegiatanBaru) => Promise<Kegiatan | null>;
  editKegiatan: (id: string, data: KegiatanBaru, catatan?: string) => Promise<{ berubah: number; kembaliKeDraf: boolean } | null>;
  hapusKegiatan: (id: string, alasan: string) => Promise<boolean>;
  izinUbah: (k: Kegiatan) => IzinUbah;
  ubahStatus: (id: string, status: StatusBelanja) => Promise<boolean>;

  /* Pencairan */
  buatSpp: (id: string, jenis: JenisSpp, tanggal: string) => Promise<string | null>;
  majukanTahap: (id: string) => Promise<Kegiatan | null>;

  /* Pengesahan */
  sahkan: (ids: string[]) => Promise<string | null>;

  /* Pengguna (lewat API server) */
  tambahPengguna: (p: { nama: string; email: string; peran: Peran; unit: string; sandi: string }) => Promise<boolean>;
  ubahPengguna: (id: string, data: Omit<Pengguna, "id" | "dihapus">) => Promise<boolean>;
  toggleAktifPengguna: (id: string) => Promise<boolean>;
  hapusPengguna: (id: string) => Promise<boolean>;
  aturUlangSandi: (id: string, sandi: string) => Promise<boolean>;

  /* Referensi */
  simpanReferensi: (jenis: JenisReferensi, data: Record<string, string | boolean>, kode?: string) => Promise<boolean>;

  /* Kertas Kerja POK (FA Detail SAKTI) */
  dataPok: DataPok | null;
  daftarMak: InfoMak[];
  barisPok: BarisPok[];
  cariMak: (kode: string) => InfoMak | undefined;
  terapkanPok: (data: DataPok, file?: File) => Promise<boolean>;

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

/** Status yang otomatis kembali ke Draf bila dokumennya diubah (perlu diverifikasi ulang) */
export const STATUS_PERLU_ULANG: StatusBelanja[] = ["Diajukan", "Diverifikasi", "Disetujui", "Ditolak"];

const PROFIL_KOSONG: Pengguna = { id: "", nama: "", email: "", peran: "Operator Unit", unit: "", aktif: false };
const REFERENSI_KOSONG: Referensi = { akun: [], unit: [], penyedia: [], dana: [] };

/** "SP3B-BLU-10/2026" → "2026-10" */
const bulanSp3b = (nomor: string) => {
  const m = nomor.match(/(\d{2})\/(\d{4})$/);
  return m ? `${m[2]}-${m[1]}` : "";
};

/** Pesan galat login Supabase Auth dalam bahasa Indonesia */
function pesanLogin(e: { message: string; status?: number; code?: string }): string {
  const m = e.message ?? "";
  if (e.code === "user_banned" || /banned/i.test(m)) return "Akun ini nonaktif. Hubungi Administrator.";
  if (/Invalid login credentials/i.test(m)) return "Email atau kata sandi salah";
  if (/Email not confirmed/i.test(m)) return "Email belum dikonfirmasi. Hubungi Administrator.";
  if (e.status === 429 || /rate limit|too many/i.test(m)) return "Terlalu banyak percobaan masuk. Tunggu beberapa menit lalu coba lagi.";
  return pesanGalat(e);
}

export default function StoreProvider({ children }: { children: ReactNode }) {
  const [kegiatan, setKegiatan] = useState<Kegiatan[]>([]);
  const [sp3b, setSp3b] = useState<BarisSp3b[]>([]);
  const [pengguna, setPengguna] = useState<Pengguna[]>([]);
  const [referensi, setReferensi] = useState<Referensi>(REFERENSI_KOSONG);
  const [aktivitas, setAktivitas] = useState<Aktivitas[]>([]);
  const [dataPok, setDataPok] = useState<DataPok | null>(null);
  const [profil, setProfil] = useState<Pengguna | null>(null);
  const [izinSaya, setIzinSaya] = useState<Set<string>>(new Set());
  const [siap, setSiap] = useState(false);
  const [memuat, setMemuat] = useState(false);
  const profilRef = useRef<Pengguna | null>(null);
  profilRef.current = profil;

  const [pesan, setPesan] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Pesan panjang (mis. galat dari server) tampil lebih lama
  const toast = useCallback((m: string) => {
    setPesan(m);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setPesan(null), Math.min(7000, 2800 + Math.max(0, m.length - 60) * 40));
  }, []);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  /* ---------- Muat & segarkan data ---------- */
  const bersihkan = useCallback(() => {
    setProfil(null);
    setIzinSaya(new Set());
    setKegiatan([]);
    setSp3b([]);
    setPengguna([]);
    setReferensi(REFERENSI_KOSONG);
    setAktivitas([]);
    setDataPok(null);
  }, []);

  const segarkan = useMemo(() => {
    const sb = () => supabase();
    return {
      kegiatan: async () => setKegiatan(await muatKegiatan(sb())),
      sp3b: async () => setSp3b(await muatSp3b(sb())),
      pengguna: async () => {
        const daftar = await muatPengguna(sb());
        setPengguna(daftar);
        // akun sendiri dinonaktifkan/dihapus Administrator → keluar
        const saya = profilRef.current && daftar.find((u) => u.id === profilRef.current!.id);
        if (profilRef.current && (!saya || !saya.aktif)) {
          await sb().auth.signOut();
          toast("Akun Anda dinonaktifkan oleh Administrator");
        } else if (saya) setProfil(saya);
      },
      referensi: async () => setReferensi(await muatReferensi(sb())),
      aktivitas: async () => setAktivitas(await muatAktivitas(sb())),
      pok: async () => setDataPok(await muatPok(sb())),
    };
  }, [toast]);

  const muatSemua = useCallback(async () => {
    const hasil = await Promise.allSettled(Object.values(segarkan).map((f) => f()));
    const gagal = hasil.find((h): h is PromiseRejectedResult => h.status === "rejected");
    if (gagal) toast(`Sebagian data gagal dimuat: ${pesanGalat(gagal.reason)}`);
  }, [segarkan, toast]);

  /** Periksa profil pengguna Auth lalu muat data. Akun tanpa profil / nonaktif langsung dikeluarkan. */
  const mulaiSesi = useCallback(
    async (authId: string, catatMasuk: boolean): Promise<Hasil> => {
      const sb = supabase();
      const { data, error } = await sb
        .from("pengguna")
        .select("id, nama, email, peran, unit, aktif, deleted_at")
        .eq("auth_id", authId)
        .maybeSingle();
      if (error) {
        await sb.auth.signOut();
        return { ok: false, pesan: pesanGalat(error) };
      }
      if (!data || data.deleted_at) {
        await sb.auth.signOut();
        return { ok: false, pesan: "Akun ini belum terdaftar di Belanjaku. Hubungi Administrator." };
      }
      if (!data.aktif) {
        await sb.auth.signOut();
        return { ok: false, pesan: "Akun ini nonaktif. Hubungi Administrator." };
      }
      const p: Pengguna = { id: data.id, nama: data.nama, email: data.email, peran: data.peran, unit: data.unit ?? "", aktif: true };
      let izin: string[] = [];
      try {
        izin = await muatIzin(sb, p.peran);
      } catch (e) {
        await sb.auth.signOut();
        return { ok: false, pesan: pesanGalat(e as Error) };
      }
      setIzinSaya(new Set(izin));
      setProfil(p);
      setMemuat(true);
      if (catatMasuk) await sb.rpc("catat_aktivitas", { p_jenis: "Sesi", p_aksi: "masuk ke aplikasi" });
      await muatSemua();
      setMemuat(false);
      return { ok: true, nama: p.nama };
    },
    [muatSemua],
  );

  // Sesi tersimpan di browser → langsung masuk; keluar dari tab lain → bersihkan
  useEffect(() => {
    if (!supabaseTerkonfigurasi) {
      setSiap(true);
      return;
    }
    const sb = supabase();
    let batal = false;
    (async () => {
      const { data } = await sb.auth.getSession();
      if (!batal && data.session) {
        const h = await mulaiSesi(data.session.user.id, false);
        if (!h.ok) toast(h.pesan);
      }
      if (!batal) setSiap(true);
    })();
    const { data: langganan } = sb.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") bersihkan();
    });
    return () => {
      batal = true;
      langganan.subscription.unsubscribe();
    };
  }, [mulaiSesi, bersihkan, toast]);

  // Realtime + segarkan saat tab kembali aktif
  const idSaya = profil?.id;
  useEffect(() => {
    if (!idSaya) return;
    const sb = supabase();
    const tunda: Record<string, ReturnType<typeof setTimeout>> = {};
    const jadwal = (kunci: keyof typeof segarkan) => {
      clearTimeout(tunda[kunci]);
      tunda[kunci] = setTimeout(() => segarkan[kunci]().catch(() => {}), 600);
    };
    const kanal = sb
      .channel("belanjaku-data")
      .on("postgres_changes", { event: "*", schema: "public", table: "pengajuan" }, () => jadwal("kegiatan"))
      .on("postgres_changes", { event: "*", schema: "public", table: "spp" }, () => jadwal("kegiatan"))
      .on("postgres_changes", { event: "*", schema: "public", table: "pengesahan" }, () => {
        jadwal("kegiatan");
        jadwal("sp3b");
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "aktivitas" }, () => jadwal("aktivitas"))
      .on("postgres_changes", { event: "*", schema: "public", table: "pengguna" }, () => jadwal("pengguna"))
      .on("postgres_changes", { event: "*", schema: "public", table: "unit_kerja" }, () => jadwal("referensi"))
      .on("postgres_changes", { event: "*", schema: "public", table: "penyedia" }, () => jadwal("referensi"))
      .on("postgres_changes", { event: "*", schema: "public", table: "akun" }, () => jadwal("referensi"))
      .on("postgres_changes", { event: "*", schema: "public", table: "sumber_dana" }, () => jadwal("referensi"))
      .on("postgres_changes", { event: "*", schema: "public", table: "pok_unggahan" }, () => jadwal("pok"))
      .subscribe();
    let terakhir = Date.now();
    const kembali = () => {
      if (document.visibilityState !== "visible" || Date.now() - terakhir < 30_000) return;
      terakhir = Date.now();
      (Object.keys(segarkan) as (keyof typeof segarkan)[]).forEach(jadwal);
    };
    document.addEventListener("visibilitychange", kembali);
    return () => {
      document.removeEventListener("visibilitychange", kembali);
      Object.values(tunda).forEach(clearTimeout);
      sb.removeChannel(kanal);
    };
  }, [idSaya, segarkan]);

  /* ---------- Sesi ---------- */
  const penggunaAktif = profil ?? PROFIL_KOSONG;
  const sudahMasuk = profil !== null;
  const boleh = useCallback((izin: Izin) => izinSaya.has(izin), [izinSaya]);
  const bolehBuka = (modul: Modul) => profil !== null && bolehModul(profil.peran, modul);
  /** Penjaga tampilan: tampilkan pesan bila peran tidak berwenang (database tetap memeriksa ulang) */
  const wajib = (izin: Izin, aksi: string) => {
    if (boleh(izin)) return true;
    toast(`Peran ${penggunaAktif.peran} tidak berwenang ${aksi}`);
    return false;
  };

  const masuk: StoreValue["masuk"] = async (email, sandi) => {
    const sb = supabase();
    const { data, error } = await sb.auth.signInWithPassword({ email: email.trim().toLowerCase(), password: sandi });
    if (error || !data.user) return { ok: false, pesan: pesanLogin(error ?? { message: "Gagal masuk" }) };
    return mulaiSesi(data.user.id, true);
  };

  const keluar: StoreValue["keluar"] = async () => {
    const sb = supabase();
    try {
      await sb.rpc("catat_aktivitas", { p_jenis: "Sesi", p_aksi: "keluar dari aplikasi" });
    } catch {
      /* tetap keluar walau log gagal */
    }
    await sb.auth.signOut();
    bersihkan();
  };

  const gantiSandi: StoreValue["gantiSandi"] = async (lama, baru) => {
    const sb = supabase();
    const cek = await sb.auth.signInWithPassword({ email: penggunaAktif.email, password: lama });
    if (cek.error) return { ok: false, pesan: /Invalid login/i.test(cek.error.message) ? "Kata sandi lama salah" : pesanLogin(cek.error) };
    const { error } = await sb.auth.updateUser({ password: baru });
    if (error) {
      if (/different from the old/i.test(error.message)) return { ok: false, pesan: "Kata sandi baru harus berbeda dari kata sandi lama" };
      if (/weak|at least|characters/i.test(error.message)) return { ok: false, pesan: "Kata sandi baru terlalu lemah (minimal 8 karakter, huruf dan angka)" };
      return { ok: false, pesan: pesanGalat(error) };
    }
    return { ok: true };
  };

  /* ---------- Pembantu RPC ---------- */
  const rpc = async <T,>(fn: string, args: Record<string, unknown>): Promise<T | null> => {
    const { data, error } = await supabase().rpc(fn, args);
    if (error) {
      toast(pesanGalat(error));
      return null;
    }
    return data as T;
  };
  const tambahLog = (baru?: Aktivitas[]) => {
    if (!baru?.length) return;
    setAktivitas((prev) => [...baru, ...prev.filter((a) => !baru.some((b) => b.id === a.id))]);
  };
  const pasangKegiatan = (k: Kegiatan) =>
    setKegiatan((prev) => {
      const i = prev.findIndex((x) => x.id === k.id);
      if (i < 0) return [k, ...prev];
      const salin = prev.slice();
      salin[i] = k;
      return salin;
    });

  /* ---------- Riwayat aktivitas ---------- */
  const catatCetak: StoreValue["catatCetak"] = (k) => {
    void rpc<Aktivitas>("catat_aktivitas", { p_jenis: "Cetak", p_aksi: "mencetak lembar pengajuan", p_objek_id: k.id, p_objek_label: k.uraian }).then(
      (a) => a && tambahLog([a]),
    );
  };

  const jejakDokumen: StoreValue["jejakDokumen"] = async (id) => (await rpc<Aktivitas[]>("jejak_dokumen", { p_objek_id: id })) ?? [];

  const namaUnit = useCallback((kode: string) => referensi.unit.find((u) => u.kode === kode)?.nama ?? kode, [referensi.unit]);
  const namaAkun = useCallback((kode: string) => referensi.akun.find((a) => a.kode === kode)?.uraian ?? "-", [referensi.akun]);
  const infoPengguna = useCallback(
    (id: string) => {
      const u = pengguna.find((x) => x.id === id);
      return u ? { nama: u.nama, peran: u.peran } : { nama: "Pengguna tidak dikenal", peran: "-" };
    },
    [pengguna],
  );

  /* ---------- Belanja ---------- */
  const isiPengajuan = (d: KegiatanBaru) => ({
    uraian: d.uraian,
    jenisDokumen: d.jenisDokumen,
    noDokumen: d.noDokumen,
    penyediaId: d.penyediaId,
    unit: d.unit,
    dana: d.dana,
    mak: d.mak,
    nilai: d.nilai,
    tanggal: d.tanggal,
  });

  const tambahKegiatan: StoreValue["tambahKegiatan"] = async (data) => {
    if (!wajib("belanja.buat", "membuat pengajuan")) return null;
    const r = await rpc<{ pengajuan: Kegiatan; aktivitas: Aktivitas[] }>("buat_pengajuan", { p_data: isiPengajuan(data) });
    if (!r) return null;
    const k = rapikanKegiatan(r.pengajuan);
    pasangKegiatan(k);
    tambahLog(r.aktivitas);
    return k;
  };

  const izinUbah: StoreValue["izinUbah"] = (k) => {
    if (!boleh("belanja.buat")) return { boleh: false, alasan: `Peran ${penggunaAktif.peran} tidak dapat mengubah atau menghapus pengajuan` };
    if (k.dibuatOleh !== penggunaAktif.id)
      return { boleh: false, alasan: `Hanya ${infoPengguna(k.dibuatOleh).nama} (pembuat dokumen) yang dapat mengubah atau menghapus ${k.id}` };
    if (k.disahkan) return { boleh: false, alasan: `${k.id} sudah disahkan sehingga tidak bisa diubah atau dihapus` };
    if (k.spp) return { boleh: false, alasan: `${k.id} sudah masuk proses pencairan (${k.spp.no}) sehingga tidak bisa diubah atau dihapus` };
    return { boleh: true };
  };

  const editKegiatan: StoreValue["editKegiatan"] = async (id, data, catatan) => {
    const r = await rpc<{ berubah: number; kembaliKeDraf: boolean; pengajuan: Kegiatan; aktivitas: Aktivitas[] }>("ubah_pengajuan", {
      p_id: id,
      p_data: isiPengajuan(data),
      p_catatan: catatan?.trim() || null,
    });
    if (!r) return null;
    pasangKegiatan(rapikanKegiatan(r.pengajuan));
    tambahLog(r.aktivitas);
    return { berubah: r.berubah, kembaliKeDraf: r.kembaliKeDraf };
  };

  const hapusKegiatan: StoreValue["hapusKegiatan"] = async (id, alasan) => {
    const r = await rpc<{ aktivitas: Aktivitas[] }>("hapus_pengajuan", { p_id: id, p_alasan: alasan.trim() });
    if (!r) return false;
    setKegiatan((prev) => prev.filter((x) => x.id !== id));
    tambahLog(r.aktivitas);
    return true;
  };

  const ubahStatus: StoreValue["ubahStatus"] = async (id, status) => {
    const r = await rpc<{ pengajuan: Kegiatan; aktivitas: Aktivitas[] }>("ubah_status_pengajuan", { p_id: id, p_status: status });
    if (!r) return false;
    pasangKegiatan(rapikanKegiatan(r.pengajuan));
    tambahLog(r.aktivitas);
    return true;
  };

  /* ---------- Pencairan ---------- */
  const buatSpp: StoreValue["buatSpp"] = async (id, jenis, tgl) => {
    if (!wajib("pencairan.spp", "menerbitkan SPP")) return null;
    const r = await rpc<{ nomor: string; pengajuan: Kegiatan; aktivitas: Aktivitas[] }>("buat_spp", { p_pengajuan_id: id, p_jenis: jenis, p_tanggal: tgl });
    if (!r) return null;
    pasangKegiatan(rapikanKegiatan(r.pengajuan));
    tambahLog(r.aktivitas);
    return r.nomor;
  };

  const majukanTahap: StoreValue["majukanTahap"] = async (id) => {
    const r = await rpc<{ pengajuan: Kegiatan; aktivitas: Aktivitas[] }>("majukan_tahap_spp", { p_pengajuan_id: id });
    if (!r) return null;
    const k = rapikanKegiatan(r.pengajuan);
    pasangKegiatan(k);
    tambahLog(r.aktivitas);
    return k;
  };

  /* ---------- Pengesahan ---------- */
  const sahkan: StoreValue["sahkan"] = async (ids) => {
    if (!wajib("pengesahan.sahkan", "mengesahkan belanja")) return null;
    const r = await rpc<{ nomor: string; pengajuan: Kegiatan[]; aktivitas: Aktivitas[] }>("sahkan_pengajuan", { p_ids: ids });
    if (!r) return null;
    r.pengajuan.forEach((k) => pasangKegiatan(rapikanKegiatan(k)));
    tambahLog(r.aktivitas);
    segarkan.sp3b().catch(() => {});
    return r.nomor;
  };

  /** Rekap SP3B per bulan dari dokumen BLU (+ saldo awal di tabel sp3b), tanpa bulan berjalan */
  const pengesahan = useMemo<Sp3bBlu[]>(() => {
    const kini = periodeBerjalan().bulan;
    const peta = new Map<string, Sp3bBlu>();
    const ambil = (bulan: string) => {
      if (!peta.has(bulan)) {
        const [th, mm] = bulan.split("-");
        peta.set(bulan, { nomor: `SP3B-BLU-${mm}/${th}`, periode: `${NAMA_BULAN[Number(mm) - 1]} ${th}`, bulan, pencairan: 0, pengesahan: 0 });
      }
      return peta.get(bulan)!;
    };
    for (const s of sp3b) {
      const x = ambil(s.bulan.slice(0, 7));
      x.nomor = s.nomor;
      x.periode = s.periode;
      x.pencairan += s.pencairan_awal;
      x.pengesahan += s.pengesahan_awal;
    }
    for (const k of kegiatan) {
      if (k.dana !== "BLU" || !k.spp) continue;
      if (k.spp.tahap === 4) ambil(k.spp.tanggal.slice(0, 7)).pencairan += k.nilai;
      if (k.disahkan) ambil(bulanSp3b(k.disahkan.nomor)).pengesahan += k.nilai;
    }
    return [...peta.values()].filter((x) => x.bulan !== kini && x.bulan).sort((a, b) => b.bulan.localeCompare(a.bulan));
  }, [kegiatan, sp3b]);

  /* ---------- Pengguna (API server: butuh kunci rahasia Supabase) ---------- */
  const api = async <T,>(path: string, method: "POST" | "PATCH" | "DELETE", body?: unknown): Promise<T | null> => {
    const { data } = await supabase().auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      toast("Sesi berakhir. Silakan masuk kembali.");
      return null;
    }
    try {
      const res = await fetch(path, {
        method,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as T & { pesan?: string };
      if (!res.ok) {
        toast(json.pesan ?? `Permintaan gagal (${res.status})`);
        return null;
      }
      return json;
    } catch (e) {
      toast(pesanGalat(e as Error));
      return null;
    }
  };
  const pasangPengguna = (u: Pengguna) =>
    setPengguna((prev) => (prev.some((x) => x.id === u.id) ? prev.map((x) => (x.id === u.id ? u : x)) : [...prev, u]));

  const tambahPengguna: StoreValue["tambahPengguna"] = async (p) => {
    if (!wajib("pengguna.kelola", "mengelola pengguna")) return false;
    const r = await api<{ pengguna: Pengguna; aktivitas: Aktivitas[] }>("/api/pengguna", "POST", p);
    if (!r) return false;
    pasangPengguna(r.pengguna);
    tambahLog(r.aktivitas);
    return true;
  };

  const ubahPengguna: StoreValue["ubahPengguna"] = async (id, data) => {
    if (!wajib("pengguna.kelola", "mengelola pengguna")) return false;
    const r = await api<{ pengguna: Pengguna; aktivitas: Aktivitas[] }>(`/api/pengguna/${id}`, "PATCH", data);
    if (!r) return false;
    pasangPengguna(r.pengguna);
    tambahLog(r.aktivitas);
    return true;
  };

  const toggleAktifPengguna: StoreValue["toggleAktifPengguna"] = async (id) => {
    const u = pengguna.find((x) => x.id === id);
    if (!u) return false;
    return ubahPengguna(id, { nama: u.nama, email: u.email, peran: u.peran, unit: u.unit, aktif: !u.aktif });
  };

  const hapusPengguna: StoreValue["hapusPengguna"] = async (id) => {
    if (!wajib("pengguna.kelola", "mengelola pengguna")) return false;
    const r = await api<{ aktivitas: Aktivitas[] }>(`/api/pengguna/${id}`, "DELETE");
    if (!r) return false;
    setPengguna((prev) => prev.map((x) => (x.id === id ? { ...x, aktif: false, dihapus: true } : x)));
    tambahLog(r.aktivitas);
    return true;
  };

  const aturUlangSandi: StoreValue["aturUlangSandi"] = async (id, sandi) => {
    if (!wajib("pengguna.kelola", "mengelola pengguna")) return false;
    const r = await api<{ aktivitas: Aktivitas[] }>(`/api/pengguna/${id}/sandi`, "POST", { sandi });
    if (!r) return false;
    tambahLog(r.aktivitas);
    return true;
  };

  /* ---------- Referensi ---------- */
  const simpanReferensi: StoreValue["simpanReferensi"] = async (jenis, data, kode) => {
    if (!wajib("referensi.kelola", "mengubah referensi")) return false;
    const r = await rpc<{ berubah: number; aktivitas: Aktivitas[] }>("simpan_referensi", { p_jenis: jenis, p_data: data, p_kode: kode ?? null });
    if (!r) return false;
    tambahLog(r.aktivitas);
    await segarkan.referensi().catch((e) => toast(pesanGalat(e)));
    if (jenis === "penyedia" && kode) segarkan.kegiatan().catch(() => {});
    return true;
  };

  /* ---------- Kertas Kerja POK ---------- */
  const daftarMak = useMemo(() => (dataPok ? susunDaftarMak(dataPok) : []), [dataPok]);
  const petaMak = useMemo(() => new Map(daftarMak.map((m) => [m.kode, m])), [daftarMak]);
  const barisPok = useMemo(() => (dataPok ? susunBarisPok(dataPok, daftarMak) : []), [dataPok, daftarMak]);
  const cariMak = useCallback((kode: string) => petaMak.get(kode), [petaMak]);

  const terapkanPok: StoreValue["terapkanPok"] = async (data, file) => {
    if (!wajib("pok.unggah", "mengunggah FA Detail")) return false;
    const sb = supabase();
    // File asli disimpan di Storage (bucket privat "fa-detail") sebagai arsip
    let path: string | null = null;
    let arsipGagal = false;
    if (file) {
      const tahun = data.sumber.periode.match(/(\d{4})\s*$/)?.[1] ?? String(new Date().getFullYear());
      const cap = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
      path = `${tahun}/${cap}-${Math.random().toString(36).slice(2, 8)}.xlsx`;
      const up = await sb.storage.from("fa-detail").upload(path, file, {
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        upsert: false,
      });
      if (up.error) {
        path = null;
        arsipGagal = true;
      }
    }
    const r = await rpc<{ unggahan: number; aktivitas: Aktivitas[] }>("terapkan_pok", {
      p_data: { sumber: { file: data.sumber.file, periode: data.sumber.periode, satker: data.sumber.satker }, uraian: data.uraian, akun: data.akun, mak: data.mak, item: data.item },
      p_file_nama: data.sumber.file,
      p_file_path: path,
    });
    if (!r) {
      if (path) await sb.storage.from("fa-detail").remove([path]);
      return false;
    }
    tambahLog(r.aktivitas);
    await Promise.allSettled([segarkan.pok(), segarkan.referensi()]);
    if (arsipGagal) toast("Data FA Detail tersimpan, tetapi file aslinya gagal diarsipkan di Storage");
    return true;
  };

  const value: StoreValue = {
    kegiatan,
    pengesahan,
    pengguna,
    referensi,
    aktivitas,
    siap,
    terkonfigurasi: supabaseTerkonfigurasi,
    sudahMasuk,
    memuat,
    penggunaAktif,
    masuk,
    keluar,
    gantiSandi,
    boleh,
    bolehBuka,
    muatUlang: muatSemua,
    catatCetak,
    jejakDokumen,
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
    aturUlangSandi,
    simpanReferensi,
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
