"use client";

/**
 * Rekap berceklist — dipakai bersama modul Pencairan dan Pengesahan.
 *
 * Alur kegiatan (dokumen belanja):
 *   Belanja    : bagian pengadaan mencatat kegiatan                                  → Belum dicairkan
 *   Pencairan  : Operator Keuangan mencentang kegiatan yang dibayarkan ke penyedia /
 *                pihak ketiga (ceklist bar) lalu klik "Cairkan". Kegiatan hilang dari
 *                Daftar Pencairan, pindah ke Riwayat Pencairan, dan masuk Daftar Pengesahan → Dicairkan
 *   Pengesahan : Operator Pengesahan mencentang kegiatan yang sudah dicairkan lalu klik
 *                "Sahkan". Kegiatan pindah ke Riwayat Pengesahan                        → Disahkan
 * Bendahara Pengeluaran dan Administrator boleh mencairkan maupun mengesahkan.
 *
 * Setiap "Cairkan"/"Sahkan" membentuk rekap bernomor (CAIR-… / SAH-…). Satu rekap berisi satu
 * sumber dana; bila yang dicentang campuran RM dan BLU, rekap otomatis dibuat per sumber dana.
 * Rekap yang keliru dapat dibatalkan (wajib alasan) sehingga kegiatannya kembali ke daftar.
 * Database (RPC buat_rekap_* / batal_rekap_*) memeriksa ulang semua aturan ini.
 */
import { useMemo, useState } from "react";
import Icon, { type IconName } from "@/components/Icon";
import { JUMLAH_KOLOM_KEGIATAN, KepalaKegiatan, SelKegiatan } from "@/components/KolomKegiatan";
import { useStore } from "@/components/StoreProvider";
import { Badge, BadgeDana, EmptyRow, Field, Modal, PageHead, Paginasi, Saring, SearchBox, Status, Tabs, useHalaman, type Tone } from "@/components/ui";
import type { Izin } from "@/lib/akses";
import { JENIS_DOKUMEN, JENIS_PENCAIRAN, jumlah } from "@/lib/data";
import { desimal, hariIni, rupiah, rupiahSingkat, tanggal, tanggalJam } from "@/lib/format";
import type { JenisDokumen, JenisPencairan, JenisRekap, Kegiatan, Rekap } from "@/lib/types";

type Dana = "RM" | "BLU";
type TabDana = "Semua" | Dana;
type Tampilan = "daftar" | "riwayat";
type ModeRiwayat = "kegiatan" | "rekap";
type FilterDok = "Semua" | JenisDokumen;
type FilterDana = "Semua" | Dana;
type FilterBayar = "Semua" | JenisPencairan;

const DANA: Dana[] = ["RM", "BLU"];
const TAB_DANA: TabDana[] = ["Semua", "RM", "BLU"];
const NAMA_DANA: Record<Dana, string> = { RM: "Rupiah Murni", BLU: "PNBP BLU" };

/** Warna badge mekanisme pembayaran (LS · GU · TUP) */
export const TONE_JENIS_BAYAR: Record<JenisPencairan, Tone> = { LS: "i", GU: "w", TUP: "p" };

interface Konfig {
  judul: string;
  subjudul: string;
  izin: Izin;
  ikon: IconName;
  /** label tombol aksi */
  tombol: string;
  /** kata kerja pasif: dicairkan / disahkan */
  kata: string;
  /** nama proses: pencairan / pengesahan */
  proses: string;
  daftar: string;
  riwayat: string;
  /** siapa yang boleh membuat rekap (untuk peran yang hanya melihat) */
  pelaku: string;
  labelTanggal: string;
  labelRef: string;
  refSingkat: string;
  contohRef: string;
  contohCatatan: string;
  kosong: string;
}

const KONFIG: Record<JenisRekap, Konfig> = {
  pencairan: {
    judul: "Pencairan",
    subjudul: "Kegiatan dari bagian pengadaan yang akan dibayarkan ke penyedia atau pihak ketiga. Centang kegiatan, lalu cairkan sekaligus.",
    izin: "pencairan.rekap",
    ikon: "wallet",
    tombol: "Cairkan",
    kata: "dicairkan",
    proses: "pencairan",
    daftar: "Daftar Pencairan",
    riwayat: "Riwayat Pencairan",
    pelaku: "Pencairan dilakukan oleh Operator Keuangan, Bendahara Pengeluaran, atau Administrator.",
    labelTanggal: "Tanggal pencairan",
    labelRef: "No. SP2D / SPM (opsional)",
    refSingkat: "No. SP2D / SPM",
    contohRef: "mis. nomor SP2D dari SAKTI",
    contohCatatan: "mis. Pembayaran termin I kontrak pemeliharaan",
    kosong: "Belum ada kegiatan yang menunggu dicairkan. Kegiatan dicatat bagian pengadaan di modul Belanja.",
  },
  pengesahan: {
    judul: "Pengesahan",
    subjudul: "Kegiatan yang sudah dicairkan dan menunggu disahkan. Centang kegiatan, lalu sahkan sekaligus.",
    izin: "pengesahan.sahkan",
    ikon: "stamp",
    tombol: "Sahkan",
    kata: "disahkan",
    proses: "pengesahan",
    daftar: "Daftar Pengesahan",
    riwayat: "Riwayat Pengesahan",
    pelaku: "Pengesahan dilakukan oleh Operator Pengesahan, Bendahara Pengeluaran, atau Administrator.",
    labelTanggal: "Tanggal pengesahan",
    labelRef: "No. dokumen pengesahan (opsional)",
    refSingkat: "No. dokumen pengesahan",
    contohRef: "mis. SP3B BLU / SP2B / SPM GU Nihil",
    contohCatatan: "mis. Pengesahan belanja BLU bulan Oktober",
    kosong: "Belum ada kegiatan yang menunggu disahkan. Kegiatan masuk ke sini setelah dicairkan di modul Pencairan.",
  },
};

