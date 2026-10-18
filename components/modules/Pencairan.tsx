"use client";

import { useState } from "react";
import Icon from "@/components/Icon";
import { JUMLAH_KOLOM_KEGIATAN, KepalaKegiatan, SelKegiatan } from "@/components/KolomKegiatan";
import { useStore } from "@/components/StoreProvider";
import { Badge, EmptyRow, Field, Modal, PageHead, SearchBox, Status, Tabs } from "@/components/ui";
import { TAHAP_PENCAIRAN } from "@/lib/akses";
import { NAMA_TAHAP } from "@/lib/data";
import { hariIni, rupiahSingkat, tanggal } from "@/lib/format";
import type { JenisSpp, TahapPencairan } from "@/lib/types";

type FilterJenis = "Semua" | JenisSpp;
const TAHAP: TahapPencairan[] = [1, 2, 3, 4];

export default function Pencairan() {
  const { kegiatan, majukanTahap, boleh, penggunaAktif, toast } = useStore();
  const bisaSpp = boleh("pencairan.spp");
  const bisaPpspm = boleh("pencairan.ppspm");
  const bisaSp2d = boleh("pencairan.sp2d");
  /** Label tombol untuk memajukan ke tahap berikutnya */
  const LABEL_PROSES: Record<2 | 3 | 4, string> = { 2: "Uji SPP", 3: "Terbitkan SPM", 4: "Catat SP2D" };
  const keterangan = [
    bisaSpp && "Anda menerbitkan SPP dari pengajuan yang disetujui.",
    bisaPpspm && "Anda menguji SPP dan menerbitkan SPM.",
    bisaSp2d && "Anda mencatat SP2D yang sudah terbit.",
    !bisaSpp && !bisaPpspm && !bisaSp2d && "Anda dapat melihat posisi dokumen pencairan.",
  ].filter(Boolean);
  const [jenis, setJenis] = useState<FilterJenis>("Semua");
  const [tahap, setTahap] = useState<TahapPencairan | null>(null);
  const [cari, setCari] = useState("");
  const [formBaru, setFormBaru] = useState(false);
  const [proses, setProses] = useState<string | null>(null);

  // Kegiatan yang sudah masuk proses pencairan (punya SPP)
  const denganSpp = kegiatan.filter((k) => k.spp);
  const diTahap = (t: TahapPencairan) => denganSpp.filter((k) => k.spp!.tahap === t);
  const q = cari.toLowerCase();
  const baris = denganSpp
    .filter(
      (k) =>
        (jenis === "Semua" || k.spp!.jenis === jenis) &&
        (tahap === null || k.spp!.tahap === tahap) &&
        [k.uraian, k.noDokumen, k.penyedia, k.spp!.no].join(" ").toLowerCase().includes(q),
    )
    .sort((a, b) => b.spp!.no.localeCompare(a.spp!.no));

  const majukan = async (id: string) => {
    setProses(id);
    const hasil = await majukanTahap(id);
    setProses(null);
    if (hasil?.spp) toast(hasil.spp.tahap === 4 ? `SP2D terbit untuk ${hasil.spp.no}` : `${hasil.spp.no} maju ke tahap ${NAMA_TAHAP[hasil.spp.tahap]}`);
  };

  return (
    <>
      <PageHead
        title="Pencairan"
        subtitle="Alur dokumen dari SPP, verifikasi PPSPM, SPM, sampai SP2D terbit."
        actions={
          bisaSpp ? (
            <button type="button" className="btn acc" onClick={() => setFormBaru(true)}>
              <Icon name="plus" />
              Buat SPP
            </button>
          ) : undefined
        }
      />

      <div className="flow">
        {TAHAP.map((t) => (
          <button key={t} type="button" className={`step ${tahap === t ? "on" : ""}`} onClick={() => setTahap(tahap === t ? null : t)} aria-pressed={tahap === t}>
            <div className="k">TAHAP {t} · {NAMA_TAHAP[t].toUpperCase()}</div>
            <div className="n num">{diTahap(t).length}</div>
            <div className="d num">{rupiahSingkat(diTahap(t).reduce((a, k) => a + k.nilai, 0))}</div>
          </button>
        ))}
      </div>

      <section className="panel">
        <div className="ph">
          <div>
            <h3>Daftar Pencairan</h3>
            <p className="sub">
              {tahap ? `Menampilkan tahap ${NAMA_TAHAP[tahap]} · klik kartu tahap lagi untuk melihat semua` : "Klik kartu tahap di atas untuk menyaring daftar"}
            </p>
          </div>
          <div className="tbar">
            <Tabs<FilterJenis>
              label="Jenis SPP"
              value={jenis}
              onChange={setJenis}
              items={(["Semua", "LS", "GU", "TUP"] as FilterJenis[]).map((v) => ({ value: v, label: v === "Semua" ? "Semua SPP" : v }))}
            />
            <SearchBox id="cair-cari" value={cari} onChange={setCari} placeholder="Cari kegiatan atau No. SPP" />
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
                <th style={{ minWidth: 190 }}>Tahapan</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {baris.length === 0 ? (
                <EmptyRow cols={JUMLAH_KOLOM_KEGIATAN + 2}>Tidak ada dokumen untuk filter ini.</EmptyRow>
              ) : (
                baris.map((k) => {
                  const s = k.spp!;
                  return (
                    <tr key={k.id}>
                      <SelKegiatan k={k} />
                      <td className="full" data-label="Tahapan">
                        <div className="spp-baris">
                          <span className="mono">{s.no}</span>
                          <Badge tone={s.jenis === "LS" ? "i" : s.jenis === "GU" ? "w" : ""}>{s.jenis}</Badge>
                        </div>
                        <div className="prog" aria-label={`Tahap ${s.tahap} dari 4`}>
                          {TAHAP.map((t) => (
                            <i key={t} className={t <= s.tahap ? "f" : ""} />
                          ))}
                        </div>
                        <div className="note" style={{ marginTop: 4 }}>
                          {s.tahap === 4 ? "SP2D terbit" : `Posisi: ${NAMA_TAHAP[s.tahap]}`} · {tanggal(s.tanggal)}
                        </div>
                      </td>
                      <td className="full">
                        {s.tahap < 4 ? (
                          (() => {
                            const berikut = (s.tahap + 1) as 2 | 3 | 4;
                            return boleh(TAHAP_PENCAIRAN[berikut].izin) ? (
                              <button type="button" className="btn soft sm" disabled={proses === k.id} onClick={() => majukan(k.id)}>
                                {proses === k.id ? "Memproses…" : LABEL_PROSES[berikut]}
                              </button>
                            ) : (
                              <span className="note">Menunggu {TAHAP_PENCAIRAN[berikut].pelaku}</span>
                            );
                          })()
                        ) : k.disahkan ? (
                          <Status tone="i">Disahkan</Status>
                        ) : (
                          <Status tone="g">Cair</Status>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {formBaru && <FormSpp onClose={() => setFormBaru(false)} />}
    </>
  );
}

function FormSpp({ onClose }: { onClose: () => void }) {
  const { kegiatan, buatSpp, toast } = useStore();
  const siap = kegiatan.filter((k) => k.status === "Disetujui" && !k.spp);
  const [id, setId] = useState(siap[0]?.id ?? "");
  const pilihan = siap.find((k) => k.id === id);
  const [jenis, setJenis] = useState<JenisSpp>(pilihan?.jenisDokumen === "Kwitansi" ? "GU" : "LS");
  const [tgl, setTgl] = useState(hariIni());

  const simpan = async () => {
    if (!pilihan) {
      onClose();
      return;
    }
    const no = await buatSpp(pilihan.id, jenis, tgl);
    if (!no) return;
    toast(`${no} diterbitkan`);
    onClose();
  };

  return (
    <Modal
      title="Buat SPP"
      description="Pilih kegiatan yang sudah disetujui PPK untuk diterbitkan SPP-nya."
      submitLabel={siap.length ? "Terbitkan SPP" : "Tutup"}
      onSubmit={simpan}
      onClose={onClose}
    >
      {siap.length === 0 ? (
        <p className="hint">Semua kegiatan yang disetujui sudah dibuatkan SPP. Setujui pengajuan baru di modul Belanja terlebih dahulu.</p>
      ) : (
        <>
          <Field label="Kegiatan" full>
            <select value={id} onChange={(e) => setId(e.target.value)}>
              {siap.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.uraian} — {k.noDokumen} ({rupiahSingkat(k.nilai)})
                </option>
              ))}
            </select>
          </Field>
          <Field label="Jenis SPP">
            <select value={jenis} onChange={(e) => setJenis(e.target.value as JenisSpp)}>
              <option value="LS">LS — Langsung</option>
              <option value="GU">GU — Ganti Uang</option>
              <option value="TUP">TUP — Tambahan UP</option>
            </select>
          </Field>
          <Field label="Tanggal SPP">
            <input type="date" value={tgl} onChange={(e) => setTgl(e.target.value)} />
          </Field>
        </>
      )}
    </Modal>
  );
}
