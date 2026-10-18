"use client";

/** Ganti kata sandi akun sendiri (kata sandi lama diperiksa ulang lebih dulu) */
import { useState } from "react";
import { useStore } from "./StoreProvider";
import { Field, Modal } from "./ui";

export default function GantiSandi({ onClose }: { onClose: () => void }) {
  const { gantiSandi, toast } = useStore();
  const [lama, setLama] = useState("");
  const [baru, setBaru] = useState("");
  const [ulang, setUlang] = useState("");

  const simpan = async () => {
    if (!lama || !baru) return toast("Isi kata sandi lama dan kata sandi baru");
    if (baru.length < 8 || !/[A-Za-z]/.test(baru) || !/[0-9]/.test(baru)) return toast("Kata sandi baru minimal 8 karakter dan berisi huruf serta angka");
    if (baru !== ulang) return toast("Ulangi kata sandi baru dengan tepat");
    const h = await gantiSandi(lama, baru);
    if (!h.ok) return toast(h.pesan);
    toast("Kata sandi berhasil diganti");
    onClose();
  };

  return (
    <Modal title="Ganti Kata Sandi" description="Gunakan minimal 8 karakter yang berisi huruf dan angka." submitLabel="Simpan Kata Sandi" onSubmit={simpan} onClose={onClose}>
      <Field label="Kata sandi lama" full>
        <input type="password" autoComplete="current-password" value={lama} onChange={(e) => setLama(e.target.value)} />
      </Field>
      <Field label="Kata sandi baru">
        <input type="password" autoComplete="new-password" value={baru} onChange={(e) => setBaru(e.target.value)} />
      </Field>
      <Field label="Ulangi kata sandi baru">
        <input type="password" autoComplete="new-password" value={ulang} onChange={(e) => setUlang(e.target.value)} />
      </Field>
    </Modal>
  );
}
