"use client";

import { useState } from "react";
import Icon from "@/components/Icon";
import { useStore } from "@/components/StoreProvider";
import { Badge, Field, Modal, PageHead, SearchBox, Status, type Tone } from "@/components/ui";
import type { Pengguna as TPengguna } from "@/lib/types";

import { PERAN } from "@/lib/data";
import { inisial } from "@/lib/format";
import type { Peran } from "@/lib/types";

/** Warna badge per peran: admin biru, pengadaan netral, keuangan hijau, pengesahan ungu, pejabat pemantau kuning */
const TONE_PERAN: Record<Peran, Tone> = {
  Administrator: "i",
  "Operator Pengadaan": "",
  "Operator Keuangan": "g",
  "Operator Pengesahan": "p",
  "Bendahara Pengeluaran": "g",
  PPK: "w",
  PPSPM: "w",
};

/** Kata sandi acak yang mudah dibacakan: 3 huruf + 4 angka + 3 huruf, mis. "Kap7314rum" */
function sandiAcak() {
  const h = "abcdefghjkmnpqrstuvwxyz";
  const ambil = (n: number, dari: string) => Array.from(crypto.getRandomValues(new Uint32Array(n)), (x) => dari[x % dari.length]).join("");
  const awal = ambil(3, h);
  return awal[0].toUpperCase() + awal.slice(1) + ambil(4, "23456789") + ambil(3, h);
}

