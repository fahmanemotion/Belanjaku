"use client";

/**
 * State bersama seluruh modul, tersambung ke database Supabase.
 *
 * - Login: Supabase Auth (email + kata sandi). Profil dan peran dibaca dari tabel `pengguna` (pengguna tidak terikat unit kerja).
 * - Membaca data: tabel/view Supabase yang dilindungi Row Level Security.
 * - Mengubah data: fungsi RPC di database (supabase/migrations) yang memeriksa peran, status dokumen,
 *   dan menulis Riwayat Aktivitas dalam satu transaksi. Pemeriksaan izin di sini hanya untuk tampilan.
 * - Alur: Pengadaan (Nota Dinas & HPS → Surat Pesanan → Nota Pembelian → Kwitansi, BAP & BAST)
 *         atau Belanja (dicatat Operator Pengadaan) → rekap pencairan → rekap pengesahan.
 * - Kelola pengguna: API server app/api/pengguna (butuh kunci rahasia, hanya Administrator).
 * - Realtime: perubahan oleh pengguna lain langsung dimuat ulang; saat tab kembali aktif data disegarkan.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { bolehModul, type Izin, type Modul } from "@/lib/akses";
import {
  kePengguna,
  muatAktivitas,
  muatIzin,
  muatKegiatan,
  muatPaket,
  muatPengguna,
  muatPok,
  muatReferensi,
  muatRekap,
  pesanGalat,
  rapikanKegiatan,
  rapikanPaket,
  rapikanRekap,
} from "@/lib/db";
import { susunBarisPok, susunDaftarMak, type BarisPok, type DataPok, type InfoMak } from "@/lib/mak";
import { supabase, supabaseTerkonfigurasi } from "@/lib/supabase";
import type { Aktivitas, AnggaranMak, DataPenyedia, ItemPaket, JenisPencairan, JenisRekap, Kegiatan, Paket, Pengguna, Peran, Referensi, Rekap } from "@/lib/types";

export type KegiatanBaru = Omit<Kegiatan, "id" | "status" | "pencairan" | "pengesahan" | "dibuatOleh">;
export type JenisReferensi = keyof Referensi;

/** Isian saat membuat rekap pencairan / pengesahan */
export interface IsianRekap {
  tanggal: string;
  /** wajib untuk rekap pencairan */
  jenisBayar?: JenisPencairan;
  referensi?: string;
  catatan?: string;
}

/** Hasil pemeriksaan hak ubah/hapus sebuah dokumen oleh pengguna yang sedang masuk */
export interface IzinUbah {
  boleh: boolean;
  alasan?: string;
}

type Hasil = { ok: true; nama?: string } | { ok: false; pesan: string };

/* ---------- Isian tahap pengadaan (dikirim ke RPC simpan_*) ---------- */
export interface IsianNotaDinas {
  pekerjaan: string;
  unit: string;
  dana: string;
  mak: string;
  ndNomor: string;
  ndTanggal: string;
  ppn: boolean;
  item: Omit<ItemPaket, "harga">[];
  /** wajib bila yang menyimpan Administrator */
  ppkId?: string;
}
export interface IsianPesanan {
  spNomor: string;
  spTanggal: string;
  batasHari: number;
  /** id kosong = penyedia baru (langsung ditambahkan ke Referensi) */
  penyedia: DataPenyedia;
  /** wajib bila yang menyimpan Administrator */
  ppId?: string;
}
export interface IsianPembelian {
  notaTanggal: string;
  ppn: boolean;
  /** harga satuan pembelian per barang, urut sesuai HPS */
  harga: number[];
}
export interface IsianKwitansi {
  kwNomor: string;
  kwTanggal: string;
  bapNomor: string;
  bapTanggal: string;
  bastNomor: string;
  bastTanggal: string;
  /** tanda √ pada kolom MEMENUHI di Lampiran BAP */
  centang: boolean;
}
export interface IsianPejabat {
  nip: string;
  pangkat: string;
  skNomor: string;
  skTanggal: string;
}
/** Hasil simpan tahap: paket terbaru + jumlah kolom yang berubah (0 = tidak ada perubahan) */
export type HasilPaket = { paket: Paket; berubah: number } | null;

