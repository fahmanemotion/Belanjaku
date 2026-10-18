"use client";

/**
 * Pratinjau & cetak "Lembar Pengajuan Belanja" (kertas A4).
 * Lembar dirender di atas halaman; saat dicetak hanya lembar ini yang ikut (lihat @media print di globals.css).
 * Setiap kali tombol Cetak ditekan, aksinya dicatat di Riwayat Aktivitas.
 */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Icon from "./Icon";
import { useStore } from "./StoreProvider";
import { JENIS_BELANJA, NAMA_TAHAP, jenisBelanjaDariAkun } from "@/lib/data";
import { hariIni, rupiah, sekarang, tanggalJam, tanggalPanjang, terbilang } from "@/lib/format";
import type { Kegiatan } from "@/lib/types";

export default function CetakKegiatan({ k, onClose }: { k: Kegiatan; onClose: () => void }) {
  const { aktivitas, pengguna, penggunaAktif, referensi, namaUnit, namaAkun, infoPengguna, catat, cariMak } = useStore();
  const [siap, setSiap] = useState(false);
  const [waktuCetak] = useState(sekarang);

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
  const ppk = pengguna.find((u) => u.peran === "PPK" && u.aktif);
  const jenis = jenisBelanjaDariAkun(k.akun);
  const namaJenis = JENIS_BELANJA.find((j) => j.kode === jenis)?.nama ?? "-";
  const namaDana = referensi.dana.find((d) => d.kode === k.dana)?.nama;
  const kalimat = terbilang(k.nilai);
  const mak = cariMak(k.mak);
  // Jejak dokumen urut dari yang paling awal (aksi cetak tidak ikut ditampilkan)
  const jejak = aktivitas.filter((a) => a.objekId === k.id && a.jenis !== "Cetak").slice().reverse();

  const status =
    k.status +
    (k.spp ? ` · ${k.spp.no} (tahap ${NAMA_TAHAP[k.spp.tahap]})` : "") +
    (k.disahkan ? ` · disahkan ${k.disahkan.nomor}` : "");

  const cetak = () => {
    catat({ jenis: "Cetak", modul: "Belanja", aksi: "mencetak lembar pengajuan", objekId: k.id, objekLabel: k.uraian });
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

          <h1>Lembar Pengajuan Belanja</h1>
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
              {jejak.length === 0 ? (
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
              <p>Dibuat oleh,</p>
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
