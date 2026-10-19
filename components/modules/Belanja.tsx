"use client";

import { useMemo, useState } from "react";
import CetakKegiatan from "@/components/CetakKegiatan";
import Combobox, { type OpsiCombo } from "@/components/Combobox";
import Icon, { type IconName } from "@/components/Icon";
import { JUMLAH_KOLOM_KEGIATAN, KepalaKegiatan, SelKegiatan } from "@/components/KolomKegiatan";
import { useStore } from "@/components/StoreProvider";
import { EmptyRow, Field, InputRupiah, Modal, PageHead, Paginasi, Saring, SearchBox, Status, Tabs, useHalaman, type Tone } from "@/components/ui";
import { JENIS_DOKUMEN, STATUS_BELANJA, akunSesuaiDana, infoJenisDokumen } from "@/lib/data";
import { hariIni, rupiah, rupiahSingkat, tanggal, terbilang } from "@/lib/format";
import { akunDariMak } from "@/lib/mak";
import type { JenisDokumen, Kegiatan, StatusBelanja, SumberDana } from "@/lib/types";

export const TONE_BELANJA: Record<StatusBelanja, Tone> = {
  "Belum dicairkan": "w",
  Dicairkan: "i",
  Disahkan: "g",
};

type Filter = "Semua" | StatusBelanja;
type FilterDana = "Semua" | "RM" | "BLU";
type FilterPencatat = "Semua" | "Saya";

/**
 * Modul Belanja — dipakai bagian pengadaan barang/jasa untuk mencatat seluruh dokumen belanja
 * kebutuhan unit kerja secara terpusat (boleh oleh beberapa operator sekaligus).
 * Dokumen yang tersimpan langsung masuk Daftar Pencairan; status berikutnya mengikuti rekap
 * pencairan dan pengesahan oleh bagian keuangan.
 */