interface StoreValue {
  kegiatan: Kegiatan[];
  /** rekap pencairan & pengesahan, terbaru di atas */
  rekap: Rekap[];
  /** semua profil, termasuk yang sudah dihapus (untuk nama di riwayat) */
  pengguna: Pengguna[];
  referensi: Referensi;
  aktivitas: Aktivitas[];
  /** paket pengadaan (alur Kwitansi), terbaru di atas */
  paket: Paket[];

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
  editKegiatan: (id: string, data: KegiatanBaru, catatan?: string) => Promise<{ berubah: number } | null>;
  hapusKegiatan: (id: string, alasan: string) => Promise<boolean>;
  izinUbah: (k: Kegiatan) => IzinUbah;

  /* Pencairan & Pengesahan (rekap berceklist) */
  buatRekap: (jenis: JenisRekap, ids: string[], isian: IsianRekap) => Promise<Rekap | null>;
  batalRekap: (jenis: JenisRekap, nomor: string, alasan: string) => Promise<boolean>;
  /** sisa anggaran per MAK untuk kegiatan yang akan disahkan (pemeriksaan yang sama dengan saat Sahkan) */
  cekAnggaran: (ids: string[]) => Promise<{ ok: true; data: AnggaranMak[] } | { ok: false; pesan: string }>;

  /* Pengadaan (alur dokumen Kwitansi) */
  simpanNotaDinas: (id: string | null, data: IsianNotaDinas) => Promise<HasilPaket>;
  simpanPesanan: (id: string, data: IsianPesanan) => Promise<HasilPaket>;
  simpanPembelian: (id: string, data: IsianPembelian) => Promise<HasilPaket>;
  simpanKwitansi: (id: string, data: IsianKwitansi) => Promise<HasilPaket>;
  /** mundur satu tahap (isian tetap tersimpan); tahap 4 menghapus dokumen belanjanya */
  batalTahapPaket: (id: string, alasan: string) => Promise<Paket | null>;
  hapusPaket: (id: string, alasan: string) => Promise<boolean>;
  catatCetakPaket: (p: Paket, dokumen: string[]) => void;
  /** NIP, pangkat, SK — oleh Administrator atau pemilik akun sendiri */
  simpanDataPejabat: (id: string, data: IsianPejabat) => Promise<{ berubah: number } | null>;

