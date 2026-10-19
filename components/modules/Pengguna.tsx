"use client";

import { useState } from "react";
import Icon from "@/components/Icon";
import { useStore } from "@/components/StoreProvider";
import { Badge, Field, Modal, PageHead, SearchBox, Status, type Tone } from "@/components/ui";
import { AKSES } from "@/lib/akses";
import { PERAN, PERAN_SATU_AKUN } from "@/lib/data";
import { inisial } from "@/lib/format";
import type { Peran, Pengguna as TPengguna } from "@/lib/types";

/** Warna badge per peran: admin biru, pengadaan netral, pencairan hijau, pengesahan ungu, pejabat pemantau kuning */
const TONE_PERAN: Record<Peran, Tone> = {
  Administrator: "i",
  "Operator Pengadaan": "",
  "Operator Pencairan": "g",
  "Operator Pengesahan": "p",
  "Pejabat Pengadaan": "w",
  PPK: "w",
  Manajemen: "",
};

/**
 * Pengguna hanya dibedakan menurut peran (tidak terikat unit kerja).
 * Operator Pencairan & Operator Pengesahan hanya boleh satu akun aktif; peran lain boleh banyak akun.
 * PPK & Pejabat Pengadaan menyimpan data penanda tangan (NIP, pangkat; SK untuk PPK) untuk dokumen pengadaan.
 */
const satuAkun = (r: Peran) => PERAN_SATU_AKUN.includes(r);
const penandaTangan = (r: Peran) => r === "PPK" || r === "Pejabat Pengadaan";
/** Pemegang aktif peran satu-akun selain `kecuali` (untuk menandai pilihan peran yang sudah terisi) */
const pemegang = (daftar: TPengguna[], r: Peran, kecuali?: string) =>
  satuAkun(r) ? daftar.find((u) => u.peran === r && u.aktif && !u.dihapus && u.id !== kecuali) : undefined;

/** Kata sandi acak yang mudah dibacakan: 3 huruf + 4 angka + 3 huruf, mis. "Kap7314rum" */
function sandiAcak() {
  const h = "abcdefghjkmnpqrstuvwxyz";
  const ambil = (n: number, dari: string) => Array.from(crypto.getRandomValues(new Uint32Array(n)), (x) => dari[x % dari.length]).join("");
  const awal = ambil(3, h);
  return awal[0].toUpperCase() + awal.slice(1) + ambil(4, "23456789") + ambil(3, h);
}

export default function Pengguna() {
  const { pengguna: semua, penggunaAktif, toggleAktifPengguna, hapusPengguna, toast } = useStore();
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
            {/* angka = akun aktif; akun nonaktif disebut terpisah */}
            <b className="num">{pengguna.filter((u) => u.peran === r && u.aktif).length}</b>
            <p>{r}</p>
            {(() => {
              const nonaktif = pengguna.filter((u) => u.peran === r && !u.aktif).length;
              const catatan = [satuAkun(r) && "Hanya 1 akun aktif", nonaktif > 0 && `${nonaktif} nonaktif`].filter(Boolean).join(" · ");
              return catatan ? <small className={`role-catatan ${satuAkun(r) ? "" : "netral"}`}>{catatan}</small> : null;
            })()}
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
            <p className="tugas-peran">{AKSES[u.peran]?.tugas}</p>
            {penandaTangan(u.peran) && (
              <p className={`data-pejabat ${u.nip ? "" : "kurang"}`}>
                {u.nip ? `NIP ${u.nip}` : "NIP belum diisi"}
                {u.pangkat ? ` · ${u.pangkat}` : ""}
                {u.peran === "PPK" && !u.skNomor ? " · SK belum diisi" : ""}
              </p>
            )}
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
          </div>
        </Modal>
      )}
    </>
  );
}

