"use client";

/**
 * Pratinjau & cetak "Lembar Dokumen Belanja" (kertas A4).
 * Lembar dirender di atas halaman; saat dicetak hanya lembar ini yang ikut (lihat @media print di globals.css).
 * Setiap kali tombol Cetak ditekan, aksinya dicatat di Riwayat Aktivitas.
 * PPK boleh lebih dari satu akun: penanda tangan dipilih di bar pratinjau (bawaan: PPK pertama menurut nama).
 */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Icon from "./Icon";
import { useStore } from "./StoreProvider";
import { JENIS_BELANJA, jenisBelanjaDariAkun } from "@/lib/data";
import { hariIni, rupiah, sekarang, tanggal, tanggalJam, tanggalPanjang, terbilang } from "@/lib/format";
import type { Aktivitas, Kegiatan } from "@/lib/types";

export default function CetakKegiatan({ k, onClose }: { k: Kegiatan; onClose: () => void }) {
  const { pengguna, penggunaAktif, referensi, namaUnit, namaAkun, infoPengguna, catatCetak, cariMak, jejakDokumen } = useStore();
  const [siap, setSiap] = useState(false);
  const [waktuCetak] = useState(sekarang);
  /** riwayat lengkap dokumen dari database (null = sedang dimuat) */
  const [riwayat, setRiwayat] = useState<Aktivitas[] | null>(null);
  const daftarPpk = pengguna.filter((u) => u.peran === "PPK" && u.aktif && !u.dihapus).sort((a, b) => a.nama.localeCompare(b.nama, "id"));
  /** id PPK penanda tangan; "" = tanpa nama (titik-titik) */
  const [idPpk, setIdPpk] = useState(() => daftarPpk[0]?.id ?? "");

  useEffect(() => {
    let batal = false;
    jejakDokumen(k.id).then((x) => !batal && setRiwayat(x));
    return () => {
      batal = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [k.id]);

  useEffect(() => {
    setSiap(true);
    document.body.classList.add("ada-cetak");
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.classList.remove("ada-cetak");
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  if (!siap) return null;

  const pembuat = infoPengguna(k.dibuatOleh);
  const ppk = daftarPpk.find((u) => u.id === idPpk);
  const jenis = jenisBelanjaDariAkun(k.akun);
  const namaJenis = JENIS_BELANJA.find((j) => j.kode === jenis)?.nama ?? "-";
  const namaDana = referensi.dana.find((d) => d.kode === k.dana)?.nama;
  const kalimat = terbilang(k.nilai);
  const mak = cariMak(k.mak);
  // Jejak dokumen urut dari yang paling awal (aksi cetak tidak ikut ditampilkan)
  const jejak = (riwayat ?? []).filter((a) => a.jenis !== "Cetak").slice().reverse();

  const status = [
    k.status,
    k.pencairan && `rekap pencairan ${k.pencairan.nomor} (${k.pencairan.jenis}, ${tanggal(k.pencairan.tanggal)})`,
    k.pengesahan && `rekap pengesahan ${k.pengesahan.nomor} (${tanggal(k.pengesahan.tanggal)})`,
  ]
    .filter(Boolean)
    .join(" · ");

  const cetak = () => {
    catatCetak(k);
    window.print();
  };

  return createPortal(
    <div className="pratinjau" role="dialog" aria-modal="true" aria-label={`Pratinjau cetak ${k.id}`}>
      <div className="pratinjau-bar">
        <div>
          <b>Pratinjau cetak</b>
          <span>{k.id} · kertas A4</span>
        </div>
        <div className="tbar">
          {daftarPpk.length > 1 && (
            <label className="pilih-ppk">
              <span>PPK</span>
              <select value={idPpk} onChange={(e) => setIdPpk(e.target.value)} aria-label="PPK penanda tangan">
                {daftarPpk.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nama}
                  </option>
                ))}
                <option value="">Tanpa nama</option>
              </select>
            </label>
          )}
          <button type="button" className="btn soft sm" onClick={onClose}>
            Tutup
          </button>
          <button type="button" className="btn acc sm" onClick={cetak}>
            <Icon name="print" />
            Cetak
          </button>
        </div>
      </div>

      <div className="pratinjau-isi" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
        <article className="kertas">
          <header className="kop">
            <p>Kementerian Perhubungan</p>
            <p>Badan Pengembangan Sumber Daya Manusia Perhubungan</p>
            <h2>Politeknik Ilmu Pelayaran Makassar</h2>
          </header>

          <h1>Lembar Dokumen Belanja</h1>
          <p className="nomor">Nomor: {k.id}</p>

          <table className="rincian">
            <tbody>
              <tr><th>Uraian kegiatan</th><td>{k.uraian}</td></tr>
              <tr><th>Unit kerja</th><td>{namaUnit(k.unit)}</td></tr>
              <tr><th>Dokumen</th><td>{k.jenisDokumen} · <span className="mono">{k.noDokumen}</span></td></tr>
              <tr><th>Tanggal dokumen</th><td>{tanggalPanjang(k.tanggal, false)}</td></tr>
              <tr><th>Penyedia</th><td>{k.penyedia}</td></tr>
              <tr><th>Sumber dana</th><td>{k.dana}{namaDana ? ` (${namaDana})` : ""}</td></tr>
              <tr>
                <th>Mata Anggaran Kegiatan</th>
                <td>
                  <span className="mono">{k.mak}</span>
                  {mak && (
                    <span className="mak-cetak">
                      <span>Kegiatan {mak.kegiatan.kode} · {mak.kegiatan.uraian}</span>
                      <span>KRO {mak.kro.kode} · {mak.kro.uraian}</span>
                      <span>RO {mak.ro.kode} · {mak.ro.uraian}</span>
                      <span>Komponen {mak.komponen.kode} · {mak.komponen.uraian}</span>
                      <span>Sub komponen {mak.subKomponen.kode} · {mak.subKomponen.uraian}</span>
                    </span>
                  )}
                </td>
              </tr>
              <tr><th>Akun</th><td><span className="mono">{k.akun}</span> {namaAkun(k.akun)}</td></tr>
              <tr><th>Jenis belanja</th><td>{namaJenis}</td></tr>
              <tr className="nilai"><th>Nilai</th><td>{rupiah(k.nilai)}</td></tr>
              <tr><th>Terbilang</th><td className="terbilang">{kalimat.charAt(0).toUpperCase() + kalimat.slice(1)}</td></tr>
              <tr><th>Status</th><td>{status}</td></tr>
            </tbody>
          </table>

          <h3>Jejak dokumen</h3>
          <table className="jejak">
            <thead>
              <tr><th>Waktu</th><th>Pelaku</th><th>Aktivitas</th></tr>
            </thead>
            <tbody>
              {riwayat === null ? (
                <tr><td colSpan={3}>Memuat jejak dokumen…</td></tr>
              ) : jejak.length === 0 ? (
                <tr><td colSpan={3}>Belum ada aktivitas tercatat.</td></tr>
              ) : (
                jejak.map((a) => (
                  <tr key={a.id}>
                    <td className="nowrap">{tanggalJam(a.waktu)}</td>
                    <td>{infoPengguna(a.oleh).nama}</td>
                    <td>
                      {a.aksi.charAt(0).toUpperCase() + a.aksi.slice(1)}
                      {a.perubahan?.length ? ` (${a.perubahan.map((p) => `${p.kolom}: ${p.dari} → ${p.ke}`).join("; ")})` : ""}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          <div className="ttd">
            <div>
              <p>Dicatat oleh,</p>
              <p>{pembuat.peran}</p>
              <div className="ruang" />
              <p className="nama">{pembuat.nama}</p>
            </div>
            <div>
              <p>Makassar, {tanggalPanjang(hariIni(), false)}</p>
              <p>Pejabat Pembuat Komitmen</p>
              <div className="ruang" />
              <p className="nama">{ppk?.nama ?? "............................"}</p>
              <p>NIP. ............................</p>
            </div>
          </div>

          <footer className="kaki">
            Dicetak dari Belanjaku oleh {penggunaAktif.nama} · {tanggalJam(waktuCetak)}
          </footer>
        </article>
      </div>
    </div>,
    document.body,
  );
}