  /* Pengguna (lewat API server) */
  tambahPengguna: (p: { nama: string; email: string; peran: Peran; sandi: string }) => Promise<Pengguna | null>;
  ubahPengguna: (id: string, data: Pick<Pengguna, "nama" | "email" | "peran" | "aktif">) => Promise<boolean>;
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

const PROFIL_KOSONG: Pengguna = { id: "", nama: "", email: "", peran: "Operator Pengadaan", aktif: false };
const REFERENSI_KOSONG: Referensi = { akun: [], unit: [], penyedia: [], dana: [] };

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
  const [rekap, setRekap] = useState<Rekap[]>([]);
  const [pengguna, setPengguna] = useState<Pengguna[]>([]);
  const [referensi, setReferensi] = useState<Referensi>(REFERENSI_KOSONG);
  const [aktivitas, setAktivitas] = useState<Aktivitas[]>([]);
  const [paket, setPaket] = useState<Paket[]>([]);
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
    setRekap([]);
    setPengguna([]);
    setReferensi(REFERENSI_KOSONG);
    setAktivitas([]);
    setPaket([]);
    setDataPok(null);
  }, []);

  const segarkan = useMemo(() => {
    const sb = () => supabase();
    return {
      kegiatan: async () => setKegiatan(await muatKegiatan(sb())),
      rekap: async () => setRekap(await muatRekap(sb())),
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
      paket: async () => setPaket(await muatPaket(sb())),
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
        .select("id, nama, email, peran, aktif, deleted_at")
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
      const p: Pengguna = { id: data.id, nama: data.nama, email: data.email, peran: data.peran, aktif: true };
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
      .on("postgres_changes", { event: "*", schema: "public", table: "rekap_pencairan" }, () => {
        jadwal("kegiatan");
        jadwal("rekap");
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "rekap_pengesahan" }, () => {
        jadwal("kegiatan");
        jadwal("rekap");
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "aktivitas" }, () => jadwal("aktivitas"))
      .on("postgres_changes", { event: "*", schema: "public", table: "pengguna" }, () => jadwal("pengguna"))
      .on("postgres_changes", { event: "*", schema: "public", table: "unit_kerja" }, () => jadwal("referensi"))
      .on("postgres_changes", { event: "*", schema: "public", table: "penyedia" }, () => jadwal("referensi"))
      .on("postgres_changes", { event: "*", schema: "public", table: "akun" }, () => jadwal("referensi"))
      .on("postgres_changes", { event: "*", schema: "public", table: "sumber_dana" }, () => jadwal("referensi"))
      .on("postgres_changes", { event: "*", schema: "public", table: "pok_unggahan" }, () => jadwal("pok"))
      .on("postgres_changes", { event: "*", schema: "public", table: "paket_pengadaan" }, () => jadwal("paket"))
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
    void rpc<Aktivitas>("catat_aktivitas", { p_jenis: "Cetak", p_aksi: "mencetak lembar belanja", p_objek_id: k.id, p_objek_label: k.uraian }).then(
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
    if (!wajib("belanja.buat", "mencatat dokumen belanja")) return null;
    const r = await rpc<{ pengajuan: Kegiatan; aktivitas: Aktivitas[] }>("buat_pengajuan", { p_data: isiPengajuan(data) });
    if (!r) return null;
    const k = rapikanKegiatan(r.pengajuan);
    pasangKegiatan(k);
    tambahLog(r.aktivitas);
    return k;
  };

  const izinUbah: StoreValue["izinUbah"] = (k) => {
    if (k.paketId) return { boleh: false, alasan: `${k.id} terbit dari paket pengadaan ${k.paketId}; ubah atau batalkan kwitansinya lewat modul Pengadaan` };
    if (!boleh("belanja.buat")) return { boleh: false, alasan: `Peran ${penggunaAktif.peran} tidak dapat mengubah atau menghapus dokumen belanja` };
    if (k.dibuatOleh !== penggunaAktif.id)
      return { boleh: false, alasan: `Hanya ${infoPengguna(k.dibuatOleh).nama} (pencatat dokumen) yang dapat mengubah atau menghapus ${k.id}` };
    if (k.pencairan) return { boleh: false, alasan: `${k.id} sudah dicairkan pada ${k.pencairan.nomor} sehingga tidak bisa diubah atau dihapus` };
    return { boleh: true };
  };

  const editKegiatan: StoreValue["editKegiatan"] = async (id, data, catatan) => {
    const r = await rpc<{ berubah: number; pengajuan: Kegiatan; aktivitas: Aktivitas[] }>("ubah_pengajuan", {
      p_id: id,
      p_data: isiPengajuan(data),
      p_catatan: catatan?.trim() || null,
    });
    if (!r) return null;
    pasangKegiatan(rapikanKegiatan(r.pengajuan));
    tambahLog(r.aktivitas);
    return { berubah: r.berubah };
  };

  const hapusKegiatan: StoreValue["hapusKegiatan"] = async (id, alasan) => {
    const r = await rpc<{ aktivitas: Aktivitas[] }>("hapus_pengajuan", { p_id: id, p_alasan: alasan.trim() });
    if (!r) return false;
    setKegiatan((prev) => prev.filter((x) => x.id !== id));
    tambahLog(r.aktivitas);
    return true;
  };

  /* ---------- Pencairan & Pengesahan (rekap) ---------- */
  const buatRekap: StoreValue["buatRekap"] = async (jenis, ids, isian) => {
    const cair = jenis === "pencairan";
    if (!wajib(cair ? "pencairan.rekap" : "pengesahan.sahkan", cair ? "mencairkan belanja" : "mengesahkan belanja")) return null;
    const umum = {
      p_ids: ids,
      p_tanggal: isian.tanggal,
      p_referensi: isian.referensi?.trim() || null,
      p_catatan: isian.catatan?.trim() || null,
    };
    const r = await rpc<{ rekap: Rekap; pengajuan: Kegiatan[]; aktivitas: Aktivitas[] }>(
      cair ? "buat_rekap_pencairan" : "buat_rekap_pengesahan",
      cair ? { ...umum, p_jenis: isian.jenisBayar } : umum,
    );
    if (!r) return null;
    const baru = rapikanRekap(r.rekap);
    r.pengajuan.forEach((k) => pasangKegiatan(rapikanKegiatan(k)));
    setRekap((prev) => [baru, ...prev.filter((x) => !(x.jenisRekap === jenis && x.nomor === baru.nomor))]);
    tambahLog(r.aktivitas);
    return baru;
  };

  // Tanpa toast: galatnya ditampilkan di form Sahkan
  const cekAnggaran = useCallback<StoreValue["cekAnggaran"]>(async (ids) => {
    const { data, error } = await supabase().rpc("cek_anggaran_pengesahan", { p_ids: ids });
    if (error) return { ok: false, pesan: pesanGalat(error) };
    return { ok: true, data: (data ?? []) as AnggaranMak[] };
  }, []);

  const batalRekap: StoreValue["batalRekap"] = async (jenis, nomor, alasan) => {
    const cair = jenis === "pencairan";
    if (!wajib(cair ? "pencairan.rekap" : "pengesahan.sahkan", "membatalkan rekap")) return false;
    const r = await rpc<{ pengajuan: Kegiatan[]; aktivitas: Aktivitas[] }>(cair ? "batal_rekap_pencairan" : "batal_rekap_pengesahan", {
      p_nomor: nomor,
      p_alasan: alasan.trim(),
    });
    if (!r) return false;
    r.pengajuan.forEach((k) => pasangKegiatan(rapikanKegiatan(k)));
    setRekap((prev) => prev.filter((x) => !(x.jenisRekap === jenis && x.nomor === nomor)));
    tambahLog(r.aktivitas);
    return true;
  };

  /* ---------- Pengadaan ---------- */
  const pasangPaket = (p: Paket) =>
    setPaket((prev) => {
      const i = prev.findIndex((x) => x.id === p.id);
      if (i < 0) return [p, ...prev];
      const salin = prev.slice();
      salin[i] = p;
      return salin;
    });
  type BalasanPaket = { paket: Paket; berubah?: number; aktivitas: Aktivitas[]; pengajuan?: Kegiatan; penyedia?: boolean };
  const terimaPaket = (r: BalasanPaket | null): HasilPaket => {
    if (!r) return null;
    const p = rapikanPaket(r.paket);
    pasangPaket(p);
    if (r.pengajuan) pasangKegiatan(rapikanKegiatan(r.pengajuan));
    if (r.penyedia) segarkan.referensi().catch(() => {});
    tambahLog(r.aktivitas);
    return { paket: p, berubah: r.berubah ?? 1 };
  };

  const simpanNotaDinas: StoreValue["simpanNotaDinas"] = async (id, data) => {
    if (!wajib("pengadaan.ppk", "menerbitkan nota dinas pengadaan")) return null;
    return terimaPaket(await rpc<BalasanPaket>("simpan_nota_dinas", { p_id: id, p_data: data }));
  };
  const simpanPesanan: StoreValue["simpanPesanan"] = async (id, data) => {
    if (!wajib("pengadaan.pp", "menerbitkan surat pesanan")) return null;
    return terimaPaket(await rpc<BalasanPaket>("simpan_pesanan", { p_id: id, p_data: data }));
  };
  const simpanPembelian: StoreValue["simpanPembelian"] = async (id, data) => {
    if (!wajib("pengadaan.pp", "mencatat nota pembelian")) return null;
    return terimaPaket(await rpc<BalasanPaket>("simpan_pembelian", { p_id: id, p_data: data }));
  };
  const simpanKwitansi: StoreValue["simpanKwitansi"] = async (id, data) => {
    if (!wajib("pengadaan.ppk", "menerbitkan kwitansi")) return null;
    return terimaPaket(await rpc<BalasanPaket>("simpan_kwitansi", { p_id: id, p_data: data }));
  };
  const batalTahapPaket: StoreValue["batalTahapPaket"] = async (id, alasan) => {
    const r = await rpc<{ paket: Paket; aktivitas: Aktivitas[]; pengajuanDihapus?: string }>("batal_tahap_paket", { p_id: id, p_alasan: alasan.trim() });
    if (!r) return null;
    const p = rapikanPaket(r.paket);
    pasangPaket(p);
    if (r.pengajuanDihapus) setKegiatan((prev) => prev.filter((x) => x.id !== r.pengajuanDihapus));
    tambahLog(r.aktivitas);
    return p;
  };
  const hapusPaket: StoreValue["hapusPaket"] = async (id, alasan) => {
    if (!wajib("pengadaan.ppk", "menghapus paket pengadaan")) return false;
    const r = await rpc<{ aktivitas: Aktivitas[] }>("hapus_paket", { p_id: id, p_alasan: alasan.trim() });
    if (!r) return false;
    setPaket((prev) => prev.filter((x) => x.id !== id));
    tambahLog(r.aktivitas);
    return true;
  };
  const catatCetakPaket: StoreValue["catatCetakPaket"] = (p, dokumen) => {
    void rpc<Aktivitas>("catat_aktivitas", {
      p_jenis: "Cetak",
      p_aksi: "mencetak dokumen pengadaan",
      p_objek_id: p.id,
      p_objek_label: p.pekerjaan,
      p_catatan: dokumen.join(", "),
    }).then((a) => a && tambahLog([a]));
  };
  const simpanDataPejabat: StoreValue["simpanDataPejabat"] = async (id, data) => {
    const r = await rpc<{ berubah: number; pengguna: Parameters<typeof kePengguna>[0]; aktivitas: Aktivitas[] }>("simpan_data_pejabat", { p_id: id, p_data: data });
    if (!r) return null;
    const u = kePengguna(r.pengguna);
    pasangPengguna(u);
    if (u.id === profilRef.current?.id) setProfil(u);
    tambahLog(r.aktivitas);
    return { berubah: r.berubah };
  };

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
    if (!wajib("pengguna.kelola", "mengelola pengguna")) return null;
    const r = await api<{ pengguna: Pengguna; aktivitas: Aktivitas[] }>("/api/pengguna", "POST", p);
    if (!r) return null;
    pasangPengguna(r.pengguna);
    tambahLog(r.aktivitas);
    return r.pengguna;
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
    return ubahPengguna(id, { nama: u.nama, email: u.email, peran: u.peran, aktif: !u.aktif });
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
    rekap,
    pengguna,
    referensi,
    aktivitas,
    paket,
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
    buatRekap,
    batalRekap,
    cekAnggaran,
    simpanNotaDinas,
    simpanPesanan,
    simpanPembelian,
    simpanKwitansi,
    batalTahapPaket,
    hapusPaket,
    catatCetakPaket,
    simpanDataPejabat,
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
