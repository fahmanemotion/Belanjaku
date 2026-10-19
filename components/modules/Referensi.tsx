"use client";

import { useState, type ReactNode } from "react";
import Icon from "@/components/Icon";
import { useStore, type JenisReferensi } from "@/components/StoreProvider";
import { Badge, EmptyRow, Field, Modal, PageHead, SearchBox, Status, Tabs } from "@/components/ui";
import { labelJenisAkun } from "@/lib/data";
import type { RefAkun, RefDana, RefPenyedia, RefUnit } from "@/lib/types";

type Jenis = JenisReferensi;
type Baris = RefAkun | RefUnit | RefPenyedia | RefDana;

const TAB: { value: Jenis; label: string }[] = [
  { value: "akun", label: "Akun Belanja" },
  { value: "unit", label: "Unit Kerja" },
  { value: "penyedia", label: "Penyedia" },
  { value: "dana", label: "Sumber Dana" },
];

const KOLOM: Record<Jenis, string[]> = {
  akun: ["Kode Akun", "Uraian", "Jenis Belanja"],
  unit: ["Kode", "Unit Kerja", "Penanggung Jawab"],
  penyedia: ["Nama Penyedia", "Pimpinan", "Bidang", "Kota", "Status"],
  dana: ["Kode", "Sumber Dana", "Warna"],
};

export default function Referensi() {
  const { referensi, boleh } = useStore();
  // Hanya Administrator yang menambah/mengubah data referensi; peran lain melihat saja
  const bisaKelola = boleh("referensi.kelola");
  const [tab, setTab] = useState<Jenis>("akun");
  const [cari, setCari] = useState("");
  const [form, setForm] = useState<{ jenis: Jenis; awal?: Baris } | null>(null);

  const q = cari.toLowerCase();
  const cocok = (vals: (string | boolean)[]) => vals.join(" ").toLowerCase().includes(q);
  const ubah = (awal: Baris, label: string) =>
    bisaKelola ? (
      <td className="sel-aksi-ref">
        <button type="button" className="ib-aksi" aria-label={`Ubah ${label}`} title={`Ubah ${label}`} onClick={() => setForm({ jenis: tab, awal })}>
          <Icon name="edit" />
        </button>
      </td>
    ) : null;

  let rows: ReactNode[] = [];
  if (tab === "akun")
    rows = referensi.akun.filter((r) => cocok([r.kode, r.uraian, r.jenis])).map((r) => (
      <tr key={r.kode}>
        <td className="mono" data-label="Kode Akun">{r.kode}</td>
        <td className="main"><b>{r.uraian}</b></td>
        <td data-label="Jenis Belanja"><Badge tone={r.jenis.startsWith("Modal") ? "i" : r.jenis.startsWith("Pegawai") ? "w" : ""}>{r.jenis}</Badge></td>
        {ubah(r, r.kode)}
      </tr>
    ));
  if (tab === "unit")
    rows = referensi.unit.filter((r) => cocok([r.kode, r.nama, r.penanggungJawab])).map((r) => (
      <tr key={r.kode}>
        <td className="mono" data-label="Kode">{r.kode}</td>
        <td className="main"><b>{r.nama}</b></td>
        <td data-label="Penanggung Jawab">{r.penanggungJawab || "-"}</td>
        {ubah(r, r.nama)}
      </tr>
    ));
  if (tab === "penyedia")
    rows = referensi.penyedia.filter((r) => cocok([r.nama, r.bidang, r.kota, r.pimpinan, r.alamat, r.npwp])).map((r) => (
      <tr key={r.id}>
        <td className="main">
          <b>{r.nama}</b>
          {r.alamat && <small className="sub-ref">{r.alamat}</small>}
        </td>
        <td data-label="Pimpinan">
          {r.pimpinan || "-"}
          {r.pimpinan && r.jabatan && <small className="sub-ref">{r.jabatan}</small>}
        </td>
        <td data-label="Bidang">{r.bidang || "-"}</td>
        <td data-label="Kota">{r.kota || "-"}</td>
        <td data-label="Status"><Status tone={r.aktif ? "g" : "m"}>{r.aktif ? "Aktif" : "Tidak aktif"}</Status></td>
        {ubah(r, r.nama)}
      </tr>
    ));
  if (tab === "dana")
    rows = referensi.dana.filter((r) => cocok([r.kode, r.nama])).map((r) => (
      <tr key={r.kode}>
        <td className="mono" data-label="Kode">{r.kode}</td>
        <td className="main"><b>{r.nama}</b></td>
        <td data-label="Warna">
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 14, height: 14, borderRadius: "50%", background: r.warna, flex: "none" }} />
            <span className="mono">{r.warna}</span>
          </span>
        </td>
        {ubah(r, r.nama)}
      </tr>
    ));

  const kolom = KOLOM[tab].length + (bisaKelola ? 1 : 0);

  return (
    <>
      <PageHead
        title="Referensi"
        subtitle="Data acuan yang dipakai di seluruh modul: akun BAS, unit kerja, penyedia, dan sumber dana."
      />

      <section className="panel">
        <div className="ph">
          <Tabs<Jenis> label="Jenis referensi" value={tab} onChange={setTab} items={TAB} />
          <div className="tbar">
            <SearchBox id="ref-cari" value={cari} onChange={setCari} placeholder="Cari referensi" />
            {bisaKelola && (
              <button type="button" className="btn dark sm" onClick={() => setForm({ jenis: tab })}>
                <Icon name="plus" />
                Tambah
              </button>
            )}
          </div>
        </div>
        <div className="tw stack">
          <table className="narrow">
            <thead>
              <tr>
                {KOLOM[tab].map((k) => <th key={k}>{k}</th>)}
                {bisaKelola && <th className="r">Aksi</th>}
              </tr>
            </thead>
            <tbody>
              {rows.length ? rows : <EmptyRow cols={kolom}>Tidak ada data yang cocok.</EmptyRow>}
            </tbody>
          </table>
        </div>
      </section>

      {form && <FormReferensi jenis={form.jenis} awal={form.awal} onClose={() => setForm(null)} />}
    </>
  );
}

