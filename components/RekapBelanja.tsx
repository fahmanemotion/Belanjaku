"use client";

/**
 * Rekap berceklist — dipakai bersama modul Pencairan dan Pengesahan.
 *
 * Alur dokumen:
 *   Belanja     : bagian pengadaan mencatat dokumen belanja (status Belum dicairkan)
 *   Pencairan   : Operator Keuangan / Bendahara mencentang belanja lalu klik "Cairkan".
 *                 Belanja terpilih menjadi satu rekap CAIR-…, hilang dari Daftar Pencairan,
 *                 pindah ke detail rekap di Riwayat Pencairan, lalu masuk Daftar Pengesahan.
 *   Pengesahan  : belanja yang sudah dicairkan dicentang lalu klik "Sahkan" → rekap SAH-…
 *                 di Riwayat Pengesahan.
 *
 * Satu rekap hanya untuk satu sumber dana (RM atau BLU), karena itu daftar dipisah per tab RM / BLU.
 * Rekap yang keliru dapat dibatalkan (wajib alasan); belanjanya kembali ke daftar.
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
type Tampilan = "daftar" | "riwayat";
type FilterDok = "Semua" | JenisDokumen;
type FilterDana = "Semua" | Dana;
type FilterBayar = "Semua" | JenisPencairan;

const DANA: Dana[] = ["RM", "BLU"];
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
    subjudul: "Rekap pembayaran belanja dari bagian pengadaan kepada penyedia atau pihak ketiga. Centang belanja, lalu cairkan sekaligus dalam satu rekap.",
    izin: "pencairan.rekap",
    ikon: "wallet",
    tombol: "Cairkan",
    kata: "dicairkan",
    proses: "pencairan",
    daftar: "Daftar Pencairan",
    riwayat: "Riwayat Pencairan",
    labelTanggal: "Tanggal pencairan",
    labelRef: "No. SP2D / SPM (opsional)",
    refSingkat: "No. SP2D / SPM",
    contohRef: "mis. nomor SP2D dari SAKTI",
    contohCatatan: "mis. Pembayaran termin I kontrak pemeliharaan",
    kosong: "Belum ada belanja yang menunggu dicairkan. Dokumen belanja dicatat bagian pengadaan di modul Belanja.",
  },
  pengesahan: {
    judul: "Pengesahan",
    subjudul: "Rekap pengesahan belanja yang sudah dicairkan. Centang belanja, lalu sahkan sekaligus dalam satu rekap.",
    izin: "pengesahan.sahkan",
    ikon: "stamp",
    tombol: "Sahkan",
    kata: "disahkan",
    proses: "pengesahan",
    daftar: "Daftar Pengesahan",
    riwayat: "Riwayat Pengesahan",
    labelTanggal: "Tanggal pengesahan",
    labelRef: "No. dokumen pengesahan (opsional)",
    refSingkat: "No. dokumen pengesahan",
    contohRef: "mis. SP3B BLU / SP2B / SPM GU Nihil",
    contohCatatan: "mis. Pengesahan belanja BLU bulan Oktober",
    kosong: "Belum ada belanja yang menunggu disahkan. Belanja masuk ke sini setelah dicairkan di modul Pencairan.",
  },
};

const jml = (n: number) => desimal(n, 0);
const totalNilai = (xs: Kegiatan[]) => jumlah(xs.map((k) => k.nilai));

/* =========================================================
   Halaman modul
   ========================================================= */
