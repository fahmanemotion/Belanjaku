"use client";

/**
 * Bagian antarmuka "tempel dari Excel" untuk tabel barang/jasa:
 *  - BilahTempel  : ringkasan hasil tempel di atas tabel (kolom yang dikenali, baris yang dilewati, catatan)
 *                   dengan tombol Atur kolom & baris… dan Urungkan — mirip tombol "Opsi Tempel" di Excel.
 *  - DialogTempel : pratinjau salinan; arti tiap kolom dan jenis tiap baris (barang / spesifikasi / lewati) bisa diubah,
 *                   lalu pilih ditambahkan di bawah, menimpa mulai baris tertentu, atau mengganti semua barang.
 */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import Icon from "./Icon";
import { rupiah } from "@/lib/format";
import {
  DAFTAR_PERAN,
  NAMA_PERAN,
  golongkan,
  susunBarang,
  type JenisBaris,
  type Peran,
  type Susunan,
  type Tafsir,
} from "@/lib/tempelExcel";

export type ModeTempel = "timpa" | "tambah" | "ganti";

/** A, B, …, Z, AA, AB … */
export const hurufKolom = (k: number): string => (k < 26 ? String.fromCharCode(65 + k) : hurufKolom(Math.floor(k / 26) - 1) + hurufKolom(k % 26));

/** "Nama Barang → Uraian · Vol → Jumlah / volume · …" */
export function uraianKolom(t: Pick<Tafsir, "peran" | "judul">): string {
  return t.peran
    .flatMap((p, k) => (p === "lewati" || p === "no" ? [] : [`${t.judul[k] ? t.judul[k] : `kolom ${hurufKolom(k)}`} → ${NAMA_PERAN[p]}`]))
    .join(" · ");
}

