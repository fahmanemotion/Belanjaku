"use client";

/**
 * Riwayat Aktivitas — jejak audit seluruh tindakan operator.
 * Menjawab: siapa melakukan apa, kapan, pada dokumen mana, dan apa yang berubah.
 * Klik nomor dokumen untuk "melacak" seluruh perjalanan dokumen tersebut dari awal.
 */
import { useEffect, useMemo, useState } from "react";
import Icon from "@/components/Icon";
import { useStore } from "@/components/StoreProvider";
import { TONE_BELANJA } from "@/components/modules/Belanja";
import { Badge, PageHead, Saring, SearchBox, Status } from "@/components/ui";
import { JENIS_AKTIVITAS, MODUL_AKTIVITAS } from "@/lib/data";
import { hariIni, inisial, jam, rupiah, selisihHari, tanggal, tanggalJam, tanggalPanjang } from "@/lib/format";
import type { Aktivitas as TAktivitas, JenisAktivitas, ModulAktivitas } from "@/lib/types";

type FilterJenis = "Semua" | JenisAktivitas;
type FilterModul = "Semua" | ModulAktivitas;
type FilterPeriode = "Semua" | "hari" | "7hari" | "bulan";

const PER_HALAMAN = 40;
const infoJenis = (j: JenisAktivitas) => JENIS_AKTIVITAS.find((x) => x.value === j)!;

