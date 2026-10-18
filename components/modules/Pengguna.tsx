"use client";

import { useState } from "react";
import Icon from "@/components/Icon";
import { useStore } from "@/components/StoreProvider";
import { Badge, Field, Modal, PageHead, SearchBox, Status } from "@/components/ui";
import type { Pengguna as TPengguna } from "@/lib/types";

import { PERAN } from "@/lib/data";
import { inisial } from "@/lib/format";
import type { Peran } from "@/lib/types";

export default function Pengguna() {
  const { pengguna, penggunaAktif, toggleAktifPengguna, hapusPengguna, namaUnit, toast } = useStore();
  /** Akun yang sedang masuk — tidak boleh menonaktifkan atau menghapus dirinya sendiri */
  const ID_AKUN_SAYA = penggunaAktif.id;
  const [akanDihapus, setAkanDihapus] = useState<TPengguna | null>(null);
  const [akanDiedit, setAkanDiedit] = useState<TPengguna | null>(null);
  const [cari, setCari] = useState("");
  const [peran, setPeran] = useState<Peran | null>(null);
  const [tambah, setTambah] = useState(false);

  const q = cari.toLowerCase();
  const daftar = pengguna.filter(
    (u) => (peran === null || u.peran === peran) && (u.nama + u.email).toLowerCase().includes(q),
  );

  return (
    <>
      <PageHead
        title="Pengguna"
        subtitle="Kelola akun dan peran pengelola keuangan yang dapat mengakses aplikasi."
        actions={
          <>
            <SearchBox id="user-cari" value={cari} onChange={setCari} placeholder="Cari nama atau email" />
            <button type="button" className="btn acc" onClick={() => setTambah(true)}>
              <Icon name="plus" />
              Tambah Pengguna
            </button>
          </>
        }
      />

      <div className="roles">
        {PERAN.map((r) => (
          <button
            key={r}
            type="button"
            className="role"
            onClick={() => setPeran(peran === r ? null : r)}
            aria-pressed={peran === r}
            style={{ textAlign: "left", outline: peran === r ? "2px solid var(--accent)" : undefined }}
          >
            <b className="num">{pengguna.filter((u) => u.peran === r).length}</b>
            <p>{r}</p>
          </button>
        ))}
      </div>

      <div className="users">
        {daftar.map((u, i) => (
          <article className="ucard" key={u.id}>
            <div className="top2">
              <div className={`av ${i % 3 === 1 ? "o" : ""}`}>{inisial(u.nama)}</div>
              <div style={{ minWidth: 0 }}>
                <b>{u.nama}</b>
                <div className="em">{u.email}</div>
              </div>
            </div>
            <div className="meta">
              <Badge tone={u.peran === "Administrator" ? "i" : u.peran === "Operator Unit" ? "" : "w"}>{u.peran}</Badge>
              <Status tone={u.aktif ? "g" : "m"}>{u.aktif ? "Aktif" : "Nonaktif"}</Status>
            </div>
            <div className="meta">
              <span>{namaUnit(u.unit)}</span>
            </div>
            <div className="uaksi">
              <button type="button" className="btn soft sm" onClick={() => setAkanDiedit(u)} title={`Edit data ${u.nama}`}>
                <Icon name="edit" />
                Edit
              </button>
              <button
                type="button"
                className="btn soft sm"
                disabled={u.id === ID_AKUN_SAYA}
                title={u.id === ID_AKUN_SAYA ? "Akun Anda sendiri tidak bisa dinonaktifkan" : undefined}
                onClick={() => {
                  toggleAktifPengguna(u.id);
                  toast(`${u.nama} ${u.aktif ? "dinonaktifkan" : "diaktifkan"}`);
                }}
              >
                {u.aktif ? "Nonaktifkan" : "Aktifkan"}
              </button>
              <button
                type="button"
                className="btn danger sm ikon"
                onClick={() => setAkanDihapus(u)}
                disabled={u.id === ID_AKUN_SAYA}
                title={u.id === ID_AKUN_SAYA ? "Akun Anda sendiri tidak bisa dihapus" : `Hapus ${u.nama}`}
                aria-label={`Hapus ${u.nama}`}
              >
                <Icon name="trash" />
              </button>
            </div>
          </article>
        ))}
        {daftar.length === 0 && <p className="note">Tidak ada pengguna yang cocok.</p>}
      </div>

      {tambah && <FormPengguna onClose={() => setTambah(false)} />}
      {akanDiedit && <FormPengguna awal={akanDiedit} onClose={() => setAkanDiedit(null)} />}

      {akanDihapus && (
        <Modal
          title="Hapus pengguna?"
          description="Pengguna ini tidak bisa lagi masuk ke Belanjaku. Data belanja yang pernah dibuatnya tetap tersimpan."
          submitLabel="Hapus pengguna"
          bahaya
          onSubmit={() => {
            hapusPengguna(akanDihapus.id);
            toast(`${akanDihapus.nama} dihapus`);
            setAkanDihapus(null);
          }}
          onClose={() => setAkanDihapus(null)}
        >
          <div className="full ringkas">
            <div><span>Nama</span><b>{akanDihapus.nama}</b></div>
            <div><span>Email</span><b>{akanDihapus.email}</b></div>
            <div><span>Peran</span><b>{akanDihapus.peran}</b></div>
            <div><span>Unit kerja</span><b>{namaUnit(akanDihapus.unit)}</b></div>
          </div>
        </Modal>
      )}
    </>
  );
}

