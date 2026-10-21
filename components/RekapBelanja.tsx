"use client";

/**
 * Rekap berceklist — dipakai bersama modul Pencairan dan Pengesahan.
 *
 * Alur kegiatan (dokumen belanja):
 *   Belanja    : bagian pengadaan mencatat kegiatan                                  → Belum dicairkan
 *   Pencairan  : Operator Pencairan mencentang kegiatan yang dibayarkan ke penyedia /
 *                pihak ketiga (ceklist bar) lalu klik "Cairkan". Kegiatan hilang dari
 *                Daftar Pencairan, pindah ke Riwayat Pencairan, dan masuk Daftar Pengesahan → Dicairkan
 *   Pengesahan : Operator Pengesahan mencentang kegiatan yang sudah dicairkan lalu klik
 *                "Sahkan". Kegiatan pindah ke Riwayat Pengesahan                        → Disahkan
 * Administrator boleh mencairkan maupun mengesahkan. Operator Pencairan dan Operator Pengesahan
 * masing-masing hanya satu akun aktif.
 *
 * Riwayat menampilkan tabel rekapan (Uraian "Pencairan 01", tanggal, sumber dana, nominal); tombol aksi
 * "Lihat daftar" mengganti tabel itu dengan daftar kegiatan yang sudah dicairkan / disahkan pada rekap tersebut.
 *
 * Sisa anggaran MAK di FA Detail tidak membatasi saat belanja dicatat; batasnya berlaku saat "Sahkan":
 * total kegiatan per MAK ≤ sisa FA Detail aktif − kegiatan yang sudah disahkan sejak FA Detail itu diunggah
 * (form Sahkan menampilkan rinciannya lewat RPC cek_anggaran_pengesahan, database memeriksa ulang).
 *
 * Setiap "Cairkan"/"Sahkan" membentuk rekap bernomor (CAIR-… / SAH-…). Satu rekap berisi satu
 * sumber dana. Tabel dipisah per sumber dana (tombol RM | BLU): Daftar dan Riwayat hanya berisi kegiatan /
 * rekap dana yang dipilih, dan yang dicentang di tabel itu menjadi satu rekap untuk dana tersebut.
 * Rekap yang keliru dapat dibatalkan (wajib alasan) sehingga kegiatannya kembali ke daftar.
 * Database (RPC buat_rekap_* / batal_rekap_*) memeriksa ulang semua aturan ini.
 */
import { useEffect, useMemo, useState } from "react";
import Icon, { type IconName } from "@/components/Icon";
import { KepalaKegiatan, SelKegiatan, kolomKegiatan } from "@/components/KolomKegiatan";
import { useStore } from "@/components/StoreProvider";
import { Badge, BadgeDana, DiTabelLain, EmptyRow, Field, Modal, PageHead, Paginasi, PilihDana, Saring, SearchBox, Status, useHalaman, type Tone } from "@/components/ui";
import type { Izin } from "@/lib/akses";
import { DAFTAR_DANA, JENIS_DOKUMEN, JENIS_PENCAIRAN, NAMA_DANA, jumlah, type Dana } from "@/lib/data";
import { desimal, hariIni, rupiah, rupiahSingkat, tanggal, tanggalJam } from "@/lib/format";
import type { AnggaranMak, JenisDokumen, JenisPencairan, JenisRekap, Kegiatan, Rekap } from "@/lib/types";

type Tampilan = "daftar" | "riwayat";
type FilterDok = "Semua" | JenisDokumen;
type FilterBayar = "Semua" | JenisPencairan;

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
    pelaku: "Pencairan dilakukan oleh Operator Pencairan atau Administrator.",
    labelTanggal: "Tanggal pencairan",
    labelRef: "No. SP2D / SPM (opsional)",
    refSingkat: "No. SP2D / SPM",
    contohRef: "mis. nomor SP2D dari SAKTI",
    contohCatatan: "mis. Pembayaran termin I kontrak pemeliharaan",
    kosong: "Belum ada kegiatan {dana} yang menunggu dicairkan. Kegiatan dicatat bagian pengadaan di modul Belanja.",
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
    pelaku: "Pengesahan dilakukan oleh Operator Pengesahan atau Administrator.",
    labelTanggal: "Tanggal pengesahan",
    labelRef: "No. dokumen pengesahan (opsional)",
    refSingkat: "No. dokumen pengesahan",
    contohRef: "mis. SP3B BLU / SP2B / SPM GU Nihil",
    contohCatatan: "mis. Pengesahan belanja BLU bulan Oktober",
    kosong: "Belum ada kegiatan {dana} yang menunggu disahkan. Kegiatan masuk ke sini setelah dicairkan di modul Pencairan.",
  },
};