export default function Aktivitas() {
  const { aktivitas, kegiatan, pengguna, infoPengguna, boleh, jejakDokumen } = useStore();
  // Tanpa izin "lihat semua" (Operator Unit), database hanya mengirim aktivitas sendiri + dokumen unitnya
  const lihatSemua = boleh("aktivitas.semua");
  // "Hari ini" baru dihitung di browser agar tidak berbeda dengan hasil render server
  const [hari, setHari] = useState<string | null>(null);
  useEffect(() => setHari(hariIni()), []);

  const [operator, setOperator] = useState("Semua");
  const [jenis, setJenis] = useState<FilterJenis>("Semua");
  const [modul, setModul] = useState<FilterModul>("Semua");
  const [periode, setPeriode] = useState<FilterPeriode>("Semua");
  const [cari, setCari] = useState("");
  const [lacak, setLacak] = useState<string | null>(null);
  /** riwayat lengkap dokumen yang dilacak, langsung dari database (tidak terbatas 1.000 aktivitas terbaru) */
  const [jejak, setJejak] = useState<TAktivitas[] | null>(null);
  const [batas, setBatas] = useState(PER_HALAMAN);

  useEffect(() => {
    if (!lacak) return;
    let batal = false;
    setJejak(null);
    jejakDokumen(lacak).then((x) => !batal && setJejak(x));
    return () => {
      batal = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lacak, aktivitas.length]);

  const adaFilter = operator !== "Semua" || jenis !== "Semua" || modul !== "Semua" || periode !== "Semua" || cari !== "";
  const reset = () => {
    setOperator("Semua");
    setJenis("Semua");
    setModul("Semua");
    setPeriode("Semua");
    setCari("");
    setBatas(PER_HALAMAN);
  };

  /** Semua pelaku yang pernah tercatat + pengguna saat ini */
  const daftarOperator = useMemo(() => {
    const id = Array.from(new Set([...(lihatSemua ? pengguna.map((u) => u.id) : []), ...aktivitas.map((a) => a.oleh)]));
    return id.map((x) => ({ value: x, label: infoPengguna(x).nama })).sort((a, b) => a.label.localeCompare(b.label));
  }, [pengguna, aktivitas, infoPengguna, lihatSemua]);

  const masukPeriode = (a: TAktivitas) => {
    if (periode === "Semua" || !hari) return true;
    const t = a.waktu.slice(0, 10);
    if (periode === "hari") return t === hari;
    if (periode === "7hari") return selisihHari(t, hari) >= 0 && selisihHari(t, hari) <= 6;
    return t.slice(0, 7) === hari.slice(0, 7);
  };

  const teksCari = (a: TAktivitas) =>
    [
      a.objekId,
      a.objekLabel,
      a.aksi,
      a.catatan,
      infoPengguna(a.oleh).nama,
      ...(a.perubahan ?? []).flatMap((p) => [p.kolom, p.dari, p.ke]),
    ]
      .join(" ")
      .toLowerCase();

  const hasil = useMemo(() => {
    if (lacak) return (jejak ?? aktivitas.filter((a) => a.objekId === lacak)).slice().reverse(); // urut dari awal
    const q = cari.trim().toLowerCase();
    return aktivitas.filter(
      (a) =>
        (operator === "Semua" || a.oleh === operator) &&
        (jenis === "Semua" || a.jenis === jenis) &&
        (modul === "Semua" || a.modul === modul) &&
        masukPeriode(a) &&
        (!q || teksCari(a).includes(q)),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aktivitas, jejak, lacak, operator, jenis, modul, periode, cari, hari, infoPengguna]);

  const tampil = lacak ? hasil : hasil.slice(0, batas);

  /** Kelompokkan per tanggal (urutan tetap mengikuti hasil) */
  const kelompok = useMemo(() => {
    const g: { tgl: string; isi: TAktivitas[] }[] = [];
    for (const a of tampil) {
      const t = a.waktu.slice(0, 10);
      const akhir = g[g.length - 1];
      if (akhir?.tgl === t) akhir.isi.push(a);
      else g.push({ tgl: t, isi: [a] });
    }
    return g;
  }, [tampil]);

  const judulTanggal = (t: string) => {
    if (hari) {
      const s = selisihHari(t, hari);
      if (s === 0) return `Hari ini · ${tanggalPanjang(t)}`;
      if (s === 1) return `Kemarin · ${tanggalPanjang(t)}`;
    }
    return tanggalPanjang(t);
  };

  /* ---------- Ringkasan ---------- */
  const hariIniSaja = hari ? aktivitas.filter((a) => a.waktu.startsWith(hari)) : [];
  const jumlahJenis = (j: JenisAktivitas) => aktivitas.filter((a) => a.jenis === j).length;
  const tujuhHari = (j: JenisAktivitas) =>
    hari ? aktivitas.filter((a) => a.jenis === j && selisihHari(a.waktu, hari) >= 0 && selisihHari(a.waktu, hari) <= 6).length : 0;
  const terlama = aktivitas.length ? aktivitas[aktivitas.length - 1].waktu : "";

  /* ---------- Pelacakan dokumen ---------- */
  const mulaiLacak = (id: string) => {
    setLacak(id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const dokLacak = lacak ? kegiatan.find((k) => k.id === lacak) : undefined;
  const logLacak = lacak ? hasil : [];
  const dokDihapus = lacak ? !dokLacak && logLacak.some((a) => a.jenis === "Hapus") : false;

  /* ---------- Ekspor CSV (untuk arsip / pemeriksaan) ---------- */
  const ekspor = () => {
    const sel = (v: string | undefined) => `"${(v ?? "").replace(/"/g, '""')}"`;
    const kepala = ["Waktu", "Operator", "Peran", "Modul", "Jenis", "Aktivitas", "Dokumen", "Uraian", "Perubahan", "Catatan"];
    const baris = hasil.map((a) => {
      const u = infoPengguna(a.oleh);
      return [
        tanggalJam(a.waktu),
        u.nama,
        u.peran,
        a.modul,
        infoJenis(a.jenis).label,
        a.aksi,
        a.objekId,
        a.objekLabel,
        (a.perubahan ?? []).map((p) => `${p.kolom}: ${p.dari} -> ${p.ke}`).join("; "),
        a.catatan,
      ]
        .map(sel)
        .join(";");
    });
    const blob = new Blob(["﻿" + [kepala.map(sel).join(";"), ...baris].join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `riwayat-aktivitas${lacak ? "-" + lacak : ""}-${hariIni()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <PageHead
        title="Riwayat Aktivitas"
        subtitle="Jejak setiap tindakan operator — siapa, kapan, dokumen apa, dan apa yang diubah — agar kesalahan mudah ditelusuri."
        actions={
          <button type="button" className="btn soft" onClick={ekspor} disabled={hasil.length === 0}>
            <Icon name="download" />
            Ekspor CSV
          </button>
        }
      />

      <div className="stats">
        <div className="stat hot">
          <div className="lbl">Aktivitas hari ini</div>
          <div className="big num">{hari ? hariIniSaja.length : "—"}</div>
          <div className="note">{hari ? `${new Set(hariIniSaja.map((a) => a.oleh)).size} operator aktif` : " "}</div>
        </div>
        <div className="stat">
          <div className="lbl">Dokumen diubah</div>
          <div className="big num">{jumlahJenis("Ubah")}</div>
          <div className="note">{tujuhHari("Ubah")} dalam 7 hari terakhir</div>
        </div>
        <div className="stat">
          <div className="lbl">Dokumen dihapus</div>
          <div className="big num">{jumlahJenis("Hapus")}</div>
          <div className="note">tercatat beserta alasannya</div>
        </div>
        <div className="stat">
          <div className="lbl">Total tercatat</div>
          <div className="big num">{aktivitas.length}</div>
          <div className="note">{terlama ? `sejak ${tanggal(terlama.slice(0, 10))}` : "belum ada"}</div>
        </div>
      </div>

      <section className="panel">
        {lacak ? (
          <div className="lacak">
            <div className="lacak-ikon">
              <Icon name="route" />
            </div>
            <div className="lacak-isi">
              <p className="lbl">Melacak dokumen</p>
              <h3>
                <span className="mono">{lacak}</span> {dokLacak?.uraian ?? logLacak[0]?.objekLabel}
              </h3>
              <div className="lacak-meta">
                {dokLacak ? (
                  <Status tone={TONE_BELANJA[dokLacak.status]}>{dokLacak.status}</Status>
                ) : (
                  <Badge tone={dokDihapus ? "b" : ""}>{dokDihapus ? "Sudah dihapus" : "Tidak ditemukan"}</Badge>
                )}
                {dokLacak && <span>{rupiah(dokLacak.nilai)}</span>}
                {dokLacak && <span>dibuat oleh {infoPengguna(dokLacak.dibuatOleh).nama}</span>}
                <span>{logLacak.length} aktivitas</span>
              </div>
            </div>
            <button type="button" className="btn soft sm" onClick={() => setLacak(null)}>
              <Icon name="close" />
              Tutup pelacakan
            </button>
          </div>
        ) : (
          <div className="ph">
            <div>
              <h3>Linimasa</h3>
              <p className="sub">
                {hasil.length} aktivitas{adaFilter ? " sesuai saringan" : ""}
                {lihatSemua ? "" : " · aktivitas Anda & dokumen unit Anda"} · klik nomor dokumen untuk melacak perjalanannya
              </p>
            </div>
            <div className="tbar filter-kegiatan filter-log">
              <Saring<string>
                label="Operator"
                value={operator}
                onChange={(v) => { setOperator(v); setBatas(PER_HALAMAN); }}
                opsi={[{ value: "Semua", label: "Semua operator" }, ...daftarOperator]}
              />
              <Saring<FilterJenis>
                label="Jenis aktivitas"
                value={jenis}
                onChange={(v) => { setJenis(v); setBatas(PER_HALAMAN); }}
                opsi={[{ value: "Semua", label: "Semua aktivitas" }, ...JENIS_AKTIVITAS.map((j) => ({ value: j.value, label: j.label }))]}
              />
              <Saring<FilterModul>
                label="Modul"
                value={modul}
                onChange={(v) => { setModul(v); setBatas(PER_HALAMAN); }}
                opsi={[{ value: "Semua", label: "Semua modul" }, ...MODUL_AKTIVITAS.map((m) => ({ value: m, label: m }))]}
              />
              <Saring<FilterPeriode>
                label="Periode"
                value={periode}
                onChange={(v) => { setPeriode(v); setBatas(PER_HALAMAN); }}
                opsi={[
                  { value: "Semua", label: "Semua waktu" },
                  { value: "hari", label: "Hari ini" },
                  { value: "7hari", label: "7 hari terakhir" },
                  { value: "bulan", label: "Bulan ini" },
                ]}
              />
              <SearchBox id="log-cari" value={cari} onChange={(v) => { setCari(v); setBatas(PER_HALAMAN); }} placeholder="Cari dokumen, operator, nilai" />
              {adaFilter && (
                <button type="button" className="btn soft sm" onClick={reset}>
                  <Icon name="close" />
                  Reset
                </button>
              )}
            </div>
          </div>
        )}

        {kelompok.length === 0 ? (
          <p className="kosong-log">Tidak ada aktivitas yang cocok dengan saringan.</p>
        ) : (
          kelompok.map((g) => (
            <section key={g.tgl} className="log-hari" aria-label={tanggalPanjang(g.tgl)}>
              <h4>{judulTanggal(g.tgl)}</h4>
              <ol className="log-daftar">
                {g.isi.map((a) => (
                  <BarisLog key={a.id} a={a} onLacak={lacak ? undefined : mulaiLacak} />
                ))}
              </ol>
            </section>
          ))
        )}

        {!lacak && hasil.length > batas && (
          <div className="muat-lagi">
            <button type="button" className="btn soft" onClick={() => setBatas((b) => b + PER_HALAMAN)}>
              Tampilkan lebih banyak · {hasil.length - batas} lagi
            </button>
          </div>
        )}
      </section>
    </>
  );
}

function BarisLog({ a, onLacak }: { a: TAktivitas; onLacak?: (id: string) => void }) {
  const { infoPengguna, penggunaAktif } = useStore();
  const u = infoPengguna(a.oleh);
  const j = infoJenis(a.jenis);
  const dokumen = a.objekId?.startsWith("BLJ-");

  return (
    <li className={`log t-${j.tone || "n"}`}>
      <time className="log-jam" dateTime={a.waktu}>{jam(a.waktu)}</time>
      <div className="log-isi">
        <div className="log-kepala">
          <span className="av log-av" aria-hidden="true">{inisial(u.nama)}</span>
          <p>
            <b>{a.oleh === penggunaAktif.id ? `${u.nama} (Anda)` : u.nama}</b>
            <span className="log-peran">{u.peran}</span>
            <span className="log-aksi">
              {a.aksi}
              {dokumen &&
                (onLacak ? (
                  <button type="button" className="doc-chip" onClick={() => onLacak(a.objekId!)} title={`Lacak semua aktivitas ${a.objekId}`}>
                    {a.objekId}
                  </button>
                ) : (
                  <span className="doc-chip statis">{a.objekId}</span>
                ))}
              {!dokumen && a.objekLabel && <b className="log-objek-inline">{a.objekLabel}</b>}
            </span>
          </p>
          <Badge tone={j.tone}>{j.label}</Badge>
        </div>

        {dokumen && a.objekLabel && <p className="log-objek">{a.objekLabel}</p>}

        {a.perubahan && a.perubahan.length > 0 &&
          (a.jenis === "Hapus" ? (
            <div className="ringkas log-ringkas">
              <p className="lbl">Isi dokumen saat dihapus</p>
              {a.perubahan.map((p) => (
                <div key={p.kolom}><span>{p.kolom}</span><b>{p.dari}</b></div>
              ))}
            </div>
          ) : (
            <div className="log-ubah-wrap">
              <table className="log-ubah">
                <thead>
                  <tr><th>Kolom</th><th>Sebelum</th><th>Sesudah</th></tr>
                </thead>
                <tbody>
                  {a.perubahan.map((p) => (
                    <tr key={p.kolom}>
                      <td>{p.kolom}</td>
                      <td><del>{p.dari}</del></td>
                      <td><ins>{p.ke}</ins></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}

        {a.catatan && (
          <p className="log-catatan">
            <Icon name="info" />
            <span>{a.catatan}</span>
          </p>
        )}
      </div>
    </li>
  );
}