export default function Pengguna() {
  const { pengguna: semua, penggunaAktif, toggleAktifPengguna, hapusPengguna, namaUnit, toast } = useStore();
  /** Akun yang sedang masuk — tidak boleh menonaktifkan atau menghapus dirinya sendiri */
  const ID_AKUN_SAYA = penggunaAktif.id;
  const [akanDihapus, setAkanDihapus] = useState<TPengguna | null>(null);
  const [akanDiedit, setAkanDiedit] = useState<TPengguna | null>(null);
  const [akanReset, setAkanReset] = useState<TPengguna | null>(null);
  const [cari, setCari] = useState("");
  const [peran, setPeran] = useState<Peran | null>(null);
  const [tambah, setTambah] = useState(false);
  const [proses, setProses] = useState<string | null>(null);

  // profil yang sudah dihapus hanya disimpan untuk riwayat, tidak ditampilkan di sini
  const pengguna = semua.filter((u) => !u.dihapus);
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
              <Badge tone={TONE_PERAN[u.peran] ?? ""}>{u.peran}</Badge>
              <Status tone={u.aktif ? "g" : "m"}>{u.aktif ? "Aktif" : "Nonaktif"}</Status>
            </div>
            <div className="meta">
              <span>{u.unit ? namaUnit(u.unit) : "Tidak terikat unit"}</span>
            </div>
            <div className="uaksi">
              <button type="button" className="btn soft sm" onClick={() => setAkanDiedit(u)} title={`Edit data ${u.nama}`}>
                <Icon name="edit" />
                Edit
              </button>
              <button
                type="button"
                className="btn soft sm"
                disabled={u.id === ID_AKUN_SAYA || proses === u.id}
                title={u.id === ID_AKUN_SAYA ? "Akun Anda sendiri tidak bisa dinonaktifkan" : undefined}
                onClick={async () => {
                  setProses(u.id);
                  if (await toggleAktifPengguna(u.id)) toast(`${u.nama} ${u.aktif ? "dinonaktifkan" : "diaktifkan"}`);
                  setProses(null);
                }}
              >
                {proses === u.id ? "Memproses…" : u.aktif ? "Nonaktifkan" : "Aktifkan"}
              </button>
              <button
                type="button"
                className="btn soft sm ikon"
                onClick={() => setAkanReset(u)}
                disabled={u.id === ID_AKUN_SAYA}
                title={u.id === ID_AKUN_SAYA ? "Ganti kata sandi Anda lewat menu akun" : `Atur ulang kata sandi ${u.nama}`}
                aria-label={`Atur ulang kata sandi ${u.nama}`}
              >
                <Icon name="lock" />
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
      {akanReset && <AturUlangSandi u={akanReset} onClose={() => setAkanReset(null)} />}

      {akanDihapus && (
        <Modal
          title="Hapus pengguna?"
          description="Akun login pengguna ini dihapus sehingga tidak bisa lagi masuk ke Belanjaku. Data belanja dan riwayat aktivitasnya tetap tersimpan."
          submitLabel="Hapus pengguna"
          bahaya
          onSubmit={async () => {
            if (!(await hapusPengguna(akanDihapus.id))) return;
            toast(`${akanDihapus.nama} dihapus`);
            setAkanDihapus(null);
          }}
          onClose={() => setAkanDihapus(null)}
        >
          <div className="full ringkas">
            <div><span>Nama</span><b>{akanDihapus.nama}</b></div>
            <div><span>Email</span><b>{akanDihapus.email}</b></div>
            <div><span>Peran</span><b>{akanDihapus.peran}</b></div>
            <div><span>Unit kerja</span><b>{akanDihapus.unit ? namaUnit(akanDihapus.unit) : "-"}</b></div>
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
  const [peran, setPeran] = useState<Peran>(awal?.peran ?? "Operator Pengadaan");
  // Peran tidak lagi terikat unit kerja; unit hanya keterangan asal pengguna
  const [unit, setUnit] = useState(awal ? awal.unit : "");
  const [aktif, setAktif] = useState(awal?.aktif ?? true);
  const [sandi, setSandi] = useState(() => (awal ? "" : sandiAcak()));

  const simpan = async () => {
    const em = email.trim().toLowerCase();
    if (!nama.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) {
      toast("Isi nama dan email dinas yang valid");
      return;
    }
    if (pengguna.some((u) => !u.dihapus && u.email.toLowerCase() === em && u.id !== awal?.id)) {
      toast("Email ini sudah dipakai pengguna lain");
      return;
    }
    if (awal) {
      if (!(await ubahPengguna(awal.id, { nama: nama.trim(), email: em, peran, unit, aktif }))) return;
      toast(`Data ${nama.trim()} diperbarui`);
    } else {
      if (sandi.length < 8 || !/[A-Za-z]/.test(sandi) || !/[0-9]/.test(sandi)) {
        toast("Kata sandi awal minimal 8 karakter dan berisi huruf serta angka");
        return;
      }
      if (!(await tambahPengguna({ nama: nama.trim(), email: em, peran, unit, sandi }))) return;
      toast(`Pengguna ditambahkan · kata sandi awal: ${sandi}`);
    }
    onClose();
  };

  return (
    <Modal
      title={modeEdit ? "Edit Pengguna" : "Tambah Pengguna"}
      description={
        modeEdit
          ? "Ubah data lalu simpan. Perubahan peran langsung mengubah hak akses pengguna."
          : "Akun login dibuat dengan kata sandi awal di bawah. Sampaikan kepada pengguna dan minta ia menggantinya lewat menu akun."
      }
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
          <option value="">Tidak terikat unit</option>
          {referensi.unit.map((u) => (
            <option key={u.kode} value={u.kode}>{u.nama}</option>
          ))}
        </select>
      </Field>
      {!modeEdit && (
        <Field label="Kata sandi awal" full>
          <span className="isian-tombol">
            <input value={sandi} onChange={(e) => setSandi(e.target.value)} autoComplete="off" spellCheck={false} className="mono" />
            <button type="button" className="btn soft sm" onClick={() => setSandi(sandiAcak())}>
              Acak
            </button>
          </span>
        </Field>
      )}
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

/** Administrator mengatur ulang kata sandi pengguna lain (mis. pengguna lupa kata sandi) */
function AturUlangSandi({ u, onClose }: { u: TPengguna; onClose: () => void }) {
  const { aturUlangSandi, toast } = useStore();
  const [sandi, setSandi] = useState(sandiAcak);

  const simpan = async () => {
    if (sandi.length < 8 || !/[A-Za-z]/.test(sandi) || !/[0-9]/.test(sandi)) {
      toast("Kata sandi minimal 8 karakter dan berisi huruf serta angka");
      return;
    }
    if (!(await aturUlangSandi(u.id, sandi))) return;
    toast(`Kata sandi ${u.nama} diatur ulang · kata sandi baru: ${sandi}`);
    onClose();
  };

  return (
    <Modal
      title="Atur Ulang Kata Sandi"
      description={`Kata sandi lama ${u.nama} tidak berlaku lagi. Sampaikan kata sandi baru ini dan minta ia menggantinya lewat menu akun.`}
      submitLabel="Atur Ulang"
      onSubmit={simpan}
      onClose={onClose}
    >
      <div className="full ringkas">
        <div><span>Nama</span><b>{u.nama}</b></div>
        <div><span>Email</span><b>{u.email}</b></div>
      </div>
      <Field label="Kata sandi baru" full>
        <span className="isian-tombol">
          <input value={sandi} onChange={(e) => setSandi(e.target.value)} autoComplete="off" spellCheck={false} className="mono" />
          <button type="button" className="btn soft sm" onClick={() => setSandi(sandiAcak())}>
            Acak
          </button>
        </span>
      </Field>
    </Modal>
  );
}