export default function RekapBelanja({ jenis }: { jenis: JenisRekap }) {
  const K = KONFIG[jenis];
  const cair = jenis === "pencairan";
  const { kegiatan, rekap, boleh } = useStore();
  // Hanya Operator Keuangan & Bendahara Pengeluaran yang bisa mencentang dan membuat rekap
  const bisa = boleh(K.izin);

  // Pencairan: belanja belum dicairkan. Pengesahan: sudah dicairkan, belum disahkan.
  const menunggu = useMemo(() => {
    const xs = kegiatan.filter((k) => (cair ? !k.pencairan : Boolean(k.pencairan) && !k.pengesahan));
    // Pengesahan: belanja dari rekap pencairan yang sama diletakkan berdekatan
    return cair ? xs : [...xs].sort((a, b) => b.pencairan!.nomor.localeCompare(a.pencairan!.nomor) || a.id.localeCompare(b.id));
  }, [kegiatan, cair]);
  const selesai = useMemo(() => kegiatan.filter((k) => (cair ? k.pencairan : k.pengesahan)), [kegiatan, cair]);
  const daftarRekap = useMemo(
    () => rekap.filter((r) => r.jenisRekap === jenis).sort((a, b) => b.dibuatPada.localeCompare(a.dibuatPada) || b.nomor.localeCompare(a.nomor)),
    [rekap, jenis],
  );

  const [tampilan, setTampilan] = useState<Tampilan>("daftar");
  const [dana, setDana] = useState<Dana>(() => (menunggu.some((k) => k.dana === "RM") || !menunggu.some((k) => k.dana === "BLU") ? "RM" : "BLU"));
  const [dipilih, setDipilih] = useState<string[]>([]);
  /** salinan belanja terpilih saat form dibuka */
  const [isiForm, setIsiForm] = useState<Kegiatan[] | null>(null);
  /** nomor rekap yang baru dibuat (disorot & dibuka di Riwayat) */
  const [baru, setBaru] = useState<string | null>(null);

  const terpilih = useMemo(() => {
    const s = new Set(dipilih);
    return menunggu.filter((k) => k.dana === dana && s.has(k.id));
  }, [menunggu, dipilih, dana]);

  const gantiDana = (d: Dana) => {
    setDana(d);
    setDipilih([]); // satu rekap = satu sumber dana
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
              Daftar Belanja
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

      <div className="stats">
        <div className="stat hot">
          <div className="lbl">Menunggu {K.proses}</div>
          <div className="big num">{rupiahSingkat(totalNilai(menunggu))}</div>
          <div className="note">{jml(menunggu.length)} belanja</div>
        </div>
        {DANA.map((d) => {
          const xs = menunggu.filter((k) => k.dana === d);
          return (
            <div className="stat" key={d}>
              <div className="lbl">Menunggu · {d}</div>
              <div className="big num">{rupiahSingkat(totalNilai(xs))}</div>
              <div className="note">
                {jml(xs.length)} belanja {NAMA_DANA[d]}
              </div>
            </div>
          );
        })}
        <div className="stat">
          <div className="lbl">Sudah {K.kata}</div>
          <div className="big num">{rupiahSingkat(totalNilai(selesai))}</div>
          <div className="note">
            {jml(selesai.length)} belanja · {jml(daftarRekap.length)} rekap
          </div>
        </div>
      </div>

      {tampilan === "daftar" ? (
        <DaftarRekap
          jenis={jenis}
          menunggu={menunggu}
          bisa={bisa}
          dana={dana}
          gantiDana={gantiDana}
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
          dana={dana}
          isi={isiForm}
          onClose={() => setIsiForm(null)}
          onSelesai={(r) => {
            setIsiForm(null);
            setDipilih([]);
            setBaru(r.nomor);
            setTampilan("riwayat");
          }}
        />
      )}
    </>
  );
}

/* =========================================================
   Daftar belanja yang menunggu (berceklist)
   ========================================================= */
