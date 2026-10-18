"use client";

import { useMemo, useState } from "react";
import CetakKegiatan from "@/components/CetakKegiatan";
import Combobox, { type OpsiCombo } from "@/components/Combobox";
import Icon, { type IconName } from "@/components/Icon";
import { JUMLAH_KOLOM_KEGIATAN, KepalaKegiatan, SelKegiatan } from "@/components/KolomKegiatan";
import { STATUS_PERLU_ULANG, useStore } from "@/components/StoreProvider";
import { EmptyRow, Field, Modal, PageHead, SearchBox, Status, Tabs, type Tone } from "@/components/ui";
import { JENIS_DOKUMEN, STATUS_BELANJA, akunSesuaiDana, infoJenisDokumen } from "@/lib/data";
import { hariIni, rupiah, rupiahSingkat } from "@/lib/format";
import { akunDariMak } from "@/lib/mak";
import type { JenisDokumen, Kegiatan, StatusBelanja, SumberDana } from "@/lib/types";

export const TONE_BELANJA: Record<StatusBelanja, Tone> = {
  Draf: "m",
  Diajukan: "w",
  Diverifikasi: "i",
  Disetujui: "g",
  Ditolak: "b",
};

type Filter = "Semua" | StatusBelanja;

export default function Belanja() {
  const { kegiatan, ubahStatus, izinUbah, infoPengguna, penggunaAktif, boleh, namaUnit, toast } = useStore();
  const [filter, setFilter] = useState<Filter>("Semua");
  const [cari, setCari] = useState("");
  const [formBaru, setFormBaru] = useState(false);
  const [diedit, setDiedit] = useState<Kegiatan | null>(null);
  const [dihapus, setDihapus] = useState<Kegiatan | null>(null);
  const [dicetak, setDicetak] = useState<Kegiatan | null>(null);
  /** id dokumen yang sedang diproses (tombol alur terkunci sampai selesai) */
  const [proses, setProses] = useState<string | null>(null);

  const bisaBuat = boleh("belanja.buat");
  const bisaVerifikasi = boleh("belanja.verifikasi");
  const bisaSetujui = boleh("belanja.setujui");
  const semuaUnit = boleh("belanja.lihatSemua");

  // Tanpa izin "lihat semua" (Operator Unit) hanya pengajuan unitnya sendiri yang tampil
  const terlihat = useMemo(
    () => (semuaUnit ? kegiatan : kegiatan.filter((k) => k.unit === penggunaAktif.unit)),
    [kegiatan, semuaUnit, penggunaAktif.unit],
  );
  const total = (s: StatusBelanja[]) => terlihat.filter((k) => s.includes(k.status)).reduce((a, k) => a + k.nilai, 0);
  const jumlah = (s: StatusBelanja) => terlihat.filter((k) => k.status === s).length;

  const baris = useMemo(() => {
    const q = cari.toLowerCase();
    return terlihat.filter(
      (k) =>
        (filter === "Semua" || k.status === filter) &&
        [k.id, k.uraian, k.noDokumen, k.penyedia, k.akun, k.mak].join(" ").toLowerCase().includes(q),
    );
  }, [terlihat, filter, cari]);

  const ubah = async (k: Kegiatan, status: StatusBelanja, pesan: string) => {
    setProses(k.id);
    if (await ubahStatus(k.id, status)) toast(pesan);
    setProses(null);
  };

  /** Tombol alur sesuai status dokumen dan peran yang sedang masuk */
  const alur = (k: Kegiatan) => {
    const milik = k.dibuatOleh === penggunaAktif.id;
    const sibuk = proses === k.id;
    if (k.status === "Draf")
      return milik && bisaBuat ? (
        <button type="button" className="btn soft sm" disabled={sibuk} onClick={() => ubah(k, "Diajukan", "Pengajuan diajukan, menunggu verifikasi pagu")}>
          {sibuk ? "Memproses…" : "Ajukan"}
        </button>
      ) : (
        <span className="note">Belum diajukan</span>
      );
    if (k.status === "Diajukan")
      return bisaVerifikasi ? (
        <button type="button" className="btn soft sm" disabled={sibuk} onClick={() => ubah(k, "Diverifikasi", "Pagu terverifikasi, menunggu persetujuan PPK")}>
          {sibuk ? "Memproses…" : "Verifikasi"}
        </button>
      ) : (
        <span className="note">Menunggu verifikasi</span>
      );
    if (k.status === "Diverifikasi")
      return bisaSetujui ? (
        <div className="tbar" style={{ gap: 6, flexWrap: "nowrap" }}>
          <button type="button" className="btn dark sm" disabled={sibuk} onClick={() => ubah(k, "Disetujui", "Pengajuan disetujui PPK")}>
            Setujui
          </button>
          <button type="button" className="btn soft sm" disabled={sibuk} onClick={() => ubah(k, "Ditolak", "Pengajuan dikembalikan ke unit")}>
            Tolak
          </button>
        </div>
      ) : (
        <span className="note">Menunggu persetujuan PPK</span>
      );
    if (k.status === "Disetujui" && !k.spp) return <span className="note">Siap dibuat SPP</span>;
    return null;
  };

  /** Ikon edit · hapus · cetak. Edit & hapus hanya untuk peran pembuat pengajuan, terkunci bila bukan dokumennya. */
  const ikonAksi = (k: Kegiatan) => {
    const izin = izinUbah(k);
    const kunci = izin.boleh ? undefined : izin.alasan;
    return (
      <div className="ikon-aksi">
        {bisaBuat && (
          <>
            <TombolIkon ikon="edit" label={`Edit ${k.id}`} kunci={kunci} onClick={() => (kunci ? toast(kunci) : setDiedit(k))} />
            <TombolIkon ikon="trash" label={`Hapus ${k.id}`} kunci={kunci} bahaya onClick={() => (kunci ? toast(kunci) : setDihapus(k))} />
          </>
        )}
        <TombolIkon ikon="print" label={`Cetak ${k.id}`} onClick={() => setDicetak(k)} />
      </div>
    );
  };

  // Keterangan hak akses di atas tabel
  const keterangan = [
    !semuaUnit && `Menampilkan pengajuan ${namaUnit(penggunaAktif.unit)}.`,
    bisaVerifikasi && "Anda memverifikasi pagu pengajuan yang diajukan.",
    bisaSetujui && "Anda menyetujui atau menolak pengajuan yang sudah diverifikasi.",
    bisaBuat && "Edit & hapus hanya untuk dokumen buatan Anda.",
    !bisaBuat && !bisaVerifikasi && !bisaSetujui && "Anda dapat melihat dan mencetak pengajuan.",
  ].filter(Boolean);

  return (
    <>
      <PageHead
        title="Belanja"
        subtitle="Pengajuan belanja unit kerja: diajukan operator, diverifikasi pagunya, lalu disetujui PPK sebelum dicairkan."
        actions={
          bisaBuat ? (
            <button type="button" className="btn acc" onClick={() => setFormBaru(true)}>
              <Icon name="plus" />
              Pengajuan Baru
            </button>
          ) : undefined
        }
      />

      <div className="stats">
        <div className="stat hot">
          <div className="lbl">Total diajukan</div>
          <div className="big num">{rupiahSingkat(total(["Diajukan", "Diverifikasi", "Disetujui", "Ditolak"]))}</div>
          <div className="note">{terlihat.length} kegiatan</div>
        </div>
        <div className="stat">
          <div className="lbl">Menunggu verifikasi</div>
          <div className="big num">{jumlah("Diajukan")}</div>
          <div className="note">{rupiahSingkat(total(["Diajukan"]))}</div>
        </div>
        <div className="stat">
          <div className="lbl">Disetujui PPK</div>
          <div className="big num">{jumlah("Disetujui")}</div>
          <div className="note">{rupiahSingkat(total(["Disetujui"]))}</div>
        </div>
        <div className="stat">
          <div className="lbl">Ditolak / dikembalikan</div>
          <div className="big num">{jumlah("Ditolak")}</div>
          <div className="note">{rupiahSingkat(total(["Ditolak"]))}</div>
        </div>
      </div>

      <section className="panel">
        <div className="ph">
          <Tabs<Filter>
            label="Filter status"
            value={filter}
            onChange={setFilter}
            items={[{ value: "Semua", label: "Semua" }, ...STATUS_BELANJA.map((s) => ({ value: s, label: s }))]}
          />
          <SearchBox id="belanja-cari" value={cari} onChange={setCari} placeholder="Cari kegiatan, dokumen, penyedia" />
        </div>
        <p className="info-akses">
          <Icon name="shield" />
          <span>
            Masuk sebagai <b>{penggunaAktif.nama}</b> ({penggunaAktif.peran}) · {keterangan.join(" ")}
          </span>
        </p>
        <div className="tw stack">
          <table className="tabel-kegiatan">
            <thead>
              <tr>
                <KepalaKegiatan />
                <th>Status</th>
                <th className="th-aksi">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {baris.length === 0 ? (
                <EmptyRow cols={JUMLAH_KOLOM_KEGIATAN + 2}>Belum ada pengajuan dengan status ini.</EmptyRow>
              ) : (
                baris.map((k) => {
                  const milikSaya = k.dibuatOleh === penggunaAktif.id;
                  return (
                    <tr key={k.id}>
                      <SelKegiatan k={k} />
                      <td data-label="Status">
                        <Status tone={TONE_BELANJA[k.status]}>{k.status}</Status>
                        <span className={`oleh ${milikSaya ? "saya" : ""}`}>oleh {milikSaya ? "Anda" : infoPengguna(k.dibuatOleh).nama}</span>
                      </td>
                      <td className="full sel-aksi">
                        <div className="aksi-baris">
                          {alur(k)}
                          {ikonAksi(k)}
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

      {formBaru && <FormPengajuan onClose={() => setFormBaru(false)} onSaved={() => { setFilter("Semua"); setFormBaru(false); }} />}
      {diedit && <FormPengajuan awal={diedit} onClose={() => setDiedit(null)} onSaved={() => setDiedit(null)} />}
      {dihapus && <KonfirmasiHapus k={dihapus} onClose={() => setDihapus(null)} />}
      {dicetak && <CetakKegiatan k={dicetak} onClose={() => setDicetak(null)} />}
    </>
  );
}

/* ---------- Tombol ikon di kolom Aksi ---------- */
function TombolIkon({
  ikon,
  label,
  onClick,
  kunci,
  bahaya = false,
}: {
  ikon: IconName;
  label: string;
  onClick: () => void;
  /** alasan terkunci; bila diisi tombol tampil redup dan klik hanya menampilkan alasannya */
  kunci?: string;
  bahaya?: boolean;
}) {
  return (
    <button
      type="button"
      className={`ib-aksi ${bahaya ? "bahaya" : ""} ${kunci ? "terkunci" : ""}`}
      aria-label={label}
      aria-disabled={kunci ? true : undefined}
      title={kunci ?? label}
      onClick={onClick}
    >
      <Icon name={ikon} />
      {kunci && (
        <span className="gembok" aria-hidden="true">
          <Icon name="lock" />
        </span>
      )}
    </button>
  );
}

/* ---------- Konfirmasi hapus (wajib alasan, tercatat di Riwayat Aktivitas) ---------- */
function KonfirmasiHapus({ k, onClose }: { k: Kegiatan; onClose: () => void }) {
  const { hapusKegiatan, namaAkun, toast } = useStore();
  const [alasan, setAlasan] = useState("");

  return (
    <Modal
      title={`Hapus ${k.id}?`}
      description="Dokumen akan hilang dari daftar belanja. Isi dokumen dan alasan penghapusan tetap tersimpan di Riwayat Aktivitas."
      submitLabel="Hapus dokumen"
      bahaya
      onSubmit={async () => {
        if (alasan.trim().length < 5) {
          toast("Tuliskan alasan penghapusan (minimal 5 karakter)");
          return;
        }
        if (!(await hapusKegiatan(k.id, alasan))) return;
        toast(`${k.id} dihapus`);
        onClose();
      }}
      onClose={onClose}
    >
      <div className="full ringkas">
        <div><span>Uraian</span><b>{k.uraian}</b></div>
        <div><span>{k.jenisDokumen}</span><b className="mono">{k.noDokumen}</b></div>
        <div><span>MAK</span><b className="mono">{k.mak}</b></div>
        <div><span>Akun</span><b>{k.akun} {namaAkun(k.akun)}</b></div>
        <div><span>Status</span><b>{k.status}</b></div>
        <div className="total"><span>Nilai</span><b>{rupiah(k.nilai)}</b></div>
      </div>
      <Field label="Alasan penghapusan" full>
        <textarea rows={2} value={alasan} onChange={(e) => setAlasan(e.target.value)} placeholder="mis. Terinput dua kali, yang dipakai BLJ-2026-0408" />
      </Field>
    </Modal>
  );
}

/* ---------- Form pengajuan baru / ubah pengajuan ---------- */
function FormPengajuan({ awal, onClose, onSaved }: { awal?: Kegiatan; onClose: () => void; onSaved: () => void }) {
  const { referensi, tambahKegiatan, editKegiatan, boleh, penggunaAktif, daftarMak, cariMak, toast } = useStore();
  // Operator Unit hanya boleh mengajukan untuk unitnya sendiri
  const unitSendiri = !boleh("belanja.lihatSemua");
  const [uraian, setUraian] = useState(awal?.uraian ?? "");
  const [jenisDokumen, setJenisDokumen] = useState<JenisDokumen | "">(awal?.jenisDokumen ?? "Kwitansi");
  const [noDokumen, setNoDokumen] = useState(awal?.noDokumen ?? "");
  const [penyedia, setPenyedia] = useState(awal?.penyediaId ?? "");
  const [unit, setUnit] = useState(awal?.unit ?? (unitSendiri ? penggunaAktif.unit : ""));
  const [dana, setDana] = useState<SumberDana | "">(awal?.dana ?? "");
  const [mak, setMak] = useState(awal?.mak ?? "");
  const [nilai, setNilai] = useState(awal ? String(awal.nilai) : "");
  const [tgl, setTgl] = useState(awal?.tanggal ?? hariIni());
  const [catatan, setCatatan] = useState("");
  const ulang = awal ? STATUS_PERLU_ULANG.includes(awal.status) : false;

  /* ---------- pilihan combobox: cukup nama / kode, tanpa keterangan tambahan ---------- */
  const opsiDokumen: OpsiCombo[] = JENIS_DOKUMEN.map((j) => ({ value: j.value, label: j.value }));
  // penyedia nonaktif tetap tampil bila sudah dipakai dokumen ini (agar namanya terbaca, lalu bisa diganti)
  const opsiPenyedia: OpsiCombo[] = referensi.penyedia
    .filter((p) => p.aktif || p.id === awal?.penyediaId)
    .map((p) => ({ value: p.id, label: p.aktif ? p.nama : `${p.nama} (tidak aktif)` }));
  const opsiUnit: OpsiCombo[] = referensi.unit
    .filter((u) => !unitSendiri || u.kode === penggunaAktif.unit)
    .map((u) => ({ value: u.kode, label: u.nama }));
  const opsiDana: OpsiCombo[] = referensi.dana
    .filter((d) => d.kode === "RM" || d.kode === "BLU")
    .map((d) => ({ value: d.kode, label: d.kode }));

  // MAK dari DIPA (urutan sesuai DIPA), hanya yang akunnya sesuai sumber dana
  const opsiMak: OpsiCombo[] = useMemo(
    () => (dana ? daftarMak.filter((m) => akunSesuaiDana(m.akun, dana)).map((m) => ({ value: m.kode, label: m.kode, mono: true })) : []),
    [dana, daftarMak],
  );
  const n = Number(nilai);

  const gantiDana = (d: string) => {
    setDana(d as SumberDana);
    // MAK lama dikosongkan bila akunnya tidak sesuai sumber dana baru
    if (mak && !akunSesuaiDana(akunDariMak(mak), d)) setMak("");
  };

  const simpan = async () => {
    const kurang = [
      !uraian.trim() && "uraian kegiatan",
      !jenisDokumen && "jenis dokumen",
      !noDokumen.trim() && "nomor dokumen",
      !penyedia && "penyedia",
      !unit && "unit kerja",
      !dana && "sumber dana",
      !mak && "Mata Anggaran Kegiatan",
      !(n > 0) && "nilai",
    ].filter(Boolean);
    if (kurang.length) {
      toast(`Lengkapi ${kurang.join(", ")}`);
      return;
    }
    if (!akunSesuaiDana(akunDariMak(mak), dana)) {
      toast(`MAK ${mak} tidak sesuai untuk sumber dana ${dana}`);
      return;
    }
    const pagu = cariMak(mak);
    if (pagu && n > pagu.sisa) {
      toast(`Nilai melebihi sisa pagu MAK (sisa ${rupiah(pagu.sisa)})`);
      return;
    }
    const data = {
      uraian: uraian.trim(),
      unit,
      dana: dana as SumberDana,
      mak,
      akun: akunDariMak(mak),
      jenisDokumen: jenisDokumen as JenisDokumen,
      noDokumen: noDokumen.trim(),
      penyediaId: penyedia,
      penyedia: referensi.penyedia.find((p) => p.id === penyedia)?.nama ?? "",
      nilai: n,
      tanggal: tgl,
    };
    if (awal) {
      const hasil = await editKegiatan(awal.id, data, catatan);
      if (!hasil) return;
      if (hasil.berubah === 0) {
        toast("Belum ada perubahan untuk disimpan");
        return;
      }
      toast(`${awal.id}: ${hasil.berubah} kolom diubah${hasil.kembaliKeDraf ? " · status kembali ke Draf" : ""}`);
    } else {
      const baru = await tambahKegiatan(data);
      if (!baru) return;
      toast(`${baru.id} tersimpan sebagai draf`);
    }
    onSaved();
  };

  return (
    <Modal
      title={awal ? `Ubah ${awal.id}` : "Pengajuan Belanja Baru"}
      description={
        awal
          ? ulang
            ? `Status saat ini ${awal.status}. Setelah disimpan, status kembali ke Draf dan perlu diajukan ulang. Setiap perubahan tercatat di Riwayat Aktivitas.`
            : "Setiap perubahan tercatat di Riwayat Aktivitas beserta nilai sebelum dan sesudahnya."
          : "Isi rincian kegiatan. Pengajuan tersimpan sebagai draf sampai Anda mengajukannya ke PPK."
      }
      submitLabel={awal ? "Simpan Perubahan" : "Simpan Draf"}
      onSubmit={simpan}
      onClose={onClose}
    >
      <Field label="Uraian kegiatan" full>
        <input value={uraian} onChange={(e) => setUraian(e.target.value)} placeholder="mis. Pengadaan bahan praktik Diklat BST" />
      </Field>
      <Field label="Jenis dokumen">
        <Combobox value={jenisDokumen} onChange={(v) => setJenisDokumen(v as JenisDokumen)} opsi={opsiDokumen} placeholder="Pilih jenis dokumen" />
      </Field>
      <Field label="No. dokumen">
        <input value={noDokumen} onChange={(e) => setNoDokumen(e.target.value)} placeholder={infoJenisDokumen(jenisDokumen || "Kwitansi").contohNo} />
      </Field>
      <Field label="Penyedia" full>
        <Combobox value={penyedia} onChange={setPenyedia} opsi={opsiPenyedia} placeholder="Ketik untuk mencari penyedia" />
      </Field>
      <Field label="Unit kerja">
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
      <Field label="Nilai (Rp)">
        <input type="number" min={1} inputMode="numeric" value={nilai} onChange={(e) => setNilai(e.target.value)} placeholder="0" />
      </Field>
      <Field label="Tanggal dokumen">
        <input type="date" value={tgl} onChange={(e) => setTgl(e.target.value)} />
      </Field>
      {awal && (
        <Field label="Catatan perubahan (opsional)" full>
          <textarea rows={2} value={catatan} onChange={(e) => setCatatan(e.target.value)} placeholder="mis. Penyesuaian harga sesuai penawaran akhir" />
        </Field>
      )}
    </Modal>
  );
}