/** Form tambah pengguna; bila `awal` diisi, form menjadi form edit */
function FormPengguna({ onClose, awal }: { onClose: () => void; awal?: TPengguna }) {
  const { pengguna, penggunaAktif, tambahPengguna, ubahPengguna, simpanDataPejabat, toast } = useStore();
  const ID_AKUN_SAYA = penggunaAktif.id;
  const modeEdit = Boolean(awal);
  const akunSendiri = awal?.id === ID_AKUN_SAYA;
  const [nama, setNama] = useState(awal?.nama ?? "");
  const [email, setEmail] = useState(awal?.email ?? "");
  const [peran, setPeran] = useState<Peran>(awal?.peran ?? "Operator Pengadaan");
  const [aktif, setAktif] = useState(awal?.aktif ?? true);
  // Peran satu-akun yang sudah dipegang akun aktif lain tidak bisa dipilih untuk akun aktif
  // (akun nonaktif boleh disiapkan lebih dulu sebagai pengganti)
  const terisi = pemegang(pengguna, peran, awal?.id);
  const [sandi, setSandi] = useState(() => (awal ? "" : sandiAcak()));
  // data penanda tangan dokumen pengadaan (PPK & Pejabat Pengadaan)
  const [nip, setNip] = useState(awal?.nip ?? "");
  const [pangkat, setPangkat] = useState(awal?.pangkat ?? "");
  const [skNomor, setSkNomor] = useState(awal?.skNomor ?? "");
  const [skTanggal, setSkTanggal] = useState(awal?.skTanggal ?? "");
  const pejabat = penandaTangan(peran);
  const dataPejabat = {
    nip: nip.trim(),
    pangkat: pangkat.trim(),
    skNomor: peran === "PPK" ? skNomor.trim() : awal?.skNomor ?? "",
    skTanggal: peran === "PPK" ? skTanggal : awal?.skTanggal ?? "",
  };
  const pejabatBerubah =
    pejabat &&
    (dataPejabat.nip !== (awal?.nip ?? "") ||
      dataPejabat.pangkat !== (awal?.pangkat ?? "") ||
      dataPejabat.skNomor !== (awal?.skNomor ?? "") ||
      dataPejabat.skTanggal !== (awal?.skTanggal ?? ""));

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
    if (terisi && aktif) {
      toast(`Peran ${peran} hanya boleh satu akun aktif dan saat ini dipakai ${terisi.nama}`);
      return;
    }
    if (pejabat && dataPejabat.nip && (!/^[\d ]+$/.test(dataPejabat.nip) || dataPejabat.nip.replace(/\s/g, "").length !== 18)) {
      toast("NIP harus 18 digit angka (boleh berspasi)");
      return;
    }
    if (awal) {
      const berubah =
        nama.trim() !== awal.nama || em !== awal.email || peran !== awal.peran || aktif !== awal.aktif;
      if (berubah && !(await ubahPengguna(awal.id, { nama: nama.trim(), email: em, peran, aktif }))) return;
      if (pejabatBerubah && !(await simpanDataPejabat(awal.id, dataPejabat))) return;
      toast(berubah || pejabatBerubah ? `Data ${nama.trim()} diperbarui` : "Belum ada perubahan untuk disimpan");
    } else {
      if (sandi.length < 8 || !/[A-Za-z]/.test(sandi) || !/[0-9]/.test(sandi)) {
        toast("Kata sandi awal minimal 8 karakter dan berisi huruf serta angka");
        return;
      }
      const baru = await tambahPengguna({ nama: nama.trim(), email: em, peran, sandi });
      if (!baru) return;
      if (pejabatBerubah && !(await simpanDataPejabat(baru.id, dataPejabat))) {
        toast(`Pengguna ditambahkan (kata sandi awal: ${sandi}), tetapi data penanda tangan gagal disimpan`);
        onClose();
        return;
      }
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
      <Field label="Peran" full>
        <select value={peran} onChange={(e) => setPeran(e.target.value as Peran)} disabled={akunSendiri} title={akunSendiri ? "Peran akun Anda sendiri tidak bisa diubah" : undefined}>
          {PERAN.map((r) => {
            const lain = pemegang(pengguna, r, awal?.id);
            return (
              <option key={r} value={r} disabled={Boolean(lain) && aktif && r !== awal?.peran}>
                {r}
                {satuAkun(r) ? (lain ? ` — sudah dipakai ${lain.nama}` : " (hanya 1 akun aktif)") : ""}
              </option>
            );
          })}
        </select>
        <small className="isian-catatan">
          {AKSES[peran]?.tugas}
          {satuAkun(peran) ? " · peran ini hanya boleh satu akun aktif" : ""}
        </small>
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
      {pejabat && (
        <>
          <p className="hint">Data penanda tangan — dicetak di bawah nama pada dokumen pengadaan.</p>
          <Field label="NIP">
            <input value={nip} onChange={(e) => setNip(e.target.value)} className="mono" inputMode="numeric" placeholder="198810262015032003" />
          </Field>
          <Field label="Pangkat/golongan">
            <input value={pangkat} onChange={(e) => setPangkat(e.target.value)} placeholder="mis. Penata (III/c)" />
          </Field>
          {peran === "PPK" && (
            <>
              <Field label="No. SK penunjukan PPK">
                <input value={skNomor} onChange={(e) => setSkNomor(e.target.value)} placeholder="SK-PIP.Mks 258 Tahun 2025" />
              </Field>
              <Field label="Tanggal SK">
                <input type="date" value={skTanggal} onChange={(e) => setSkTanggal(e.target.value)} />
              </Field>
            </>
          )}
        </>
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
