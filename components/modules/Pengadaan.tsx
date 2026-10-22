"use client";

/**
 * Modul Pengadaan — alur dokumen Kwitansi (sesuai berkas NODIN_KWITANSI.xlsx):
 *   1. PPK               : Nota Dinas Perintah Pengadaan Barang/Jasa + HPS
 *   2. Pejabat Pengadaan : Surat Pesanan kepada penyedia (pihak ketiga)
 *   3. Pejabat Pengadaan : Nota / Bukti Pembelian
 *   4. PPK               : Kwitansi, BAP & BAST beserta lampirannya → dokumen belanja Kwitansi di Daftar Pencairan
 * Semua peran dapat melihat dan mencetak dokumen; tombol aksi hanya tampil untuk pelaku tahapnya.
 * Satu tahap bisa diubah selama tahap berikutnya belum terbit; tahap terakhir bisa dibatalkan (dengan alasan).
 * Aturan yang sama diperiksa ulang di database (supabase/migrations/20261020090000_pengadaan_kwitansi.sql).
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import Combobox, { type OpsiCombo } from "@/components/Combobox";
import Icon from "@/components/Icon";
import InputNomor, { nomorAwal, nomorLengkap, type NilaiNomor } from "@/components/InputNomor";
import { TONE_BELANJA } from "@/components/modules/Belanja";
import { useStore } from "@/components/StoreProvider";
import {
  TabelBeli,
  TabelHps,
  TabelLampiran,
  barisDariItem,
  barisKosong,
  barisTerisi,
  itemDariBaris,
  pesanSalah,
  salahBarang,
  type BarisBarang,
} from "@/components/TabelBarang";
import { BadgeDana, Dialog, DiTabelLain, EmptyRow, Field, Modal, PageHead, PilihDana, Saring, SearchBox, Status, Tabs, type Tone } from "@/components/ui";
import { akunSesuaiDana, type Dana } from "@/lib/data";
import { hariIni, rupiah, rupiahSingkat, tanggal } from "@/lib/format";
import { akunDariMak } from "@/lib/mak";
import {
  TAHAP,
  dataPejabat,
  dataPenyedia,
  dokumenTahap,
  hitungTotal,
  kurangPejabat,
  kurangPenyedia,
  nilaiPaket,
  polaNomor,
  terbilangRupiah,
  totalBeli,
  totalHps,
  type KodeDokumen,
} from "@/lib/pengadaan";
import type { DataPenyedia, Kegiatan, Paket, TahapPaket } from "@/lib/types";

/** Pratinjau cetak (10 templat dokumen + kop & logo yang tertanam di kode) dimuat terpisah agar halaman tetap ringan */
const muatCetak = () => import("@/components/CetakPengadaan");
const CetakPengadaan = dynamic(muatCetak, {
  ssr: false,
  loading: () => (
    <div className="pratinjau pratinjau-dok" role="status" aria-live="polite">
      <p className="pratinjau-kosong">Menyiapkan dokumen…</p>
    </div>
  ),
});

const TONE_TAHAP: Record<TahapPaket, Tone> = { 1: "w", 2: "i", 3: "p", 4: "g" };
const MENUNGGU: Record<TahapPaket, string> = {
  1: "Menunggu Surat Pesanan",
  2: "Menunggu Nota Pembelian",
  3: "Menunggu Kwitansi dari PPK",
  4: "Masuk Daftar Pencairan",
};

type FilterTahap = "Semua" | "1" | "2" | "3" | "4";
type JenisForm = "nd" | "sp" | "nota" | "kw" | "batal" | "hapus";
type FormAktif = { jenis: JenisForm; id?: string };

/** Siapa boleh menjalankan tahap apa (database memeriksa ulang aturan yang sama) */
function useHakPaket() {
  const { boleh, penggunaAktif } = useStore();
  const admin = penggunaAktif.peran === "Administrator";
  const bisaPpk = boleh("pengadaan.ppk");
  const bisaPp = boleh("pengadaan.pp");
  const ppkPaket = (p: Paket) => bisaPpk && (admin || p.ppkId === penggunaAktif.id);
  const ppPaket = (p: Paket) => bisaPp && (admin || p.ppId === penggunaAktif.id);
  return {
    admin,
    bisaPpk,
    bisaPp,
    ubahNd: (p: Paket) => p.tahap === 1 && ppkPaket(p),
    hapus: (p: Paket) => p.tahap === 1 && ppkPaket(p),
    terbitSp: (p: Paket) => p.tahap === 1 && bisaPp,
    ubahSp: (p: Paket) => p.tahap === 2 && ppPaket(p),
    catatNota: (p: Paket) => p.tahap === 2 && ppPaket(p),
    ubahNota: (p: Paket) => p.tahap === 3 && ppPaket(p),
    terbitKw: (p: Paket) => p.tahap === 3 && ppkPaket(p),
    ubahKw: (p: Paket, k?: Kegiatan) => p.tahap === 4 && ppkPaket(p) && !k?.pencairan,
    batal: (p: Paket, k?: Kegiatan) => (p.tahap === 2 || p.tahap === 3 ? ppPaket(p) : p.tahap === 4 ? ppkPaket(p) && !k?.pencairan : false),
    /** tindakan berikutnya yang menjadi tugas pengguna ini */
    berikut: (p: Paket): { label: string; jenis: JenisForm } | null =>
      p.tahap === 1 && bisaPp
        ? { label: "Terbitkan Surat Pesanan", jenis: "sp" }
        : p.tahap === 2 && ppPaket(p)
          ? { label: "Catat Nota Pembelian", jenis: "nota" }
          : p.tahap === 3 && ppkPaket(p)
            ? { label: "Terbitkan Kwitansi", jenis: "kw" }
            : null,
  };
}

/** Hari ini bila sudah lewat `min` dan masih di tahun anggaran paket; selain itu `min` */
function tanggalBawaan(min: string, tahun: number) {
  const h = hariIni();
  return h >= min && h.startsWith(String(tahun)) ? h : min;
}

