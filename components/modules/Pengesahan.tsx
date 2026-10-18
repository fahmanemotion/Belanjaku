"use client";

/**
 * Modul Pengesahan
 * - Riwayat       : rekap pengesahan per periode (Pencairan, Pengesahan, Outstanding)
 *                   + daftar kegiatan yang sudah disahkan
 * - Daftar Belanja: kegiatan dari modul Pencairan (kolom sama dengan tabel kegiatan lain)
 *                   dengan kotak centang; operator memilih kegiatan yang akan disahkan
 */
import { useMemo, useState } from "react";
import Icon from "@/components/Icon";
import { JUMLAH_KOLOM_KEGIATAN, KepalaKegiatan, SelKegiatan } from "@/components/KolomKegiatan";
import { useStore } from "@/components/StoreProvider";
import { Badge, EmptyRow, Modal, PageHead, SearchBox, Status } from "@/components/ui";
import { NAMA_TAHAP, jumlah, periodeBerjalan } from "@/lib/data";
import { desimal, rupiah, tanggal } from "@/lib/format";
import type { Kegiatan, Sp3bBlu } from "@/lib/types";

type Tampilan = "riwayat" | "daftar";

const bisaDisahkan = (k: Kegiatan) => k.spp?.tahap === 4 && !k.disahkan;
/** periode SP3B bulan berjalan (zona waktu Makassar) */
const PERIODE_BERJALAN = periodeBerjalan();

