"use client";

import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import GrafikTargetRealisasi, { type JenisGrafik } from "@/components/charts/GrafikTargetRealisasi";
import Icon, { type IconName } from "@/components/Icon";
import { useStore } from "@/components/StoreProvider";
import UnggahFaDetail from "@/components/UnggahFaDetail";
import { BadgeDana, EmptyRow, PageHead, Paginasi, Saring, SearchBox, useHalaman } from "@/components/ui";
import {
  BULAN_12,
  BULAN_BERJALAN,
  FILTER_DANA,
  JENIS_BELANJA,
  KARTU_TARGET,
  KODE_DIPA,
  NAMA_BULAN,
  PAGU_JENIS,
  REALISASI_BULANAN,
  RINGKASAN_DANA,
  TAHUN_BERJALAN,
  TAHUN_BULANAN,
  jumlah,
  seriBulananTahun,
  seriTahunan,
  jenisBelanjaDariAkun,
  hitungKartuTarget,
  type Dana,
  type FilterDana,
  type JenisBelanja,
  JENIS_DOKUMEN,
  type KartuTarget,
} from "@/lib/data";
import type { JenisDokumen } from "@/lib/types";
import { JUMLAH_KOLOM_KEGIATAN, KepalaKegiatan, SelKegiatan } from "@/components/KolomKegiatan";
import { desimal, rupiah, rupiahSingkat, tanggal, tanggalJam } from "@/lib/format";
import type { BarisPok } from "@/lib/mak";

const LABEL_FILTER: Record<FilterDana, string> = { Gabung: "RM + BLU", RM: "Rupiah Murni", BLU: "PNBP BLU" };

function danaDari(filter: FilterDana): Dana[] {
  return filter === "Gabung" ? ["RM", "BLU"] : [filter];
}

function sapaan(jam: number) {
  if (jam < 11) return "Selamat pagi";
  if (jam < 15) return "Selamat siang";
  if (jam < 18) return "Selamat sore";
  return "Selamat malam";
}

/** Pagu & realisasi per jenis belanja untuk filter terpilih */
function hitungJenis(filter: FilterDana) {
  const sumber = danaDari(filter);
  return JENIS_BELANJA.map((j) => {
    const pagu = jumlah(sumber.map((d) => PAGU_JENIS[d][j.kode as JenisBelanja].pagu));
    const realisasi = jumlah(sumber.map((d) => PAGU_JENIS[d][j.kode as JenisBelanja].realisasi));
    return { ...j, pagu, realisasi, sisa: pagu - realisasi };
  });
}

/* =========================================================
   Kartu sumber dana (BLU / RM)
   ========================================================= */
function Tile({
  label,
  icon,
  value,
  delta,
  deltaTone = "up",
  note,
  variant,
}: {
  label: string;
  icon: IconName;
  value: ReactNode;
  delta?: string;
  deltaTone?: "up" | "down" | "plain";
  note: string;
  variant?: "hot" | "ink";
}) {
  return (
    <div className={`tile ${variant ?? ""}`}>
      <div className="tt">
        {label}
        <span className="ic"><Icon name={icon} /></span>
      </div>
      <div>
        <div className="v num">{value}</div>
        {delta && <span className={`delta ${deltaTone}`}>{delta}</span>} <span className="note">{note}</span>
      </div>
    </div>
  );
}

function KartuDana({
  dana,
  pengesahan,
  catatanPengesahan,
  catatanPencairan,
}: {
  dana: Dana;
  pengesahan: number;
  catatanPengesahan: string;
  catatanPencairan: string;
}) {
  const info = RINGKASAN_DANA[dana];
  const pagu = jumlah(JENIS_BELANJA.map((j) => PAGU_JENIS[dana][j.kode].pagu));
  const total = jumlah(REALISASI_BULANAN[dana]);
  const pencairan = Math.max(0, total - pengesahan);
  const berjalan = info.kegiatan - info.kegiatanSelesai;

  return (
    <section className="dcard" aria-label={`Ringkasan belanja ${dana}`}>
      <div className="dhead">
        <div>
          <h3>Belanja {dana}</h3>
          <p className="sub">{info.nama} · pagu {rupiahSingkat(pagu)}</p>
        </div>
        <BadgeDana dana={dana} />
      </div>
      <div className="tiles">
        <Tile
          variant={dana === "BLU" ? "hot" : "ink"}
          label="Total Belanja"
          icon="trend"
          value={rupiahSingkat(total)}
          delta={`${desimal((total / pagu) * 100)}%`}
          note="dari pagu"
        />
        <Tile label="Nilai Pengesahan" icon="stamp" value={rupiahSingkat(pengesahan)} delta={`${desimal((pengesahan / total) * 100)}%`} deltaTone="plain" note={catatanPengesahan} />
        <Tile label="Nilai Pencairan" icon="wallet" value={rupiahSingkat(pencairan)} delta={`${desimal((pencairan / total) * 100)}%`} deltaTone="plain" note={catatanPencairan} />
        <Tile
          label="Total Kegiatan"
          icon="grid"
          value={
            <>
              {info.kegiatan} <small>kegiatan</small>
            </>
          }
          delta={`${info.kegiatanSelesai} selesai`}
          note={`${berjalan} berjalan`}
        />
      </div>
    </section>
  );
}

