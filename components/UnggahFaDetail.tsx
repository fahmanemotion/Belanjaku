"use client";

/**
 * Upload FA Detail (SAKTI) untuk memperbarui Kertas Kerja POK.
 * Berkas dibaca di browser (lib/faDetail.ts), ringkasan & hasil validasinya ditampilkan dulu,
 * baru diterapkan setelah pengguna menekan "Terapkan data".
 */
import { useState } from "react";
import Icon from "./Icon";
import { useStore } from "./StoreProvider";
import { Modal } from "./ui";
import { bacaFaDetail, type HasilFa } from "@/lib/faDetail";
import { desimal, rupiah } from "@/lib/format";

export default function UnggahFaDetail({ onClose }: { onClose: () => void }) {
  const { terapkanPok, toast } = useStore();
  const [membaca, setMembaca] = useState(false);
  const [hasil, setHasil] = useState<HasilFa | null>(null);
  const [berkas, setBerkas] = useState<File | null>(null);
  const [seret, setSeret] = useState(false);

  const baca = async (f?: File | null) => {
    if (!f) return;
    setMembaca(true);
    setHasil(null);
    const h = await bacaFaDetail(f);
    setHasil(h);
    setBerkas(h.ok ? f : null);
    setMembaca(false);
  };

  const terapkan = async () => {
    if (!hasil?.ok) {
      toast(membaca ? "Tunggu, berkas masih dibaca" : "Pilih berkas FA Detail yang valid terlebih dahulu");
      return;
    }
    // data disimpan ke database; file asli diarsipkan di Supabase Storage
    if (await terapkanPok(hasil.data, berkas ?? undefined)) {
      const r = hasil.ringkasan;
      toast(`Kertas Kerja POK diperbarui · ${desimal(r.jumlahMak, 0)} MAK${r.jumlahItem ? ` · ${desimal(r.jumlahItem, 0)} item` : ""}`);
      onClose();
    }
  };

  const r = hasil?.ok ? hasil.ringkasan : null;

  return (
    <Modal
      title="Upload FA Detail"
      description="Berkas Excel (.xlsx) dari SAKTI: Laporan Realisasi FA Detail 16 Segmen, per Program sampai Akun atau Item. Kertas Kerja POK untuk semua pengguna akan diganti dengan isi berkas ini."
      submitLabel="Terapkan data"
      onSubmit={terapkan}
      onClose={onClose}
    >
      <label
        className={`unggah-zona full ${seret ? "seret" : ""} ${r ? "ada" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setSeret(true);
        }}
        onDragLeave={() => setSeret(false)}
        onDrop={(e) => {
          e.preventDefault();
          setSeret(false);
          baca(e.dataTransfer.files?.[0]);
        }}
      >
        <input
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={(e) => {
            baca(e.target.files?.[0]);
            e.target.value = ""; // berkas yang sama bisa dipilih ulang
          }}
        />
        <span className="unggah-ikon">
          <Icon name={r ? "file" : "upload"} />
        </span>
        <b>{membaca ? "Membaca berkas…" : r ? r.file : "Pilih berkas atau seret ke sini"}</b>
        <small>{r ? "Klik untuk memilih berkas lain" : "Format .xlsx · Laporan FA Detail 16 Segmen dari SAKTI"}</small>
      </label>

      {hasil && !hasil.ok && (
        <p className="unggah-galat full" role="alert">
          <Icon name="info" />
          {hasil.pesan}
        </p>
      )}

      {r && (
        <>
          <div className="full ringkas unggah-ringkas">
            <div><span>Satuan kerja</span><b>{r.satker || "-"}</b></div>
            <div><span>Periode</span><b>{r.periode || "-"}</b></div>
            <div><span>Rincian</span><b>{r.tingkat === "item" ? `${desimal(r.jumlahMak, 0)} MAK · ${desimal(r.jumlahItem, 0)} item` : `${desimal(r.jumlahMak, 0)} MAK (tanpa item)`}</b></div>
            <div><span>Pagu</span><b className="num">{rupiah(r.total.pagu)}</b></div>
            <div><span>Realisasi</span><b className="num">{rupiah(r.total.realisasi)}</b></div>
            {r.total.lock > 0 && <div><span>Lock pagu</span><b className="num">{rupiah(r.total.lock)}</b></div>}
            <div className="total"><span>Sisa anggaran</span><b className="num">{rupiah(r.total.sisa)}</b></div>
          </div>

          <ul className="unggah-cek full" aria-label="Hasil validasi">
            {r.totalLaporan && (
              <li className={r.totalCocok ? "ok" : "warn"}>
                <Icon name={r.totalCocok ? "check" : "info"} />
                {r.totalCocok
                  ? "Pagu, lock pagu, dan realisasi cocok dengan baris JUMLAH SELURUHNYA"
                  : `Total belum cocok dengan baris JUMLAH SELURUHNYA (laporan: pagu ${rupiah(r.totalLaporan.pagu)}, realisasi ${rupiah(r.totalLaporan.realisasi)}) — periksa kembali berkasnya`}
              </li>
            )}
            <li className="ok">
              <Icon name="check" />
              Sumber dana terisi dari kode akun: RM {desimal(r.makRm, 0)} MAK · BLU {desimal(r.makBlu, 0)} MAK
            </li>
            {r.tingkat === "item" && (
              <li className={r.itemTidakCocok ? "warn" : "ok"}>
                <Icon name={r.itemTidakCocok ? "info" : "check"} />
                {r.itemTidakCocok ? `${r.itemTidakCocok} akun: jumlah item tidak sama dengan nilai akunnya` : "Jumlah item sama dengan nilai setiap akun"}
              </li>
            )}
            {r.barisSambungan > 0 && (
              <li className="ok">
                <Icon name="check" />
                {r.barisSambungan} uraian yang terpotong pergantian halaman sudah digabung
              </li>
            )}
            {r.peringatan.map((p) => (
              <li key={p} className="warn">
                <Icon name="info" />
                {p}
              </li>
            ))}
          </ul>
        </>
      )}
    </Modal>
  );
}