const jml = (n: number) => desimal(n, 0);
/** Uraian rekap untuk tabel riwayat: CAIR-2026-0001 → "Pencairan 01", SAH-2026-0012 → "Pengesahan 12" */
export function labelRekap(r: Pick<Rekap, "nomor" | "jenisRekap">): string {
  const urut = Number(r.nomor.split("-").pop());
  return `${r.jenisRekap === "pencairan" ? "Pencairan" : "Pengesahan"} ${Number.isFinite(urut) ? String(urut).padStart(2, "0") : r.nomor}`;
}
const totalNilai = (xs: Kegiatan[]) => jumlah(xs.map((k) => k.nilai));
const lawan = (d: Dana): Dana => (d === "RM" ? "BLU" : "RM");

/* =========================================================
   Halaman modul
   ========================================================= */
export default function RekapBelanja({ jenis }: { jenis: JenisRekap }) {
  const K = KONFIG[jenis];
  const cair = jenis === "pencairan";
  const { kegiatan, rekap, boleh, danaAktif: dana, pilihDana } = useStore();
  // Pencairan: Operator Pencairan; Pengesahan: Operator Pengesahan; Administrator: keduanya
  const bisa = boleh(K.izin);

  // Pencairan: belum dicairkan. Pengesahan: sudah dicairkan, belum disahkan. (kedua sumber dana)
  const menungguSemua = useMemo(() => {
    const xs = kegiatan.filter((k) => (cair ? !k.pencairan : Boolean(k.pencairan) && !k.pengesahan));
    // Pengesahan: kegiatan dari rekap pencairan yang sama diletakkan berdekatan
    return cair ? xs : [...xs].sort((a, b) => b.pencairan!.nomor.localeCompare(a.pencairan!.nomor) || a.id.localeCompare(b.id));
  }, [kegiatan, cair]);
  const rekapSemua = useMemo(
    () => rekap.filter((r) => r.jenisRekap === jenis).sort((a, b) => b.dibuatPada.localeCompare(a.dibuatPada) || b.nomor.localeCompare(a.nomor)),
    [rekap, jenis],
  );
  // Tabel per sumber dana
  const menunggu = useMemo(() => menungguSemua.filter((k) => k.dana === dana), [menungguSemua, dana]);
  const daftarRekap = useMemo(() => rekapSemua.filter((r) => r.dana === dana), [rekapSemua, dana]);
  const kegDana = useMemo(() => kegiatan.filter((k) => k.dana === dana), [kegiatan, dana]);

  const [tampilan, setTampilan] = useState<Tampilan>("daftar");
  const [dipilih, setDipilih] = useState<string[]>([]);
  /** salinan kegiatan terpilih saat form dibuka */
  const [isiForm, setIsiForm] = useState<Kegiatan[] | null>(null);
  /** nomor rekap yang baru dibuat (disorot di Riwayat) */
  const [baru, setBaru] = useState<string[]>([]);

  // Centang berlaku per tabel: hanya kegiatan dana yang sedang dibuka yang ikut dicairkan/disahkan.
  // Centang di tabel dana lain tetap tersimpan; yang sudah tidak menunggu (diproses pengguna lain) diabaikan.
  const terpilih = useMemo(() => {
    const s = new Set(dipilih);
    return menunggu.filter((k) => s.has(k.id));
  }, [menunggu, dipilih]);

  // Ringkasan dana yang dipilih: alur belum dicairkan → dicairkan → disahkan
  const belumCair = kegDana.filter((k) => !k.pencairan);
  const sudahCair = kegDana.filter((k) => k.pencairan);
  const tungguSah = kegDana.filter((k) => k.pencairan && !k.pengesahan);
  const sudahSah = kegDana.filter((k) => k.pengesahan);
  const kartu = cair
    ? [
        { lbl: `Menunggu pencairan · ${dana}`, xs: menunggu, note: `${jml(menunggu.length)} kegiatan` },
        { lbl: "Sudah dicairkan", xs: sudahCair, note: `${jml(sudahCair.length)} kegiatan · ${jml(daftarRekap.length)} rekap` },
        { lbl: "Menunggu pengesahan", xs: tungguSah, note: `${jml(tungguSah.length)} kegiatan` },
        { lbl: "Disahkan", xs: sudahSah, note: `${jml(sudahSah.length)} kegiatan` },
      ]
    : [
        { lbl: `Menunggu pengesahan · ${dana}`, xs: menunggu, note: `${jml(menunggu.length)} kegiatan` },
        { lbl: "Sudah disahkan", xs: sudahSah, note: `${jml(sudahSah.length)} kegiatan · ${jml(daftarRekap.length)} rekap` },
        { lbl: "Belum dicairkan", xs: belumCair, note: `${jml(belumCair.length)} kegiatan di Daftar Pencairan` },
        { lbl: `Total belanja ${dana}`, xs: kegDana, note: `${jml(kegDana.length)} kegiatan` },
      ];

  // Ringkasan di tombol RM | BLU mengikuti tampilan: Daftar → menunggu, Riwayat → rekap
  const infoDana = (d: Dana) => {
    if (tampilan === "daftar") {
      const xs = menungguSemua.filter((k) => k.dana === d);
      return `${jml(xs.length)} menunggu · ${rupiahSingkat(totalNilai(xs))}`;
    }
    const rs = rekapSemua.filter((r) => r.dana === d);
    return `${jml(rs.length)} rekap · ${rupiahSingkat(jumlah(rs.map((r) => r.total)))}`;
  };

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
              {daftarRekap.length > 0 && <span className="count netral">{jml(daftarRekap.length)}</span>}
            </button>
          </div>
        }
      />

      <PilihDana value={dana} onChange={pilihDana} info={{ RM: infoDana("RM"), BLU: infoDana("BLU") }} />

      <div className="stats">
        {kartu.map((c, i) => (
          <div className={`stat ${i === 0 ? "hot" : ""}`} key={c.lbl}>
            <div className="lbl">{c.lbl}</div>
            <div className="big num">{rupiahSingkat(totalNilai(c.xs))}</div>
            <div className="note">{c.note}</div>
          </div>
        ))}
      </div>

      {tampilan === "daftar" ? (
        <DaftarRekap
          jenis={jenis}
          dana={dana}
          menunggu={menunggu}
          menungguLain={menungguSemua.filter((k) => k.dana !== dana)}
          onPindahDana={pilihDana}
          bisa={bisa}
          dipilih={dipilih}
          setDipilih={setDipilih}
          terpilih={terpilih}
          onRekap={() => setIsiForm(terpilih)}
        />
      ) : (
        <RiwayatRekap
          jenis={jenis}
          dana={dana}
          daftar={daftarRekap}
          daftarLain={rekapSemua.filter((r) => r.dana !== dana)}
          onPindahDana={pilihDana}
          bisa={bisa}
          baru={baru}
        />
      )}

      {isiForm && (
        <FormRekap
          jenis={jenis}
          isi={isiForm}
          onClose={() => setIsiForm(null)}
          onSelesai={(hasil) => {
            // hanya centang kegiatan yang sudah diproses yang dilepas; centang di tabel dana lain tetap
            const selesai = new Set(isiForm.map((k) => k.id));
            setDipilih((xs) => xs.filter((id) => !selesai.has(id)));
            setIsiForm(null);
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
  dana,
  menunggu,
  menungguLain,
  onPindahDana,
  bisa,
  dipilih,
  setDipilih,
  terpilih,
  onRekap,
}: {
  jenis: JenisRekap;
  dana: Dana;
  /** kegiatan dana ini yang menunggu */
  menunggu: Kegiatan[];
  /** kegiatan dana lain yang menunggu (untuk ajakan pindah tabel saat mencari) */
  menungguLain: Kegiatan[];
  onPindahDana: (d: Dana) => void;
  bisa: boolean;
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

  // Pilihan unit hanya unit yang punya kegiatan di tabel ini
  const opsiUnit = useMemo(
    () =>
      [...new Set(menunggu.map((k) => k.unit))]
        .map((u) => ({ value: u, label: namaUnit(u) }))
        .sort((a, b) => a.label.localeCompare(b.label, "id")),
    [menunggu, namaUnit],
  );
  const q = cari.trim().toLowerCase();
  const cocokCari = (k: Kegiatan) =>
    (dok === "Semua" || k.jenisDokumen === dok) &&
    (!q || [k.id, k.uraian, k.noDokumen, k.penyedia, k.akun, k.mak, namaUnit(k.unit), k.pencairan?.nomor ?? ""].join(" ").toLowerCase().includes(q));
  const baris = menunggu.filter((k) => (unit === "Semua" || k.unit === unit) && cocokCari(k));

  // 30 kegiatan per halaman; setiap filter berubah kembali ke halaman 1
  const hal = useHalaman(baris);
  const saring =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      hal.awal();
    };
  // Pindah tabel RM ⇄ BLU: unit kerja (pilihannya beda per tabel) dan halaman kembali ke awal
  const [danaTadi, setDanaTadi] = useState(dana);
  if (danaTadi !== dana) {
    setDanaTadi(dana);
    setUnit("Semua");
    hal.awal();
  }
  const adaFilter = dok !== "Semua" || unit !== "Semua" || cari !== "";
  // Hasil pencarian / jenis dokumen yang ada di tabel dana lain (saringan unit kerja tidak dibawa)
  const cocokLain = q || dok !== "Semua" ? menungguLain.filter(cocokCari).length : 0;
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
  const kolom = kolomKegiatan(true) + 1 + (bisa ? 1 : 0);
  const labelKolom = cair ? "Tgl. Dokumen" : "Pencairan";

  return (
    <section className="panel ada-paginasi" ref={hal.ref} aria-label={`${K.daftar} ${dana}`}>
      <div className="ph">
        <div>
          <h3>
            {K.daftar} {dana}
          </h3>
          <p className="sub">
            {jml(baris.length)} kegiatan {NAMA_DANA[dana]} menunggu {K.proses} · total {rupiah(total)}
          </p>
        </div>
        <div className="tbar filter-kegiatan">
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
            ? `Centang kegiatan ${dana} yang akan ${K.kata}, lalu klik ${K.tombol}; kegiatan yang dicentang menjadi satu rekap ${K.proses} ${dana}. Kegiatan yang sudah ${K.kata} pindah ke Riwayat${cair ? " dan masuk Daftar Pengesahan" : ""}.`
            : `Anda dapat melihat daftar dan riwayat. ${K.pelaku}`}
        </span>
      </p>
      <DiTabelLain jumlah={cocokLain} dana={lawan(dana)} satuan="kegiatan" onBuka={() => onPindahDana(lawan(dana))} />

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
              <KepalaKegiatan tanpaDana />
              <th>{labelKolom}</th>
            </tr>
          </thead>
          <tbody>
            {baris.length === 0 ? (
              <EmptyRow cols={kolom}>
                {menunggu.length === 0 ? K.kosong.replace("{dana}", dana) : `Tidak ada kegiatan ${dana} yang cocok dengan filter.`}
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
                    <SelKegiatan k={k} tanpaDana />
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
                <td colSpan={kolomKegiatan(true) - 1 + (bisa ? 1 : 0)}>
                  Total {jml(baris.length)} kegiatan {dana}
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
            <b>{terpilih.length ? `${jml(terpilih.length)} kegiatan ${dana} dipilih` : `Belum ada kegiatan ${dana} dipilih`}</b>
            <span className="num">{terpilih.length ? rupiah(totalNilai(terpilih)) : `Centang kegiatan yang akan ${K.kata}`}</span>
          </div>
          <div className="tbar">
            {terpilih.length > 0 ? (
              <button type="button" className="btn soft sm" onClick={() => setDipilih(dipilih.filter((id) => !menunggu.some((k) => k.id === id)))}>
                Batal pilih
              </button>
            ) : (
              baris.length > 0 && (
                <button type="button" className="btn soft sm" onClick={() => setDipilih([...new Set([...dipilih, ...baris.map((k) => k.id)])])}>
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
      <b className="judul-info-rekap">{labelRekap({ nomor: k.pencairan.nomor, jenisRekap: "pencairan" })}</b>
      <span className="info-rekap-sub">
        <span className="mono">{k.pencairan.nomor}</span>
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

/** Hasil cek sisa anggaran di form Sahkan ("-" = form Cairkan, tidak diperiksa) */
type StatusAnggaran = { status: "-" } | { status: "memuat" } | { status: "siap"; data: AnggaranMak[] } | { status: "gagal"; pesan: string };
/** Sisa anggaran MAK = sisa di FA Detail aktif − kegiatan yang sudah disahkan sejak FA Detail itu diunggah */
const sisaMak = (a: AnggaranMak) => (a.sisaFa ?? 0) - a.terpakai;
const cukup = (a: AnggaranMak) => a.ada && a.usul <= sisaMak(a);

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
  const { buatRekap, cekAnggaran, dataPok, toast } = useStore();
  const grup = DAFTAR_DANA.map((d) => ({ dana: d, isi: isi.filter((k) => k.dana === d) })).filter((g) => g.isi.length > 0);

  // Sahkan: sisa anggaran MAK (FA Detail aktif) diperiksa dulu; tombol terkunci bila ada MAK yang kurang
  const [anggaran, setAnggaran] = useState<StatusAnggaran>(cair ? { status: "-" } : { status: "memuat" });
  useEffect(() => {
    if (cair) return;
    let batal = false;
    void cekAnggaran(isi.map((k) => k.id)).then((h) => {
      if (!batal) setAnggaran(h.ok ? { status: "siap", data: h.data } : { status: "gagal", pesan: h.pesan });
    });
    return () => {
      batal = true;
    };
  }, [cair, isi, cekAnggaran]);
  const kurang = anggaran.status === "siap" ? anggaran.data.filter((a) => !cukup(a)) : [];
  const terkunci = !cair && (anggaran.status === "memuat" || kurang.length > 0);
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
    for (const d of DAFTAR_DANA) {
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
    if (kurang.length > 0) {
      toast(`Sisa anggaran tidak mencukupi untuk ${jml(kurang.length)} MAK`);
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
      toast(`${jml(n)} kegiatan ${K.kata} · ${hasil.map((r) => `${labelRekap(r)} (${r.nomor})`).join(" dan ")}`);
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
      nonaktif={terkunci}
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
      <CekAnggaran anggaran={anggaran} periode={dataPok?.sumber.periode} />
    </Modal>
  );
}

/* ---------- Cek sisa anggaran per MAK (form Sahkan) ---------- */
function CekAnggaran({ anggaran, periode }: { anggaran: StatusAnggaran; periode?: string }) {
  if (anggaran.status === "-") return null;
  // MAK yang kurang ditampilkan paling atas
  const data = anggaran.status === "siap" ? [...anggaran.data].sort((a, b) => Number(cukup(a)) - Number(cukup(b)) || a.mak.localeCompare(b.mak)) : [];
  const kurang = data.filter((a) => !cukup(a));
  return (
    <div className="full cek-anggaran" aria-live="polite">
      <div className="cek-anggaran-kepala">
        <b>Sisa anggaran per MAK</b>
        <span>FA Detail{periode ? ` ${periode}` : ""} dikurangi kegiatan yang sudah disahkan sejak FA Detail itu diunggah</span>
      </div>
      {anggaran.status === "memuat" && <p className="cek-anggaran-info">Memeriksa sisa anggaran…</p>}
      {anggaran.status === "gagal" && (
        <p className="cek-anggaran-info">Sisa anggaran belum bisa ditampilkan ({anggaran.pesan}). Database tetap memeriksanya saat disahkan.</p>
      )}
      {data.length > 0 && (
        <ul className="daftar-anggaran">
          {data.map((a) => {
            const ok = cukup(a);
            const sisa = sisaMak(a);
            return (
              <li key={a.mak} className={ok ? undefined : "kurang"}>
                <div className="da-kepala">
                  <span className="mono">{a.mak}</span>
                  {!a.ada ? (
                    <Status tone="b">Tidak ada di FA Detail</Status>
                  ) : ok ? (
                    <Status tone="g">Cukup</Status>
                  ) : (
                    <Status tone="b">Kurang {rupiah(a.usul - sisa)}</Status>
                  )}
                </div>
                <div className="da-angka">
                  <span>
                    Akan disahkan <b className="num">{rupiah(a.usul)}</b> · {jml(a.jumlah)} kegiatan
                  </span>
                  {a.ada && (
                    <span>
                      Sisa anggaran <b className="num">{rupiah(sisa)}</b>
                    </span>
                  )}
                </div>
                {a.ada && a.terpakai > 0 && (
                  <small>
                    Sisa FA Detail {rupiah(a.sisaFa ?? 0)} − {rupiah(a.terpakai)} sudah disahkan sejak FA Detail diunggah
                  </small>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {kurang.length > 0 && (
        <p className="cek-anggaran-galat">
          <Icon name="lock" />
          <span>
            Sisa anggaran tidak mencukupi untuk {jml(kurang.length)} MAK, sehingga belum bisa disahkan. Hapus centang kegiatan pada MAK tersebut atau unggah
            FA Detail terbaru.
          </span>
        </p>
      )}
    </div>
  );
}

/* =========================================================
   Riwayat: tabel rekapan → tombol aksi menampilkan daftar kegiatan rekap tersebut
   ========================================================= */
function RiwayatRekap({
  jenis,
  dana,
  daftar,
  daftarLain,
  onPindahDana,
  bisa,
  baru,
}: {
  jenis: JenisRekap;
  dana: Dana;
  /** rekap dana ini */
  daftar: Rekap[];
  /** rekap dana lain (untuk ajakan pindah tabel saat mencari) */
  daftarLain: Rekap[];
  onPindahDana: (d: Dana) => void;
  bisa: boolean;
  baru: string[];
}) {
  const K = KONFIG[jenis];
  const cair = jenis === "pencairan";
  const { kegiatan, infoPengguna } = useStore();
  const [bayar, setBayar] = useState<FilterBayar>("Semua");
  const [cari, setCari] = useState("");
  /** nomor rekap yang sedang dibuka (tabel rekapan diganti daftar kegiatannya) */
  const [aktif, setAktif] = useState<string | null>(null);
  const [dibatalkan, setDibatalkan] = useState<Rekap | null>(null);

  // Kegiatan per nomor rekap
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

  const cocok = useMemo(() => {
    const q = cari.trim().toLowerCase();
    return (r: Rekap) =>
      (bayar === "Semua" || r.jenisBayar === bayar) &&
      (!q ||
        [
          labelRekap(r),
          r.nomor,
          r.referensi ?? "",
          r.catatan ?? "",
          infoPengguna(r.dibuatOleh).nama,
          ...(isi.get(r.nomor) ?? []).flatMap((k) => [k.id, k.uraian, k.noDokumen, k.penyedia]),
        ]
          .join(" ")
          .toLowerCase()
          .includes(q));
  }, [bayar, cari, isi, infoPengguna]);
  const baris = useMemo(() => daftar.filter(cocok), [daftar, cocok]);

  const hal = useHalaman(baris);
  const saring =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      hal.awal();
    };
  // Pindah tabel RM ⇄ BLU: kembali ke tabel rekapan halaman pertama
  const [danaTadi, setDanaTadi] = useState(dana);
  if (danaTadi !== dana) {
    setDanaTadi(dana);
    setAktif(null);
    hal.awal();
  }
  const adaFilter = bayar !== "Semua" || cari !== "";
  const cocokLain = adaFilter ? daftarLain.filter(cocok).length : 0;
  const reset = () => {
    setBayar("Semua");
    setCari("");
    hal.awal();
  };
  /** Ganti tampilan: tabel rekapan ⇄ daftar kegiatan satu rekap (layar kembali ke judul panel) */
  const gantiTampilan = (nomor: string | null) => {
    setAktif(nomor);
    const el = hal.ref.current;
    if (el && el.getBoundingClientRect().top < 0) {
      const halus = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      el.scrollIntoView({ behavior: halus ? "smooth" : "auto", block: "start" });
    }
  };

  const rekapAktif = aktif ? daftar.find((r) => r.nomor === aktif) : undefined;
  const labelTgl = cair ? "Tgl. Pencairan" : "Tgl. Pengesahan";
  const labelNominal = cair ? "Nominal Pencairan" : "Nominal Pengesahan";
  const total = jumlah(baris.map((r) => r.total));

  return (
    <section className="panel ada-paginasi" ref={hal.ref} aria-label={`${K.riwayat} ${dana}`}>
      {rekapAktif ? (
        <DetailRekap
          r={rekapAktif}
          jenis={jenis}
          dok={isi.get(rekapAktif.nomor) ?? []}
          bisa={bisa}
          baru={baru.includes(rekapAktif.nomor)}
          onKembali={() => gantiTampilan(null)}
          onBatal={() => setDibatalkan(rekapAktif)}
        />
      ) : (
        <>
          <div className="ph">
            <div>
              <h3>
                {K.riwayat} {dana}
              </h3>
              <p className="sub">
                {jml(baris.length)} rekap {NAMA_DANA[dana]} · {jml(jumlah(baris.map((r) => r.jumlah)))} kegiatan · total {rupiah(total)}
              </p>
            </div>
            <div className="tbar filter-kegiatan">
              {cair && (
                <Saring<FilterBayar>
                  label="Jenis pembayaran"
                  value={bayar}
                  onChange={saring(setBayar)}
                  opsi={[{ value: "Semua", label: "Semua jenis" }, ...JENIS_PENCAIRAN.map((j) => ({ value: j.value, label: j.value }))]}
                />
              )}
              <SearchBox id={`${jenis}-riwayat-cari`} value={cari} onChange={saring(setCari)} placeholder="Cari rekap atau kegiatan" />
              {adaFilter && (
                <button type="button" className="btn soft sm" onClick={reset}>
                  <Icon name="close" />
                  Reset
                </button>
              )}
            </div>
          </div>

          <DiTabelLain jumlah={cocokLain} dana={lawan(dana)} satuan="rekap" onBuka={() => onPindahDana(lawan(dana))} />
          <div className="tw stack">
            <table className="tabel-rekap">
              <thead>
                <tr>
                  <th>Uraian</th>
                  <th>{labelTgl}</th>
                  <th className="r">{labelNominal}</th>
                  <th className="r">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {baris.length === 0 ? (
                  <EmptyRow cols={4}>
                    {daftar.length === 0
                      ? `Belum ada rekap ${K.proses} ${dana}. Rekap terbentuk saat kegiatan di Daftar dicentang lalu ${K.kata}.`
                      : `Tidak ada rekap ${dana} yang cocok dengan filter.`}
                  </EmptyRow>
                ) : (
                  hal.tampil.map((r) => {
                    const dok = isi.get(r.nomor) ?? [];
                    const disahkan = cair ? dok.filter((k) => k.pengesahan).length : 0;
                    const sorot = baru.includes(r.nomor);
                    return (
                      <tr key={r.nomor} className={`bisa-klik ${sorot ? "baru" : ""}`} onClick={() => gantiTampilan(r.nomor)}>
                        <td className="main">
                          <span className="uraian-rekap">
                            <span className="judul-rekap">
                              <b>{labelRekap(r)}</b>
                              {sorot && <span className="badge g">Baru</span>}
                            </span>
                            <small>
                              <span className="mono">{r.nomor}</span> · {jml(r.jumlah)} kegiatan
                              {r.jenisBayar ? ` · ${r.jenisBayar}` : ""}
                              {r.referensi ? ` · No. ${r.referensi}` : ""}
                            </small>
                            {cair && (
                              <span className="status-rekap-baris">
                                {dok.length > 0 && disahkan === dok.length ? (
                                  <Status tone="g">Disahkan semua</Status>
                                ) : disahkan > 0 ? (
                                  <Status tone="i">
                                    {jml(disahkan)}/{jml(dok.length)} disahkan
                                  </Status>
                                ) : (
                                  <Status tone="w">Menunggu pengesahan</Status>
                                )}
                              </span>
                            )}
                          </span>
                        </td>
                        <td className="num" data-label={labelTgl}>
                          {tanggal(r.tanggal)}
                        </td>
                        <td className="r num" data-label={labelNominal}>
                          <b>{rupiah(r.total)}</b>
                        </td>
                        <td className="r aksi-rekap">
                          <button
                            type="button"
                            className="btn soft sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              gantiTampilan(r.nomor);
                            }}
                            aria-label={`Lihat daftar kegiatan ${labelRekap(r)}`}
                          >
                            <Icon name="eye" />
                            Lihat daftar
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              {baris.length > 0 && (
                <tfoot>
                  <tr>
                    <td colSpan={2}>
                      Total {jml(baris.length)} rekap {dana}
                      {hal.jumlahHalaman > 1 && <span className="note"> (semua halaman)</span>}
                    </td>
                    <td className="r num">{rupiah(total)}</td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          <Paginasi halaman={hal.halaman} jumlahHalaman={hal.jumlahHalaman} total={baris.length} ukuran={hal.ukuran} satuan="rekap" onPindah={hal.pindah} />
        </>
      )}

      {dibatalkan && (
        <KonfirmasiBatal
          r={dibatalkan}
          jenis={jenis}
          onClose={() => setDibatalkan(null)}
          onBatal={() => {
            setDibatalkan(null);
            gantiTampilan(null);
          }}
        />
      )}
    </section>
  );
}

/* ---------- Daftar kegiatan dalam satu rekap (menggantikan tabel rekapan) ---------- */
function DetailRekap({
  r,
  jenis,
  dok,
  bisa,
  baru,
  onKembali,
  onBatal,
}: {
  r: Rekap;
  jenis: JenisRekap;
  dok: Kegiatan[];
  bisa: boolean;
  baru: boolean;
  onKembali: () => void;
  onBatal: () => void;
}) {
  const K = KONFIG[jenis];
  const cair = jenis === "pencairan";
  const { infoPengguna } = useStore();
  // Rekap pencairan yang sebagian kegiatannya sudah disahkan tidak boleh dibatalkan
  const disahkan = cair ? dok.filter((k) => k.pengesahan) : [];
  const nomorSah = [...new Set(disahkan.map((k) => k.pengesahan!.nomor))];
  const terkunci = cair && disahkan.length > 0;
  const kolomAkhir = cair ? "Pengesahan" : "Pencairan";

  return (
    <>
      <div className="kembali-rekap">
        <button type="button" className="btn soft sm" onClick={onKembali}>
          <Icon name="chevron" className="kiri" />
          Kembali ke tabel rekapan
        </button>
      </div>
      <div className="ph">
        <div>
          <h3>
            {labelRekap(r)} {baru && <span className="badge g">Baru</span>}
          </h3>
          <p className="sub">
            Daftar kegiatan yang sudah {K.kata} · <span className="mono">{r.nomor}</span> · {jml(r.jumlah)} kegiatan · total {rupiah(r.total)}
          </p>
        </div>
        {bisa && (
          <button type="button" className="btn danger sm" disabled={terkunci} onClick={onBatal} title={terkunci ? "Batalkan rekap pengesahannya terlebih dahulu" : undefined}>
            <Icon name="close" />
            Batalkan rekap
          </button>
        )}
      </div>

      <dl className="info-rekap-detail">
        <div>
          <dt>{K.labelTanggal}</dt>
          <dd>{tanggal(r.tanggal)}</dd>
        </div>
        <div>
          <dt>Sumber dana</dt>
          <dd>
            <BadgeDana dana={r.dana} /> {NAMA_DANA[r.dana as Dana] ?? r.dana}
          </dd>
        </div>
        {r.jenisBayar && (
          <div>
            <dt>Jenis pembayaran</dt>
            <dd>
              <Badge tone={TONE_JENIS_BAYAR[r.jenisBayar]}>{r.jenisBayar}</Badge>
            </dd>
          </div>
        )}
        <div>
          <dt>{K.refSingkat}</dt>
          <dd className={r.referensi ? "mono" : "kosong"}>{r.referensi ?? "—"}</dd>
        </div>
        <div>
          <dt>Dibuat oleh</dt>
          <dd>
            {infoPengguna(r.dibuatOleh).nama}
            <small>{tanggalJam(r.dibuatPada)}</small>
          </dd>
        </div>
        {r.catatan && (
          <div className="lebar">
            <dt>Catatan</dt>
            <dd>{r.catatan}</dd>
          </div>
        )}
      </dl>
      {terkunci && (
        <p className="info-akses">
          <Icon name="lock" />
          <span>
            Rekap ini tidak bisa dibatalkan karena sebagian kegiatannya sudah disahkan ({nomorSah.join(", ")}). Batalkan rekap pengesahannya terlebih
            dahulu.
          </span>
        </p>
      )}

      <div className="tw stack">
        <table className="tabel-kegiatan">
          <thead>
            <tr>
              <KepalaKegiatan tanpaDana />
              <th>{kolomAkhir}</th>
            </tr>
          </thead>
          <tbody>
            {dok.length === 0 ? (
              <EmptyRow cols={kolomKegiatan(true) + 1}>Rincian kegiatan rekap ini tidak ditemukan.</EmptyRow>
            ) : (
              dok.map((k) => (
                <tr key={k.id}>
                  <SelKegiatan k={k} tanpaDana />
                  <td data-label={kolomAkhir}>
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
                <td colSpan={kolomKegiatan(true) - 1}>Total {jml(dok.length)} kegiatan</td>
                <td className="r num">{rupiah(totalNilai(dok))}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </>
  );
}

/* ---------- Konfirmasi batal rekap (wajib alasan, tercatat di Riwayat Aktivitas) ---------- */
function KonfirmasiBatal({ r, jenis, onClose, onBatal }: { r: Rekap; jenis: JenisRekap; onClose: () => void; onBatal: () => void }) {
  const K = KONFIG[jenis];
  const { batalRekap, toast } = useStore();
  const [alasan, setAlasan] = useState("");

  return (
    <Modal
      title={`Batalkan ${labelRekap(r)}?`}
      description={`${jml(r.jumlah)} kegiatan dalam rekap ini kembali ke ${K.daftar}. Nomor ${r.nomor} tidak dipakai lagi; pembatalan dan alasannya tercatat di Riwayat Aktivitas.`}
      submitLabel="Batalkan rekap"
      bahaya
      onSubmit={async () => {
        if (alasan.trim().length < 5) {
          toast("Tuliskan alasan pembatalan (minimal 5 karakter)");
          return;
        }
        if (!(await batalRekap(jenis, r.nomor, alasan))) return;
        toast(`${labelRekap(r)} (${r.nomor}) dibatalkan · ${jml(r.jumlah)} kegiatan kembali ke ${K.daftar}`);
        onBatal();
      }}
      onClose={onClose}
    >
      <div className="full ringkas">
        <div>
          <span>Nomor rekap</span>
          <b className="mono">{r.nomor}</b>
        </div>
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