/* =========================================================
   Panel grafik Target vs Realisasi
   ========================================================= */
type Periode = "bulanan" | "tahunan";
type Nada = "good" | "warn" | "bad";

function PanelGrafik({ filter }: { filter: FilterDana }) {
  const [periode, setPeriode] = useState<Periode>("bulanan");
  const [tahun, setTahun] = useState(TAHUN_BERJALAN);
  const [jenis, setJenis] = useState<JenisGrafik>("batang");

  const data = useMemo(() => {
    if (periode === "bulanan") {
      const s = seriBulananTahun(tahun, filter);
      return {
        labels: BULAN_12,
        labelPanjang: NAMA_BULAN.map((b) => `${b} ${tahun}`),
        target: s.target,
        realisasi: s.realisasi,
        pagu: s.pagu,
        sorot: tahun === TAHUN_BERJALAN ? BULAN_BERJALAN - 1 : undefined,
        bulanTutup: s.bulanTutup,
      };
    }
    const rows = seriTahunan(filter);
    const iJalan = rows.findIndex((r) => r.tahun === TAHUN_BERJALAN);
    return {
      labels: rows.map((r) => String(r.tahun)),
      labelPanjang: rows.map((r) => `TA ${r.tahun}`),
      target: rows.map((r) => r.target),
      realisasi: rows.map((r) => r.realisasi as number | null),
      pagu: 0,
      sorot: iJalan >= 0 ? iJalan : undefined,
      bulanTutup: 0,
    };
  }, [periode, tahun, filter]);

  // ---------- ringkasan di atas grafik ----------
  let ringkasan: { label: string; nilai: string; sub: string; nada?: Nada }[];
  if (periode === "bulanan") {
    const nR = data.realisasi.filter((r) => r !== null).length;
    const tgt = jumlah(data.target.slice(0, nR));
    const real = jumlah(data.realisasi.slice(0, nR).map((r) => r ?? 0));
    const tutup = Math.min(nR, data.bulanTutup);
    const dev = tutup
      ? (jumlah(data.realisasi.slice(0, tutup).map((r, i) => Math.abs((r ?? 0) - data.target[i]) / data.target[i])) / tutup) * 100
      : null;
    const sd = nR ? `${BULAN_12[nR - 1]} ${tahun}` : String(tahun);
    const capaian = tgt ? (real / tgt) * 100 : 0;
    const selisih = real - tgt;
    ringkasan = [
      { label: `Target s.d. ${sd}`, nilai: rupiah(tgt), sub: `pagu TA ${tahun} ${rupiah(data.pagu)}` },
      { label: `Realisasi s.d. ${sd}`, nilai: rupiah(real), sub: `capaian ${desimal(capaian)}% dari target`, nada: capaian >= 95 ? "good" : capaian >= 85 ? "warn" : "bad" },
      {
        label: tutup ? `Deviasi Hal. III DIPA · rata-rata ${tutup} bln` : "Deviasi Hal. III DIPA",
        nilai: dev === null ? "—" : `${desimal(dev, 2)}%`,
        sub: tutup ? `batas 5% · selisih ${selisih < 0 ? "−" : "+"}${rupiah(Math.abs(selisih))}` : "belum ada bulan tutup buku",
        nada: dev === null ? undefined : dev <= 5 ? "good" : dev <= 10 ? "warn" : "bad",
      },
    ];
  } else {
    const rows = data.labels.map((l, i) => ({ tahun: l, t: data.target[i], r: data.realisasi[i] ?? 0 }));
    const tutup = rows.filter((_, i) => i !== data.sorot);
    const serapan = tutup.map((x) => (x.r / x.t) * 100);
    const rata = jumlah(serapan) / serapan.length;
    const iMax = serapan.indexOf(Math.max(...serapan));
    const jalan = data.sorot !== undefined ? rows[data.sorot] : undefined;
    const nada = (v: number): Nada => (v >= 95 ? "good" : v >= 90 ? "warn" : "bad");
    ringkasan = [
      { label: `Rata-rata serapan ${tutup[0].tahun}–${tutup[tutup.length - 1].tahun}`, nilai: `${desimal(rata)}%`, sub: `${tutup.length} tahun anggaran · target 95%`, nada: nada(rata) },
      { label: "Serapan tertinggi", nilai: `${desimal(serapan[iMax])}%`, sub: `TA ${tutup[iMax].tahun} · ${rupiah(tutup[iMax].r)}`, nada: nada(serapan[iMax]) },
      {
        label: `Serapan TA ${TAHUN_BERJALAN} (berjalan)`,
        nilai: jalan ? `${desimal((jalan.r / jalan.t) * 100)}%` : "—",
        sub: `s.d. ${NAMA_BULAN[BULAN_BERJALAN - 1]} · ${rupiah(jalan?.r ?? 0)}`,
      },
    ];
  }

  const kurvaS = periode === "bulanan" && jenis === "garis";
  const rentang = `${data.labels[0]}–${data.labels[data.labels.length - 1]}`;
  const sub =
    periode === "bulanan"
      ? kurvaS
        ? `Kurva S · progres kumulatif terhadap pagu · TA ${tahun} · ${LABEL_FILTER[filter]}`
        : `Per bulan · TA ${tahun} · ${LABEL_FILTER[filter]}`
      : jenis === "batang"
        ? `Per tahun anggaran ${rentang} · ${LABEL_FILTER[filter]}`
        : `Tren tahunan ${rentang} · ${LABEL_FILTER[filter]}`;

  return (
    <section className="panel c-chart span2">
      <div className="ph chart-head">
        <div>
          <h3>Target vs Realisasi</h3>
          <p className="sub">{sub}</p>
        </div>
        <div className="chart-ctrl">
          <div className="seg seg-sm" role="group" aria-label="Periode">
            {(["bulanan", "tahunan"] as Periode[]).map((p) => (
              <button key={p} type="button" className={p === periode ? "on" : ""} aria-pressed={p === periode} onClick={() => setPeriode(p)}>
                {p === "bulanan" ? "Bulanan" : "Tahunan"}
              </button>
            ))}
          </div>

          {periode === "bulanan" && (
            <label className="sel">
              <span className="sr">Tahun anggaran</span>
              <select value={tahun} onChange={(e) => setTahun(Number(e.target.value))}>
                {TAHUN_BULANAN.map((t) => (
                  <option key={t} value={t}>TA {t}</option>
                ))}
              </select>
            </label>
          )}

          <div className="seg seg-sm seg-ic" role="group" aria-label="Jenis grafik">
            <button type="button" className={jenis === "batang" ? "on" : ""} aria-pressed={jenis === "batang"} onClick={() => setJenis("batang")}>
              <Icon name="bars" />
              Batang
            </button>
            <button type="button" className={jenis === "garis" ? "on" : ""} aria-pressed={jenis === "garis"} onClick={() => setJenis("garis")}>
              <Icon name="curve" />
              {periode === "bulanan" ? "Kurva S" : "Garis"}
            </button>
          </div>
        </div>
      </div>

      <div className="chart-stats">
        {ringkasan.map((r) => (
          <div key={r.label}>
            <span>{r.label}</span>
            <b className={`num ${r.nada ?? ""}`}>{r.nilai}</b>
            <small>{r.sub}</small>
          </div>
        ))}
      </div>

      <div className="chart-box">
        <GrafikTargetRealisasi
          key={`${periode}-${jenis}`}
          labels={data.labels}
          labelPanjang={data.labelPanjang}
          target={data.target}
          realisasi={data.realisasi}
          jenis={jenis}
          kumulatif={kurvaS}
          pagu={data.pagu}
          sorot={data.sorot}
          ariaLabel={`Grafik target dan realisasi belanja, ${sub}`}
        />
      </div>

      <div className="chart-foot">
        <div className="legend">
          <span><i style={{ background: "var(--accent)" }} />Target</span>
          <span><i style={{ background: "var(--ink)" }} />Realisasi</span>
          {kurvaS && <span><i style={{ background: "var(--accent)", opacity: 0.3 }} />Deviasi</span>}
        </div>
        {data.sorot !== undefined && (
          <p className="note">
            Kolom abu-abu: periode berjalan (belum tutup buku), tidak dihitung dalam deviasi.
            {jenis === "batang" && " Angka di atas batang: deviasi terhadap target."}
          </p>
        )}
      </div>
    </section>
  );
}