/** Salin teks ke clipboard; cadangan execCommand untuk browser yang menolak navigator.clipboard */
export async function salinTeks(teks: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(teks);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = teks;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

/** Baca teks clipboard (butuh izin browser); "" bila ditolak / tidak didukung */
export async function bacaClipboard(): Promise<string> {
  try {
    return (await navigator.clipboard.readText()) ?? "";
  } catch {
    return "";
  }
}

/* =====================================================================
   Bilah hasil tempel
   ===================================================================== */
export interface IsiBilah {
  jenis: "hasil" | "info";
  judul: string;
  kolom?: string;
  catatan?: string[];
}

export function BilahTempel({ isi, onAtur, onUrungkan, onTutup }: { isi: IsiBilah; onAtur?: () => void; onUrungkan?: () => void; onTutup: () => void }) {
  return (
    <div className={`bilah-tempel ${isi.jenis}`} role="status" aria-live="polite">
      <Icon name={isi.jenis === "hasil" ? "check" : "info"} size={16} />
      <div className="bt-isi">
        <b>{isi.judul}</b>
        {isi.kolom && (
          <small>
            <span className="bt-label">Kolom:</span> {isi.kolom}
          </small>
        )}
        {isi.catatan && isi.catatan.length > 0 && <small className="bt-catatan">{isi.catatan.join(" · ")}</small>}
      </div>
      <div className="bt-aksi">
        {onAtur && (
          <button type="button" className="btn soft sm" onClick={onAtur}>
            Atur kolom & baris…
          </button>
        )}
        {onUrungkan && (
          <button type="button" className="btn soft sm" onClick={onUrungkan}>
            <Icon name="undo" />
            Urungkan
          </button>
        )}
        <button type="button" className="g-ib" aria-label="Tutup ringkasan tempel" title="Tutup" onClick={onTutup}>
          <Icon name="close" size={14} />
        </button>
      </div>
    </div>
  );
}

/* =====================================================================
   Dialog atur kolom & baris
   ===================================================================== */
const PERAN_TUNGGAL: Peran[] = ["uraian", "spek", "harga", "total", "no"];
const NAMA_JENIS: Record<JenisBaris, string> = { barang: "Barang", spek: "Spesifikasi", lewati: "Lewati" };
const MAKS_PRATINJAU = 300;

export function DialogTempel({
  data,
  tafsir,
  paksaAwal = {},
  modeAwal,
  mulai,
  akhirIsi,
  maksBarang,
  onBatal,
  onMasukkan,
}: {
  data: string[][];
  tafsir: Tafsir;
  paksaAwal?: Record<number, JenisBaris>;
  modeAwal: ModeTempel;
  /** baris tabel tempat menimpa (indeks barang), null bila tidak berasal dari sel tertentu */
  mulai: number | null;
  /** indeks sesudah baris terisi terakhir di tabel (0 = tabel kosong) */
  akhirIsi: number;
  maksBarang: number;
  onBatal: () => void;
  onMasukkan: (pilihan: { tafsir: Tafsir; paksa: Record<number, JenisBaris>; mode: ModeTempel; susunan: Susunan }) => void;
}) {
  const [peran, setPeran] = useState<Peran[]>(tafsir.peran);
  const [paksa, setPaksa] = useState<Record<number, JenisBaris>>(paksaAwal);
  const adaIsi = akhirIsi > 0;
  const [mode, setMode] = useState<ModeTempel>(adaIsi ? modeAwal : "ganti");
  const tombol = useRef<HTMLButtonElement>(null);
  const t: Tafsir = useMemo(() => ({ ...tafsir, peran }), [tafsir, peran]);
  const gol = useMemo(() => golongkan(data, t, paksa), [data, t, paksa]);
  const sus = useMemo(() => susunBarang(data, peran, gol.jenis), [data, peran, gol]);

  useEffect(() => {
    tombol.current?.focus();
  }, []);

  // kolom yang seluruhnya kosong (mis. sel gabungan di Excel) tidak ditampilkan
  const kolomTampil = useMemo(() => {
    const lebar = Math.max(0, ...data.map((r) => r.length));
    return Array.from({ length: lebar }, (_, k) => k).filter((k) => data.some((r) => (r[k] ?? "").trim()));
  }, [data]);

  const gantiPeran = (k: number, p: Peran) =>
    setPeran((xs) => xs.map((x, m) => (m === k ? p : PERAN_TUNGGAL.includes(p) && x === p ? "lewati" : x)));
  const gantiJenis = (i: number, j: JenisBaris) => setPaksa((x) => ({ ...x, [i]: j }));

  const nBarang = sus.barang.length;
  const nSpek = sus.barang.reduce((s, b) => s + b.spek.length, 0);
  const nLewat = gol.jenis.filter((j, i) => j === "lewati" && data[i].some((c) => c.trim())).length;
  const belumLengkap = sus.barang.filter((b) => b.uraian.trim().length < 2 || !b.jumlah || !b.satuan || !b.harga).length;
  const total = sus.barang.reduce((s, b) => s + (Number(b.jumlah) || 0) * (Number(b.harga) || 0), 0);
  // kolom Uraian wajib kecuali menimpa kolom tertentu pada baris yang sudah ada (mis. hanya kolom Jumlah)
  const tanpaUraian = !peran.includes("uraian") && mode !== "timpa";
  const terpotong = data.length > MAKS_PRATINJAU;
  const ruang = Math.max(0, maksBarang - (mode === "tambah" ? akhirIsi : mode === "timpa" ? (mulai ?? 0) : 0));

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onBatal();
    }
  };

  return createPortal(
    <div className="scrim scrim-tempel" onMouseDown={(e) => e.target === e.currentTarget && onBatal()}>
      <div className="modal tempel-dialog" role="dialog" aria-modal="true" aria-label="Atur hasil tempel dari Excel" onKeyDown={onKeyDown}>
        <div className="mhead">
          <h3>Tempel dari Excel</h3>
          <button type="button" className="more" onClick={onBatal} aria-label="Tutup">
            <Icon name="close" size={16} />
          </button>
        </div>
        <p>
          Periksa arti tiap kolom (baris paling atas) dan jenis tiap baris. Baris judul, kelompok, subtotal, PPN, total, dan terbilang sudah
          dilewati otomatis; baris yang diawali &ldquo;-&rdquo; menjadi spesifikasi barang di atasnya.
        </p>
        <div className="tempel-ringkas">
          <span>
            <b>{nBarang}</b> barang/jasa
          </span>
          <span>
            <b>{nSpek}</b> spesifikasi
          </span>
          <span>
            <b>{nLewat}</b> baris dilewati
          </span>
          <span>
            total <b className="num">{rupiah(total)}</b>
          </span>
          {belumLengkap > 0 && <span className="tr-ingat">{belumLengkap} barang belum lengkap — lengkapi di tabel</span>}
          {nBarang > ruang && (
            <span className="tr-salah">
              hanya {ruang} barang pertama yang masuk (maksimal {maksBarang} barang/jasa per paket)
            </span>
          )}
        </div>
        <div className="grid-excel-wrap tempel-wrap">
          <table className="grid-excel tempel-tabel">
            <thead>
              <tr>
                <th className="tt-jenis">Jenis baris</th>
                {kolomTampil.map((k) => (
                  <th key={k} className={peran[k] === "lewati" ? "tt-abai" : undefined}>
                    <select value={peran[k]} onChange={(e) => gantiPeran(k, e.target.value as Peran)} aria-label={`Arti kolom ${hurufKolom(k)}`}>
                      {DAFTAR_PERAN.map((p) => (
                        <option key={p} value={p}>
                          {NAMA_PERAN[p]}
                        </option>
                      ))}
                    </select>
                    <small title={tafsir.judul[k] || undefined}>
                      {hurufKolom(k)}
                      {tafsir.judul[k] ? ` · ${tafsir.judul[k]}` : ""}
                    </small>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.slice(0, MAKS_PRATINJAU).map((r, i) => {
                if (!r.some((c) => c.trim())) return null;
                const j = gol.jenis[i];
                return (
                  <tr key={i} className={`tt-${j}`}>
                    <td className="tt-jenis">
                      <select value={j} onChange={(e) => gantiJenis(i, e.target.value as JenisBaris)} aria-label={`Jenis baris ${i + 1}`}>
                        {(["barang", "spek", "lewati"] as JenisBaris[]).map((x) => (
                          <option key={x} value={x}>
                            {NAMA_JENIS[x]}
                          </option>
                        ))}
                      </select>
                      {j === "lewati" && gol.alasan[i] && <small>{gol.alasan[i]}</small>}
                    </td>
                    {kolomTampil.map((k) => {
                      const c = (r[k] ?? "").trim();
                      const pendek = c.split("\n")[0];
                      return (
                        <td key={k} className={peran[k] === "lewati" ? "tt-abai" : undefined} title={c.length > pendek.length || c.length > 40 ? c : undefined}>
                          {pendek.length > 60 ? pendek.slice(0, 60) + "…" : pendek}
                          {c.length > pendek.length && <span className="tt-lagi"> ⏎ …</span>}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {terpotong && <small className="isian-catatan">Pratinjau menampilkan {MAKS_PRATINJAU} baris pertama; semua baris tetap diproses.</small>}
        {adaIsi ? (
          <fieldset className="tempel-tempat">
            <legend>Masukkan ke tabel</legend>
            <label>
              <input type="radio" name="mode-tempel" checked={mode === "tambah"} onChange={() => setMode("tambah")} />
              Tambahkan di bawah barang yang sudah ada
            </label>
            {mulai !== null && (
              <label>
                <input type="radio" name="mode-tempel" checked={mode === "timpa"} onChange={() => setMode("timpa")} />
                Timpa mulai baris {mulai + 1}
              </label>
            )}
            <label>
              <input type="radio" name="mode-tempel" checked={mode === "ganti"} onChange={() => setMode("ganti")} />
              Ganti semua barang di tabel
            </label>
          </fieldset>
        ) : (
          <small className="isian-catatan">Tabel masih kosong — barang diisi mulai baris 1.</small>
        )}
        <div className="mfoot">
          {tanpaUraian && <span className="tempel-salah">Pilih kolom Uraian terlebih dahulu</span>}
          <button type="button" className="btn soft" onClick={onBatal}>
            Batal
          </button>
          <button
            ref={tombol}
            type="button"
            className="btn dark"
            disabled={!nBarang || !ruang || tanpaUraian}
            onClick={() => onMasukkan({ tafsir: t, paksa, mode, susunan: sus })}
          >
            Masukkan {Math.min(nBarang, ruang)} barang/jasa
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