/** Form tambah pengguna; bila `awal` diisi, form menjadi form edit */
function FormPengguna({ onClose, awal }: { onClose: () => void; awal?: TPengguna }) {
  const { pengguna, penggunaAktif, referensi, tambahPengguna, ubahPengguna, toast } = useStore();
  const ID_AKUN_SAYA = penggunaAktif.id;
  const modeEdit = Boolean(awal);
  const akunSendiri = awal?.id === ID_AKUN_SAYA;
  const [nama, setNama] = useState(awal?.nama ?? "");
  const [email, setEmail] = useState(awal?.email ?? "");
  const [peran, setPeran] = useState<Peran>(awal?.peran ?? "Operator Unit");
  const [unit, setUnit] = useState(awal?.unit ?? referensi.unit[0]?.kode ?? "");
  const [aktif, setAktif] = useState(awal?.aktif ?? true);

  const simpan = () => {
    const em = email.trim().toLowerCase();
    if (!nama.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) {
      toast("Isi nama dan email dinas yang valid");
      return;
    }
    if (pengguna.some((u) => u.email.toLowerCase() === em && u.id !== awal?.id)) {
      toast("Email ini sudah dipakai pengguna lain");
      return;
    }
    if (awal) {
      ubahPengguna(awal.id, { nama: nama.trim(), email: em, peran, unit, aktif });
      toast(`Data ${nama.trim()} diperbarui`);
    } else {
      tambahPengguna({ nama: nama.trim(), email: em, peran, unit });
      toast("Pengguna ditambahkan");
    }
    onClose();
  };

  return (
    <Modal
      title={modeEdit ? "Edit Pengguna" : "Tambah Pengguna"}
      description={modeEdit ? "Ubah data lalu simpan. Perubahan peran langsung mengubah hak akses pengguna." : "Pengguna menerima akses sesuai peran yang dipilih."}
      submitLabel={modeEdit ? "Simpan Perubahan" : "Simpan Pengguna"}
      onSubmit={simpan}
      onClose={onClose}
    >
      <Field label="Nama lengkap" full>
        <input value={nama} onChange={(e) => setNama(e.target.value)} required />
      </Field>
      <Field label="Email dinas" full>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nama@pipmakassar.ac.id" required />
      </Field>
      <Field label="Peran">
        <select value={peran} onChange={(e) => setPeran(e.target.value as Peran)} disabled={akunSendiri} title={akunSendiri ? "Peran akun Anda sendiri tidak bisa diubah" : undefined}>
          {PERAN.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
      </Field>
      <Field label="Unit kerja">
        <select value={unit} onChange={(e) => setUnit(e.target.value)}>
          {referensi.unit.map((u) => (
            <option key={u.kode} value={u.kode}>{u.nama}</option>
          ))}
        </select>
      </Field>
      {modeEdit && (
        <Field label="Status akun" full>
          <select value={aktif ? "aktif" : "nonaktif"} onChange={(e) => setAktif(e.target.value === "aktif")} disabled={akunSendiri}>
            <option value="aktif">Aktif</option>
            <option value="nonaktif">Nonaktif</option>
          </select>
        </Field>
      )}
      {akunSendiri && <p className="hint">Peran dan status akun Anda sendiri tidak bisa diubah dari sini.</p>}
    </Modal>
  );
}