export default function Pengesahan() {
  const { pengesahan: riwayatLama, kegiatan, sahkan, boleh, toast } = useStore();
  // Hanya peran dengan izin pengesahan (Bendahara Pengeluaran) yang bisa memilih & mengesahkan
  const bisaSahkan = boleh("pengesahan.sahkan");
  const [tampilan, setTampilan] = useState<Tampilan>("riwayat");
  const [dipilih, setDipilih] = useState<string[]>([]);
  const [konfirmasi, setKonfirmasi] = useState(false);
  const [baruDisahkan, setBaruDisahkan] = useState<string[]>([]);

  // Hanya belanja BLU yang sudah masuk proses pencairan yang disahkan lewat SP3B BLU
  const dokBlu = useMemo(() => kegiatan.filter((k) => k.dana === "BLU" && k.spp), [kegiatan]);
  const cairBulanIni = dokBlu.filter((k) => k.spp!.tahap === 4 && k.spp!.tanggal.startsWith(PERIODE_BERJALAN.bulan));
  const disahkanBulanIni = dokBlu.filter((k) => k.disahkan?.nomor === PERIODE_BERJALAN.nomor);
  const siap = dokBlu.filter(bisaDisahkan);

  const periodeBerjalan: Sp3bBlu = {
    nomor: PERIODE_BERJALAN.nomor,
    periode: PERIODE_BERJALAN.periode,
    bulan: PERIODE_BERJALAN.bulan,
    pencairan: jumlah(cairBulanIni.map((k) => k.nilai)),
    pengesahan: jumlah(disahkanBulanIni.map((k) => k.nilai)),
  };
  const riwayat = [periodeBerjalan, ...riwayatLama];
  const terpilih = dokBlu.filter((k) => dipilih.includes(k.id));

  const prosesSahkan = async () => {
    const n = dipilih.length;
    const nomor = await sahkan(dipilih);
    if (!nomor) return;
    setBaruDisahkan(dipilih);
    setDipilih([]);
    setKonfirmasi(false);
    setTampilan("riwayat");
    toast(`${n} kegiatan disahkan pada ${nomor}`);
  };

  return (
    <>
      <PageHead
        title="Pengesahan"
        subtitle="Pengesahan belanja BLU yang sudah dicairkan (SP3B BLU) ke KPPN setiap bulan."
        actions={
          <div className="seg seg-sm seg-ic" role="group" aria-label="Tampilan">
            <button type="button" className={tampilan === "riwayat" ? "on" : ""} aria-pressed={tampilan === "riwayat"} onClick={() => setTampilan("riwayat")}>
              <Icon name="stamp" />
              Riwayat
            </button>
            <button type="button" className={tampilan === "daftar" ? "on" : ""} aria-pressed={tampilan === "daftar"} onClick={() => setTampilan("daftar")}>
              <Icon name="cart" />
              Daftar Belanja
              {bisaSahkan && siap.length > 0 && <span className="count">{siap.length}</span>}
            </button>
          </div>
        }
      />

      {tampilan === "riwayat" ? (
        <Riwayat riwayat={riwayat} berjalan={periodeBerjalan} dokumen={dokBlu} baru={baruDisahkan} keDaftar={bisaSahkan ? () => setTampilan("daftar") : undefined} />
      ) : (
        <DaftarBelanja dokumen={dokBlu} dipilih={dipilih} setDipilih={setDipilih} onSahkan={() => setKonfirmasi(true)} bisaSahkan={bisaSahkan} />
      )}

      {konfirmasi && (
        <Modal
          title={`Sahkan ${dipilih.length} kegiatan`}
          description={`Kegiatan berikut dicatat pada ${PERIODE_BERJALAN.nomor} periode ${PERIODE_BERJALAN.periode}.`}
          submitLabel="Sahkan"
          onSubmit={prosesSahkan}
          onClose={() => setKonfirmasi(false)}
        >
          <div className="full ringkas">
            {terpilih.map((k) => (
              <div key={k.id}>
                <span>{k.uraian}</span>
                <b className="num">{rupiah(k.nilai)}</b>
              </div>
            ))}
            <div className="total">
              <span>Total pengesahan</span>
              <b className="num">{rupiah(jumlah(terpilih.map((k) => k.nilai)))}</b>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

/* =========================================================
   Tampilan Riwayat
   ========================================================= */
function Riwayat({
  riwayat,
  berjalan,
  dokumen,
  baru,
  keDaftar,
}: {
  riwayat: Sp3bBlu[];
  berjalan: Sp3bBlu;
  dokumen: Kegiatan[];
  baru: string[];
  /** tidak diisi bila peran tidak berwenang mengesahkan */
  keDaftar?: () => void;
}) {
  const outstanding = berjalan.pencairan - berjalan.pengesahan;
  const persen = berjalan.pencairan ? (berjalan.pengesahan / berjalan.pencairan) * 100 : 0;
  const C = 2 * Math.PI * 58;
  const kegiatanDisahkan = dokumen
    .filter((k) => k.disahkan)
    .sort((a, b) => (b.disahkan!.tanggal + b.spp!.no).localeCompare(a.disahkan!.tanggal + a.spp!.no));
  const totalOutstanding = jumlah(riwayat.map((r) => r.pencairan - r.pengesahan));

  return (
    <div className="tumpuk">
      <div className="two">
        <section className="panel">
          <h3>Periode Berjalan</h3>
          <p className="sub mono">{berjalan.nomor}</p>
          <svg className="ring" viewBox="0 0 150 150" role="img" aria-label={`${desimal(persen)} persen pencairan sudah disahkan`}>
            <circle cx="75" cy="75" r="58" fill="none" style={{ stroke: "var(--sub)" }} strokeWidth={14} />
            <circle
              cx="75" cy="75" r="58" fill="none" style={{ stroke: "var(--accent)" }} strokeWidth={14}
              strokeLinecap="round" strokeDasharray={`${(C * Math.min(100, persen)) / 100} ${C}`} transform="rotate(-90 75 75)"
            />
            <text x="75" y="74" textAnchor="middle" fontSize={24} fontWeight={700} style={{ fill: "var(--ink)" }}>
              {desimal(persen, 0)}%
            </text>
            <text x="75" y="93" textAnchor="middle" fontSize={11} style={{ fill: "var(--muted)" }}>
              sudah disahkan
            </text>
          </svg>
          <div>
            <div className="prow"><span>Periode</span><b>{berjalan.periode}</b></div>
            <div className="prow"><span>Pencairan</span><b className="num">{rupiah(berjalan.pencairan)}</b></div>
            <div className="prow"><span>Pengesahan</span><b className="num">{rupiah(berjalan.pengesahan)}</b></div>
            <div className="prow">
              <span>Outstanding</span>
              <b className="num" style={{ color: outstanding > 0 ? "var(--warn)" : "var(--good)" }}>{rupiah(outstanding)}</b>
            </div>
          </div>
          {outstanding > 0 && keDaftar && (
            <button type="button" className="btn acc" style={{ width: "100%", marginTop: 14 }} onClick={keDaftar}>
              <Icon name="check" />
              Pilih kegiatan untuk disahkan
            </button>
          )}
        </section>

        <section className="panel">
          <div className="ph">
            <div>
              <h3>Riwayat Pengesahan</h3>
              <p className="sub">Total outstanding seluruh periode: {rupiah(totalOutstanding)}</p>
            </div>
          </div>
          <div className="tw stack">
            <table>
              <thead>
                <tr>
                  <th>Nomor</th>
                  <th>Periode</th>
                  <th className="r">Pencairan</th>
                  <th className="r">Pengesahan</th>
                  <th className="r">Outstanding</th>
                </tr>
              </thead>
              <tbody>
                {riwayat.map((r, i) => {
                  const os = r.pencairan - r.pengesahan;
                  return (
                    <tr key={r.nomor} className={i === 0 ? "baris-berjalan" : undefined}>
                      <td className="mono" data-label="Nomor">{r.nomor}</td>
                      <td className="main">
                        <b>{r.periode}</b>
                        {i === 0 && <span className="note"> · berjalan</span>}
                      </td>
                      <td className="r num" data-label="Pencairan">{rupiah(r.pencairan)}</td>
                      <td className="r num" data-label="Pengesahan">{rupiah(r.pengesahan)}</td>
                      <td className="r num" data-label="Outstanding" style={{ color: os > 0 ? "var(--warn)" : "var(--good)", fontWeight: 700 }}>
                        {rupiah(os)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <section className="panel">
        <div className="ph">
          <div>
            <h3>Kegiatan Disahkan</h3>
            <p className="sub">
              {kegiatanDisahkan.length} kegiatan · total {rupiah(jumlah(kegiatanDisahkan.map((k) => k.nilai)))}
            </p>
          </div>
        </div>
        <div className="tw stack">
          <table>
            <thead>
              <tr>
                <th>No. SPP</th>
                <th>Uraian Kegiatan</th>
                <th>Jenis</th>
                <th className="r">Nilai</th>
                <th>Tgl. Pengesahan</th>
                <th>No. Pengesahan</th>
              </tr>
            </thead>
            <tbody>
              {kegiatanDisahkan.length === 0 ? (
                <EmptyRow cols={6}>
                  Belum ada kegiatan yang disahkan pada {PERIODE_BERJALAN.periode}. Pilih kegiatan lewat tombol <b>Daftar Belanja</b>.
                </EmptyRow>
              ) : (
                kegiatanDisahkan.map((k) => (
                  <tr key={k.id} className={baru.includes(k.id) ? "baru" : undefined}>
                    <td className="mono" data-label="No. SPP">{k.spp!.no}</td>
                    <td className="main">
                      <b>{k.uraian}</b>
                      {baru.includes(k.id) && <span className="badge g" style={{ marginLeft: 8 }}>Baru</span>}
                    </td>
                    <td data-label="Jenis"><Badge tone={k.spp!.jenis === "LS" ? "i" : k.spp!.jenis === "GU" ? "w" : ""}>{k.spp!.jenis}</Badge></td>
                    <td className="r num" data-label="Nilai"><b>{rupiah(k.nilai)}</b></td>
                    <td className="num" data-label="Tgl. Pengesahan">{tanggal(k.disahkan!.tanggal)}</td>
                    <td className="mono" data-label="No. Pengesahan">{k.disahkan!.nomor}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

/* =========================================================
   Tampilan Daftar Belanja (kolom sama dengan tabel kegiatan lain + kotak centang)
   ========================================================= */
function DaftarBelanja({
  dokumen,
  dipilih,
  setDipilih,
  onSahkan,
  bisaSahkan,
}: {
  dokumen: Kegiatan[];
  dipilih: string[];
  setDipilih: (v: string[]) => void;
  onSahkan: () => void;
  bisaSahkan: boolean;
}) {
  const [cari, setCari] = useState("");
  const q = cari.toLowerCase();
  const baris = dokumen
    .filter((k) => [k.uraian, k.noDokumen, k.penyedia, k.spp!.no].join(" ").toLowerCase().includes(q))
    .sort((a, b) => b.spp!.no.localeCompare(a.spp!.no));
  const bisa = bisaSahkan ? baris.filter(bisaDisahkan) : [];
  const semua = bisa.length > 0 && bisa.every((k) => dipilih.includes(k.id));
  const sebagian = bisa.some((k) => dipilih.includes(k.id)) && !semua;
  const total = jumlah(dokumen.filter((k) => dipilih.includes(k.id)).map((k) => k.nilai));

  const toggle = (id: string) => setDipilih(dipilih.includes(id) ? dipilih.filter((x) => x !== id) : [...dipilih, id]);
  const toggleSemua = () =>
    setDipilih(semua ? dipilih.filter((x) => !bisa.some((k) => k.id === x)) : [...new Set([...dipilih, ...bisa.map((k) => k.id)])]);

  return (
    <section className="panel">
      <div className="ph">
        <div>
          <h3>Daftar Belanja</h3>
          <p className="sub">
            {bisaSahkan
              ? `Belanja BLU dari modul Pencairan. Centang kegiatan yang SP2D-nya sudah terbit untuk disahkan pada ${PERIODE_BERJALAN.periode}.`
              : "Belanja BLU dari modul Pencairan. Pengesahan dilakukan oleh Bendahara Pengeluaran; Anda hanya dapat melihat."}
          </p>
        </div>
        <SearchBox id="sah-cari" value={cari} onChange={setCari} placeholder="Cari kegiatan, dokumen, penyedia" />
      </div>

      <div className="tw stack">
        <table className="tabel-pilih tabel-kegiatan">
          <thead>
            <tr>
              <th className="pick">
                <input
                  type="checkbox"
                  aria-label="Pilih semua kegiatan yang bisa disahkan"
                  checked={semua}
                  ref={(el) => {
                    if (el) el.indeterminate = sebagian;
                  }}
                  onChange={toggleSemua}
                  disabled={bisa.length === 0}
                />
              </th>
              <KepalaKegiatan />
              <th>Posisi</th>
            </tr>
          </thead>
          <tbody>
            {baris.length === 0 ? (
              <EmptyRow cols={JUMLAH_KOLOM_KEGIATAN + 2}>Tidak ada kegiatan yang cocok.</EmptyRow>
            ) : (
              baris.map((k) => {
                const aktif = bisaSahkan && bisaDisahkan(k);
                const cek = dipilih.includes(k.id);
                return (
                  <tr key={k.id} className={`${aktif ? "bisa" : "tidak"} ${cek ? "dipilih" : ""}`} onClick={aktif ? () => toggle(k.id) : undefined}>
                    <td className="pick">
                      <input
                        type="checkbox"
                        checked={cek}
                        disabled={!aktif}
                        onChange={() => toggle(k.id)}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`Pilih ${k.uraian}`}
                      />
                    </td>
                    <SelKegiatan k={k} />
                    <td data-label="Posisi">
                      {k.disahkan ? (
                        <Status tone="i">Disahkan</Status>
                      ) : k.spp!.tahap === 4 ? (
                        <Status tone="g">SP2D terbit</Status>
                      ) : (
                        <Status tone="m">Belum cair · {NAMA_TAHAP[k.spp!.tahap]}</Status>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {bisaSahkan && (
      <div className={`pickbar ${dipilih.length ? "aktif" : ""}`}>
        <div>
          <b>{dipilih.length} kegiatan dipilih</b>
          <span className="num">{rupiah(total)}</span>
        </div>
        <div className="tbar">
          {dipilih.length > 0 ? (
            <button type="button" className="btn soft sm" onClick={() => setDipilih([])}>
              Batal pilih
            </button>
          ) : (
            bisa.length > 0 && (
              <button type="button" className="btn soft sm" onClick={toggleSemua}>
                Pilih semua ({bisa.length})
              </button>
            )
          )}
          <button type="button" className="btn acc sm" disabled={dipilih.length === 0} onClick={onSahkan}>
            <Icon name="stamp" />
            Sahkan
          </button>
        </div>
      </div>
      )}
    </section>
  );
}
