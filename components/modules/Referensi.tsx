"use client";

import { useState, type ReactNode } from "react";
import Icon from "@/components/Icon";
import { useStore } from "@/components/StoreProvider";
import { Badge, EmptyRow, Field, Modal, PageHead, SearchBox, Status, Tabs } from "@/components/ui";
import type { Referensi as Ref } from "@/lib/types";

type Jenis = keyof Ref;

const TAB: { value: Jenis; label: string }[] = [
  { value: "akun", label: "Akun Belanja" },
  { value: "unit", label: "Unit Kerja" },
  { value: "penyedia", label: "Penyedia" },
  { value: "dana", label: "Sumber Dana" },
];

const KOLOM: Record<Jenis, string[]> = {
  akun: ["Kode Akun", "Uraian", "Jenis Belanja"],
  unit: ["Kode", "Unit Kerja", "Penanggung Jawab"],
  penyedia: ["Nama Penyedia", "Bidang", "Kota", "Status"],
  dana: ["Kode", "Sumber Dana", "Warna"],
};

const FORM: Record<Jenis, string[]> = {
  akun: ["Kode akun", "Uraian", "Jenis belanja"],
  unit: ["Kode unit", "Nama unit kerja", "Penanggung jawab"],
  penyedia: ["Nama penyedia", "Bidang usaha", "Kota"],
  dana: ["Kode", "Nama sumber dana", "Warna (hex, mis. #3a6fd9)"],
};

export default function Referensi() {
  const { referensi, boleh } = useStore();
  // Hanya Administrator yang menambah data referensi; peran lain melihat saja
  const bisaKelola = boleh("referensi.kelola");
  const [tab, setTab] = useState<Jenis>("akun");
  const [cari, setCari] = useState("");
  const [tambah, setTambah] = useState(false);

  const q = cari.toLowerCase();
  const cocok = (vals: (string | boolean)[]) => vals.join(" ").toLowerCase().includes(q);

  let rows: ReactNode[] = [];
  if (tab === "akun")
    rows = referensi.akun.filter((r) => cocok([r.kode, r.uraian, r.jenis])).map((r) => (
      <tr key={r.kode}>
        <td className="mono" data-label="Kode Akun">{r.kode}</td>
        <td className="main"><b>{r.uraian}</b></td>
        <td data-label="Jenis Belanja"><Badge tone={r.jenis.startsWith("Modal") ? "i" : r.jenis.startsWith("Pegawai") ? "w" : ""}>{r.jenis}</Badge></td>
      </tr>
    ));
  if (tab === "unit")
    rows = referensi.unit.filter((r) => cocok([r.kode, r.nama, r.penanggungJawab])).map((r) => (
      <tr key={r.kode}>
        <td className="mono" data-label="Kode">{r.kode}</td>
        <td className="main"><b>{r.nama}</b></td>
        <td data-label="Penanggung Jawab">{r.penanggungJawab}</td>
      </tr>
    ));
  if (tab === "penyedia")
    rows = referensi.penyedia.filter((r) => cocok([r.nama, r.bidang, r.kota])).map((r) => (
      <tr key={r.nama}>
        <td className="main"><b>{r.nama}</b></td>
        <td data-label="Bidang">{r.bidang}</td>
        <td data-label="Kota">{r.kota}</td>
        <td data-label="Status"><Status tone={r.aktif ? "g" : "m"}>{r.aktif ? "Aktif" : "Tidak aktif"}</Status></td>
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
      </tr>
    ));

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
              <button type="button" className="btn dark sm" onClick={() => setTambah(true)}>
                <Icon name="plus" />
                Tambah
              </button>
            )}
          </div>
        </div>
        <div className="tw stack">
          <table className="narrow">
            <thead>
              <tr>{KOLOM[tab].map((k) => <th key={k}>{k}</th>)}</tr>
            </thead>
            <tbody>
              {rows.length ? rows : <EmptyRow cols={KOLOM[tab].length}>Tidak ada data yang cocok.</EmptyRow>}
            </tbody>
          </table>
        </div>
      </section>

      {tambah && <FormReferensi jenis={tab} onClose={() => setTambah(false)} />}
    </>
  );
}

function FormReferensi({ jenis, onClose }: { jenis: Jenis; onClose: () => void }) {
  const { setReferensi, catat, toast } = useStore();
  const label = FORM[jenis];
  const [nilai, setNilai] = useState<string[]>(label.map(() => ""));

  const simpan = () => {
    const v = nilai.map((x) => x.trim());
    if (v.some((x) => !x)) {
      toast("Semua kolom wajib diisi");
      return;
    }
    setReferensi((r) => {
      switch (jenis) {
        case "akun":
          return { ...r, akun: [...r.akun, { kode: v[0], uraian: v[1], jenis: v[2] }] };
        case "unit":
          return { ...r, unit: [...r.unit, { kode: v[0], nama: v[1], penanggungJawab: v[2] }] };
        case "penyedia":
          return { ...r, penyedia: [...r.penyedia, { nama: v[0], bidang: v[1], kota: v[2], aktif: true }] };
        case "dana":
          return { ...r, dana: [...r.dana, { kode: v[0], nama: v[1], warna: v[2] }] };
      }
    });
    catat({
      jenis: "Referensi",
      modul: "Referensi",
      aksi: `menambah ${TAB.find((t) => t.value === jenis)?.label.toLowerCase()}`,
      objekId: v[0],
      objekLabel: v[1],
    });
    toast("Referensi tersimpan");
    onClose();
  };

  return (
    <Modal
      title={`Tambah ${TAB.find((t) => t.value === jenis)?.label}`}
      description="Data baru langsung tersedia di formulir pengajuan."
      submitLabel="Simpan"
      onSubmit={simpan}
      onClose={onClose}
    >
      {label.map((l, i) => (
        <Field key={l} label={l} full={i === 1}>
          <input
            value={nilai[i]}
            onChange={(e) => setNilai((n) => n.map((x, j) => (j === i ? e.target.value : x)))}
            required
          />
        </Field>
      ))}
    </Modal>
  );
}