export default function Belanja() {
  const { kegiatan, izinUbah, infoPengguna, penggunaAktif, boleh, namaUnit, toast } = useStore();
  const [filter, setFilter] = useState<Filter>("Semua");
  const [dana, setDana] = useState<FilterDana>("Semua");
  const [pencatat, setPencatat] = useState<FilterPencatat>("Semua");
  const [cari, setCari] = useState("");
  const [formBaru, setFormBaru] = useState(false);
  const [diedit, setDiedit] = useState<Kegiatan | null>(null);
  const [dihapus, setDihapus] = useState<Kegiatan | null>(null);
  const [dicetak, setDicetak] = useState<Kegiatan | null>(null);

  const bisaBuat = boleh("belanja.buat");
  // Semua peran melihat seluruh dokumen belanja (pengguna tidak terikat unit kerja)
  const terlihat = kegiatan;
  const dengan = (s: StatusBelanja) => terlihat.filter((k) => k.status === s);
  const nilai = (xs: Kegiatan[]) => xs.reduce((a, k) => a + k.nilai, 0);

  const baris = useMemo(() => {
    const q = cari.trim().toLowerCase();
    return terlihat.filter(
      (k) =>
        (filter === "Semua" || k.status === filter) &&
        (dana === "Semua" || k.dana === dana) &&
        (pencatat === "Semua" || k.dibuatOleh === penggunaAktif.id) &&
        (!q ||
          [k.id, k.uraian, k.noDokumen, k.penyedia, k.akun, k.mak, namaUnit(k.unit), k.pencairan?.nomor ?? "", k.pengesahan?.nomor ?? ""]
            .join(" ")
            .toLowerCase()
            .includes(q)),
    );
  }, [terlihat, filter, dana, pencatat, cari, penggunaAktif.id, namaUnit]);

  // 30 dokumen per halaman; setiap filter berubah kembali ke halaman 1
  const hal = useHalaman(baris);
  const saring =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      hal.awal();
    };
  const adaFilter = dana !== "Semua" || pencatat !== "Semua" || cari !== "";
  const reset = () => {
    setDana("Semua");
    setPencatat("Semua");
    setCari("");
    hal.awal();
  };

  /** Ikon edit · hapus · cetak. Edit & hapus hanya untuk pencatat dokumen selama belum dicairkan. */
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
    bisaBuat
      ? "Catat dokumen belanja untuk unit kerja mana pun; edit & hapus hanya untuk dokumen catatan Anda yang belum dicairkan."
      : "Anda dapat melihat dan mencetak dokumen belanja yang dicatat bagian pengadaan.",
  ].filter(Boolean);

  return (
    <>
      <PageHead
        title="Belanja"
        subtitle="Pencatatan dokumen belanja kebutuhan unit kerja oleh bagian pengadaan barang/jasa. Dokumen yang tersimpan langsung masuk daftar pencairan."
        actions={
          bisaBuat ? (
            <button type="button" className="btn acc" onClick={() => setFormBaru(true)}>
              <Icon name="plus" />
              Catat Belanja
            </button>
          ) : undefined
        }
      />

      <div className="stats">
        <div className="stat hot">
          <div className="lbl">Total tercatat</div>
          <div className="big num">{rupiahSingkat(nilai(terlihat))}</div>
          <div className="note">{terlihat.length} dokumen belanja</div>
        </div>
        {STATUS_BELANJA.map((s) => (
          <div className="stat" key={s}>
            <div className="lbl">{s}</div>
            <div className="big num">{dengan(s).length}</div>
            <div className="note">{rupiahSingkat(nilai(dengan(s)))}</div>
          </div>
        ))}
      </div>

      <section className="panel ada-paginasi" ref={hal.ref}>
        <div className="ph">
          <Tabs<Filter>
            label="Filter status"
            value={filter}
            onChange={saring(setFilter)}
            items={[
              { value: "Semua", label: `Semua · ${terlihat.length}` },
              ...STATUS_BELANJA.map((s) => ({ value: s, label: `${s} · ${dengan(s).length}` })),
            ]}
          />
          <div className="tbar filter-kegiatan">
            <Saring<FilterDana>
              label="Sumber dana"
              value={dana}
              onChange={saring(setDana)}
              opsi={[
                { value: "Semua", label: "Semua dana" },
                { value: "RM", label: "RM" },
                { value: "BLU", label: "BLU" },
              ]}
            />
            {bisaBuat && (
              <Saring<FilterPencatat>
                label="Pencatat"
                value={pencatat}
                onChange={saring(setPencatat)}
                opsi={[
                  { value: "Semua", label: "Semua pencatat" },
                  { value: "Saya", label: "Catatan saya" },
                ]}
              />
            )}
            <SearchBox id="belanja-cari" value={cari} onChange={saring(setCari)} placeholder="Cari kegiatan, dokumen, penyedia" />
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
                <EmptyRow cols={JUMLAH_KOLOM_KEGIATAN + 2}>
                  {terlihat.length === 0
                    ? bisaBuat
                      ? "Belum ada dokumen belanja. Klik Catat Belanja untuk mencatat dokumen pertama."
                      : "Belum ada dokumen belanja yang dicatat."
                    : "Tidak ada dokumen yang cocok dengan filter."}
                </EmptyRow>
              ) : (
                hal.tampil.map((k) => {
                  const milikSaya = k.dibuatOleh === penggunaAktif.id;
                  const rekap = k.pengesahan ?? k.pencairan;
                  return (
                    <tr key={k.id}>
                      <SelKegiatan k={k} />
                      <td data-label="Status">
                        <Status tone={TONE_BELANJA[k.status]}>{k.status}</Status>
                        {rekap && (
                          <span className="status-rekap mono" title={`${k.pengesahan ? "Rekap pengesahan" : "Rekap pencairan"} · ${tanggal(rekap.tanggal)}`}>
                            {rekap.nomor}
                          </span>
                        )}
                        <span className={`oleh ${milikSaya ? "saya" : ""}`}>dicatat {milikSaya ? "Anda" : infoPengguna(k.dibuatOleh).nama}</span>
                        {k.paketId && (
                          <span className="oleh" title="Kwitansi dari modul Pengadaan; diubah atau dibatalkan lewat paketnya">
                            dari paket <span className="mono">{k.paketId}</span>
                          </span>
                        )}
                      </td>
                      <td className="full sel-aksi">
                        <div className="aksi-baris">{ikonAksi(k)}</div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <Paginasi halaman={hal.halaman} jumlahHalaman={hal.jumlahHalaman} total={baris.length} ukuran={hal.ukuran} satuan="dokumen" onPindah={hal.pindah} />
      </section>

      {formBaru && (
        <FormBelanja
          onClose={() => setFormBaru(false)}
          onSaved={() => {
            setFilter("Semua");
            hal.awal();
            setFormBaru(false);
          }}
        />
      )}
      {diedit && <FormBelanja awal={diedit} onClose={() => setDiedit(null)} onSaved={() => setDiedit(null)} />}
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
      description="Dokumen akan hilang dari daftar belanja dan daftar pencairan. Isi dokumen dan alasan penghapusan tetap tersimpan di Riwayat Aktivitas."
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

/* ---------- Form catat dokumen belanja / ubah dokumen ---------- */
function FormBelanja({ awal, onClose, onSaved }: { awal?: Kegiatan; onClose: () => void; onSaved: () => void }) {
  const { referensi, tambahKegiatan, editKegiatan, daftarMak, toast } = useStore();
  const [uraian, setUraian] = useState(awal?.uraian ?? "");
  const [jenisDokumen, setJenisDokumen] = useState<JenisDokumen | "">(awal?.jenisDokumen ?? "Kwitansi");
  const [noDokumen, setNoDokumen] = useState(awal?.noDokumen ?? "");
  const [penyedia, setPenyedia] = useState(awal?.penyediaId ?? "");
  const [unit, setUnit] = useState(awal?.unit ?? "");
  const [dana, setDana] = useState<SumberDana | "">(awal?.dana ?? "");
  const [mak, setMak] = useState(awal?.mak ?? "");
  const [nilai, setNilai] = useState(awal ? String(awal.nilai) : "");
  const [tgl, setTgl] = useState(awal?.tanggal ?? hariIni());
  const [catatan, setCatatan] = useState("");

  /* ---------- pilihan combobox: cukup nama / kode, tanpa keterangan tambahan ---------- */
  const opsiDokumen: OpsiCombo[] = JENIS_DOKUMEN.map((j) => ({ value: j.value, label: j.value }));
  // penyedia nonaktif tetap tampil bila sudah dipakai dokumen ini (agar namanya terbaca, lalu bisa diganti)
  const opsiPenyedia: OpsiCombo[] = referensi.penyedia
    .filter((p) => p.aktif || p.id === awal?.penyediaId)
    .map((p) => ({ value: p.id, label: p.aktif ? p.nama : `${p.nama} (tidak aktif)` }));
  const opsiUnit: OpsiCombo[] = referensi.unit.map((u) => ({ value: u.kode, label: u.nama }));
  const opsiDana: OpsiCombo[] = referensi.dana
    .filter((d) => d.kode === "RM" || d.kode === "BLU")
    .map((d) => ({ value: d.kode, label: d.kode }));

  // MAK dari DIPA (urutan sesuai DIPA), hanya yang akunnya sesuai sumber dana
  const opsiMak: OpsiCombo[] = useMemo(
    () => (dana ? daftarMak.filter((m) => akunSesuaiDana(m.akun, dana)).map((m) => ({ value: m.kode, label: m.kode, mono: true })) : []),
    [dana, daftarMak],
  );
  // Nilai tidak dibatasi sisa anggaran MAK (sisa anggaran baru berlaku saat pengesahan)
  const n = Number(nilai);
  const kalimatNilai = n > 0 ? terbilang(n) : "";

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
      toast(`${awal.id}: ${hasil.berubah} kolom diubah`);
    } else {
      const baru = await tambahKegiatan(data);
      if (!baru) return;
      toast(`${baru.id} tersimpan dan masuk Daftar Pencairan`);
    }
    onSaved();
  };

  return (
    <Modal
      title={awal ? `Ubah ${awal.id}` : "Catat Dokumen Belanja"}
      description={
        awal
          ? "Dokumen masih bisa diubah selama belum dicairkan. Setiap perubahan tercatat di Riwayat Aktivitas beserta nilai sebelum dan sesudahnya."
          : "Isi rincian dokumen belanja kebutuhan unit kerja. Setelah disimpan, dokumen langsung masuk Daftar Pencairan; hanya Anda yang dapat mengubah atau menghapusnya selama belum dicairkan."
      }
      submitLabel={awal ? "Simpan Perubahan" : "Simpan Dokumen"}
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
        <InputRupiah value={nilai} onChange={setNilai} />
        {kalimatNilai && <small className="isian-catatan">{kalimatNilai.charAt(0).toUpperCase() + kalimatNilai.slice(1)}</small>}
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