/** Isian form per jenis referensi; kunci = nama kolom yang dikirim ke database */
const ISIAN: Record<Jenis, { kunci: string; label: string; contoh?: string; kode?: boolean; opsional?: boolean; lebar?: boolean }[]> = {
  akun: [
    { kunci: "kode", label: "Kode akun (6 digit)", contoh: "521211", kode: true },
    { kunci: "uraian", label: "Uraian", contoh: "Belanja Bahan" },
  ],
  unit: [
    { kunci: "kode", label: "Kode unit", contoh: "UK09", kode: true },
    { kunci: "nama", label: "Nama unit kerja" },
    { kunci: "penanggungJawab", label: "Penanggung jawab", contoh: "Kepala Unit", opsional: true },
  ],
  penyedia: [
    { kunci: "nama", label: "Nama penyedia", contoh: "CV …", lebar: true },
    { kunci: "pimpinan", label: "Nama pimpinan", contoh: "dicetak di dokumen pengadaan", opsional: true },
    { kunci: "jabatan", label: "Jabatan pimpinan", contoh: "Direktur", opsional: true },
    { kunci: "alamat", label: "Alamat", opsional: true, lebar: true },
    { kunci: "bidang", label: "Bidang usaha", opsional: true },
    { kunci: "kota", label: "Kota", opsional: true },
    { kunci: "npwp", label: "NPWP", opsional: true },
    { kunci: "bank", label: "Bank", contoh: "BANK BNI", opsional: true },
    { kunci: "rekening", label: "No. rekening", opsional: true },
  ],
  dana: [
    { kunci: "kode", label: "Kode", contoh: "PNBP", kode: true },
    { kunci: "nama", label: "Nama sumber dana" },
    { kunci: "warna", label: "Warna (hex, mis. #3a6fd9)", contoh: "#3a6fd9" },
  ],
};