export default function Pengadaan() {
  const { paket, kegiatan, pengguna, penggunaAktif, referensi, infoPengguna, namaUnit, namaAkun, danaAktif: dana, pilihDana } = useStore();
  const hak = useHakPaket();
  const [tab, setTab] = useState<FilterTahap>("Semua");
  const [saya, setSaya] = useState<"Semua" | "Saya">("Semua");
  const [cari, setCari] = useState("");
  const [detail, setDetail] = useState<string | null>(null);
  const [form, setForm] = useState<FormAktif | null>(null);
  const [cetak, setCetak] = useState<{ id: string; dokumen: KodeDokumen[] } | null>(null);
  const [dataSaya, setDataSaya] = useState(false);

  // Unduh modul cetak di latar belakang setelah halaman tampil, supaya pratinjau langsung terbuka saat dipakai
  useEffect(() => {
    const t = window.setTimeout(() => void muatCetak().catch(() => undefined), 1500);
    return () => window.clearTimeout(t);
  }, []);

  const cariPaket = (id?: string) => paket.find((x) => x.id === id);
  const belanjaDari = (p: Paket) => (p.pengajuanId ? kegiatan.find((k) => k.id === p.pengajuanId) : undefined);
  const namaPenyedia = (p: Paket) => p.arsip?.penyedia?.nama ?? referensi.penyedia.find((x) => x.id === p.penyediaId)?.nama;

  // Tabel per sumber dana: kartu tahap, tab, dan tabel hanya berisi paket dana yang dipilih
  const lain: Dana = dana === "RM" ? "BLU" : "RM";
  const paketDana = useMemo(() => paket.filter((p) => p.dana === dana), [paket, dana]);
  const cocok = useMemo(() => {
    const q = cari.trim().toLowerCase();
    return (p: Paket) =>
      (tab === "Semua" || String(p.tahap) === tab) &&
      (saya === "Semua" || hak.berikut(p) !== null) &&
      (!q ||
        [p.id, p.pekerjaan, p.mak, p.nd.nomor, p.sp?.nomor, p.kwitansi?.nomor, p.pengajuanId, namaPenyedia(p), namaUnit(p.unit), infoPengguna(p.ppkId).nama, p.ppId ? infoPengguna(p.ppId).nama : ""]
          .join(" ")
          .toLowerCase()
          .includes(q));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, saya, cari, referensi.penyedia, namaUnit, infoPengguna, hak]);
  const baris = useMemo(() => paketDana.filter(cocok), [paketDana, cocok]);

  const perTahap = (t: TahapPaket) => paketDana.filter((p) => p.tahap === t);
  const tugasSaya = paketDana.filter((p) => hak.berikut(p) !== null).length;
  const adaFilter = saya !== "Semua" || cari !== "";
  const cocokLain = adaFilter ? paket.filter((p) => p.dana === lain && cocok(p)).length : 0;
  const nilaiDana = (d: Dana) => paket.filter((p) => p.dana === d).reduce((s, p) => s + nilaiPaket(p), 0);
  const jumlahDana = (d: Dana) => paket.filter((p) => p.dana === d).length;

  // Data penanda tangan akun sendiri (PPK / Pejabat Pengadaan) yang belum diisi
  const profil = pengguna.find((u) => u.id === penggunaAktif.id) ?? penggunaAktif;
  const pejabatSaya = penggunaAktif.peran === "PPK" || penggunaAktif.peran === "Pejabat Pengadaan";
  const kurangSaya = pejabatSaya ? kurangPejabat(dataPejabat(profil), penggunaAktif.peran === "PPK") : [];

  const keterangan = hak.bisaPpk && hak.bisaPp
    ? "Anda dapat menjalankan semua tahap pengadaan."
    : hak.bisaPpk
      ? "Sebagai PPK Anda menerbitkan Nota Dinas & HPS, lalu Kwitansi, BAP & BAST untuk paket Anda."
      : hak.bisaPp
        ? "Sebagai Pejabat Pengadaan Anda menerbitkan Surat Pesanan dan mencatat Nota Pembelian."
        : "Anda dapat memantau dan mencetak dokumen pengadaan.";

  const bukaForm = (jenis: JenisForm, id?: string) => setForm({ jenis, id });
  const p = cariPaket(form?.id);
  const pDetail = cariPaket(detail ?? undefined);
  const pCetak = cariPaket(cetak?.id);

  return (
    <>
      <PageHead
        title="Pengadaan"
        subtitle="Alur dokumen Kwitansi: PPK menerbitkan Nota Dinas & HPS, Pejabat Pengadaan memesan dan membeli dari penyedia, lalu PPK menerbitkan Kwitansi, BAP & BAST untuk pencairan."
        actions={
          <>
            {pejabatSaya && (
              <button type="button" className="btn soft" onClick={() => setDataSaya(true)}>
                <Icon name="edit" />
                Data penanda tangan
              </button>
            )}
            {hak.bisaPpk && (
              <button type="button" className="btn acc" onClick={() => bukaForm("nd")}>
                <Icon name="plus" />
                Buat Nota Dinas
              </button>
            )}
          </>
        }
      />

      {kurangSaya.length > 0 && (
        <p className="peringatan-data" role="status">
          <Icon name="info" />
          <span>
            Data penanda tangan Anda belum lengkap ({kurangSaya.join(", ")}). Isian ini dicetak di bawah nama Anda pada dokumen pengadaan.
          </span>
          <button type="button" className="btn soft sm" onClick={() => setDataSaya(true)}>
            Lengkapi
          </button>
        </p>
      )}

      <PilihDana
        value={dana}
        onChange={(d) => {
          pilihDana(d);
          setDetail(null);
        }}
        info={{
          RM: `${jumlahDana("RM")} paket · ${rupiahSingkat(nilaiDana("RM"))}`,
          BLU: `${jumlahDana("BLU")} paket · ${rupiahSingkat(nilaiDana("BLU"))}`,
        }}
        tugas={
          hak.bisaPpk || hak.bisaPp
            ? {
                RM: paket.filter((p) => p.dana === "RM" && hak.berikut(p) !== null).length,
                BLU: paket.filter((p) => p.dana === "BLU" && hak.berikut(p) !== null).length,
              }
            : undefined
        }
      />

      <ol className="alur-paket" aria-label={`Tahap pengadaan ${dana}`}>
        {TAHAP.map((t) => {
          const xs = perTahap(t.tahap);
          const nilai = xs.reduce((s, x) => s + nilaiPaket(x), 0);
          const cair = t.tahap === 4 ? xs.filter((x) => belanjaDari(x)?.pencairan).length : 0;
          const aktif = tab === String(t.tahap);
          return (
            <li key={t.tahap}>
              <button
                type="button"
                className={`alur-kartu ${aktif ? "on" : ""}`}
                aria-pressed={aktif}
                onClick={() => setTab(aktif ? "Semua" : (String(t.tahap) as FilterTahap))}
              >
                <span className="alur-no">{t.tahap}</span>
                <span className="alur-isi">
                  <small>{t.pelaku}</small>
                  <b>{t.nama}</b>
                  <span className="alur-angka num">
                    {xs.length} paket · {rupiahSingkat(nilai)}
                  </span>
                  <span className="alur-catatan">{t.tahap === 4 ? `${cair} sudah dicairkan` : MENUNGGU[t.tahap]}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      <section className="panel" aria-label={`Tabel paket pengadaan ${dana}`}>
        <div className="ph">
          <Tabs<FilterTahap>
            label="Filter tahap"
            value={tab}
            onChange={setTab}
            items={[
              { value: "Semua", label: `Semua · ${paketDana.length}` },
              ...TAHAP.map((t) => ({ value: String(t.tahap) as FilterTahap, label: `${t.singkat} · ${perTahap(t.tahap).length}` })),
            ]}
          />
          <div className="tbar filter-kegiatan">
            {(hak.bisaPpk || hak.bisaPp) && (
              <Saring<"Semua" | "Saya">
                label="Tugas"
                value={saya}
                onChange={setSaya}
                opsi={[
                  { value: "Semua", label: "Semua paket" },
                  { value: "Saya", label: `Perlu tindakan saya · ${tugasSaya}` },
                ]}
              />
            )}
            <SearchBox id="paket-cari" value={cari} onChange={setCari} placeholder="Cari pekerjaan, nomor, penyedia" />
            {adaFilter && (
              <button
                type="button"
                className="btn soft sm"
                onClick={() => {
                  setSaya("Semua");
                  setCari("");
                }}
              >
                <Icon name="close" />
                Reset
              </button>
            )}
          </div>
        </div>
        <p className="info-akses">
          <Icon name="shield" />
          <span>
            Masuk sebagai <b>{penggunaAktif.nama}</b> ({penggunaAktif.peran}) · {keterangan}
          </span>
        </p>
        <DiTabelLain jumlah={cocokLain} dana={lain} satuan="paket" onBuka={() => pilihDana(lain)} />
        <div className="tw stack">
          <table className="tabel-paket">
            <thead>
              <tr>
                <th>Paket Pekerjaan</th>
                <th>Akun</th>
                <th>Pejabat</th>
                <th>Penyedia</th>
                <th className="r">Nilai</th>
                <th>Tahap</th>
                <th className="th-aksi">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {baris.length === 0 ? (
                <EmptyRow cols={7}>
                  {paketDana.length === 0
                    ? hak.bisaPpk
                      ? `Belum ada paket pengadaan ${dana}. Klik Buat Nota Dinas untuk memulai.`
                      : `Belum ada paket pengadaan ${dana}. Paket dimulai dari Nota Dinas yang diterbitkan PPK.`
                    : `Tidak ada paket ${dana} yang cocok dengan filter.`}
                </EmptyRow>
              ) : (
                baris.map((x) => {
                  const k = belanjaDari(x);
                  const berikut = hak.berikut(x);
                  const hps = totalHps(x).total;
                  return (
                    <tr key={x.id}>
                      <td className="main">
                        <div className="act">
                          <span className="ai">
                            <Icon name="box" />
                          </span>
                          <div>
                            <button type="button" className="tautan-paket" onClick={() => setDetail(x.id)}>
                              {x.pekerjaan}
                            </button>
                            <span className="mak-keg" title={`Nota Dinas ${x.nd.nomor}`}>
                              {x.id}
                            </span>
                            <small>
                              {namaUnit(x.unit)} · ND {tanggal(x.nd.tanggal)}
                            </small>
                          </div>
                        </div>
                      </td>
                      <td data-label="Akun" title={namaAkun(x.mak.split(".").pop() ?? "")}>
                        <span className="mono">{x.mak.split(".").pop()}</span>
                        <div className="note akun-ur">{namaAkun(x.mak.split(".").pop() ?? "")}</div>
                      </td>
                      <td data-label="Pejabat" className="sel-pejabat">
                        <span>
                          <small>PPK</small> {infoPengguna(x.ppkId).nama}
                        </span>
                        <span>
                          <small>PP</small> {x.ppId && x.tahap >= 2 ? infoPengguna(x.ppId).nama : "—"}
                        </span>
                      </td>
                      <td data-label="Penyedia">{x.tahap >= 2 ? namaPenyedia(x) ?? "—" : "—"}</td>
                      <td className="r num" data-label={x.tahap >= 3 ? "Nilai pembelian" : "Nilai HPS"}>
                        <b>{rupiah(nilaiPaket(x))}</b>
                        {x.tahap >= 3 && <span className="note">HPS {rupiah(hps)}</span>}
                      </td>
                      <td data-label="Tahap">
                        <Status tone={TONE_TAHAP[x.tahap]}>
                          {x.tahap}. {TAHAP[x.tahap - 1].singkat}
                        </Status>
                        {x.tahap === 4 && k ? (
                          <span className="status-rekap">
                            <span className="mono">{k.id}</span> · {k.status}
                          </span>
                        ) : (
                          <span className="status-rekap">{MENUNGGU[x.tahap]}</span>
                        )}
                      </td>
                      <td className="full sel-aksi">
                        <div className="aksi-baris">
                          {berikut && (
                            <button type="button" className="btn acc sm" onClick={() => bukaForm(berikut.jenis, x.id)}>
                              {berikut.label}
                            </button>
                          )}
                          <div className="ikon-aksi">
                            <button type="button" className="ib-aksi" aria-label={`Rincian ${x.id}`} title={`Rincian ${x.id}`} onClick={() => setDetail(x.id)}>
                              <Icon name="eye" />
                            </button>
                            <button
                              type="button"
                              className="ib-aksi"
                              aria-label={`Cetak dokumen ${x.id}`}
                              title={`Cetak dokumen ${x.id}`}
                              onClick={() => setCetak({ id: x.id, dokumen: dokumenTahap(x.tahap) })}
                            >
                              <Icon name="print" />
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {pDetail && (
        <DetailPaket
          p={pDetail}
          onClose={() => setDetail(null)}
          onForm={(jenis) => bukaForm(jenis, pDetail.id)}
          onCetak={(dokumen) => setCetak({ id: pDetail.id, dokumen })}
        />
      )}
      {form?.jenis === "nd" && (
        <FormNotaDinas
          awal={p}
          danaAwal={dana}
          onClose={() => setForm(null)}
          onSaved={(baru) => {
            setForm(null);
            // paket tampil di tabel sumber dananya
            if (baru.dana !== dana && (baru.dana === "RM" || baru.dana === "BLU")) pilihDana(baru.dana);
            if (!p) {
              setTab("Semua");
              setDetail(baru.id);
            }
          }}
        />
      )}
      {form?.jenis === "sp" && p && <FormPesanan p={p} onClose={() => setForm(null)} />}
      {form?.jenis === "nota" && p && <FormPembelian p={p} onClose={() => setForm(null)} />}
      {form?.jenis === "kw" && p && <FormKwitansi p={p} onClose={() => setForm(null)} />}
      {form?.jenis === "batal" && p && <FormBatal p={p} onClose={() => setForm(null)} />}
      {form?.jenis === "hapus" && p && (
        <FormHapus
          p={p}
          onClose={() => setForm(null)}
          onDone={() => {
            setForm(null);
            setDetail(null);
          }}
        />
      )}
      {dataSaya && <FormDataPejabat id={penggunaAktif.id} onClose={() => setDataSaya(false)} />}
      {cetak && pCetak && <CetakPengadaan p={pCetak} awal={cetak.dokumen} onClose={() => setCetak(null)} />}
    </>
  );
}

/* =====================================================================
   Rincian paket: tahap demi tahap + daftar barang
   ===================================================================== */
function DetailPaket({
  p,
  onClose,
  onForm,
  onCetak,
}: {
  p: Paket;
  onClose: () => void;
  onForm: (jenis: JenisForm) => void;
  onCetak: (dokumen: KodeDokumen[]) => void;
}) {
  const { kegiatan, referensi, infoPengguna, namaUnit } = useStore();
  const hak = useHakPaket();
  const k = p.pengajuanId ? kegiatan.find((x) => x.id === p.pengajuanId) : undefined;
  const hps = totalHps(p);
  const beli = p.tahap >= 3 ? totalBeli(p) : null;
  const penyedia = p.arsip?.penyedia ?? dataPenyedia(referensi.penyedia.find((x) => x.id === p.penyediaId));
  const semuaDokumen = TAHAP.filter((t) => t.tahap <= p.tahap).flatMap((t) => dokumenTahap(t.tahap));

  const tombol = (label: string, jenis: JenisForm, gaya = "soft") => (
    <button type="button" className={`btn ${gaya} sm`} onClick={() => onForm(jenis)}>
      {label}
    </button>
  );
  const tombolCetak = (t: TahapPaket) => (
    <button type="button" className="btn soft sm" onClick={() => onCetak(dokumenTahap(t))}>
      <Icon name="print" />
      Cetak
    </button>
  );

  return (
    <Dialog
      title={p.pekerjaan}
      subtitle={
        <>
          <span className="mono">{p.id}</span>
          <span>{namaUnit(p.unit)}</span>
          <BadgeDana dana={p.dana} />
          <span className="mono">{p.mak}</span>
        </>
      }
      onClose={onClose}
      aksi={
        <button type="button" className="btn soft sm" onClick={() => onCetak(semuaDokumen)} aria-label="Cetak semua dokumen">
          <Icon name="print" />
          <span className="teks-lebar">Cetak semua</span>
        </button>
      }
    >
      <ol className="tahap-paket">
        <LangkahPaket no={1} p={p} pelaku={`PPK · ${infoPengguna(p.ppkId).nama}`}>
          <dl className="rinci">
            <div><dt>No. Nota Dinas</dt><dd className="mono">{p.nd.nomor}</dd></div>
            <div><dt>Tanggal</dt><dd>{tanggal(p.nd.tanggal)}</dd></div>
            <div><dt>Total HPS</dt><dd><b>{rupiah(hps.total)}</b> {p.ppn ? "termasuk PPN 11%" : "tanpa PPN"}</dd></div>
          </dl>
          <div className="tahap-aksi">
            {hak.ubahNd(p) && tombol("Ubah", "nd")}
            {hak.hapus(p) && tombol("Hapus paket", "hapus", "danger")}
            {tombolCetak(1)}
          </div>
        </LangkahPaket>

        <LangkahPaket no={2} p={p} pelaku={`Pejabat Pengadaan${p.tahap >= 2 && p.ppId ? ` · ${infoPengguna(p.ppId).nama}` : ""}`}>
          {p.tahap >= 2 && p.sp ? (
            <dl className="rinci">
              <div><dt>No. Surat Pesanan</dt><dd className="mono">{p.sp.nomor}</dd></div>
              <div><dt>Tanggal</dt><dd>{tanggal(p.sp.tanggal)} · paling lambat {p.sp.batasHari} hari</dd></div>
              <div><dt>Penyedia</dt><dd>{penyedia?.nama ?? "—"}{penyedia?.pimpinan ? ` · ${penyedia.pimpinan}` : ""}</dd></div>
            </dl>
          ) : (
            <p className="tahap-tunggu">Pejabat Pengadaan memilih penyedia lalu menerbitkan Surat Pesanan.</p>
          )}
          <div className="tahap-aksi">
            {hak.terbitSp(p) && tombol("Terbitkan Surat Pesanan", "sp", "acc")}
            {hak.ubahSp(p) && tombol("Ubah", "sp")}
            {p.tahap === 2 && hak.batal(p) && tombol("Batalkan", "batal", "danger")}
            {p.tahap >= 2 && tombolCetak(2)}
          </div>
        </LangkahPaket>

        <LangkahPaket no={3} p={p} pelaku="Pejabat Pengadaan">
          {p.tahap >= 3 && p.nota && beli ? (
            <dl className="rinci">
              <div><dt>Tanggal nota</dt><dd>{tanggal(p.nota.tanggal)}</dd></div>
              <div>
                <dt>Total pembelian</dt>
                <dd>
                  <b>{rupiah(beli.total)}</b> {p.nota.ppn ? "termasuk PPN 11%" : "tanpa PPN"}
                  {hps.total > beli.total && <span className="note"> · hemat {rupiah(hps.total - beli.total)} dari HPS</span>}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="tahap-tunggu">Setelah barang/jasa diterima, Pejabat Pengadaan mencatat Nota / Bukti Pembelian dari penyedia.</p>
          )}
          <div className="tahap-aksi">
            {hak.catatNota(p) && tombol("Catat Nota Pembelian", "nota", "acc")}
            {hak.ubahNota(p) && tombol("Ubah", "nota")}
            {p.tahap === 3 && hak.batal(p) && tombol("Batalkan", "batal", "danger")}
            {p.tahap >= 3 && tombolCetak(3)}
          </div>
        </LangkahPaket>

        <LangkahPaket no={4} p={p} pelaku={`PPK · ${infoPengguna(p.ppkId).nama}`}>
          {p.tahap === 4 && p.kwitansi && p.bap && p.bast ? (
            <dl className="rinci">
              <div><dt>No. Kwitansi</dt><dd className="mono">{p.kwitansi.nomor} · {tanggal(p.kwitansi.tanggal)}</dd></div>
              <div><dt>No. BAP</dt><dd className="mono">{p.bap.nomor} · {tanggal(p.bap.tanggal)}</dd></div>
              <div><dt>No. BAST</dt><dd className="mono">{p.bast.nomor} · {tanggal(p.bast.tanggal)}</dd></div>
              <div>
                <dt>Dokumen belanja</dt>
                <dd>
                  {k ? (
                    <>
                      <span className="mono">{k.id}</span> <Status tone={TONE_BELANJA[k.status]}>{k.status}</Status>
                      {k.pencairan && <span className="note"> · {k.pencairan.nomor}</span>}
                    </>
                  ) : (
                    <span className="mono">{p.pengajuanId}</span>
                  )}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="tahap-tunggu">PPK menerbitkan Kwitansi, BAP, dan BAST; kwitansi langsung masuk Daftar Pencairan.</p>
          )}
          <div className="tahap-aksi">
            {hak.terbitKw(p) && tombol("Terbitkan Kwitansi, BAP & BAST", "kw", "acc")}
            {hak.ubahKw(p, k) && tombol("Ubah", "kw")}
            {p.tahap === 4 && hak.batal(p, k) && tombol("Batalkan", "batal", "danger")}
            {p.tahap === 4 && tombolCetak(4)}
          </div>
          {p.tahap === 4 && k?.pencairan && <p className="tahap-tunggu">Kwitansi sudah dicairkan sehingga tidak bisa diubah atau dibatalkan.</p>}
        </LangkahPaket>
      </ol>

      <h4 className="judul-item">Daftar barang/jasa</h4>
      <div className="tw">
        <table className="tabel-item">
          <thead>
            <tr>
              <th>No.</th>
              <th>Uraian</th>
              <th className="r">Jumlah</th>
              <th className="r">Harga HPS</th>
              {beli && <th className="r">Harga beli</th>}
              <th className="r">Jumlah (Rp)</th>
            </tr>
          </thead>
          <tbody>
            {p.item.map((x, i) => (
              <tr key={i}>
                <td>{i + 1}</td>
                <td>
                  <b>{x.uraian}</b>
                  {x.spesifikasi.map((s, j) => (
                    <small key={j} className="spek">
                      {s}
                    </small>
                  ))}
                  {x.ket && <small className="spek">Ket: {x.ket}</small>}
                </td>
                <td className="r num">
                  {x.jumlah} {x.satuan}
                </td>
                <td className="r num">{rupiah(x.hargaHps)}</td>
                {beli && <td className="r num">{rupiah(x.harga ?? 0)}</td>}
                <td className="r num">{rupiah(x.jumlah * ((beli ? x.harga : x.hargaHps) ?? 0))}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={beli ? 5 : 4} className="r">Jumlah</td>
              <td className="r num">{rupiah((beli ?? hps).jumlah)}</td>
            </tr>
            {(beli ? p.nota?.ppn : p.ppn) && (
              <tr>
                <td colSpan={beli ? 5 : 4} className="r">PPN 11%</td>
                <td className="r num">{rupiah((beli ?? hps).ppn)}</td>
              </tr>
            )}
            <tr className="total">
              <td colSpan={beli ? 5 : 4} className="r">{beli ? "Total pembelian" : "Total HPS"}</td>
              <td className="r num">{rupiah((beli ?? hps).total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </Dialog>
  );
}

function LangkahPaket({ no, p, pelaku, children }: { no: TahapPaket; p: Paket; pelaku: string; children: ReactNode }) {
  const status = p.tahap >= no ? "selesai" : p.tahap + 1 === no ? "berjalan" : "belum";
  return (
    <li className={`langkah ${status}`}>
      <span className="langkah-no" aria-hidden="true">
        {status === "selesai" ? <Icon name="check" /> : no}
      </span>
      <div className="langkah-isi">
        <div className="langkah-kepala">
          <b>{TAHAP[no - 1].nama}</b>
          <small>{pelaku}</small>
          <span className="sr">{status === "selesai" ? "sudah terbit" : status === "berjalan" ? "tahap berikutnya" : "belum"}</span>
        </div>
        {children}
      </div>
    </li>
  );
}

/* =====================================================================
   Tahap 1 — Nota Dinas & HPS (PPK)
   ===================================================================== */
function FormNotaDinas({
  awal,
  danaAwal,
  onClose,
  onSaved,
}: {
  awal?: Paket;
  /** paket baru: sumber dana tabel yang sedang dibuka */
  danaAwal?: Dana;
  onClose: () => void;
  onSaved: (p: Paket) => void;
}) {
  const { referensi, daftarMak, pengguna, penggunaAktif, simpanNotaDinas, toast } = useStore();
  const admin = penggunaAktif.peran === "Administrator";
  const [pekerjaan, setPekerjaan] = useState(awal?.pekerjaan ?? "");
  const [unit, setUnit] = useState(awal?.unit ?? "");
  const [dana, setDana] = useState<string>(awal?.dana ?? danaAwal ?? "");
  const [mak, setMak] = useState(awal?.mak ?? "");
  const [tgl, setTgl] = useState(awal?.nd.tanggal ?? hariIni());
  const [nomor, setNomor] = useState<NilaiNomor>(() => nomorAwal("nd", awal?.nd.nomor));
  const [ppn, setPpn] = useState(awal?.ppn ?? true);
  const daftarPpk = pengguna.filter((u) => u.peran === "PPK" && u.aktif && !u.dihapus);
  const [ppkId, setPpkId] = useState(awal?.ppkId ?? (daftarPpk.length === 1 ? daftarPpk[0].id : ""));
  // Tabel HPS bergaya Excel: paket baru dimulai dengan 3 baris kosong, ubah paket = barang yang ada + 1 baris kosong
  // (spesifikasi paket lama menjadi baris uraian tersendiri di bawah barangnya)
  const [barang, setBarang] = useState<BarisBarang[]>(() =>
    awal ? [...awal.item.flatMap(barisDariItem), barisKosong()] : [barisKosong(), barisKosong(), barisKosong()],
  );
  /** bertambah tiap kali simpan gagal karena isian tabel → sel yang salah ditandai merah */
  const [coba, setCoba] = useState(0);
  /** isian tabel sudah diubah → form tidak tertutup oleh Esc / klik di luar */
  const [diubah, setDiubah] = useState(false);

  const opsiUnit: OpsiCombo[] = referensi.unit.map((u) => ({ value: u.kode, label: u.nama }));
  const opsiDana: OpsiCombo[] = referensi.dana.filter((d) => d.kode === "RM" || d.kode === "BLU").map((d) => ({ value: d.kode, label: d.kode }));
  const opsiMak: OpsiCombo[] = useMemo(
    () => (dana ? daftarMak.filter((m) => akunSesuaiDana(m.akun, dana)).map((m) => ({ value: m.kode, label: m.kode, mono: true })) : []),
    [dana, daftarMak],
  );
  const gantiDana = (d: string) => {
    setDana(d);
    if (mak && !akunSesuaiDana(akunDariMak(mak), d)) setMak("");
  };
  const gantiBarang = (xs: BarisBarang[]) => {
    setBarang(xs);
    setDiubah(true);
  };
  const gantiPpn = (v: boolean) => {
    setPpn(v);
    setDiubah(true);
  };

  const simpan = async () => {
    const kurang = [
      !pekerjaan.trim() && "nama pekerjaan",
      !unit && "unit kerja",
      !dana && "sumber dana",
      !mak && "MAK",
      !nomorLengkap(nomor, polaNomor("nd", dana, tgl)) && "nomor nota dinas",
      !tgl && "tanggal",
      admin && !ppkId && "PPK penanda tangan",
    ].filter(Boolean);
    if (kurang.length) return toast(`Lengkapi ${kurang.join(", ")}`);
    const isi = barang.filter(barisTerisi);
    if (!isi.length) {
      setCoba((c) => c + 1);
      return toast("Isi minimal satu barang/jasa pada tabel HPS");
    }
    const k = isi.findIndex((b) => salahBarang(b).length > 0);
    if (k >= 0) {
      setCoba((c) => c + 1);
      return toast(`Lengkapi ${pesanSalah(isi[k])} barang/jasa nomor ${k + 1} (sel bertanda merah)`);
    }
    const r = await simpanNotaDinas(awal?.id ?? null, {
      pekerjaan: pekerjaan.trim(),
      unit,
      dana,
      mak,
      ndNomor: nomorLengkap(nomor, polaNomor("nd", dana, tgl)),
      ndTanggal: tgl,
      ppn,
      item: itemDariBaris(barang),
      ppkId: admin ? ppkId : undefined,
    });
    if (!r) return;
    if (awal && r.berubah === 0) return toast("Belum ada perubahan untuk disimpan");
    toast(awal ? `${awal.id}: nota dinas & HPS diperbarui` : `${r.paket.id} terbit · menunggu Surat Pesanan dari Pejabat Pengadaan`);
    onSaved(r.paket);
  };

  return (
    <Modal
      lebar="tabel"
      jaga={diubah}
      title={awal ? `Ubah Nota Dinas ${awal.id}` : "Buat Nota Dinas & HPS"}
      description="Nota Dinas Perintah Pengadaan Barang/Jasa kepada Pejabat Pengadaan beserta HPS (daftar paket pekerjaan). Masih bisa diubah selama Surat Pesanan belum terbit."
      submitLabel={awal ? "Simpan Perubahan" : "Terbitkan Nota Dinas"}
      onSubmit={simpan}
      onClose={onClose}
    >
      <Field label="Nama pekerjaan" full>
        <input value={pekerjaan} onChange={(e) => setPekerjaan(e.target.value)} placeholder="mis. Belanja Kebutuhan Sosialisasi Penawaran Kerjasama Yaitu Cinderamata" />
      </Field>
      <Field label="Unit kerja pengguna">
        <Combobox value={unit} onChange={setUnit} opsi={opsiUnit} placeholder="Pilih unit kerja" />
      </Field>
      <Field label="Sumber dana">
        <Combobox value={dana} onChange={gantiDana} opsi={opsiDana} placeholder="Pilih RM atau BLU" />
      </Field>
      <Field label="Mata Anggaran Kegiatan (MAK)" full>
        <Combobox
          value={mak}
          onChange={setMak}
          opsi={opsiMak}
          disabled={!dana}
          placeholder={dana ? "Ketik kode MAK" : "Pilih sumber dana terlebih dahulu"}
          kosong={`Tidak ada MAK ${dana} yang cocok`}
        />
      </Field>
      {admin && (
        <Field label="PPK penanda tangan" full>
          <select value={ppkId} onChange={(e) => setPpkId(e.target.value)}>
            <option value="">Pilih PPK</option>
            {daftarPpk.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nama}
              </option>
            ))}
          </select>
          {daftarPpk.length === 0 && <small className="isian-catatan">Belum ada akun PPK aktif. Tambahkan di modul Pengguna.</small>}
        </Field>
      )}
      <InputNomor label="Nomor Nota Dinas" jenis="nd" dana={dana} tanggal={tgl} nilai={nomor} onChange={setNomor} />
      <Field label="Tanggal Nota Dinas">
        <input type="date" value={tgl} onChange={(e) => setTgl(e.target.value)} />
      </Field>
      <TabelHps nilai={barang} onChange={gantiBarang} ppn={ppn} onPpn={gantiPpn} coba={coba} onInfo={toast} />
    </Modal>
  );
}

/* =====================================================================
   Tahap 2 — Surat Pesanan (Pejabat Pengadaan)
   ===================================================================== */
const PENYEDIA_BARU = "__baru";
const penyediaKosong = (): DataPenyedia => ({ nama: "", pimpinan: "", jabatan: "Direktur", alamat: "", kota: "Makassar", npwp: "", bank: "", rekening: "" });

function FormPesanan({ p, onClose }: { p: Paket; onClose: () => void }) {
  const { referensi, pengguna, penggunaAktif, simpanPesanan, toast } = useStore();
  const admin = penggunaAktif.peran === "Administrator";
  const baru = p.tahap === 1;
  const [pilih, setPilih] = useState(p.penyediaId ?? "");
  const [d, setD] = useState<DataPenyedia>(() => dataPenyedia(referensi.penyedia.find((x) => x.id === p.penyediaId)) ?? penyediaKosong());
  const [tgl, setTgl] = useState(p.sp?.tanggal ?? p.nd.tanggal);
  const [nomor, setNomor] = useState<NilaiNomor>(() => nomorAwal("sp", p.sp?.nomor));
  const [batas, setBatas] = useState(String(p.sp?.batasHari ?? 7));
  const daftarPp = pengguna.filter((u) => u.peran === "Pejabat Pengadaan" && u.aktif && !u.dihapus);
  const [ppId, setPpId] = useState(p.ppId ?? (daftarPp.length === 1 ? daftarPp[0].id : ""));

  const opsiPenyedia: OpsiCombo[] = [
    ...referensi.penyedia.filter((x) => x.aktif || x.id === p.penyediaId).map((x) => ({ value: x.id, label: x.aktif ? x.nama : `${x.nama} (tidak aktif)` })),
    { value: PENYEDIA_BARU, label: "+ Penyedia baru (belum ada di Referensi)" },
  ];
  const gantiPenyedia = (id: string) => {
    setPilih(id);
    setD(id === PENYEDIA_BARU ? penyediaKosong() : dataPenyedia(referensi.penyedia.find((x) => x.id === id)) ?? penyediaKosong());
  };
  const isi = (k: keyof DataPenyedia) => (e: { target: { value: string } }) => setD((x) => ({ ...x, [k]: e.target.value }));
  const hps = totalHps(p);

  const simpan = async () => {
    const pola = polaNomor("sp", p.dana, tgl);
    const kurang = [
      !pilih && "penyedia",
      pilih === PENYEDIA_BARU && !d.nama.trim() && "nama penyedia",
      ...(pilih ? kurangPenyedia(d) : []),
      !nomorLengkap(nomor, pola) && "nomor surat pesanan",
      !tgl && "tanggal",
      !(Number(batas) >= 1) && "batas waktu",
      admin && !ppId && "Pejabat Pengadaan",
    ].filter(Boolean);
    if (kurang.length) return toast(`Lengkapi ${kurang.join(", ")}`);
    const digitNpwp = d.npwp.replace(/\D/g, "").length;
    if (digitNpwp < 15 || digitNpwp > 16) return toast("NPWP penyedia harus 15 atau 16 digit");
    if (tgl < p.nd.tanggal) return toast(`Tanggal surat pesanan tidak boleh sebelum tanggal nota dinas (${tanggal(p.nd.tanggal)})`);
    const r = await simpanPesanan(p.id, {
      spNomor: nomorLengkap(nomor, pola),
      spTanggal: tgl,
      batasHari: Number(batas),
      penyedia: { ...d, id: pilih === PENYEDIA_BARU ? undefined : pilih },
      ppId: admin ? ppId : undefined,
    });
    if (!r) return;
    if (!baru && r.berubah === 0) return toast("Belum ada perubahan untuk disimpan");
    toast(baru ? `${p.id}: Surat Pesanan terbit · menunggu nota pembelian` : `${p.id}: surat pesanan diperbarui`);
    onClose();
  };

  return (
    <Modal
      lebar="tabel"
      title={baru ? "Terbitkan Surat Pesanan" : `Ubah Surat Pesanan ${p.id}`}
      description="Surat Pesanan kepada penyedia/pihak ketiga. Data penyedia di bawah dicetak di Surat Pesanan hingga Kwitansi dan ikut tersimpan di Referensi."
      submitLabel={baru ? "Terbitkan Surat Pesanan" : "Simpan Perubahan"}
      onSubmit={simpan}
      onClose={onClose}
    >
      <div className="full ringkas">
        <div><span>Paket</span><b>{p.id}</b></div>
        <div><span>Pekerjaan</span><b>{p.pekerjaan}</b></div>
        <div><span>Nota Dinas</span><b className="mono">{p.nd.nomor}</b></div>
        <div className="total"><span>Total HPS</span><b>{rupiah(hps.total)}</b></div>
      </div>
      {admin && (
        <Field label="Pejabat Pengadaan penanda tangan" full>
          <select value={ppId} onChange={(e) => setPpId(e.target.value)}>
            <option value="">Pilih Pejabat Pengadaan</option>
            {daftarPp.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nama}
              </option>
            ))}
          </select>
          {daftarPp.length === 0 && (
            <small className="isian-catatan">Belum ada akun Pejabat Pengadaan aktif. Tambahkan di modul Pengguna.</small>
          )}
        </Field>
      )}
      <Field label="Penyedia" full>
        <Combobox value={pilih} onChange={gantiPenyedia} opsi={opsiPenyedia} placeholder="Ketik untuk mencari penyedia" />
      </Field>
      {pilih && (
        <>
          {pilih === PENYEDIA_BARU && (
            <Field label="Nama penyedia" full>
              <input value={d.nama} onChange={isi("nama")} placeholder="mis. CV. SETARA AURORA" />
            </Field>
          )}
          <Field label="Nama pimpinan">
            <input value={d.pimpinan} onChange={isi("pimpinan")} placeholder="mis. A. NAJAMUDDIN BASO M." />
          </Field>
          <Field label="Jabatan pimpinan">
            <input value={d.jabatan} onChange={isi("jabatan")} placeholder="Direktur" />
          </Field>
          <Field label="Alamat" full>
            <input value={d.alamat} onChange={isi("alamat")} placeholder="mis. JL. Bumi Tamalanrea Permai (BTP) Blok AC 3 No. 267" />
          </Field>
          <Field label="Kota">
            <input value={d.kota} onChange={isi("kota")} />
          </Field>
          <Field label="NPWP">
            <input value={d.npwp} onChange={isi("npwp")} className="mono" placeholder="96.257.9074-801.000" />
          </Field>
          <Field label="Bank">
            <input value={d.bank} onChange={isi("bank")} placeholder="BANK BNI" />
          </Field>
          <Field label="No. rekening">
            <input value={d.rekening} onChange={isi("rekening")} className="mono" inputMode="numeric" />
          </Field>
        </>
      )}
      <InputNomor label="Nomor Surat Pesanan" jenis="sp" dana={p.dana} tanggal={tgl} nilai={nomor} onChange={setNomor} />
      <Field label="Tanggal Surat Pesanan">
        <input type="date" value={tgl} min={p.nd.tanggal} onChange={(e) => setTgl(e.target.value)} />
      </Field>
      <Field label="Dilaksanakan paling lambat (hari)">
        <input inputMode="numeric" className="num" value={batas} onChange={(e) => setBatas(e.target.value.replace(/\D/g, "").slice(0, 3))} />
        <small className="isian-catatan">Dicetak: &ldquo;paling lambat {Number(batas) || "…"} Hari Setelah Menerima Surat Pesanan ini&rdquo;</small>
      </Field>
      <TabelLampiran judul="Barang/jasa yang dipesan (dari HPS)" item={p.item} harga="hps" ppn={p.ppn} onInfo={toast} />
    </Modal>
  );
}

/* =====================================================================
   Tahap 3 — Nota / Bukti Pembelian (Pejabat Pengadaan)
   ===================================================================== */
function FormPembelian({ p, onClose }: { p: Paket; onClose: () => void }) {
  const { simpanPembelian, toast } = useStore();
  const baru = p.tahap === 2;
  const minimal = p.sp?.tanggal ?? p.nd.tanggal;
  const [tgl, setTgl] = useState(p.nota?.tanggal ?? tanggalBawaan(minimal, p.tahun));
  const [ppn, setPpn] = useState(p.nota?.ppn ?? p.ppn);
  const [harga, setHarga] = useState<string[]>(() => p.item.map((x) => String(x.harga ?? x.hargaHps)));
  /** harga sudah diubah → form tidak tertutup oleh Esc / klik di luar */
  const [diubah, setDiubah] = useState(false);
  const beli = hitungTotal(
    p.item.map((x, i) => ({ jumlah: x.jumlah, hargaHps: x.hargaHps, harga: Number(harga[i]) || 0 })),
    "harga",
    ppn,
  );
  const hps = totalHps(p);
  const lebih = beli.total > hps.total;

  const simpan = async () => {
    if (!tgl) return toast("Isi tanggal nota pembelian");
    if (tgl < minimal) return toast(`Tanggal nota tidak boleh sebelum tanggal surat pesanan (${tanggal(minimal)})`);
    const i = harga.findIndex((h) => !(Number(h) > 0));
    if (i >= 0) return toast(`Isi harga satuan barang/jasa nomor ${i + 1} (sel bertanda merah)`);
    if (lebih) return toast("Total pembelian melebihi HPS");
    const r = await simpanPembelian(p.id, { notaTanggal: tgl, ppn, harga: harga.map(Number) });
    if (!r) return;
    if (!baru && r.berubah === 0) return toast("Belum ada perubahan untuk disimpan");
    toast(baru ? `${p.id}: nota pembelian dicatat · menunggu kwitansi dari PPK` : `${p.id}: nota pembelian diperbarui`);
    onClose();
  };

  return (
    <Modal
      lebar="tabel"
      jaga={diubah}
      title={baru ? "Catat Nota Pembelian" : `Ubah Nota Pembelian ${p.id}`}
      description="Harga sesuai Nota / Bukti Pembelian dari penyedia (bawaan: harga HPS). Total pembelian tidak boleh melebihi HPS."
      submitLabel={baru ? "Simpan Nota Pembelian" : "Simpan Perubahan"}
      onSubmit={simpan}
      onClose={onClose}
      nonaktif={lebih}
    >
      <Field label="Tanggal nota">
        <input type="date" value={tgl} min={minimal} onChange={(e) => setTgl(e.target.value)} />
      </Field>
      <TabelBeli
        item={p.item}
        harga={harga}
        onHarga={(h) => {
          setHarga(h);
          setDiubah(true);
        }}
        ppn={ppn}
        onPpn={(v) => {
          setPpn(v);
          setDiubah(true);
        }}
        totalHps={hps.total}
        onInfo={toast}
      />
      {lebih && <p className="full unggah-galat">Total pembelian {rupiah(beli.total)} melebihi HPS {rupiah(hps.total)}.</p>}
    </Modal>
  );
}

/* =====================================================================
   Tahap 4 — Kwitansi, BAP & BAST (PPK) → Daftar Pencairan
   ===================================================================== */
function FormKwitansi({ p, onClose }: { p: Paket; onClose: () => void }) {
  const { referensi, pengguna, simpanKwitansi, toast } = useStore();
  const baru = p.tahap === 3;
  const minimal = p.nota?.tanggal ?? p.nd.tanggal;
  const [kwTgl, setKwTgl] = useState(p.kwitansi?.tanggal ?? minimal);
  const [bapTgl, setBapTgl] = useState(p.bap?.tanggal ?? minimal);
  const [bastTgl, setBastTgl] = useState(p.bast?.tanggal ?? minimal);
  const [kw, setKw] = useState<NilaiNomor>(() => nomorAwal("kw", p.kwitansi?.nomor));
  const [bap, setBap] = useState<NilaiNomor>(() => nomorAwal("bap", p.bap?.nomor));
  const [bast, setBast] = useState<NilaiNomor>(() => nomorAwal("bast", p.bast?.nomor));
  const [centang, setCentang] = useState(p.bap?.centang ?? true);
  const beli = totalBeli(p);
  const penyedia = dataPenyedia(referensi.penyedia.find((x) => x.id === p.penyediaId));
  const kurangPeny = kurangPenyedia(penyedia);
  const ppk = dataPejabat(pengguna.find((u) => u.id === p.ppkId));
  const kurangPpk = kurangPejabat(ppk, true);

  // kode paket di nomor BAST mengikuti nomor BAP selama belum diubah sendiri
  const gantiBap = (n: NilaiNomor) => {
    if (!bast.manual && (bast.tengah === "" || bast.tengah === bap.tengah)) setBast((b) => ({ ...b, tengah: n.tengah }));
    setBap(n);
  };

  const simpan = async () => {
    const nomor = {
      kw: nomorLengkap(kw, polaNomor("kw", p.dana, kwTgl)),
      bap: nomorLengkap(bap, polaNomor("bap", p.dana, bapTgl)),
      bast: nomorLengkap(bast, polaNomor("bast", p.dana, bastTgl)),
    };
    const kurang = [!nomor.kw && "nomor kwitansi", !nomor.bap && "nomor BAP", !nomor.bast && "nomor BAST", !kwTgl && "tanggal kwitansi", !bapTgl && "tanggal BAP", !bastTgl && "tanggal BAST"].filter(Boolean);
    if (kurang.length) return toast(`Lengkapi ${kurang.join(", ")}`);
    if ([kwTgl, bapTgl, bastTgl].some((t) => t < minimal)) return toast(`Tanggal kwitansi, BAP, dan BAST tidak boleh sebelum tanggal nota (${tanggal(minimal)})`);
    const r = await simpanKwitansi(p.id, {
      kwNomor: nomor.kw,
      kwTanggal: kwTgl,
      bapNomor: nomor.bap,
      bapTanggal: bapTgl,
      bastNomor: nomor.bast,
      bastTanggal: bastTgl,
      centang,
    });
    if (!r) return;
    if (!baru && r.berubah === 0) return toast("Belum ada perubahan untuk disimpan");
    toast(baru ? `${p.id}: Kwitansi terbit · ${r.paket.pengajuanId} masuk Daftar Pencairan` : `${p.id}: kwitansi, BAP & BAST diperbarui`);
    onClose();
  };

  return (
    <Modal
      lebar="tabel"
      title={baru ? "Terbitkan Kwitansi, BAP & BAST" : `Ubah Kwitansi ${p.id}`}
      description={
        baru
          ? "Setelah disimpan, kwitansi langsung masuk Daftar Pencairan sebagai dokumen belanja jenis Kwitansi. Masih bisa diubah atau dibatalkan selama belum dicairkan."
          : "Perubahan nomor dan tanggal kwitansi ikut diperbarui pada dokumen belanjanya. Data penyedia dan pejabat ikut diperbarui dari data terbaru."
      }
      submitLabel={baru ? "Terbitkan & Ajukan ke Pencairan" : "Simpan Perubahan"}
      onSubmit={simpan}
      onClose={onClose}
      nonaktif={kurangPeny.length > 0}
    >
      <div className="full ringkas">
        <div><span>Pekerjaan</span><b>{p.pekerjaan}</b></div>
        <div><span>Penyedia</span><b>{penyedia?.nama ?? "—"}</b></div>
        <div><span>MAK</span><b className="mono">{p.mak}</b></div>
        <div className="total"><span>Jumlah uang</span><b>{rupiah(beli.total)}</b></div>
        <small className="terbilang-ringkas">{terbilangRupiah(beli.total)}</small>
      </div>
      {kurangPeny.length > 0 && (
        <p className="full unggah-galat">
          Data penyedia belum lengkap ({kurangPeny.join(", ")}). Minta Pejabat Pengadaan melengkapinya lewat Ubah Surat Pesanan, atau Administrator di Referensi.
        </p>
      )}
      {kurangPpk.length > 0 && (
        <p className="full peringatan-isian">
          Data penanda tangan PPK belum lengkap ({kurangPpk.join(", ")}); bagian itu tercetak titik-titik. Lengkapi lewat tombol Data penanda tangan.
        </p>
      )}
      <InputNomor label="Nomor Kwitansi" jenis="kw" dana={p.dana} tanggal={kwTgl} nilai={kw} onChange={setKw} />
      <Field label="Tanggal Kwitansi">
        <input type="date" value={kwTgl} min={minimal} onChange={(e) => setKwTgl(e.target.value)} />
      </Field>
      <InputNomor label="Nomor BAP (Berita Acara Pemeriksaan)" jenis="bap" dana={p.dana} tanggal={bapTgl} nilai={bap} onChange={gantiBap} />
      <Field label="Tanggal BAP">
        <input type="date" value={bapTgl} min={minimal} onChange={(e) => setBapTgl(e.target.value)} />
      </Field>
      <InputNomor label="Nomor BAST (Berita Acara Serah Terima)" jenis="bast" dana={p.dana} tanggal={bastTgl} nilai={bast} onChange={setBast} />
      <Field label="Tanggal BAST">
        <input type="date" value={bastTgl} min={minimal} onChange={(e) => setBastTgl(e.target.value)} />
      </Field>
      <TabelLampiran judul="Lampiran Kwitansi, BAP & BAST" item={p.item} harga="beli" ppn={p.nota?.ppn ?? p.ppn} centang={centang} onInfo={toast} />
      <label className="full cek-baris">
        <input type="checkbox" checked={centang} onChange={(e) => setCentang(e.target.checked)} />
        Beri tanda √ pada kolom MEMENUHI di Lampiran BAP (kosongkan bila diisi tangan)
      </label>
    </Modal>
  );
}

/* =====================================================================
   Batalkan tahap terakhir & hapus paket
   ===================================================================== */
function FormBatal({ p, onClose }: { p: Paket; onClose: () => void }) {
  const { batalTahapPaket, toast } = useStore();
  const [alasan, setAlasan] = useState("");
  const nama = TAHAP[p.tahap - 1].nama;
  const kembali = TAHAP[p.tahap - 2]?.nama;
  return (
    <Modal
      title={`Batalkan ${nama}?`}
      description={
        p.tahap === 4
          ? `Dokumen belanja ${p.pengajuanId} dikeluarkan dari Daftar Pencairan. Isian kwitansi tetap tersimpan sehingga bisa diperbaiki lalu diterbitkan ulang.`
          : `Paket kembali ke tahap ${kembali} sehingga tahap itu bisa diperbaiki. Isian ${nama.toLowerCase()} tetap tersimpan untuk diterbitkan ulang.`
      }
      submitLabel={`Batalkan ${nama}`}
      bahaya
      onSubmit={async () => {
        if (alasan.trim().length < 5) return toast("Tuliskan alasan pembatalan (minimal 5 karakter)");
        if (!(await batalTahapPaket(p.id, alasan))) return;
        toast(`${p.id}: ${nama} dibatalkan`);
        onClose();
      }}
      onClose={onClose}
    >
      <div className="full ringkas">
        <div><span>Paket</span><b>{p.id}</b></div>
        <div><span>Pekerjaan</span><b>{p.pekerjaan}</b></div>
      </div>
      <Field label="Alasan pembatalan" full>
        <textarea rows={2} value={alasan} onChange={(e) => setAlasan(e.target.value)} placeholder="mis. Nomor kwitansi salah ketik" />
      </Field>
    </Modal>
  );
}

function FormHapus({ p, onClose, onDone }: { p: Paket; onClose: () => void; onDone: () => void }) {
  const { hapusPaket, toast } = useStore();
  const [alasan, setAlasan] = useState("");
  return (
    <Modal
      title={`Hapus paket ${p.id}?`}
      description="Nota Dinas & HPS paket ini dihapus dari daftar. Isi dan alasan penghapusan tetap tersimpan di Riwayat Aktivitas."
      submitLabel="Hapus paket"
      bahaya
      onSubmit={async () => {
        if (alasan.trim().length < 5) return toast("Tuliskan alasan penghapusan (minimal 5 karakter)");
        if (!(await hapusPaket(p.id, alasan))) return;
        toast(`${p.id} dihapus`);
        onDone();
      }}
      onClose={onClose}
    >
      <div className="full ringkas">
        <div><span>Pekerjaan</span><b>{p.pekerjaan}</b></div>
        <div><span>Nota Dinas</span><b className="mono">{p.nd.nomor}</b></div>
        <div className="total"><span>Total HPS</span><b>{rupiah(totalHps(p).total)}</b></div>
      </div>
      <Field label="Alasan penghapusan" full>
        <textarea rows={2} value={alasan} onChange={(e) => setAlasan(e.target.value)} placeholder="mis. Kegiatan dibatalkan" />
      </Field>
    </Modal>
  );
}

/* =====================================================================
   Data penanda tangan (NIP, pangkat, SK) — akun sendiri atau oleh Administrator
   ===================================================================== */
export function FormDataPejabat({ id, onClose }: { id: string; onClose: () => void }) {
  const { pengguna, simpanDataPejabat, toast } = useStore();
  const u = pengguna.find((x) => x.id === id);
  const [nip, setNip] = useState(u?.nip ?? "");
  const [pangkat, setPangkat] = useState(u?.pangkat ?? "");
  const [sk, setSk] = useState(u?.skNomor ?? "");
  const [skTgl, setSkTgl] = useState(u?.skTanggal ?? "");
  const ppk = u?.peran === "PPK";
  if (!u) return null;
  return (
    <Modal
      title="Data penanda tangan"
      description={`Dicetak di bawah nama ${u.nama} pada dokumen pengadaan.${ppk ? " Nomor & tanggal SK penunjukan PPK dicetak di BAP." : ""}`}
      submitLabel="Simpan"
      onSubmit={async () => {
        const digit = nip.replace(/\s/g, "");
        if (nip.trim() && (!/^[\d ]+$/.test(nip) || digit.length !== 18)) return toast("NIP harus 18 digit angka (boleh berspasi)");
        const r = await simpanDataPejabat(u.id, { nip, pangkat, skNomor: ppk ? sk : u.skNomor ?? "", skTanggal: ppk ? skTgl : u.skTanggal ?? "" });
        if (!r) return;
        toast(r.berubah ? "Data penanda tangan tersimpan" : "Belum ada perubahan untuk disimpan");
        if (r.berubah) onClose();
      }}
      onClose={onClose}
    >
      <Field label="NIP">
        <input value={nip} onChange={(e) => setNip(e.target.value)} className="mono" inputMode="numeric" placeholder="198810262015032003" />
      </Field>
      <Field label="Pangkat/golongan">
        <input value={pangkat} onChange={(e) => setPangkat(e.target.value)} placeholder="mis. Penata (III/c)" />
      </Field>
      {ppk && (
        <>
          <Field label="Nomor SK penunjukan PPK" full>
            <input value={sk} onChange={(e) => setSk(e.target.value)} placeholder="mis. SK-PIP.Mks 258 Tahun 2025" />
          </Field>
          <Field label="Tanggal SK">
            <input type="date" value={skTgl} onChange={(e) => setSkTgl(e.target.value)} />
          </Field>
        </>
      )}
    </Modal>
  );
}