function DaftarRekap({
  jenis,
  menunggu,
  bisa,
  dana,
  gantiDana,
  dipilih,
  setDipilih,
  terpilih,
  onRekap,
}: {
  jenis: JenisRekap;
  menunggu: Kegiatan[];
  bisa: boolean;
  dana: Dana;
  gantiDana: (d: Dana) => void;
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

  const sumber = useMemo(() => menunggu.filter((k) => k.dana === dana), [menunggu, dana]);
  // Pilihan unit hanya unit yang punya belanja di daftar ini
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

  // 30 belanja per halaman; setiap filter berubah kembali ke halaman 1
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
  const hitung = (d: Dana) => menunggu.filter((k) => k.dana === d).length;
  const lain: Dana = dana === "RM" ? "BLU" : "RM";

  return (
    <section className="panel ada-paginasi" ref={hal.ref}>
      <div className="ph">
        <div>
          <h3>{K.daftar}</h3>
          <p className="sub">
            {jml(baris.length)} belanja {dana} menunggu {K.proses} · total {rupiah(total)}
          </p>
        </div>
        <div className="tbar filter-kegiatan">
          <Tabs<Dana>
            label="Sumber dana"
            value={dana}
            onChange={(d) => {
              gantiDana(d);
              setUnit("Semua");
              hal.awal();
            }}
            items={DANA.map((d) => ({ value: d, label: `${d} · ${jml(hitung(d))}` }))}
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
            ? `Centang belanja ${dana}, lalu klik ${K.tombol}. Satu rekap untuk satu sumber dana; belanja yang sudah ${K.kata} pindah ke Riwayat${cair ? " dan masuk Daftar Pengesahan" : ""}.`
            : "Anda dapat melihat daftar dan riwayat. Rekap dilakukan oleh Operator Keuangan atau Bendahara Pengeluaran."}
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
                    aria-label="Pilih semua belanja di halaman ini"
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
                    ? `Tidak ada belanja ${dana} yang menunggu ${K.proses}. Lihat tab ${lain}.`
                    : "Tidak ada belanja yang cocok dengan filter."}
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
                  Total {jml(baris.length)} belanja
                  {hal.jumlahHalaman > 1 && <span className="note"> (semua halaman)</span>}
                </td>
                <td className="r num">{rupiah(total)}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <Paginasi halaman={hal.halaman} jumlahHalaman={hal.jumlahHalaman} total={baris.length} ukuran={hal.ukuran} satuan="belanja" onPindah={hal.pindah} />

      {bisa && (
        <div className={`pickbar ${terpilih.length ? "aktif" : ""}`}>
          <div>
            <b>{terpilih.length ? `${jml(terpilih.length)} belanja ${dana} dipilih` : `Belum ada belanja ${dana} dipilih`}</b>
            <span className="num">{terpilih.length ? rupiah(totalNilai(terpilih)) : `Centang belanja yang akan ${K.kata}`}</span>
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

/** Nomor, jenis, dan tanggal rekap pencairan sebuah belanja */
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
   Form buat rekap
   ========================================================= */
function FormRekap({
  jenis,
  dana,
  isi,
  onClose,
  onSelesai,
}: {
  jenis: JenisRekap;
  dana: Dana;
  isi: Kegiatan[];
  onClose: () => void;
  onSelesai: (r: Rekap) => void;
}) {
  const K = KONFIG[jenis];
  const cair = jenis === "pencairan";
  const { buatRekap, toast } = useStore();
  // Pengesahan tidak boleh bertanggal sebelum tanggal pencairan terakhir belanja terpilih
  const minTanggal = cair ? "" : isi.reduce((m, k) => (k.pencairan && k.pencairan.tanggal > m ? k.pencairan.tanggal : m), "");
  const [tgl, setTgl] = useState(() => {
    const h = hariIni();
    return minTanggal && h < minTanggal ? minTanggal : h;
  });
  // Kwitansi umumnya dibayar lewat GU; kontrak/honor/gaji/perjadin lewat LS
  const [jenisBayar, setJenisBayar] = useState<JenisPencairan>(() => (isi.every((k) => k.jenisDokumen === "Kwitansi") ? "GU" : "LS"));
  const [referensi, setReferensi] = useState("");
  const [catatan, setCatatan] = useState("");

  const simpan = async () => {
    if (!tgl) {
      toast(`Isi ${K.labelTanggal.toLowerCase()}`);
      return;
    }
    if (minTanggal && tgl < minTanggal) {
      toast(`Tanggal pengesahan tidak boleh sebelum tanggal pencairan (${tanggal(minTanggal)})`);
      return;
    }
    const r = await buatRekap(
      jenis,
      isi.map((k) => k.id),
      { tanggal: tgl, jenisBayar: cair ? jenisBayar : undefined, referensi, catatan },
    );
    if (!r) return;
    toast(`${jml(r.jumlah)} belanja ${K.kata} pada ${r.nomor}`);
    onSelesai(r);
  };

  const isianRef = (
    <input value={referensi} maxLength={100} onChange={(e) => setReferensi(e.target.value)} placeholder={K.contohRef} />
  );

  return (
    <Modal
      title={`${K.tombol} ${jml(isi.length)} belanja ${dana}`}
      description={
        cair
          ? "Belanja terpilih menjadi satu rekap pencairan, pindah ke Riwayat Pencairan, lalu masuk Daftar Pengesahan."
          : "Belanja terpilih menjadi satu rekap pengesahan dan pindah ke Riwayat Pengesahan."
      }
      submitLabel={K.tombol}
      onSubmit={simpan}
      onClose={onClose}
    >
      <Field label={K.labelTanggal}>
        <input type="date" value={tgl} min={minTanggal || undefined} onChange={(e) => setTgl(e.target.value)} />
      </Field>
      {cair ? (
        <Field label="Jenis pembayaran">
          <select value={jenisBayar} onChange={(e) => setJenisBayar(e.target.value as JenisPencairan)}>
            {JENIS_PENCAIRAN.map((j) => (
              <option key={j.value} value={j.value}>
                {j.label}
              </option>
            ))}
          </select>
        </Field>
      ) : (
        <Field label={K.labelRef}>{isianRef}</Field>
      )}
      {cair && (
        <Field label={K.labelRef} full>
          {isianRef}
        </Field>
      )}
      <Field label="Catatan (opsional)" full>
        <textarea rows={2} maxLength={500} value={catatan} onChange={(e) => setCatatan(e.target.value)} placeholder={K.contohCatatan} />
      </Field>
      <div className="full ringkas">
        {isi.map((k) => (
          <div key={k.id}>
            <span>{k.uraian}</span>
            <b className="num">{rupiah(k.nilai)}</b>
          </div>
        ))}
        <div className="total">
          <span>
            Total {K.proses} {dana}
          </span>
          <b className="num">{rupiah(totalNilai(isi))}</b>
        </div>
      </div>
    </Modal>
  );
}

/* =========================================================
   Riwayat rekap (detail belanja per rekap)
   ========================================================= */
function RiwayatRekap({ jenis, daftar, bisa, baru }: { jenis: JenisRekap; daftar: Rekap[]; bisa: boolean; baru: string | null }) {
  const K = KONFIG[jenis];
  const cair = jenis === "pencairan";
  const { kegiatan, infoPengguna } = useStore();
  const [dana, setDana] = useState<FilterDana>("Semua");
  const [bayar, setBayar] = useState<FilterBayar>("Semua");
  const [cari, setCari] = useState("");
  const [buka, setBuka] = useState<Set<string>>(() => new Set(baru ? [baru] : []));
  const [dibatalkan, setDibatalkan] = useState<Rekap | null>(null);

  // Belanja per nomor rekap
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

  const baris = useMemo(() => {
    const q = cari.trim().toLowerCase();
    return daftar.filter(
      (r) =>
        (dana === "Semua" || r.dana === dana) &&
        (bayar === "Semua" || r.jenisBayar === bayar) &&
        (!q ||
          [r.nomor, r.referensi ?? "", r.catatan ?? "", infoPengguna(r.dibuatOleh).nama, ...(isi.get(r.nomor) ?? []).flatMap((k) => [k.id, k.uraian, k.noDokumen, k.penyedia])]
            .join(" ")
            .toLowerCase()
            .includes(q)),
    );
  }, [daftar, dana, bayar, cari, isi, infoPengguna]);

  const hal = useHalaman(baris);
  const saring =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      hal.awal();
    };
  const adaFilter = dana !== "Semua" || bayar !== "Semua" || cari !== "";
  const reset = () => {
    setDana("Semua");
    setBayar("Semua");
    setCari("");
    hal.awal();
  };
  const toggle = (nomor: string) =>
    setBuka((prev) => {
      const s = new Set(prev);
      if (s.has(nomor)) s.delete(nomor);
      else s.add(nomor);
      return s;
    });

  return (
    <section className="panel ada-paginasi" ref={hal.ref}>
      <div className="ph">
        <div>
          <h3>{K.riwayat}</h3>
          <p className="sub">
            {jml(baris.length)} rekap · {jml(jumlah(baris.map((r) => r.jumlah)))} belanja · total {rupiah(jumlah(baris.map((r) => r.total)))}
          </p>
        </div>
        <div className="tbar filter-kegiatan">
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
          <SearchBox id={`${jenis}-riwayat-cari`} value={cari} onChange={saring(setCari)} placeholder={`Cari nomor rekap, ${cair ? "SP2D" : "dokumen"}, atau belanja`} />
          {adaFilter && (
            <button type="button" className="btn soft sm" onClick={reset}>
              <Icon name="close" />
              Reset
            </button>
          )}
        </div>
      </div>

      {baris.length === 0 ? (
        <div className="rekap-kosong">
          <Icon name="history" />
          <b>{daftar.length === 0 ? `Belum ada rekap ${K.proses}` : "Tidak ada rekap yang cocok"}</b>
          <p>
            {daftar.length === 0
              ? `Rekap terbentuk saat belanja di Daftar Belanja dicentang lalu ${K.kata}.`
              : "Ubah atau reset filter untuk melihat rekap lainnya."}
          </p>
        </div>
      ) : (
        <div className="rekap-daftar">
          {hal.tampil.map((r) => (
            <KartuRekap
              key={r.nomor}
              r={r}
              jenis={jenis}
              dok={isi.get(r.nomor) ?? []}
              terbuka={buka.has(r.nomor)}
              baru={r.nomor === baru}
              bisa={bisa}
              onToggle={() => toggle(r.nomor)}
              onBatal={() => setDibatalkan(r)}
            />
          ))}
        </div>
      )}
      <Paginasi halaman={hal.halaman} jumlahHalaman={hal.jumlahHalaman} total={baris.length} ukuran={hal.ukuran} satuan="rekap" onPindah={hal.pindah} />

      {dibatalkan && <KonfirmasiBatal r={dibatalkan} jenis={jenis} onClose={() => setDibatalkan(null)} />}
    </section>
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
  // Rekap pencairan: berapa belanjanya yang sudah disahkan
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
          <small>Belanja</small>
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
                  <EmptyRow cols={JUMLAH_KOLOM_KEGIATAN + 1}>Rincian belanja rekap ini tidak ditemukan.</EmptyRow>
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
                    <td colSpan={JUMLAH_KOLOM_KEGIATAN - 1}>Total {jml(dok.length)} belanja</td>
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
                  ? `Tidak bisa dibatalkan karena sebagian belanja sudah disahkan (${nomorSah.join(", ")}). Batalkan rekap pengesahannya terlebih dahulu.`
                  : `Bila rekap keliru, batalkan agar belanjanya kembali ke ${K.daftar}.`}
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
      description={`${jml(r.jumlah)} belanja dalam rekap ini kembali ke ${K.daftar}. Nomor ${r.nomor} tidak dipakai lagi; pembatalan dan alasannya tercatat di Riwayat Aktivitas.`}
      submitLabel="Batalkan rekap"
      bahaya
      onSubmit={async () => {
        if (alasan.trim().length < 5) {
          toast("Tuliskan alasan pembatalan (minimal 5 karakter)");
          return;
        }
        if (!(await batalRekap(jenis, r.nomor, alasan))) return;
        toast(`${r.nomor} dibatalkan · ${jml(r.jumlah)} belanja kembali ke ${K.daftar}`);
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
          <span>Jumlah belanja</span>
          <b>{jml(r.jumlah)}</b>
        </div>
        <div className="total">
          <span>Total</span>
          <b className="num">{rupiah(r.total)}</b>
        </div>
      </div>
      <Field label="Alasan pembatalan" full>
        <textarea rows={2} value={alasan} onChange={(e) => setAlasan(e.target.value)} placeholder="mis. Salah pilih belanja, SP2D belum terbit" />
      </Field>
    </Modal>
  );
}