const jml = (n: number) => desimal(n, 0);
const totalNilai = (xs: Kegiatan[]) => jumlah(xs.map((k) => k.nilai));
/** "RM 2 · BLU 3" bila kegiatan terpilih tercampur dua sumber dana */
const rincianDana = (xs: Kegiatan[]) => {
  const ada = DANA.map((d) => [d, xs.filter((k) => k.dana === d).length] as const).filter(([, n]) => n > 0);
  return ada.length > 1 ? ada.map(([d, n]) => `${d} ${jml(n)}`).join(" · ") : "";
};

/* =========================================================
   Halaman modul
   ========================================================= */
export default function RekapBelanja({ jenis }: { jenis: JenisRekap }) {
  const K = KONFIG[jenis];
  const cair = jenis === "pencairan";
  const { kegiatan, rekap, boleh } = useStore();
  // Pencairan: Operator Keuangan; Pengesahan: Operator Pengesahan; Bendahara & Administrator: keduanya
  const bisa = boleh(K.izin);

  // Pencairan: belum dicairkan. Pengesahan: sudah dicairkan, belum disahkan.
  const menunggu = useMemo(() => {
    const xs = kegiatan.filter((k) => (cair ? !k.pencairan : Boolean(k.pencairan) && !k.pengesahan));
    // Pengesahan: kegiatan dari rekap pencairan yang sama diletakkan berdekatan
    return cair ? xs : [...xs].sort((a, b) => b.pencairan!.nomor.localeCompare(a.pencairan!.nomor) || a.id.localeCompare(b.id));
  }, [kegiatan, cair]);
  const selesai = useMemo(() => kegiatan.filter((k) => (cair ? k.pencairan : k.pengesahan)), [kegiatan, cair]);
  const daftarRekap = useMemo(
    () => rekap.filter((r) => r.jenisRekap === jenis).sort((a, b) => b.dibuatPada.localeCompare(a.dibuatPada) || b.nomor.localeCompare(a.nomor)),
    [rekap, jenis],
  );

  const [tampilan, setTampilan] = useState<Tampilan>("daftar");
  const [tab, setTab] = useState<TabDana>("Semua");
  const [dipilih, setDipilih] = useState<string[]>([]);
  /** salinan kegiatan terpilih saat form dibuka */
  const [isiForm, setIsiForm] = useState<Kegiatan[] | null>(null);
  /** nomor rekap yang baru dibuat (disorot di Riwayat) */
  const [baru, setBaru] = useState<string[]>([]);

  // Pilihan tetap tersimpan walau pindah tab; yang sudah tidak menunggu (diproses pengguna lain) diabaikan
  const terpilih = useMemo(() => {
    const s = new Set(dipilih);
    return menunggu.filter((k) => s.has(k.id));
  }, [menunggu, dipilih]);

  return (
    <>
      <PageHead
        title={K.judul}
        subtitle={K.subjudul}
        actions={
          <div className="seg seg-sm seg-ic" role="group" aria-label="Tampilan">
            <button type="button" className={tampilan === "daftar" ? "on" : ""} aria-pressed={tampilan === "daftar"} onClick={() => setTampilan("daftar")}>
              <Icon name="cart" />
              Daftar
              {menunggu.length > 0 && <span className="count">{jml(menunggu.length)}</span>}
            </button>
            <button type="button" className={tampilan === "riwayat" ? "on" : ""} aria-pressed={tampilan === "riwayat"} onClick={() => setTampilan("riwayat")}>
              <Icon name="history" />
              Riwayat
              {selesai.length > 0 && <span className="count netral">{jml(selesai.length)}</span>}
            </button>
          </div>
        }
      />

      <div className="stats">
        <div className="stat hot">
          <div className="lbl">Menunggu {K.proses}</div>
          <div className="big num">{rupiahSingkat(totalNilai(menunggu))}</div>
          <div className="note">{jml(menunggu.length)} kegiatan</div>
        </div>
        {DANA.map((d) => {
          const xs = menunggu.filter((k) => k.dana === d);
          return (
            <div className="stat" key={d}>
              <div className="lbl">Menunggu · {d}</div>
              <div className="big num">{rupiahSingkat(totalNilai(xs))}</div>
              <div className="note">
                {jml(xs.length)} kegiatan {NAMA_DANA[d]}
              </div>
            </div>
          );
        })}
        <div className="stat">
          <div className="lbl">Sudah {K.kata}</div>
          <div className="big num">{rupiahSingkat(totalNilai(selesai))}</div>
          <div className="note">
            {jml(selesai.length)} kegiatan · {jml(daftarRekap.length)} rekap
          </div>
        </div>
      </div>

      {tampilan === "daftar" ? (
        <DaftarRekap
          jenis={jenis}
          menunggu={menunggu}
          bisa={bisa}
          tab={tab}
          setTab={setTab}
          dipilih={dipilih}
          setDipilih={setDipilih}
          terpilih={terpilih}
          onRekap={() => setIsiForm(terpilih)}
        />
      ) : (
        <RiwayatRekap jenis={jenis} daftar={daftarRekap} bisa={bisa} baru={baru} />
      )}

      {isiForm && (
        <FormRekap
          jenis={jenis}
          isi={isiForm}
          onClose={() => setIsiForm(null)}
          onSelesai={(hasil) => {
            setIsiForm(null);
            setDipilih([]);
            setBaru(hasil.map((r) => r.nomor));
            setTampilan("riwayat");
          }}
        />
      )}
    </>
  );
}

/* =========================================================
   Daftar kegiatan yang menunggu (ceklist)
   ========================================================= */