function nilaiAwal(jenis: Jenis, awal?: Baris): Record<string, string> {
  if (!awal) return Object.fromEntries(ISIAN[jenis].map((f) => [f.kunci, ""]));
  return Object.fromEntries(ISIAN[jenis].map((f) => [f.kunci, String((awal as unknown as Record<string, unknown>)[f.kunci] ?? "")]));
}

function FormReferensi({ jenis, awal, onClose }: { jenis: Jenis; awal?: Baris; onClose: () => void }) {
  const { simpanReferensi, toast } = useStore();
  const isian = ISIAN[jenis];
  const [nilai, setNilai] = useState<Record<string, string>>(() => nilaiAwal(jenis, awal));
  const [aktif, setAktif] = useState(jenis === "penyedia" && awal ? (awal as RefPenyedia).aktif : true);
  const label = TAB.find((t) => t.value === jenis)?.label ?? "";
  // kode akun → jenis belanja & sumber dana langsung terlihat
  const infoAkun = jenis === "akun" && /^\d{6}$/.test(nilai.kode ?? "") ? labelJenisAkun(nilai.kode) : null;

  const simpan = async () => {
    const v = Object.fromEntries(Object.entries(nilai).map(([k, x]) => [k, x.trim()]));
    const wajib = isian.filter((f) => !f.opsional);
    if (wajib.some((f) => !v[f.kunci])) {
      toast(`Lengkapi ${wajib.filter((f) => !v[f.kunci]).map((f) => f.label.toLowerCase()).join(", ")}`);
      return;
    }
    if (jenis === "akun" && !/^\d{6}$/.test(v.kode)) return toast("Kode akun harus 6 digit angka");
    if (jenis === "dana" && !/^#[0-9a-fA-F]{6}$/.test(v.warna)) return toast("Warna harus format hex #RRGGBB");
    const data: Record<string, string | boolean> = jenis === "penyedia" ? { ...v, aktif } : v;
    const kunci = awal ? (jenis === "penyedia" ? (awal as RefPenyedia).id : v.kode) : undefined;
    if (!(await simpanReferensi(jenis, data, kunci))) return;
    toast(awal ? "Perubahan referensi tersimpan" : "Referensi tersimpan");
    onClose();
  };

  return (
    <Modal
      title={`${awal ? "Ubah" : "Tambah"} ${label}`}
      description={awal ? "Perubahan langsung dipakai di seluruh modul dan tercatat di Riwayat Aktivitas." : "Data baru langsung tersedia di formulir pengajuan."}
      submitLabel={awal ? "Simpan Perubahan" : "Simpan"}
      onSubmit={simpan}
      onClose={onClose}
    >
      {isian.map((f, i) => (
        <Field key={f.kunci} label={f.label} full={jenis === "penyedia" ? Boolean(f.lebar) : i === 1 || isian.length === 2}>
          <input
            value={nilai[f.kunci] ?? ""}
            onChange={(e) => setNilai((n) => ({ ...n, [f.kunci]: f.kode ? e.target.value.toUpperCase() : e.target.value }))}
            placeholder={f.contoh}
            disabled={Boolean(awal && f.kode)}
            title={awal && f.kode ? "Kode tidak dapat diubah" : undefined}
            className={f.kode ? "mono" : undefined}
          />
        </Field>
      ))}
      {infoAkun && <p className="hint">Jenis belanja & sumber dana: <b>{infoAkun}</b> (ditentukan dari kode akun)</p>}
      {jenis === "penyedia" && awal && (
        <Field label="Status" full>
          <select value={aktif ? "aktif" : "nonaktif"} onChange={(e) => setAktif(e.target.value === "aktif")}>
            <option value="aktif">Aktif — muncul di formulir pengajuan</option>
            <option value="nonaktif">Tidak aktif — disembunyikan dari formulir</option>
          </select>
        </Field>
      )}
    </Modal>
  );
}