/* =========================================================
   Tabel Kegiatan Belanja
   ========================================================= */
type FilterDok = "Semua" | JenisDokumen;
type FilterSumber = "Semua" | Dana;
type FilterJenisBelanja = "Semua" | JenisBelanja;

const NAMA_JENIS_BELANJA: Record<JenisBelanja, string> = {
  Pegawai: "Belanja Pegawai",
  Barang: "Belanja Barang",
  Modal: "Belanja Modal",
};

function TabelKegiatan({ judul }: { judul: ReactNode }) {
  const { kegiatan: semuaKegiatan, boleh, penggunaAktif, namaUnit } = useStore();
  // Operator Unit hanya melihat kegiatan unitnya sendiri
  const semuaUnit = boleh("belanja.lihatSemua");
  const kegiatan = useMemo(
    () => (semuaUnit ? semuaKegiatan : semuaKegiatan.filter((k) => k.unit === penggunaAktif.unit)),
    [semuaKegiatan, semuaUnit, penggunaAktif.unit],
  );
  const [sumber, setSumber] = useState<FilterSumber>("Semua");
  const [jenisBel, setJenisBel] = useState<FilterJenisBelanja>("Semua");
  const [dok, setDok] = useState<FilterDok>("Semua");
  const [cari, setCari] = useState("");
  const adaFilter = sumber !== "Semua" || jenisBel !== "Semua" || dok !== "Semua" || cari !== "";

  const baris = useMemo(() => {
    const q = cari.toLowerCase();
    return kegiatan.filter(
      (k) =>
        (sumber === "Semua" || k.dana === sumber) &&
        (jenisBel === "Semua" || jenisBelanjaDariAkun(k.akun) === jenisBel) &&
        (dok === "Semua" || k.jenisDokumen === dok) &&
        [k.uraian, k.noDokumen, k.penyedia, k.akun, k.mak].join(" ").toLowerCase().includes(q),
    );
  }, [kegiatan, sumber, jenisBel, dok, cari]);
  const total = jumlah(baris.map((k) => k.nilai));
  // 30 kegiatan per halaman; setiap filter berubah kembali ke halaman 1
  const hal = useHalaman(baris);
  const saring =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      hal.awal();
    };
  const reset = () => {
    setSumber("Semua");
    setJenisBel("Semua");
    setDok("Semua");
    setCari("");
    hal.awal();
  };

  return (
    <section className="panel span3 ada-paginasi" ref={hal.ref}>
      <div className="ph">
        <div>
          {judul}
          <p className="sub">
            {jml(baris.length)} kegiatan{semuaUnit ? "" : ` · ${namaUnit(penggunaAktif.unit)}`} · total {rupiah(total)}
            {sumber !== "Semua" && ` · ${sumber}`}
            {jenisBel !== "Semua" && ` · ${NAMA_JENIS_BELANJA[jenisBel]}`}
            {dok !== "Semua" && ` · ${dok}`}
          </p>
        </div>
        <div className="tbar filter-kegiatan">
          <Saring<FilterSumber>
            label="Sumber dana"
            value={sumber}
            onChange={saring(setSumber)}
            opsi={[
              { value: "Semua", label: "Semua dana" },
              { value: "RM", label: "RM" },
              { value: "BLU", label: "BLU" },
            ]}
          />
          <Saring<FilterJenisBelanja>
            label="Jenis belanja"
            value={jenisBel}
            onChange={saring(setJenisBel)}
            opsi={[
              { value: "Semua", label: "Semua belanja" },
              { value: "Pegawai", label: "Pegawai (51)" },
              { value: "Barang", label: "Barang (52)" },
              { value: "Modal", label: "Modal (53)" },
            ]}
          />
          <Saring<FilterDok>
            label="Jenis dokumen"
            value={dok}
            onChange={saring(setDok)}
            opsi={[{ value: "Semua", label: "Semua dokumen" }, ...JENIS_DOKUMEN.map((j) => ({ value: j.value, label: j.value }))]}
          />
          <SearchBox id="kegiatan-cari" value={cari} onChange={saring(setCari)} placeholder="Cari kegiatan atau penyedia" />
          {adaFilter && (
            <button type="button" className="btn soft sm" onClick={reset}>
              <Icon name="close" />
              Reset
            </button>
          )}
        </div>
      </div>
      <div className="tw stack">
        <table className="tabel-kegiatan">
          <thead>
            <tr>
              <KepalaKegiatan />
            </tr>
          </thead>
          <tbody>
            {baris.length === 0 ? (
              <EmptyRow cols={JUMLAH_KOLOM_KEGIATAN}>Tidak ada kegiatan yang cocok.</EmptyRow>
            ) : (
              hal.tampil.map((k) => (
                <tr key={k.id}>
                  <SelKegiatan k={k} />
                </tr>
              ))
            )}
          </tbody>
          {baris.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={JUMLAH_KOLOM_KEGIATAN - 1}>
                  Total {jml(baris.length)} kegiatan
                  {hal.jumlahHalaman > 1 && <span className="note"> (semua halaman)</span>}
                </td>
                <td className="r num">{rupiah(total)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <Paginasi
        halaman={hal.halaman}
        jumlahHalaman={hal.jumlahHalaman}
        total={baris.length}
        ukuran={hal.ukuran}
        satuan="kegiatan"
        onPindah={hal.pindah}
      />
    </section>
  );
}

/* =========================================================
   Tabel Kertas Kerja POK (dari FA Detail SAKTI)
   ========================================================= */
/** Kode MAK yang hanya terpotong di titik pemisah bila kolom sempit (HP) */
function KodeMak({ kode }: { kode: string }) {
  return (
    <span className="kode">
      {kode.split(".").map((seg, i, arr) => (
        <Fragment key={i}>
          {seg}
          {i < arr.length - 1 && (
            <>
              .<wbr />
            </>
          )}
        </Fragment>
      ))}
    </span>
  );
}

/** % serapan dibulatkan ke bawah (2 desimal) agar 100% hanya tampil bila realisasi = pagu */
const persenSerapan = (realisasi: number, pagu: number) =>
  pagu > 0 ? `${desimal(Math.floor((realisasi / pagu) * 10000 + 1e-9) / 100, 2)}%` : "–";
/** jumlah baris dengan pemisah ribuan: 1.159 */
const jml = (n: number) => desimal(n, 0);

function BarisTabelPok({ b }: { b: BarisPok }) {
  const m = b.mak;
  return (
    <tr>
      <td className="main">
        <div className="pok-uraian">
          <b>{b.uraian}</b>
          <small>{b.konteks}</small>
        </div>
      </td>
      <td className="mono kode-mak" data-label="Kode MAK" title={`${m.ro.uraian} › ${m.komponen.uraian} › ${m.subKomponen.uraian}`}>
        <KodeMak kode={m.kode} />
      </td>
      <td className="akun-pok" data-label="Akun" title={m.akunUraian}>
        <div className="akun-isi">
          <span className="mono">{m.akun}</span>
          <span className="note akun-ur">{m.akunUraian}</span>
        </div>
      </td>
      <td
        className="dana-pok"
        data-label="Sumber Dana"
        title={m.dana === "BLU" ? `BLU — akun ${m.akun.slice(0, 3)}xxx adalah belanja BLU` : `RM — akun ${m.akun} bukan 525xxx/537xxx`}
      >
        <BadgeDana dana={m.dana} />
      </td>
      <td className="r num" data-label="Pagu">
        {rupiah(b.pagu)}
      </td>
      <td className="r num" data-label="Realisasi">
        {rupiah(b.realisasi)}
        <small className="pct">{persenSerapan(b.realisasi, b.pagu)}</small>
      </td>
      <td className={`r num sisa-pok ${b.sisa < 0 ? "minus" : b.sisa === 0 ? "nol" : ""}`} data-label="Sisa Anggaran">
        <b>{rupiah(b.sisa)}</b>
        {b.lock > 0 && <small>lock {rupiah(b.lock)}</small>}
      </td>
    </tr>
  );
}

function TabelPok({ judul }: { judul: ReactNode }) {
  const { barisPok, dataPok, boleh } = useStore();
  const bisaUnggah = boleh("pok.unggah");
  const [sumber, setSumber] = useState<FilterSumber>("Semua");
  const [jenisBel, setJenisBel] = useState<FilterJenisBelanja>("Semua");
  const [cari, setCari] = useState("");
  const [unggah, setUnggah] = useState(false);
  const adaFilter = sumber !== "Semua" || jenisBel !== "Semua" || cari !== "";

  // Teks pencarian per baris: uraian item, sub komponen, kode MAK (termasuk akun), nama akun, komponen, RO, kegiatan
  const indeks = useMemo(
    () =>
      barisPok.map((b) =>
        [b.uraian, b.konteks, b.mak.kode, b.mak.akunUraian, b.mak.komponen.uraian, b.mak.ro.uraian, b.mak.kegiatan.uraian].join(" ").toLowerCase(),
      ),
    [barisPok],
  );
  const baris = useMemo(() => {
    const kata = cari.toLowerCase().split(/\s+/).filter(Boolean);
    return barisPok.filter(
      (b, i) =>
        (sumber === "Semua" || b.mak.dana === sumber) &&
        (jenisBel === "Semua" || jenisBelanjaDariAkun(b.mak.akun) === jenisBel) &&
        kata.every((k) => indeks[i].includes(k)),
    );
  }, [barisPok, indeks, sumber, jenisBel, cari]);
  const total = useMemo(
    () =>
      baris.reduce(
        (a, b) => ({ pagu: a.pagu + b.pagu, lock: a.lock + b.lock, realisasi: a.realisasi + b.realisasi, sisa: a.sisa + b.sisa }),
        { pagu: 0, lock: 0, realisasi: 0, sisa: 0 },
      ),
    [baris],
  );
  const jumlahMak = useMemo(() => new Set(baris.map((b) => b.mak.kode)).size, [baris]);
  const adaItem = barisPok.some((b) => b.noItem);
  // 30 baris per halaman; setiap filter berubah kembali ke halaman 1
  const hal = useHalaman(baris);
  const saring =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      hal.awal();
    };
  const reset = () => {
    setSumber("Semua");
    setJenisBel("Semua");
    setCari("");
    hal.awal();
  };
  const src = dataPok.sumber;

  return (
    <section className="panel span3 ada-paginasi" ref={hal.ref}>
      <div className="ph">
        <div>
          {judul}
          <p className="sub">
            {adaItem ? `${jml(baris.length)} item · ${jml(jumlahMak)} MAK` : `${jml(jumlahMak)} MAK`}
            {src.periode && ` · ${src.periode}`}
            {sumber !== "Semua" && ` · ${sumber}`}
            {jenisBel !== "Semua" && ` · ${NAMA_JENIS_BELANJA[jenisBel]}`}
          </p>
        </div>
        <div className="tbar filter-kegiatan filter-pok">
          <Saring<FilterSumber>
            label="Sumber dana"
            value={sumber}
            onChange={saring(setSumber)}
            opsi={[
              { value: "Semua", label: "Semua dana" },
              { value: "RM", label: "RM" },
              { value: "BLU", label: "BLU" },
            ]}
          />
          <Saring<FilterJenisBelanja>
            label="Jenis belanja"
            value={jenisBel}
            onChange={saring(setJenisBel)}
            opsi={[
              { value: "Semua", label: "Semua belanja" },
              { value: "Pegawai", label: "Pegawai (51)" },
              { value: "Barang", label: "Barang (52)" },
              { value: "Modal", label: "Modal (53)" },
            ]}
          />
          {bisaUnggah && (
            <button type="button" className="btn dark sm tombol-unggah" onClick={() => setUnggah(true)}>
              <Icon name="upload" />
              Upload FA Detail
            </button>
          )}
          <SearchBox id="pok-cari" value={cari} onChange={saring(setCari)} placeholder="Cari uraian, MAK, atau akun" />
          {adaFilter && (
            <button type="button" className="btn soft sm" onClick={reset}>
              <Icon name="close" />
              Reset
            </button>
          )}
        </div>
      </div>

      <p className="info-pok" title={src.file}>
        <Icon name="file" />
        <span>
          FA Detail SAKTI{src.periode && <> periode <b>{src.periode}</b></>} ·{" "}
          {src.diunggah ? (
            <>
              diunggah{src.oleh && <> oleh <b>{src.oleh}</b></>}, {tanggalJam(src.diunggah)}
            </>
          ) : (
            "data bawaan aplikasi"
          )}{" "}
          · sumber dana ditentukan dari kode akun (525xxx & 537xxx = BLU, lainnya RM)
        </span>
      </p>

      <div className="chart-stats pok-stats" aria-label="Total sesuai filter">
        <div>
          <span>Pagu</span>
          <b className="num">{rupiah(total.pagu)}</b>
          <small>{total.lock > 0 ? `lock pagu ${rupiah(total.lock)}` : "tanpa lock pagu"}</small>
        </div>
        <div>
          <span>Realisasi</span>
          <b className="num">{rupiah(total.realisasi)}</b>
          <small>{persenSerapan(total.realisasi, total.pagu)} dari pagu</small>
        </div>
        <div>
          <span>Sisa anggaran</span>
          <b className="num good">{rupiah(total.sisa)}</b>
          <small>pagu − lock − realisasi</small>
        </div>
      </div>

      <div className="tw stack">
        <table className="tabel-pok">
          <thead>
            <tr>
              <th>Uraian Kegiatan</th>
              <th>Kode MAK</th>
              <th>Akun</th>
              <th>Sumber Dana</th>
              <th className="r">Pagu</th>
              <th className="r">Realisasi</th>
              <th className="r">Sisa Anggaran</th>
            </tr>
          </thead>
          <tbody>
            {hal.tampil.length === 0 ? (
              <EmptyRow cols={7}>Tidak ada baris Kertas Kerja POK yang cocok.</EmptyRow>
            ) : (
              hal.tampil.map((b) => <BarisTabelPok key={b.id} b={b} />)
            )}
          </tbody>
          {baris.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={4}>
                  Total {adaItem ? `${jml(baris.length)} item · ${jml(jumlahMak)} MAK` : `${jml(jumlahMak)} MAK`}
                  {hal.jumlahHalaman > 1 && <span className="note"> (semua halaman)</span>}
                </td>
                <td className="r num">{rupiah(total.pagu)}</td>
                <td className="r num">{rupiah(total.realisasi)}</td>
                <td className="r num">{rupiah(total.sisa)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <Paginasi
        halaman={hal.halaman}
        jumlahHalaman={hal.jumlahHalaman}
        total={baris.length}
        ukuran={hal.ukuran}
        satuan={adaItem ? "item" : "MAK"}
        onPindah={hal.pindah}
      />

      {unggah && <UnggahFaDetail onClose={() => setUnggah(false)} />}
    </section>
  );
}

/* =========================================================
   Panel tabel dashboard: judulnya dropdown Kegiatan Belanja ⇄ Kertas Kerja POK
   ========================================================= */
type JenisTabel = "kegiatan" | "pok";
const KUNCI_TABEL = "belanjaku-tabel-dashboard";

function PanelTabel() {
  // pilihan tabel diingat selama tab browser terbuka (kembali dari modul lain tetap di tabel yang sama)
  const [tabel, setTabel] = useState<JenisTabel>(() => {
    try {
      return sessionStorage.getItem(KUNCI_TABEL) === "pok" ? "pok" : "kegiatan";
    } catch {
      return "kegiatan";
    }
  });
  const ganti = (v: JenisTabel) => {
    setTabel(v);
    try {
      sessionStorage.setItem(KUNCI_TABEL, v);
    } catch {
      /* penyimpanan diblokir — pilihan hanya berlaku sampai halaman ditutup */
    }
  };
  const judul = (
    <h3 className="judul-tabel">
      <span className="judul-pilih">
        <select value={tabel} onChange={(e) => ganti(e.target.value as JenisTabel)} aria-label="Pilih tabel">
          <option value="kegiatan">Kegiatan Belanja</option>
          <option value="pok">Kertas Kerja POK</option>
        </select>
      </span>
    </h3>
  );
  return tabel === "pok" ? <TabelPok judul={judul} /> : <TabelKegiatan judul={judul} />;
}

/* =========================================================
   Kartu target per jenis belanja (bulan terpilih)
   ========================================================= */
const nadaCapaian = (v: number): Nada => (v >= 95 ? "good" : v >= 75 ? "warn" : "bad");

function BarisTarget({ k, bulan }: { k: KartuTarget; bulan: number }) {
  const x = hitungKartuTarget(k, bulan);
  const capaian = x.realisasiBulan === null ? null : (x.realisasiBulan / x.targetBulan) * 100;
  const capaianSd = x.targetSd ? (x.realisasiSd / x.targetSd) * 100 : 0;
  const bln = BULAN_12[bulan - 1];

  return (
    <div className="trow" role="group" aria-label={`${k.nama} ${k.dana.join(" dan ")}`}>
      <div className="trow-head">
        <b>{k.nama}</b>
        <span className={`badge ${k.dana.length > 1 ? "" : k.dana[0] === "BLU" ? "w" : "i"}`}>{k.dana.join(" + ")}</span>
        <span className={`chip ${capaian === null ? "netral" : nadaCapaian(capaian)}`}>{capaian === null ? "—" : `${desimal(capaian)}%`}</span>
      </div>
      <div className="bar-track" title={capaian === null ? "Belum ada realisasi" : `${desimal(capaian)}% dari target ${NAMA_BULAN[bulan - 1]}`}>
        <div className="bar-fill" style={{ width: `${Math.min(100, capaian ?? 0)}%` }} />
      </div>
      <dl className="trow-nilai">
        <div>
          <dt>{bln}</dt>
          <dd>
            {x.realisasiBulan === null ? <span>belum ada</span> : <b className="num">{rupiah(x.realisasiBulan)}</b>}
            <span>/</span>
            <span className="num">{rupiah(x.targetBulan)}</span>
          </dd>
        </div>
        <div>
          <dt>s.d. {bln}</dt>
          <dd>
            <span className="num">{rupiah(x.realisasiSd)}</span>
            <span>/</span>
            <span className="num">{rupiah(x.targetSd)}</span>
            <em className={nadaCapaian(capaianSd)}>{desimal(capaianSd)}%</em>
          </dd>
        </div>
      </dl>
    </div>
  );
}

/* =========================================================
   Halaman Dashboard
   ========================================================= */
export default function Dashboard() {
  const { pengesahan: riwayatSp3b, kegiatan, penggunaAktif } = useStore();
  const [salam, setSalam] = useState("Selamat datang");
  const [filter, setFilter] = useState<FilterDana>("Gabung");
  /** Filter bulan untuk kartu target — default bulan berjalan */
  const [bulan, setBulan] = useState(BULAN_BERJALAN);

  useEffect(() => setSalam(sapaan(new Date().getHours())), []);

  const jenis = useMemo(() => hitungJenis(filter), [filter]);
  const pagu = jumlah(jenis.map((j) => j.pagu));
  const realisasi = jumlah(jenis.map((j) => j.realisasi));
  const persen = (realisasi / pagu) * 100;

  // BLU: pengesahan = riwayat SP3B + kegiatan yang disahkan pada periode berjalan (modul Pengesahan)
  const disahkanBerjalan = kegiatan.filter((k) => k.dana === "BLU" && k.disahkan);
  const pengesahanBLU = jumlah(riwayatSp3b.map((s) => s.pengesahan)) + jumlah(disahkanBerjalan.map((p) => p.nilai));
  const periodeTerakhir = disahkanBerjalan.length
    ? NAMA_BULAN[BULAN_BERJALAN - 1].slice(0, 3)
    : (riwayatSp3b.find((s) => s.pengesahan > 0)?.periode.slice(0, 3) ?? "-"); // "Agustus 2026" → "Agu"

  return (
    <>
      <PageHead
        title={`${salam}, ${penggunaAktif.nama}`}
        subtitle="Pantau pagu, realisasi, pencairan, dan pengesahan belanja tahun anggaran 2026."
        actions={
          <label className="sel sel-bulan">
            <Icon name="calendar" />
            <span className="sr">Bulan untuk kartu target</span>
            <select value={bulan} onChange={(e) => setBulan(Number(e.target.value))}>
              {NAMA_BULAN.map((b, i) => (
                <option key={b} value={i + 1}>
                  {b} {TAHUN_BERJALAN}
                  {i + 1 === BULAN_BERJALAN ? " (berjalan)" : ""}
                </option>
              ))}
            </select>
          </label>
        }
      />

      <div className="dash">
        {/* ---------- Pagu + filter + jenis belanja ---------- */}
        <section className="panel c-pagu">
          <div className="ph" style={{ marginBottom: 0 }}>
            <span className="lbl">Pagu Belanja · {LABEL_FILTER[filter]}</span>
            <span className="badge">{KODE_DIPA}</span>
          </div>
          <div className="big num">{rupiah(pagu)}</div>
          <span className="delta up">↑ {desimal(persen)}%</span>{" "}
          <span className="note">terealisasi s.d. {tanggal("2026-10-18")}</span>

          <div className="seg" role="group" aria-label="Filter sumber dana">
            {FILTER_DANA.map((f) => (
              <button key={f} type="button" className={f === filter ? "on" : ""} aria-pressed={f === filter} onClick={() => setFilter(f)}>
                {f}
              </button>
            ))}
          </div>

          <div className="inner">
            <div className="lbl" style={{ fontSize: 12.5 }}>
              <b style={{ color: "var(--ink)" }}>Jenis Belanja</b> &nbsp;|&nbsp; {LABEL_FILTER[filter]}
            </div>
            <div className="jenis-grid">
              {jenis.map((j) => {
                const p = j.pagu ? (j.realisasi / j.pagu) * 100 : 0;
                return (
                  <div className="jenis" key={j.kode}>
                    <div className="t">
                      <span className="sw" style={{ background: j.warna }} />
                      <span title={j.nama}>{j.kode}</span>
                      <span className="pct">{desimal(p)}%</span>
                    </div>
                    <div className="mini-track" title={`${desimal(p)}% terealisasi`}>
                      <i style={{ width: `${Math.min(100, p)}%`, background: j.warna }} />
                    </div>
                    <dl>
                      <div><dt>Pagu</dt><dd>{rupiah(j.pagu)}</dd></div>
                      <div><dt>Realisasi</dt><dd>{rupiah(j.realisasi)}</dd></div>
                      <div><dt>Sisa</dt><dd className="sisa">{rupiah(j.sisa)}</dd></div>
                    </dl>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ---------- Kartu BLU & RM ---------- */}
        <KartuDana
          dana="BLU"
          pengesahan={pengesahanBLU}
          catatanPengesahan={`SP3B s.d. ${periodeTerakhir}`}
          catatanPencairan="belum disahkan"
        />
        <KartuDana
          dana="RM"
          pengesahan={RINGKASAN_DANA.RM.pengesahanRM ?? 0}
          catatanPengesahan="SPM GU Nihil"
          catatanPencairan="SP2D LS/UP/GU"
        />

        {/* ---------- Grafik target vs realisasi ---------- */}
        <PanelGrafik filter={filter} />

        {/* ---------- Target per jenis belanja (ikut filter bulan di atas) ---------- */}
        <section className="panel c-side" aria-label="Target per jenis belanja">
          <div className="ph target-head">
            <div>
              <h3>Target per Jenis Belanja</h3>
              <p className="sub">
                {NAMA_BULAN[bulan - 1]} {TAHUN_BERJALAN}
                {bulan === BULAN_BERJALAN ? " (berjalan)" : ""} · realisasi / target
              </p>
            </div>
          </div>
          <div className="target-list">
            {KARTU_TARGET.map((k) => (
              <BarisTarget key={k.kode} k={k} bulan={bulan} />
            ))}
          </div>
        </section>

        {/* ---------- Tabel Kegiatan Belanja / Kertas Kerja POK ---------- */}
        <PanelTabel />
      </div>
    </>
  );
}
