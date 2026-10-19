"use client";

/**
 * Isian nomor dokumen pengadaan mengikuti pola nomor di berkas Excel, mis.
 *   PL.102/PPK/KO-RM/ [100142] /X/PIP.MKS-2026
 * Pengguna cukup mengetik bagian tengah (nomor agenda / kode paket); sumber dana, bulan Romawi, dan tahun
 * mengikuti isian lain di form. Bila nomornya berbeda pola, nomor bisa ditulis lengkap.
 */
import { polaNomor, tengahNomor, type JenisNomor } from "@/lib/pengadaan";

export interface NilaiNomor {
  /** bagian tengah nomor (mode pola) */
  tengah: string;
  /** nomor lengkap (mode manual) */
  bebas: string;
  manual: boolean;
}

/** Nilai awal isian dari nomor tersimpan; nomor yang tidak sesuai pola dibuka dalam mode tulis lengkap */
export function nomorAwal(jenis: JenisNomor, nomor?: string, tengahBawaan = ""): NilaiNomor {
  if (!nomor) return { tengah: tengahBawaan, bebas: "", manual: false };
  const t = tengahNomor(jenis, nomor);
  return t !== null ? { tengah: t, bebas: nomor, manual: false } : { tengah: tengahBawaan, bebas: nomor, manual: true };
}

/** Nomor lengkap yang akan disimpan ("" bila belum diisi) */
export function nomorLengkap(n: NilaiNomor, pola: { awal: string; akhir: string }): string {
  if (n.manual) return n.bebas.trim();
  const t = n.tengah.trim();
  return t ? pola.awal + t + pola.akhir : "";
}

export default function InputNomor({
  label,
  jenis,
  dana,
  tanggal,
  nilai,
  onChange,
}: {
  label: string;
  jenis: JenisNomor;
  dana: string;
  /** tanggal dokumen (ISO) — menentukan bulan Romawi & tahun */
  tanggal: string;
  nilai: NilaiNomor;
  onChange: (n: NilaiNomor) => void;
}) {
  const pola = polaNomor(jenis, dana, tanggal);
  const lengkap = nomorLengkap(nilai, pola);
  return (
    <div className="full isian-grup">
      <span className="isian-label">{label}</span>
      {nilai.manual ? (
        <input
          className="mono"
          value={nilai.bebas}
          onChange={(e) => onChange({ ...nilai, bebas: e.target.value })}
          placeholder={pola.awal + pola.contoh + pola.akhir}
          aria-label={label}
          spellCheck={false}
        />
      ) : (
        <span className="isian-nomor">
          <span className="mono nomor-tetap">{pola.awal}</span>
          <input
            className="mono"
            value={nilai.tengah}
            onChange={(e) => onChange({ ...nilai, tengah: e.target.value.replace(/\s+/g, "").replace(/\//g, "") })}
            placeholder={pola.contoh}
            aria-label={`${label} — bagian tengah nomor`}
            spellCheck={false}
          />
          <span className="mono nomor-tetap">{pola.akhir}</span>
        </span>
      )}
      <small className="isian-catatan">
        {nilai.manual ? (
          "Nomor ditulis lengkap sesuai dokumen."
        ) : lengkap ? (
          <>
            Nomor: <span className="mono">{lengkap}</span>
          </>
        ) : (
          "Isi bagian tengah nomor; bulan (Romawi) dan tahun mengikuti tanggal dokumen."
        )}{" "}
        <button
          type="button"
          className="tautan"
          onClick={() =>
            onChange(
              nilai.manual
                ? { ...nilai, manual: false, tengah: tengahNomor(jenis, nilai.bebas) ?? nilai.tengah }
                : { ...nilai, manual: true, bebas: lengkap || nilai.bebas },
            )
          }
        >
          {nilai.manual ? "Pakai pola nomor" : "Tulis nomor lengkap"}
        </button>
      </small>
    </div>
  );
}
