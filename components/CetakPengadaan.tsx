"use client";

/**
 * Pratinjau & cetak dokumen pengadaan (kertas A4) dengan format yang sama dengan berkas Excel
 * NODIN_KWITANSI.xlsx — urutan sheet:
 *   Nota Dinas · HPS · Surat Pesanan · Nota Pembelian · Kwitansi · Lampiran Kwitansi · BAP · Lampiran BAP · BAST · Lampiran BAST
 * Kop surat & logo kaki halaman: lib/gambarDokumen.ts (data URI, ikut tertanam di kode). Setelah kwitansi terbit,
 * data penyedia & pejabat diambil dari arsip paket (salinan saat kwitansi terbit) agar cetakan ulang tetap sama
 * walau referensi diubah. Setiap kali tombol Cetak ditekan, aksinya dicatat di Riwayat Aktivitas.
 *
 * Cetak tanpa tanggal/judul/URL dari browser: halaman pertama diberi margin atas & bawah 0 (@page :first) dan
 * jaraknya diganti padding pada lembar pertama (globals.css). Chrome hanya menambahkan header & footer bila
 * halaman pertama punya ruang margin untuknya, jadi header & footer browser tidak tercetak di semua halaman.
 */
import { Fragment, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Icon from "./Icon";
import { useStore } from "./StoreProvider";
import {
  DOKUMEN,
  angka,
  barisSpesifikasi,
  dataPejabat,
  dataPenyedia,
  hariTanggalKata,
  kurangPejabat,
  kurangPenyedia,
  nipCetak,
  tanggalSk,
  tanggalSurat,
  terbilangRupiah,
  totalBeli,
  totalHps,
  type KodeDokumen,
  type Total,
} from "@/lib/pengadaan";
import type { DataPejabat, DataPenyedia, ItemPaket, Paket } from "@/lib/types";
import { KOP_PIP, LOGO_KAN, LOGO_SGS_21001, LOGO_SGS_9001 } from "@/lib/gambarDokumen";

/** Lebar kertas A4 dalam piksel CSS (210 mm) — untuk mengecilkan pratinjau di layar sempit */
const LEBAR_A4 = 794;
const INSTANSI = "Politeknik Ilmu Pelayaran Makassar";
const KOSONG = "…………………………";

/**
 * Chrome, Edge, dan browser Chromium lain hanya menambahkan header & footer browser (tanggal, judul, URL) bila halaman
 * pertama punya margin atas/bawah — pengaturan itu dipakai untuk semua halaman. Browser lain tetap memakai margin biasa.
 */
function browserChromium(): boolean {
  if (typeof navigator === "undefined") return false;
  const nav = navigator as Navigator & { userAgentData?: { brands?: { brand: string }[] } };
  if (nav.userAgentData?.brands?.length) return nav.userAgentData.brands.some((b) => b.brand === "Chromium");
  return /\b(Chrome|Chromium|Edg)\//.test(navigator.userAgent);
}

interface Data {
  p: Paket;
  ppk: DataPejabat;
  pp: DataPejabat;
  penyedia: DataPenyedia;
}

export default function CetakPengadaan({ p, awal, onClose }: { p: Paket; awal: KodeDokumen[]; onClose: () => void }) {
  const { pengguna, referensi, catatCetakPaket } = useStore();
  const tersedia = DOKUMEN.filter((d) => d.tahap <= p.tahap);
  const [pilih, setPilih] = useState<KodeDokumen[]>(() => {
    const ok = awal.filter((k) => tersedia.some((d) => d.kode === k));
    return ok.length ? ok : tersedia.map((d) => d.kode);
  });
  const [siap, setSiap] = useState(false);
  const [skala, setSkala] = useState(1);
  const [chromium] = useState(browserChromium);
  const isiRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSiap(true);
    document.body.classList.add("ada-cetak");
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.classList.remove("ada-cetak");
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  // Pratinjau diperkecil agar satu halaman A4 muat di layar HP / jendela sempit
  useLayoutEffect(() => {
    const el = isiRef.current;
    if (!el) return;
    const ukur = () => setSkala(Math.min(1, (el.clientWidth - 24) / LEBAR_A4));
    ukur();
    const ro = new ResizeObserver(ukur);
    ro.observe(el);
    return () => ro.disconnect();
  }, [siap]);

  if (!siap) return null;

  // Data cetak: arsip saat kwitansi terbit, atau data terkini
  const d: Data = {
    p,
    ppk: p.arsip?.ppk ?? dataPejabat(pengguna.find((u) => u.id === p.ppkId)) ?? { nama: KOSONG },
    pp: p.arsip?.pp ?? (p.tahap >= 2 ? dataPejabat(pengguna.find((u) => u.id === p.ppId)) : undefined) ?? { nama: KOSONG },
    penyedia: p.arsip?.penyedia ??
      dataPenyedia(referensi.penyedia.find((x) => x.id === p.penyediaId)) ?? { nama: KOSONG, pimpinan: "", jabatan: "", alamat: "", kota: "", npwp: "", bank: "", rekening: "" },
  };
  const dicetak = DOKUMEN.filter((x) => pilih.includes(x.kode));
  const pakaiPp = pilih.some((k) => k === "sp" || k === "nota");
  const pakaiPenyedia = pilih.some((k) => k !== "nd" && k !== "hps");
  const catatan = [
    kurangPejabat(d.ppk, pilih.includes("bap")).length > 0 && `PPK belum mengisi ${kurangPejabat(d.ppk, pilih.includes("bap")).join(", ")}`,
    pakaiPp && kurangPejabat(d.pp, false).length > 0 && `Pejabat Pengadaan belum mengisi ${kurangPejabat(d.pp, false).join(", ")}`,
    pakaiPenyedia && p.tahap >= 2 && kurangPenyedia(d.penyedia).length > 0 && `data penyedia belum lengkap (${kurangPenyedia(d.penyedia).join(", ")})`,
  ].filter(Boolean) as string[];

  const ganti = (k: KodeDokumen) => setPilih((xs) => (xs.includes(k) ? xs.filter((x) => x !== k) : [...xs, k]));
  const cetak = async () => {
    if (!dicetak.length) return;
    catatCetakPaket(p, dicetak.map((x) => x.nama));
    // pastikan kop & logo sudah siap digambar sebelum jendela cetak dibuka
    const belum = Array.from(isiRef.current?.querySelectorAll("img") ?? []).filter((g) => !g.complete);
    if (belum.length) await Promise.all(belum.map((g) => g.decode().catch(() => undefined)));
    window.print();
  };

  return createPortal(
    <div
      className={`pratinjau pratinjau-dok${chromium ? " tanpa-header-browser" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label={`Pratinjau dokumen ${p.id}`}
    >
      {/* margin halaman cetak = margin kertas dokumen (lihat .dok-hal di globals.css). Di Chrome/Edge halaman pertama
          tanpa margin atas & bawah (diganti padding lembar pertama) agar browser tidak mencetak tanggal, judul, dan URL. */}
      <style>{`@page { size: A4; margin: 12mm 15mm 12mm 18mm; }${chromium ? " @page :first { margin-top: 0; margin-bottom: 0; }" : ""}`}</style>
      <div className="pratinjau-bar">
        <div>
          <b>Dokumen pengadaan</b>
          <span>
            {p.id} · {dicetak.length} dokumen · kertas A4
          </span>
        </div>
        <div className="tbar">
          <button type="button" className="btn soft sm" onClick={onClose}>
            Tutup
          </button>
          <button type="button" className="btn acc sm" onClick={cetak} disabled={!dicetak.length}>
            <Icon name="print" />
            Cetak
          </button>
        </div>
        <div className="pilih-dok" role="group" aria-label="Dokumen yang dicetak">
          {tersedia.map((x) => (
            <button key={x.kode} type="button" className={`chip-dok ${pilih.includes(x.kode) ? "on" : ""}`} aria-pressed={pilih.includes(x.kode)} onClick={() => ganti(x.kode)}>
              {pilih.includes(x.kode) && <Icon name="check" />}
              {x.nama}
            </button>
          ))}
          <button type="button" className="chip-dok semua" onClick={() => setPilih(pilih.length === tersedia.length ? [] : tersedia.map((x) => x.kode))}>
            {pilih.length === tersedia.length ? "Kosongkan" : "Pilih semua"}
          </button>
        </div>
        {catatan.length > 0 && (
          <p className="pratinjau-catatan">
            <Icon name="info" />
            <span>
              {catatan.join(" · ")}. Bagian itu tercetak titik-titik.
            </span>
          </p>
        )}
      </div>

      <div className="pratinjau-isi" ref={isiRef} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
        {dicetak.length === 0 ? (
          <p className="pratinjau-kosong">Pilih dokumen yang akan dicetak.</p>
        ) : (
          <div className="dok-tumpuk" style={{ zoom: skala }}>
            {dicetak.map((x) => (
              <Fragment key={x.kode}>{HALAMAN[x.kode](d)}</Fragment>
            ))}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

/* =====================================================================
   Bagian bersama
   ===================================================================== */
function Kop() {
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="dok-kop" src={KOP_PIP} alt="Kop surat Politeknik Ilmu Pelayaran Makassar" />;
}

function Kaki() {
  return (
    <div className="dok-kaki">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="kaki-kan" src={LOGO_KAN} alt="Komite Akreditasi Nasional" />
      {/* motto selebar aslinya (11,9 cm) apa pun hurufnya: textLength memaksa lebar teks */}
      <svg className="kaki-moto" viewBox="0 0 1185 92" role="img" aria-label="Commited to the excellence of seafarer competence">
        <text x="0" y="70" textLength="1185" lengthAdjust="spacingAndGlyphs">
          <tspan fontWeight={700}>“</tspan>Commited to the excellence of seafarer competence”
        </text>
      </svg>
      <span className="kaki-sgs">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={LOGO_SGS_9001} alt="SGS ISO 9001" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={LOGO_SGS_21001} alt="SGS ISO 21001" />
      </span>
    </div>
  );
}

/** Blok tanda tangan: baris jabatan, ruang tanda tangan, nama bergaris bawah, baris keterangan */
function Ttd({ atas, nama, bawah = [] }: { atas: ReactNode[]; nama: string; bawah?: (string | undefined)[] }) {
  return (
    <div className="ttd-blok">
      {atas.map((t, i) => (
        <p key={i}>{t || "\u00a0"}</p>
      ))}
      <div className="ttd-ruang" />
      <p className="ttd-nama">{nama || KOSONG}</p>
      {bawah.map((t, i) => (
        <p key={i}>{t || "\u00a0"}</p>
      ))}
    </div>
  );
}

const bawahPejabat = (x: DataPejabat) => [x.pangkat, `NIP. ${nipCetak(x.nip)}`];
const bawahPenyedia = (x: DataPenyedia) => [x.jabatan || "Direktur"];

/** Dua blok tanda tangan berdampingan; baris jabatan kiri & kanan disamakan jumlahnya agar nama sejajar */
function TtdDua({ kiri, kanan }: { kiri: Parameters<typeof Ttd>[0]; kanan: Parameters<typeof Ttd>[0] }) {
  const n = Math.max(kiri.atas.length, kanan.atas.length);
  const isi = (a: ReactNode[]) => [...a, ...Array(n - a.length).fill("")];
  return (
    <div className="ttd-dua">
      <Ttd {...kiri} atas={isi(kiri.atas)} />
      <Ttd {...kanan} atas={isi(kanan.atas)} />
    </div>
  );
}

/** Angka rupiah gaya akuntansi Excel: "Rp" rata kiri, angka rata kanan */
function Rp({ n }: { n: number }) {
  return (
    <span className="rp">
      <span>Rp</span>
      <span>{angka(n)}</span>
    </span>
  );
}

/** Tabel kunci : nilai */
function Kv({ baris, className = "" }: { baris: [ReactNode, ReactNode][]; className?: string }) {
  return (
    <table className={`dok-kv ${className}`}>
      <tbody>
        {baris.map(([k, v], i) => (
          <tr key={i}>
            <td>{k}</td>
            <td>:</td>
            <td>{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Baris uraian barang + baris spesifikasi "- …" */
function barisItem(item: ItemPaket[], sel: (x: ItemPaket, i: number) => ReactNode[], kosong: number) {
  return item.map((x, i) => (
    <Fragment key={i}>
      <tr className="baris-item">
        {sel(x, i).map((s, j) => (
          <td key={j}>{s}</td>
        ))}
      </tr>
      {x.spesifikasi.map((s, j) => (
        <tr key={j} className="baris-spek">
          <td />
          <td>{barisSpesifikasi(s)}</td>
          {Array.from({ length: kosong }, (_, k) => (
            <td key={k} />
          ))}
        </tr>
      ))}
    </Fragment>
  ));
}

/** Baris JUMLAH / PPN 11% / TOTAL JUMLAH / Terbilang di bawah tabel barang */
function barisTotal(t: Total, ppn: boolean, label: { ppn: string; kolomLabel: number; sesudah: number; terbilang: ReactNode }) {
  const baris = (nama: string, n: number) => (
    <tr className="baris-total">
      <td />
      <td colSpan={label.kolomLabel} className="tengah">
        {nama}
      </td>
      <td>
        <Rp n={n} />
      </td>
      {label.sesudah > 0 && <td colSpan={label.sesudah} />}
    </tr>
  );
  return (
    <>
      {baris("JUMLAH", t.jumlah)}
      {ppn && baris(label.ppn, t.ppn)}
      {baris("TOTAL JUMLAH", t.total)}
      <tr className="baris-total">
        <td />
        <td colSpan={label.kolomLabel + 1 + label.sesudah} className="miring">
          {label.terbilang}
        </td>
      </tr>
    </>
  );
}

/* =====================================================================
   1. Nota Dinas
   ===================================================================== */
function NotaDinas({ p, ppk }: Data) {
  return (
    <section className="dok-hal ada-kaki">
      <Kop />
      <p className="nd-tanggal">Makassar, {tanggalSurat(p.nd.tanggal)}</p>
      <Kv
        className="nd-kv"
        baris={[
          ["Nomor", p.nd.nomor],
          ["Lampiran", "-"],
          ["Perihal", <u key="u">Perintah Pengadaan Barang/Jasa</u>],
        ]}
      />
      <div className="nd-isi">
        <p>Kepada Yth.</p>
        <p>Pejabat Pengadaan {INSTANSI}</p>
        <p>Di</p>
        <p className="nd-tempat">Tempat</p>
        <p className="rata jarak">
          Sehubungan dengan akan dilaksanakannya kegiatan pengadaan barang/jasa di lingkungan {INSTANSI} Tahun Anggaran {p.tahun}, maka dengan ini
          disampaikan untuk melaksanakan proses Pengadaan Barang/Jasa pada kegiatan {p.pekerjaan} Sebagai dasar Pelaksanaan Berikut dilampirkan
        </p>
        <ol className="nd-daftar jarak">
          <li>
            <span>1</span>Daftar Barang yang akan diadakan;
          </li>
          <li>
            <span>2</span>Spesifikasi Teknis (jika ada);
          </li>
          <li>
            <span>3</span>Gambar (jika ada);
          </li>
        </ol>
        <p className="rata jarak">Dalam pelaksanaan proses Pengadaan Barang/Jasa agar senantiasa berpedoman pada peraturan perundang-undangan yang berlaku.</p>
        <p className="rata jarak">
          diharapkan agar Pejabat Pengadaan Barang/Jasa segera melakukan persiapan dan pelaksanaan pengadaan dengan memperhatikan batasan waktu yang tersedia.
        </p>
        <p className="jarak">Demikian disampaikan dan atas kerja samanya diucapkan terima kasih.</p>
      </div>
      <div className="ttd-kanan">
        <Ttd atas={["Pejabat Pembuat Komitmen (PPK)"]} nama={ppk.nama} bawah={bawahPejabat(ppk)} />
      </div>
      <Kaki />
    </section>
  );
}

/* =====================================================================
   2. HPS (Daftar Paket Pekerjaan, lampiran Nota Dinas)
   ===================================================================== */
function Hps({ p, ppk }: Data) {
  const t = totalHps(p);
  return (
    <section className="dok-hal">
      <Kv
        className="hps-kv"
        baris={[
          ["Lampiran Surat", "Perintah Pengadaan Barang/Jasa"],
          ["Nomor", p.nd.nomor],
          ["Tanggal", tanggalSurat(p.nd.tanggal)],
        ]}
      />
      <p className="tengah jarak">DAFTAR PAKET PEKERJAAN</p>
      <p className="tengah">{p.pekerjaan}</p>
      <table className="dok-tabel tabel-hps">
        <colgroup>
          <col style={{ width: "5.5%" }} />
          <col />
          <col style={{ width: "9.5%" }} />
          <col style={{ width: "11.5%" }} />
          <col style={{ width: "14.5%" }} />
          <col style={{ width: "18%" }} />
          <col style={{ width: "7%" }} />
        </colgroup>
        <thead>
          <tr>
            <th>No.</th>
            <th>Uraian</th>
            <th>Jumlah</th>
            <th>SATUAN</th>
            <th>HARGA SATUAN (Rp)</th>
            <th>TOTAL JUMLAH (Rp)</th>
            <th>Ket</th>
          </tr>
        </thead>
        <tbody>
          <tr className="baris-kosong">{Array.from({ length: 7 }, (_, i) => <td key={i} />)}</tr>
          {barisItem(p.item, (x, i) => [i + 1, x.uraian, angka(x.jumlah), x.satuan, angka(x.hargaHps), angka(x.jumlah * x.hargaHps), x.ket], 5)}
          <tr className="baris-tipis">{Array.from({ length: 7 }, (_, i) => <td key={i} />)}</tr>
          {barisTotal(t, p.ppn, {
            ppn: "PPN 11%",
            kolomLabel: 4,
            sesudah: 1,
            terbilang: (
              <>
                TERBILANG :<span className="sela" />
                {terbilangRupiah(t.total)}
              </>
            ),
          })}
        </tbody>
      </table>
      <div className="ttd-kanan">
        <Ttd atas={[`Makassar, ${tanggalSurat(p.nd.tanggal)}`, "Pejabat Pembuat Komitmen (PPK)"]} nama={ppk.nama} bawah={bawahPejabat(ppk)} />
      </div>
    </section>
  );
}

/* =====================================================================
   3. Surat Pesanan (Pejabat Pengadaan → penyedia)
   ===================================================================== */
function SuratPesanan({ p, pp, penyedia }: Data) {
  return (
    <section className="dok-hal">
      <p className="tengah">Surat Pesanan</p>
      <p className="tengah">
        Nomor :<span className="sela" />
        {p.sp?.nomor}
      </p>
      <div className="sp-tujuan jarak">
        <p>Kepada Yth.</p>
        <p>{penyedia.nama}</p>
        <p>Di –</p>
        <p className="sp-tempat">Tempat</p>
      </div>
      <p className="tengah jarak">Bersama ini disampaikan kiranya dapat disiapkan barang sesuai pesanan berikut :</p>
      <table className="dok-tabel tabel-blok tabel-sp">
        <colgroup>
          <col style={{ width: "6%" }} />
          <col />
          <col style={{ width: "13%" }} />
          <col style={{ width: "11%" }} />
        </colgroup>
        <thead>
          <tr>
            <th>NO</th>
            <th>Uraian</th>
            <th>Jumlah</th>
            <th>Satuan</th>
          </tr>
        </thead>
        <tbody>
          <tr className="blok-jarak">{Array.from({ length: 4 }, (_, i) => <td key={i} />)}</tr>
          {barisItem(p.item, (x, i) => [i + 1, x.uraian, angka(x.jumlah), x.satuan], 2)}
          <tr className="blok-jarak blok-akhir">{Array.from({ length: 4 }, (_, i) => <td key={i} />)}</tr>
        </tbody>
      </table>
      <p className="rata menjorok jarak">
        Demikian Pesanan ini dibuat dan untuk dilaksanakan paling lambat {p.sp?.batasHari ?? "…"} Hari Setelah Menerima Surat Pesanan ini.
      </p>
      <div className="ttd-kanan">
        <Ttd atas={[`Makassar, ${tanggalSurat(p.sp?.tanggal)}`, "Pejabat Pengadaan", INSTANSI]} nama={pp.nama} bawah={bawahPejabat(pp)} />
      </div>
    </section>
  );
}

/* =====================================================================
   4. Nota / Bukti Pembelian (Arial)
   ===================================================================== */
function NotaPembelian({ p, ppk, pp, penyedia }: Data) {
  const t = totalBeli(p);
  return (
    <section className="dok-hal dok-arial">
      <p className="tengah">NOTA / BUKTI PEMBELIAN</p>
      <div className="nota-tujuan jarak">
        <span>Kepada Yth :</span>
        <div>
          <p>PEJABAT PENGADAAN</p>
          <p>{INSTANSI}</p>
          <p>Di –</p>
          <p className="nota-tempat">Tempat</p>
        </div>
      </div>
      <table className="dok-tabel tabel-blok tabel-nota">
        <colgroup>
          <col style={{ width: "6.5%" }} />
          <col />
          <col style={{ width: "10%" }} />
          <col style={{ width: "11.5%" }} />
          <col style={{ width: "16%" }} />
          <col style={{ width: "19%" }} />
        </colgroup>
        <thead>
          <tr>
            <th>NO</th>
            <th>URAIAN</th>
            <th>Jumlah</th>
            <th>SATUAN</th>
            <th>HARGA SATUAN (Rp)</th>
            <th>JUMLAH (Rp)</th>
          </tr>
        </thead>
        <tbody>
          <tr className="blok-jarak">{Array.from({ length: 6 }, (_, i) => <td key={i} />)}</tr>
          {barisItem(p.item, (x, i) => [i + 1, x.uraian, angka(x.jumlah), x.satuan, <Rp key="h" n={x.harga ?? 0} />, <Rp key="j" n={x.jumlah * (x.harga ?? 0)} />], 4)}
          <tr className="blok-jarak blok-akhir">{Array.from({ length: 6 }, (_, i) => <td key={i} />)}</tr>
          {barisTotal(t, p.nota?.ppn ?? false, {
            ppn: "PPN 11%",
            kolomLabel: 4,
            sesudah: 0,
            terbilang: (
              <>
                Terbilang<span className="sela-kecil" />: {terbilangRupiah(t.total)}
              </>
            ),
          })}
        </tbody>
      </table>
      <TtdDua
        kiri={{ atas: ["", "Yang Menerima,", "Pejabat Pengadaan"], nama: pp.nama, bawah: bawahPejabat(pp) }}
        kanan={{ atas: [`Makassar, ${tanggalSurat(p.nota?.tanggal)}`, "Hormat Kami,", "Penyedia", penyedia.nama], nama: penyedia.pimpinan, bawah: bawahPenyedia(penyedia) }}
      />
      <div className="ttd-tengah">
        <Ttd atas={["Menyetujui,", "Pejabat Pembuat Komitmen"]} nama={ppk.nama} bawah={bawahPejabat(ppk)} />
      </div>
    </section>
  );
}

/* =====================================================================
   5. Kwitansi Pembayaran Langsung
   ===================================================================== */
function Kwitansi({ p, ppk, penyedia }: Data) {
  const t = totalBeli(p);
  return (
    <section className="dok-hal">
      <div className="kw-kotak">
        <p className="tengah kw-judul">KWITANSI PEMBAYARAN LANGSUNG</p>
        <Kv
          className="kw-kepala"
          baris={[
            ["TA", p.tahun],
            ["Nomor Bukti", p.kwitansi?.nomor],
            ["Mata Anggaran", p.mak],
          ]}
        />
        <Kv
          className="kw-isi"
          baris={[
            ["Sudah terima dari", `Pejabat Pembuat Komitmen ${INSTANSI}`],
            [
              "Jumlah Uang",
              <span key="u" className="kw-uang">
                <span>Rp</span>
                <span>{angka(t.total)}</span>
              </span>,
            ],
            ["Terbilang", terbilangRupiah(t.total)],
            ["Untuk Pembayaran", `${p.pekerjaan} pada Politeknik Ilmu pelayaran Makassar Tahun Anggaran ${p.tahun} dengan rincian terlampir.`],
          ]}
        />
        <TtdDua
          kiri={{ atas: ["", "a.n. Kuasa Pengguna Anggaran", "Pejabat Pembuat Komitmen", INSTANSI], nama: ppk.nama, bawah: bawahPejabat(ppk) }}
          kanan={{ atas: [`Makassar, ${tanggalSurat(p.kwitansi?.tanggal)}`, "", "Yang Menerima", penyedia.nama], nama: penyedia.pimpinan, bawah: bawahPenyedia(penyedia) }}
        />
        <div className="kw-bayar">
          <p>Pembayaran dibayarkan melalui Kantor Pelayanan Perbendaharan Negara (KPPN) Makassar I Kepada</p>
          <div className="kw-bank">
            <span>Kepada</span>
            <span>{penyedia.bank || KOSONG}</span>
            <span>No. Rek: {penyedia.rekening || KOSONG}</span>
            <span>atas nama</span>
            <span className="kw-lebar">{penyedia.nama}</span>
            <span />
            <span className="kw-lebar">
              NPWP<span className="sela" />:<span className="sela" />
              {penyedia.npwp || KOSONG}
            </span>
          </div>
          <p>Barang/pekerjaan tersebut telah diterima/diselesaikan dengan lengkap dan baik.</p>
        </div>
      </div>
    </section>
  );
}

/* =====================================================================
   6. Lampiran Kwitansi (Lampiran Daftar Barang)
   ===================================================================== */
function LampiranKwitansi({ p, ppk, penyedia }: Data) {
  const t = totalBeli(p);
  return (
    <section className="dok-hal">
      <div className="judul-lampiran">
        <p>LAMPIRAN DAFTAR BARANG</p>
        <p>
          {p.pekerjaan.toUpperCase()} PADA POLITEKNIK ILMU PELAYARAN MAKASSAR TAHUN ANGGARAN {p.tahun}
        </p>
        <p>{p.kwitansi?.nomor}</p>
      </div>
      <table className="dok-tabel tabel-lamp-kw">
        <colgroup>
          <col style={{ width: "5.5%" }} />
          <col />
          <col style={{ width: "11.5%" }} />
          <col style={{ width: "11.5%" }} />
          <col style={{ width: "15%" }} />
          <col style={{ width: "18%" }} />
        </colgroup>
        <thead>
          <tr>
            <th>No</th>
            <th>URAIAN</th>
            <th>JUMLAH</th>
            <th>SATUAN</th>
            <th>HARGA SATUAN (Rp)</th>
            <th>TOTAL JUMLAH (Rp)</th>
          </tr>
        </thead>
        <tbody>
          <tr className="baris-kosong">{Array.from({ length: 6 }, (_, i) => <td key={i} />)}</tr>
          <tr className="baris-kosong">{Array.from({ length: 6 }, (_, i) => <td key={i} />)}</tr>
          {barisItem(p.item, (x, i) => [i + 1, x.uraian, angka(x.jumlah), x.satuan, <Rp key="h" n={x.harga ?? 0} />, <Rp key="j" n={x.jumlah * (x.harga ?? 0)} />], 4)}
          <tr className="baris-kosong">{Array.from({ length: 6 }, (_, i) => <td key={i} />)}</tr>
          {barisTotal(t, p.nota?.ppn ?? false, {
            ppn: "PPN 11 %",
            kolomLabel: 4,
            sesudah: 0,
            terbilang: <>Terbilang : {terbilangRupiah(t.total)}</>,
          })}
        </tbody>
      </table>
      <TtdDua
        kiri={{ atas: ["", "a.n. Kuasa Pengguna Anggaran", "Pejabat Pembuat Komitmen", INSTANSI], nama: ppk.nama, bawah: bawahPejabat(ppk) }}
        kanan={{ atas: [`Makassar, ${tanggalSurat(p.kwitansi?.tanggal)}`, "Hormat Kami,", "Penyedia", penyedia.nama], nama: penyedia.pimpinan, bawah: bawahPenyedia(penyedia) }}
      />
    </section>
  );
}

/* =====================================================================
   7. BAP — Berita Acara Pemeriksaan Barang/Hasil Pekerjaan
   ===================================================================== */
function Bap({ p, ppk, penyedia }: Data) {
  const ht = hariTanggalKata(p.bap?.tanggal);
  return (
    <section className="dok-hal ada-kaki">
      <Kop />
      <p className="tengah judul-ba">BERITA ACARA PEMERIKSAAN BARANG/HASIL PEKERJAAN</p>
      <p className="tengah">
        Nomor :<span className="sela" />
        {p.bap?.nomor}
      </p>
      <p className="rata jarak">
        Pada hari ini {ht.hari} tanggal {ht.tanggal} yang bertanda tangan dibawah ini Pejabat Pembuat Komitmen Belanja {p.dana} yang di tunjuk berdasarkan Surat
        Keputusan Direktur {INSTANSI} Nomor: {ppk.skNomor || KOSONG} Tanggal {tanggalSk(ppk.skTanggal)} menerangkan dengan sebenarnya bahwa melakukan
        penelitian dan pemeriksaan Hasil Kegiatan {p.pekerjaan} Pada {INSTANSI} yang dilaksanakan oleh :
      </p>
      <Kv
        className="ba-kv jarak"
        baris={[
          ["Penyedia", penyedia.nama],
          ["Alamat", penyedia.alamat || KOSONG],
        ]}
      />
      <p className="rata jarak">
        Sesuai Kuitansi Pembayaran Langsung Pengadaan Barang/Pekerjaan {p.pekerjaan} Pada {INSTANSI}.
      </p>
      <p className="rata jarak">
        Berdasarkan hasil penelitian dan pemeriksaan, pekerjaan telah dilaksanakan dengan baik dan pekerjaan telah diterima dalam keadaan baik dan lengkap
        seluruhnya.
      </p>
      <p className="jarak">Adapun hasil penelitian dan pemeriksaan adalah sebagaimana terlampir.</p>
      <p className="rata jarak">Demikian Berita Acara Pemeriksaan Barang/Hasil Pekerjaan ini dibuat dengan sebenarnya untuk dipergunakan sebagaimana mestinya.</p>
      <TtdDua
        kiri={{ atas: ["", "", "Penyedia", penyedia.nama], nama: penyedia.pimpinan, bawah: bawahPenyedia(penyedia) }}
        kanan={{ atas: [`Makassar, ${tanggalSurat(p.bap?.tanggal)}`, "a.n. Kuasa Pengguna Anggaran", "Pejabat Pembuat Komitmen", INSTANSI], nama: ppk.nama, bawah: bawahPejabat(ppk) }}
      />
      <Kaki />
    </section>
  );
}

/* =====================================================================
   8. Lampiran BAP (hasil pemeriksaan)
   ===================================================================== */
function LampiranBap({ p, ppk, penyedia }: Data) {
  const centang = p.bap?.centang ?? false;
  return (
    <section className="dok-hal">
      <p>Lampiran B.A. Pemeriksaan Barang/ Hasil Pekerjaan</p>
      <Kv
        className="lamp-kv"
        baris={[
          ["Nomor", p.bap?.nomor],
          ["Tanggal", tanggalSurat(p.bap?.tanggal)],
        ]}
      />
      <table className="dok-tabel tabel-blok tabel-lamp-bap">
        <colgroup>
          <col style={{ width: "6%" }} />
          <col />
          <col style={{ width: "9%" }} />
          <col style={{ width: "9%" }} />
          <col style={{ width: "13%" }} />
          <col style={{ width: "17.5%" }} />
        </colgroup>
        <thead>
          <tr>
            <th rowSpan={2}>No.</th>
            <th rowSpan={2}>Nama Barang</th>
            <th rowSpan={2}>Jumlah</th>
            <th rowSpan={2}>Satuan</th>
            <th colSpan={2} className="kecil">
              HASIL PEMERIKSAAN
            </th>
          </tr>
          <tr>
            <th className="kecil">MEMENUHI</th>
            <th className="kecil">TIDAK MEMENUHI</th>
          </tr>
        </thead>
        <tbody>
          <tr className="blok-jarak">{Array.from({ length: 6 }, (_, i) => <td key={i} />)}</tr>
          {barisItem(p.item, (x, i) => [i + 1, x.uraian, angka(x.jumlah), x.satuan, centang ? "√" : "", ""], 4)}
          <tr className="blok-jarak blok-akhir">{Array.from({ length: 6 }, (_, i) => <td key={i} />)}</tr>
        </tbody>
      </table>
      <TtdDua
        kiri={{ atas: ["", "PIHAK PERTAMA", "Pejabat Pembuat Komitmen"], nama: ppk.nama, bawah: bawahPejabat(ppk) }}
        kanan={{ atas: [`Makassar, ${tanggalSurat(p.bap?.tanggal)}`, "PIHAK KEDUA", penyedia.nama], nama: penyedia.pimpinan, bawah: bawahPenyedia(penyedia) }}
      />
    </section>
  );
}

/* =====================================================================
   9. BAST — Berita Acara Serah Terima Barang / Hasil Pekerjaan
   ===================================================================== */
function Bast({ p, ppk, penyedia }: Data) {
  const ht = hariTanggalKata(p.bast?.tanggal);
  return (
    <section className="dok-hal ada-kaki">
      <Kop />
      <p className="tengah judul-ba">BERITA ACARA SERAH TERIMA BARANG / HASIL PEKERJAAN</p>
      <p className="tengah">
        Nomor :<span className="sela" />
        {p.bast?.nomor}
      </p>
      <p className="bast-hari jarak">
        <span>Pada hari ini</span>
        <span>{ht.hari}</span>
        <span>tanggal</span>
        <span>{ht.tanggal}</span>
      </p>
      <p>masing – masing yang bertanda tangan di bawah ini :</p>
      <table className="dok-kv bast-pihak jarak">
        <tbody>
          <tr>
            <td>I.</td>
            <td>N a m a</td>
            <td>:</td>
            <td>{ppk.nama}</td>
          </tr>
          <tr>
            <td />
            <td>NIP</td>
            <td>:</td>
            <td>{nipCetak(ppk.nip)}</td>
          </tr>
          <tr>
            <td />
            <td>Jabatan</td>
            <td>:</td>
            <td>Pejabat Pembuat Komitmen</td>
          </tr>
          <tr>
            <td />
            <td colSpan={3}>Dalam hal ini yang berhak menerima dan mengeluarkan hasil Pekerjaan,</td>
          </tr>
          <tr>
            <td />
            <td colSpan={3}>
              Selanjutnya disebut sebagai <b>PIHAK PERTAMA</b>.
            </td>
          </tr>
          <tr className="sela-baris">
            <td colSpan={4} />
          </tr>
          <tr>
            <td>II.</td>
            <td>N a m a</td>
            <td>:</td>
            <td>{penyedia.pimpinan || KOSONG}</td>
          </tr>
          <tr>
            <td />
            <td>Jabatan</td>
            <td>:</td>
            <td>{penyedia.jabatan || "Direktur"}</td>
          </tr>
          <tr>
            <td />
            <td>Alamat</td>
            <td>:</td>
            <td>{penyedia.alamat || KOSONG}</td>
          </tr>
          <tr>
            <td />
            <td colSpan={3}>
              Untuk selanjutnya disebut sebagai <b>PIHAK KEDUA</b>
            </td>
          </tr>
        </tbody>
      </table>
      <p className="rata jarak">
        Sesuai Kuitansi Pembayaran Langsung Pengadaan Barang/Pekerjaan {p.pekerjaan} Dengan memperhatikan Surat Pesanan Nomor : {p.sp?.nomor} tanggal{" "}
        {tanggalSurat(p.sp?.tanggal)} maka dengan ini menyatakan sebagai berikut :
      </p>
      <ol className="bast-poin jarak">
        <li>
          <span>1.</span>PIHAK KEDUA melakukan penyerahan barang sebagaimana dimaksud kepada PIHAK PERTAMA.
        </li>
        <li>
          <span>2.</span>PIHAK PERTAMA menerima penyerahan barang yang diserahkan oleh PIHAK KEDUA.
        </li>
      </ol>
      <p className="jarak">Demikian Berita Acara Serah Terima Barang ini dibuat dengan sebenarnya guna bahan selanjutnya.</p>
      <TtdDua
        kiri={{ atas: ["", "PIHAK PERTAMA"], nama: ppk.nama, bawah: bawahPejabat(ppk) }}
        kanan={{ atas: [`Makassar, ${tanggalSurat(p.bast?.tanggal)}`, "PIHAK KEDUA"], nama: penyedia.pimpinan, bawah: bawahPenyedia(penyedia) }}
      />
      <Kaki />
    </section>
  );
}

/* =====================================================================
   10. Lampiran BAST
   ===================================================================== */
function LampiranBast({ p, ppk, penyedia }: Data) {
  return (
    <section className="dok-hal">
      <p>Lampiran B.A. Serah Terima Barang/Hasil Pekerjaan</p>
      <Kv
        className="lamp-kv"
        baris={[
          ["Nomor", p.bast?.nomor],
          ["Tanggal", tanggalSurat(p.bast?.tanggal)],
        ]}
      />
      <table className="dok-tabel tabel-blok tabel-lamp-bast">
        <colgroup>
          <col style={{ width: "6%" }} />
          <col />
          <col style={{ width: "11%" }} />
          <col style={{ width: "13%" }} />
          <col style={{ width: "15%" }} />
        </colgroup>
        <thead>
          <tr>
            <th>No.</th>
            <th>Nama Barang</th>
            <th>Jumlah</th>
            <th>Satuan</th>
            <th>Keterangan</th>
          </tr>
        </thead>
        <tbody>
          <tr className="blok-jarak">{Array.from({ length: 5 }, (_, i) => <td key={i} />)}</tr>
          {barisItem(p.item, (x, i) => [i + 1, x.uraian, angka(x.jumlah), x.satuan, x.ket], 3)}
          <tr className="blok-jarak blok-akhir">{Array.from({ length: 5 }, (_, i) => <td key={i} />)}</tr>
        </tbody>
      </table>
      <TtdDua
        kiri={{ atas: ["", "PIHAK PERTAMA", "Pejabat Pembuat Komitmen"], nama: ppk.nama, bawah: bawahPejabat(ppk) }}
        kanan={{ atas: [`Makassar, ${tanggalSurat(p.bast?.tanggal)}`, "PIHAK KEDUA", penyedia.nama], nama: penyedia.pimpinan, bawah: bawahPenyedia(penyedia) }}
      />
    </section>
  );
}

const HALAMAN: Record<KodeDokumen, (d: Data) => ReactNode> = {
  nd: (d) => <NotaDinas {...d} />,
  hps: (d) => <Hps {...d} />,
  sp: (d) => <SuratPesanan {...d} />,
  nota: (d) => <NotaPembelian {...d} />,
  kw: (d) => <Kwitansi {...d} />,
  lampKw: (d) => <LampiranKwitansi {...d} />,
  bap: (d) => <Bap {...d} />,
  lampBap: (d) => <LampiranBap {...d} />,
  bast: (d) => <Bast {...d} />,
  lampBast: (d) => <LampiranBast {...d} />,
};