function DaftarRekap({
  jenis,
  menunggu,
  bisa,
  tab,
  setTab,
  dipilih,
  setDipilih,
  terpilih,
  onRekap,
}: {
  jenis: JenisRekap;
  menunggu: Kegiatan[];
  bisa: boolean;
  tab: TabDana;
  setTab: (t: TabDana) => void;
  dipilih: string[];
  setDipilih: (ids: string[]) => void;
  terpilih: Kegiatan[];
  onRekap: () => void;
}) {
  const K = KONFIG[jenis];
  const cair = jenis === "pencairan";
  const { namaUnit, infoPengguna, penggunaAktif } = useStore();
  const [dok, setDok] = useState<FilterDok>("Semua");
  const [unit, setUnit] = useState("Semua");
  const [cari, setCari] = useState("");

  const sumber = useMemo(() => (tab === "Semua" ? menunggu : menunggu.filter((k) => k.dana === tab)), [menunggu, tab]);
  // Pilihan unit hanya unit yang punya kegiatan di daftar ini
  const opsiUnit = useMemo(
    () =>
      [...new Set(sumber.map((k) => k.unit))]
        .map((u) => ({ value: u, label: namaUnit(u) }))
        .sort((a, b) => a.label.localeCompare(b.label, "id")),
    [sumber, namaUnit],
  );
  const baris = useMemo(() => {
    const q = cari.trim().toLowerCase();
    return sumber.filter(
      (k) =>
        (dok === "Semua" || k.jenisDokumen === dok) &&
        (unit === "Semua" || k.unit === unit) &&
        (!q || [k.id, k.uraian, k.noDokumen, k.penyedia, k.akun, k.mak, namaUnit(k.unit), k.pencairan?.nomor ?? ""].join(" ").toLowerCase().includes(q)),
    );
  }, [sumber, dok, unit, cari, namaUnit]);

  // 30 kegiatan per halaman; setiap filter berubah kembali ke halaman 1
  const hal = useHalaman(baris);
  const saring =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      hal.awal();
    };
  const adaFilter = dok !== "Semua" || unit !== "Semua" || cari !== "";
  const reset = () => {
    setDok("Semua");
    setUnit("Semua");
    setCari("");
    hal.awal();
  };

  const pilih = new Set(dipilih);
  const halIni = hal.tampil;
  const semuaHal = halIni.length > 0 && halIni.every((k) => pilih.has(k.id));
  const sebagianHal = !semuaHal && halIni.some((k) => pilih.has(k.id));
  const toggle = (id: string) => setDipilih(pilih.has(id) ? dipilih.filter((x) => x !== id) : [...dipilih, id]);
  const toggleHal = () =>
    setDipilih(semuaHal ? dipilih.filter((x) => !halIni.some((k) => k.id === x)) : [...new Set([...dipilih, ...halIni.map((k) => k.id)])]);

  const total = totalNilai(baris);
  const kolom = JUMLAH_KOLOM_KEGIATAN + 1 + (bisa ? 1 : 0);
  const labelKolom = cair ? "Tgl. Dokumen" : "Pencairan";
  const hitung = (t: TabDana) => (t === "Semua" ? menunggu.length : menunggu.filter((k) => k.dana === t).length);
  const campur = rincianDana(terpilih);

  return (
    <section className="panel ada-paginasi" ref={hal.ref}>
      <div className="ph">
        <div>
          <h3>{K.daftar}</h3>
          <p className="sub">
            {jml(baris.length)} kegiatan{tab === "Semua" ? "" : ` ${tab}`} menunggu {K.proses} · total {rupiah(total)}
          </p>
        </div>
        <div className="tbar filter-kegiatan">
          <Tabs<TabDana>
            label="Sumber dana"
            value={tab}
            onChange={(t) => {
              setTab(t);
              setUnit("Semua");
              hal.awal();
            }}
            items={TAB_DANA.map((t) => ({ value: t, label: `${t} · ${jml(hitung(t))}` }))}
          />
          <Saring<FilterDok>
            label="Jenis dokumen"
            value={dok}
            onChange={saring(setDok)}
            opsi={[{ value: "Semua", label: "Semua dokumen" }, ...JENIS_DOKUMEN.map((j) => ({ value: j.value, label: j.value }))]}
          />
          <Saring<string> label="Unit kerja" value={unit} onChange={saring(setUnit)} opsi={[{ value: "Semua", label: "Semua unit" }, ...opsiUnit]} />
          <SearchBox id={`${jenis}-cari`} value={cari} onChange={saring(setCari)} placeholder="Cari kegiatan, dokumen, penyedia" />
          {adaFilter && (
            <button type="button" className="btn soft sm" onClick={reset}>
              <Icon name="close" />
              Reset
            </button>
          )}
        </div>
      </div>

      <p className="info-akses">
        <Icon name="shield" />
        <span>
          Masuk sebagai <b>{penggunaAktif.nama}</b> ({penggunaAktif.peran}) ·{" "}
          {bisa
            ? `Centang kegiatan yang akan ${K.kata}, lalu klik ${K.tombol}. Kegiatan yang sudah ${K.kata} pindah ke Riwayat${cair ? " dan masuk Daftar Pengesahan" : ""}; RM dan BLU otomatis dibuat rekap terpisah.`
            : `Anda dapat melihat daftar dan riwayat. ${K.pelaku}`}
        </span>
      </p>

      <div className="tw stack">
        <table className={`tabel-kegiatan ${bisa ? "tabel-pilih" : ""}`}>
          <thead>
            <tr>
              {bisa && (
                <th className="pick">
                  <input
                    type="checkbox"
                    aria-label="Pilih semua kegiatan di halaman ini"
                    checked={semuaHal}
                    ref={(el) => {
                      if (el) el.indeterminate = sebagianHal;
                    }}
                    onChange={toggleHal}
                    disabled={halIni.length === 0}
                  />
                </th>
              )}
              <KepalaKegiatan />
              <th>{labelKolom}</th>
            </tr>
          </thead>
          <tbody>
            {baris.length === 0 ? (
              <EmptyRow cols={kolom}>
                {menunggu.length === 0
                  ? K.kosong
                  : sumber.length === 0
                    ? `Tidak ada kegiatan ${tab} yang menunggu ${K.proses}.`
                    : "Tidak ada kegiatan yang cocok dengan filter."}
              </EmptyRow>
            ) : (
              halIni.map((k) => {
                const cek = pilih.has(k.id);
                return (
                  <tr key={k.id} className={bisa ? `bisa ${cek ? "dipilih" : ""}` : undefined} onClick={bisa ? () => toggle(k.id) : undefined}>
                    {bisa && (
                      <td className="pick">
                        <input
                          type="checkbox"
                          checked={cek}
                          onChange={() => toggle(k.id)}
                          onClick={(e) => e.stopPropagation()}
                          aria-label={`Pilih ${k.id} ${k.uraian}`}
                        />
                      </td>
                    )}
                    <SelKegiatan k={k} />
                    <td data-label={labelKolom}>
                      {cair ? (
                        <>
                          <span className="num">{tanggal(k.tanggal)}</span>
                          <span className="oleh">oleh {infoPengguna(k.dibuatOleh).nama}</span>
                        </>
                      ) : (
                        <InfoPencairan k={k} />
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
          {baris.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={JUMLAH_KOLOM_KEGIATAN - 1 + (bisa ? 1 : 0)}>
                  Total {jml(baris.length)} kegiatan
                  {hal.jumlahHalaman > 1 && <span className="note"> (semua halaman)</span>}
                </td>
                <td className="r num">{rupiah(total)}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <Paginasi halaman={hal.halaman} jumlahHalaman={hal.jumlahHalaman} total={baris.length} ukuran={hal.ukuran} satuan="kegiatan" onPindah={hal.pindah} />

      {bisa && (
        <div className={`pickbar ${terpilih.length ? "aktif" : ""}`}>
          <div>
            <b>{terpilih.length ? `${jml(terpilih.length)} kegiatan dipilih` : "Belum ada kegiatan dipilih"}</b>
            <span className="num">
              {terpilih.length ? `${rupiah(totalNilai(terpilih))}${campur ? ` · ${campur}` : ""}` : `Centang kegiatan yang akan ${K.kata}`}
            </span>
          </div>
          <div className="tbar">
            {terpilih.length > 0 ? (
              <button type="button" className="btn soft sm" onClick={() => setDipilih([])}>
                Batal pilih
              </button>
            ) : (
              baris.length > 0 && (
                <button type="button" className="btn soft sm" onClick={() => setDipilih(baris.map((k) => k.id))}>
                  Pilih semua ({jml(baris.length)})
                </button>
              )
            )}
            <button type="button" className="btn acc sm" disabled={terpilih.length === 0} onClick={onRekap}>
              <Icon name={K.ikon} />
              {K.tombol}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

/** Nomor, jenis, dan tanggal rekap pencairan sebuah kegiatan */
export function InfoPencairan({ k }: { k: Kegiatan }) {
  if (!k.pencairan) return <span className="note">—</span>;
  return (
    <span className="info-rekap">
      <span className="mono">{k.pencairan.nomor}</span>
      <span className="info-rekap-sub">
        <Badge tone={TONE_JENIS_BAYAR[k.pencairan.jenis]}>{k.pencairan.jenis}</Badge>
        {tanggal(k.pencairan.tanggal)}
      </span>
    </span>
  );
}

/* =========================================================
   Form cairkan / sahkan (satu rekap per sumber dana)
   ========================================================= */
interface IsianDana {
  jenisBayar: JenisPencairan;
  referensi: string;
}

function FormRekap({
  jenis,
  isi,
  onClose,
  onSelesai,
}: {
  jenis: JenisRekap;
  isi: Kegiatan[];
  onClose: () => void;
  onSelesai: (hasil: Rekap[]) => void;
}) {
  const K = KONFIG[jenis];
  const cair = jenis === "pencairan";
  const { buatRekap, toast } = useStore();
  const grup = DANA.map((d) => ({ dana: d, isi: isi.filter((k) => k.dana === d) })).filter((g) => g.isi.length > 0);
  const banyak = grup.length > 1;
  // Pengesahan tidak boleh bertanggal sebelum tanggal pencairan terakhir kegiatan terpilih
  const minTanggal = cair ? "" : isi.reduce((m, k) => (k.pencairan && k.pencairan.tanggal > m ? k.pencairan.tanggal : m), "");
  const [tgl, setTgl] = useState(() => {
    const h = hariIni();
    return minTanggal && h < minTanggal ? minTanggal : h;
  });
  // Kwitansi umumnya dibayar lewat GU; kontrak/honor/gaji/perjadin lewat LS
  const [isian, setIsian] = useState<Record<Dana, IsianDana>>(() => {
    const awal = {} as Record<Dana, IsianDana>;
    for (const d of DANA) {
      const xs = isi.filter((k) => k.dana === d);
      awal[d] = { jenisBayar: xs.length > 0 && xs.every((k) => k.jenisDokumen === "Kwitansi") ? "GU" : "LS", referensi: "" };
    }
    return awal;
  });
  const [catatan, setCatatan] = useState("");
  const atur = (d: Dana, ubah: Partial<IsianDana>) => setIsian((prev) => ({ ...prev, [d]: { ...prev[d], ...ubah } }));

  const simpan = async () => {
    if (!tgl) {
      toast(`Isi ${K.labelTanggal.toLowerCase()}`);
      return;
    }
    if (minTanggal && tgl < minTanggal) {
      toast(`Tanggal pengesahan tidak boleh sebelum tanggal pencairan (${tanggal(minTanggal)})`);
      return;
    }
    const hasil: Rekap[] = [];
    for (const g of grup) {
      const r = await buatRekap(
        jenis,
        g.isi.map((k) => k.id),
        { tanggal: tgl, jenisBayar: cair ? isian[g.dana].jenisBayar : undefined, referensi: isian[g.dana].referensi, catatan },
      );
      if (!r) break; // pesan galat sudah ditampilkan; rekap yang sudah terbentuk tetap tersimpan
      hasil.push(r);
    }
    if (hasil.length === 0) return;
    if (hasil.length === grup.length) {
      const n = jumlah(hasil.map((r) => r.jumlah));
      toast(`${jml(n)} kegiatan ${K.kata} pada ${hasil.map((r) => r.nomor).join(" dan ")}`);
    }
    onSelesai(hasil);
  };

  const isianJenis = (d: Dana) => (
    <select value={isian[d].jenisBayar} onChange={(e) => atur(d, { jenisBayar: e.target.value as JenisPencairan })}>
      {JENIS_PENCAIRAN.map((j) => (
        <option key={j.value} value={j.value}>
          {j.label}
        </option>
      ))}
    </select>
  );
  const isianRef = (d: Dana) => (
    <input value={isian[d].referensi} maxLength={100} onChange={(e) => atur(d, { referensi: e.target.value })} placeholder={K.contohRef} />
  );

  return (
    <Modal
      title={`${K.tombol} ${jml(isi.length)} kegiatan${banyak ? "" : ` ${grup[0].dana}`}`}
      description={
        banyak
          ? `Kegiatan terpilih dibagi menjadi ${grup.length} rekap ${K.proses}, satu untuk setiap sumber dana. Setelah ${K.kata}, kegiatan pindah ke Riwayat${cair ? " dan masuk Daftar Pengesahan" : ""}.`
          : `Kegiatan terpilih menjadi satu rekap ${K.proses} dan pindah ke Riwayat${cair ? ", lalu masuk Daftar Pengesahan" : ""}.`
      }
      submitLabel={K.tombol}
      onSubmit={simpan}
      onClose={onClose}
    >
      <Field label={K.labelTanggal} full={banyak}>
        <input type="date" value={tgl} min={minTanggal || undefined} onChange={(e) => setTgl(e.target.value)} />
      </Field>
      {!banyak &&
        (cair ? (
          <>
            <Field label="Jenis pembayaran">{isianJenis(grup[0].dana)}</Field>
            <Field label={K.labelRef} full>
              {isianRef(grup[0].dana)}
            </Field>
          </>
        ) : (
          <Field label={K.labelRef}>{isianRef(grup[0].dana)}</Field>
        ))}
      {banyak &&
        grup.map((g) => (
          <div className="full grup-rekap" key={g.dana}>
            <h4>
              <BadgeDana dana={g.dana} />
              <span>
                {jml(g.isi.length)} kegiatan · <b className="num">{rupiah(totalNilai(g.isi))}</b>
              </span>
            </h4>
            {cair && <Field label="Jenis pembayaran">{isianJenis(g.dana)}</Field>}
            <Field label={K.labelRef} full={!cair}>
              {isianRef(g.dana)}
            </Field>
          </div>
        ))}
      <Field label="Catatan (opsional)" full>
        <textarea rows={2} maxLength={500} value={catatan} onChange={(e) => setCatatan(e.target.value)} placeholder={K.contohCatatan} />
      </Field>
      <div className="full ringkas">
        {grup.map((g) => (
          <div key={g.dana} className="ringkas-grup">
            {banyak && (
              <div className="ringkas-kepala">
                <span>{NAMA_DANA[g.dana]}</span>
                <b className="num">{rupiah(totalNilai(g.isi))}</b>
              </div>
            )}
            {g.isi.map((k) => (
              <div key={k.id}>
                <span>{k.uraian}</span>
                <b className="num">{rupiah(k.nilai)}</b>
              </div>
            ))}
          </div>
        ))}
        <div className="total">
          <span>Total {K.proses}</span>
          <b className="num">{rupiah(totalNilai(isi))}</b>
        </div>
      </div>
    </Modal>
  );
}

/* =========================================================
   Riwayat: per kegiatan (histori kegiatan yang sudah diproses) atau per rekap
   ========================================================= */
function RiwayatRekap({ jenis, daftar, bisa, baru }: { jenis: JenisRekap; daftar: Rekap[]; bisa: boolean; baru: string[] }) {
  const K = KONFIG[jenis];
  const cair = jenis === "pencairan";
  const { kegiatan, rekap: semuaRekap, infoPengguna, namaUnit } = useStore();
  const [mode, setMode] = useState<ModeRiwayat>("kegiatan");
  const [dana, setDana] = useState<FilterDana>("Semua");
  const [bayar, setBayar] = useState<FilterBayar>("Semua");
  const [cari, setCari] = useState("");
  const [buka, setBuka] = useState<Set<string>>(() => new Set(baru));
  const [dibatalkan, setDibatalkan] = useState<Rekap | null>(null);

  /** nomor rekap → data rekap (pencairan & pengesahan) untuk nomor SP2D / dokumen pengesahan */
  const petaRekap = useMemo(() => new Map(semuaRekap.map((r) => [`${r.jenisRekap}:${r.nomor}`, r])), [semuaRekap]);
  const nomorDari = (k: Kegiatan) => (cair ? k.pencairan?.nomor : k.pengesahan?.nomor);

  // Kegiatan per nomor rekap (untuk tampilan per rekap)
  const isi = useMemo(() => {
    const peta = new Map<string, Kegiatan[]>();
    for (const k of kegiatan) {
      const nomor = cair ? k.pencairan?.nomor : k.pengesahan?.nomor;
      if (!nomor) continue;
      if (!peta.has(nomor)) peta.set(nomor, []);
      peta.get(nomor)!.push(k);
    }
    for (const xs of peta.values()) xs.sort((a, b) => a.id.localeCompare(b.id));
    return peta;
  }, [kegiatan, cair]);

  // Histori kegiatan: terbaru di atas
  const riwayatKeg = useMemo(() => {
    const info = (k: Kegiatan) => (cair ? k.pencairan : k.pengesahan)!;
    return kegiatan
      .filter((k) => (cair ? k.pencairan : k.pengesahan))
      .sort((a, b) => info(b).tanggal.localeCompare(info(a).tanggal) || info(b).nomor.localeCompare(info(a).nomor) || a.id.localeCompare(b.id));
  }, [kegiatan, cair]);

  const q = cari.trim().toLowerCase();
  const barisKeg = useMemo(
    () =>
      riwayatKeg.filter(
        (k) =>
          (dana === "Semua" || k.dana === dana) &&
          (bayar === "Semua" || k.pencairan?.jenis === bayar) &&
          (!q ||
            [
              k.id,
              k.uraian,
              k.noDokumen,
              k.penyedia,
              k.mak,
              namaUnit(k.unit),
              k.pencairan?.nomor ?? "",
              k.pengesahan?.nomor ?? "",
              k.pencairan ? petaRekap.get(`pencairan:${k.pencairan.nomor}`)?.referensi ?? "" : "",
              k.pengesahan ? petaRekap.get(`pengesahan:${k.pengesahan.nomor}`)?.referensi ?? "" : "",
            ]
              .join(" ")
              .toLowerCase()
              .includes(q)),
      ),
    [riwayatKeg, dana, bayar, q, namaUnit, petaRekap],
  );
  const barisRekap = useMemo(
    () =>
      daftar.filter(
        (r) =>
          (dana === "Semua" || r.dana === dana) &&
          (bayar === "Semua" || r.jenisBayar === bayar) &&
          (!q ||
            [r.nomor, r.referensi ?? "", r.catatan ?? "", infoPengguna(r.dibuatOleh).nama, ...(isi.get(r.nomor) ?? []).flatMap((k) => [k.id, k.uraian, k.noDokumen, k.penyedia])]
              .join(" ")
              .toLowerCase()
              .includes(q)),
      ),
    [daftar, dana, bayar, q, isi, infoPengguna],
  );

  const halK = useHalaman(barisKeg);
  const halR = useHalaman(barisRekap);
  const awal = () => {
    halK.awal();
    halR.awal();
  };
  const saring =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      awal();
    };
  const adaFilter = dana !== "Semua" || bayar !== "Semua" || cari !== "";
  const reset = () => {
    setDana("Semua");
    setBayar("Semua");
    setCari("");
    awal();
  };
  const toggle = (nomor: string) =>
    setBuka((prev) => {
      const s = new Set(prev);
      if (s.has(nomor)) s.delete(nomor);
      else s.add(nomor);
      return s;
    });
  /** Dari tabel kegiatan: buka rekapnya di tampilan per rekap */
  const lihatRekap = (nomor: string) => {
    setMode("rekap");
    setDana("Semua");
    setBayar("Semua");
    setCari(nomor);
    setBuka((prev) => new Set(prev).add(nomor));
    awal();
  };

  const totalKeg = totalNilai(barisKeg);

  return (
    <section className="panel ada-paginasi" ref={mode === "kegiatan" ? halK.ref : halR.ref}>
      <div className="ph">
        <div>
          <h3>{K.riwayat}</h3>
          <p className="sub">
            {mode === "kegiatan"
              ? `${jml(barisKeg.length)} kegiatan ${K.kata} · total ${rupiah(totalKeg)}`
              : `${jml(barisRekap.length)} rekap · ${jml(jumlah(barisRekap.map((r) => r.jumlah)))} kegiatan · total ${rupiah(jumlah(barisRekap.map((r) => r.total)))}`}
          </p>
        </div>
        <div className="tbar filter-kegiatan">
          <div className="seg seg-sm" role="group" aria-label="Tampilan riwayat">
            <button type="button" className={mode === "kegiatan" ? "on" : ""} aria-pressed={mode === "kegiatan"} onClick={() => setMode("kegiatan")}>
              Per kegiatan
            </button>
            <button type="button" className={mode === "rekap" ? "on" : ""} aria-pressed={mode === "rekap"} onClick={() => setMode("rekap")}>
              Per rekap
            </button>
          </div>
          <Saring<FilterDana>
            label="Sumber dana"
            value={dana}
            onChange={saring(setDana)}
            opsi={[{ value: "Semua", label: "Semua dana" }, ...DANA.map((d) => ({ value: d, label: d }))]}
          />
          {cair && (
            <Saring<FilterBayar>
              label="Jenis pembayaran"
              value={bayar}
              onChange={saring(setBayar)}
              opsi={[{ value: "Semua", label: "Semua jenis" }, ...JENIS_PENCAIRAN.map((j) => ({ value: j.value, label: j.value }))]}
            />
          )}
          <SearchBox
            id={`${jenis}-riwayat-cari`}
            value={cari}
            onChange={saring(setCari)}
            placeholder={mode === "kegiatan" ? "Cari kegiatan, dokumen, nomor rekap" : `Cari nomor rekap, ${cair ? "SP2D" : "dokumen"}, atau kegiatan`}
          />
          {adaFilter && (
            <button type="button" className="btn soft sm" onClick={reset}>
              <Icon name="close" />
              Reset
            </button>
          )}
        </div>
      </div>

      {mode === "kegiatan" ? (
        <>
          <div className="tw stack">
            <table className="tabel-kegiatan">
              <thead>
                <tr>
                  <KepalaKegiatan />
                  <th>Pencairan</th>
                  <th>Pengesahan</th>
                </tr>
              </thead>
              <tbody>
                {barisKeg.length === 0 ? (
                  <EmptyRow cols={JUMLAH_KOLOM_KEGIATAN + 2}>
                    {riwayatKeg.length === 0
                      ? `Belum ada kegiatan yang ${K.kata}. Kegiatan masuk ke sini setelah dicentang di Daftar lalu ${K.kata}.`
                      : "Tidak ada kegiatan yang cocok dengan filter."}
                  </EmptyRow>
                ) : (
                  halK.tampil.map((k) => {
                    const nomor = nomorDari(k)!;
                    const sorot = baru.includes(nomor);
                    const rc = k.pencairan ? petaRekap.get(`pencairan:${k.pencairan.nomor}`) : undefined;
                    const rs = k.pengesahan ? petaRekap.get(`pengesahan:${k.pengesahan.nomor}`) : undefined;
                    return (
                      <tr key={k.id} className={sorot ? "baru" : undefined}>
                        <SelKegiatan k={k} />
                        <td data-label="Pencairan">
                          {k.pencairan && (
                            <SelRekap
                              nomor={k.pencairan.nomor}
                              tgl={k.pencairan.tanggal}
                              jenisBayar={k.pencairan.jenis}
                              referensi={rc?.referensi}
                              baru={cair && sorot}
                              onBuka={cair ? lihatRekap : undefined}
                            />
                          )}
                        </td>
                        <td data-label="Pengesahan">
                          {k.pengesahan ? (
                            <SelRekap
                              nomor={k.pengesahan.nomor}
                              tgl={k.pengesahan.tanggal}
                              referensi={rs?.referensi}
                              baru={!cair && sorot}
                              onBuka={cair ? undefined : lihatRekap}
                            />
                          ) : (
                            <Status tone="w">Menunggu pengesahan</Status>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              {barisKeg.length > 0 && (
                <tfoot>
                  <tr>
                    <td colSpan={JUMLAH_KOLOM_KEGIATAN - 1}>
                      Total {jml(barisKeg.length)} kegiatan
                      {halK.jumlahHalaman > 1 && <span className="note"> (semua halaman)</span>}
                    </td>
                    <td className="r num">{rupiah(totalKeg)}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          <Paginasi halaman={halK.halaman} jumlahHalaman={halK.jumlahHalaman} total={barisKeg.length} ukuran={halK.ukuran} satuan="kegiatan" onPindah={halK.pindah} />
        </>
      ) : (
        <>
          {barisRekap.length === 0 ? (
            <div className="rekap-kosong">
              <Icon name="history" />
              <b>{daftar.length === 0 ? `Belum ada rekap ${K.proses}` : "Tidak ada rekap yang cocok"}</b>
              <p>
                {daftar.length === 0
                  ? `Rekap terbentuk saat kegiatan di Daftar dicentang lalu ${K.kata}.`
                  : "Ubah atau reset filter untuk melihat rekap lainnya."}
              </p>
            </div>
          ) : (
            <div className="rekap-daftar">
              {halR.tampil.map((r) => (
                <KartuRekap
                  key={r.nomor}
                  r={r}
                  jenis={jenis}
                  dok={isi.get(r.nomor) ?? []}
                  terbuka={buka.has(r.nomor)}
                  baru={baru.includes(r.nomor)}
                  bisa={bisa}
                  onToggle={() => toggle(r.nomor)}
                  onBatal={() => setDibatalkan(r)}
                />
              ))}
            </div>
          )}
          <Paginasi halaman={halR.halaman} jumlahHalaman={halR.jumlahHalaman} total={barisRekap.length} ukuran={halR.ukuran} satuan="rekap" onPindah={halR.pindah} />
        </>
      )}

      {dibatalkan && <KonfirmasiBatal r={dibatalkan} jenis={jenis} onClose={() => setDibatalkan(null)} />}
    </section>
  );
}

/** Sel nomor rekap di tabel riwayat: nomor (bisa diklik), jenis, tanggal, nomor referensi */
function SelRekap({
  nomor,
  tgl,
  jenisBayar,
  referensi,
  baru,
  onBuka,
}: {
  nomor: string;
  tgl: string;
  jenisBayar?: JenisPencairan;
  referensi?: string;
  baru?: boolean;
  onBuka?: (nomor: string) => void;
}) {
  return (
    <span className="info-rekap">
      {onBuka ? (
        <button
          type="button"
          className="doc-chip rapat"
          title={`Lihat rekap ${nomor}`}
          onClick={(e) => {
            e.stopPropagation();
            onBuka(nomor);
          }}
        >
          {nomor}
        </button>
      ) : (
        <span className="mono">{nomor}</span>
      )}
      <span className="info-rekap-sub">
        {jenisBayar && <Badge tone={TONE_JENIS_BAYAR[jenisBayar]}>{jenisBayar}</Badge>}
        {tanggal(tgl)}
        {baru && <span className="badge g">Baru</span>}
      </span>
      {referensi && <span className="info-rekap-ref">No. {referensi}</span>}
    </span>
  );
}

function KartuRekap({
  r,
  jenis,
  dok,
  terbuka,
  baru,
  bisa,
  onToggle,
  onBatal,
}: {
  r: Rekap;
  jenis: JenisRekap;
  dok: Kegiatan[];
  terbuka: boolean;
  baru: boolean;
  bisa: boolean;
  onToggle: () => void;
  onBatal: () => void;
}) {
  const K = KONFIG[jenis];
  const cair = jenis === "pencairan";
  const { infoPengguna } = useStore();
  const oleh = infoPengguna(r.dibuatOleh);
  const idIsi = `isi-${r.nomor}`;
  // Rekap pencairan: berapa kegiatannya yang sudah disahkan
  const disahkan = cair ? dok.filter((k) => k.pengesahan) : [];
  const nomorSah = [...new Set(disahkan.map((k) => k.pengesahan!.nomor))];
  const terkunci = cair && disahkan.length > 0;

  return (
    <article className={`rekap ${terbuka ? "buka" : ""} ${baru ? "baru" : ""}`}>
      <button type="button" className="rekap-kepala" aria-expanded={terbuka} aria-controls={idIsi} onClick={onToggle}>
        <span className="rk-nomor">
          <b className="mono">{r.nomor}</b>
          <small>
            {tanggal(r.tanggal)}
            {baru && <span className="badge g">Baru</span>}
          </small>
        </span>
        <span className="rk-badge">
          <BadgeDana dana={r.dana} />
          {r.jenisBayar && <Badge tone={TONE_JENIS_BAYAR[r.jenisBayar]}>{r.jenisBayar}</Badge>}
        </span>
        <span className="rk-sel sempit">
          <small>Kegiatan</small>
          <b className="num">{jml(r.jumlah)}</b>
        </span>
        <span className="rk-sel">
          <small>Total</small>
          <b className="num">{rupiah(r.total)}</b>
        </span>
        <span className="rk-sel">
          <small>{K.refSingkat}</small>
          <b className={r.referensi ? "mono" : "kosong"}>{r.referensi ?? "—"}</b>
        </span>
        <span className="rk-sel">
          <small>Dibuat oleh</small>
          <b>{oleh.nama}</b>
          <small>{tanggalJam(r.dibuatPada)}</small>
        </span>
        {cair && (
          <span className="rk-status">
            {dok.length > 0 && disahkan.length === dok.length ? (
              <Status tone="g">Disahkan semua</Status>
            ) : disahkan.length > 0 ? (
              <Status tone="i">
                {jml(disahkan.length)}/{jml(dok.length)} disahkan
              </Status>
            ) : (
              <Status tone="w">Menunggu pengesahan</Status>
            )}
          </span>
        )}
        <span className="rekap-chev" aria-hidden="true">
          <Icon name="chevron" />
        </span>
      </button>

      {terbuka && (
        <div className="rekap-isi" id={idIsi}>
          {r.catatan && (
            <p className="rekap-catatan">
              <Icon name="info" />
              <span>{r.catatan}</span>
            </p>
          )}
          <div className="tw stack">
            <table className="tabel-kegiatan">
              <thead>
                <tr>
                  <KepalaKegiatan />
                  <th>{cair ? "Pengesahan" : "Pencairan"}</th>
                </tr>
              </thead>
              <tbody>
                {dok.length === 0 ? (
                  <EmptyRow cols={JUMLAH_KOLOM_KEGIATAN + 1}>Rincian kegiatan rekap ini tidak ditemukan.</EmptyRow>
                ) : (
                  dok.map((k) => (
                    <tr key={k.id}>
                      <SelKegiatan k={k} />
                      <td data-label={cair ? "Pengesahan" : "Pencairan"}>
                        {cair ? (
                          k.pengesahan ? (
                            <span className="info-rekap">
                              <Status tone="g">Disahkan</Status>
                              <span className="info-rekap-sub">
                                <span className="mono">{k.pengesahan.nomor}</span> · {tanggal(k.pengesahan.tanggal)}
                              </span>
                            </span>
                          ) : (
                            <Status tone="w">Menunggu pengesahan</Status>
                          )
                        ) : (
                          <InfoPencairan k={k} />
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {dok.length > 0 && (
                <tfoot>
                  <tr>
                    <td colSpan={JUMLAH_KOLOM_KEGIATAN - 1}>Total {jml(dok.length)} kegiatan</td>
                    <td className="r num">{rupiah(totalNilai(dok))}</td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          {bisa && (
            <div className="rekap-aksi">
              <span className="note">
                {terkunci
                  ? `Tidak bisa dibatalkan karena sebagian kegiatan sudah disahkan (${nomorSah.join(", ")}). Batalkan rekap pengesahannya terlebih dahulu.`
                  : `Bila rekap keliru, batalkan agar kegiatannya kembali ke ${K.daftar}.`}
              </span>
              <button type="button" className="btn danger sm" disabled={terkunci} onClick={onBatal}>
                <Icon name="close" />
                Batalkan rekap
              </button>
            </div>
          )}
        </div>
      )}
    </article>
  );
}

/* ---------- Konfirmasi batal rekap (wajib alasan, tercatat di Riwayat Aktivitas) ---------- */
function KonfirmasiBatal({ r, jenis, onClose }: { r: Rekap; jenis: JenisRekap; onClose: () => void }) {
  const K = KONFIG[jenis];
  const { batalRekap, toast } = useStore();
  const [alasan, setAlasan] = useState("");

  return (
    <Modal
      title={`Batalkan ${r.nomor}?`}
      description={`${jml(r.jumlah)} kegiatan dalam rekap ini kembali ke ${K.daftar}. Nomor ${r.nomor} tidak dipakai lagi; pembatalan dan alasannya tercatat di Riwayat Aktivitas.`}
      submitLabel="Batalkan rekap"
      bahaya
      onSubmit={async () => {
        if (alasan.trim().length < 5) {
          toast("Tuliskan alasan pembatalan (minimal 5 karakter)");
          return;
        }
        if (!(await batalRekap(jenis, r.nomor, alasan))) return;
        toast(`${r.nomor} dibatalkan · ${jml(r.jumlah)} kegiatan kembali ke ${K.daftar}`);
        onClose();
      }}
      onClose={onClose}
    >
      <div className="full ringkas">
        <div>
          <span>Tanggal {K.proses}</span>
          <b>{tanggal(r.tanggal)}</b>
        </div>
        <div>
          <span>Sumber dana</span>
          <b>
            {r.dana}
            {r.jenisBayar ? ` · ${r.jenisBayar}` : ""}
          </b>
        </div>
        {r.referensi && (
          <div>
            <span>{K.refSingkat}</span>
            <b className="mono">{r.referensi}</b>
          </div>
        )}
        <div>
          <span>Jumlah kegiatan</span>
          <b>{jml(r.jumlah)}</b>
        </div>
        <div className="total">
          <span>Total</span>
          <b className="num">{rupiah(r.total)}</b>
        </div>
      </div>
      <Field label="Alasan pembatalan" full>
        <textarea rows={2} value={alasan} onChange={(e) => setAlasan(e.target.value)} placeholder="mis. Salah pilih kegiatan, SP2D belum terbit" />
      </Field>
    </Modal>
  );
}
