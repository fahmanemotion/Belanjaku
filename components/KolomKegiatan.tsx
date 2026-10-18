"use client";

/**
 * Kolom tabel kegiatan yang dipakai bersama oleh:
 * Dashboard (tabel Kegiatan), Belanja, Pencairan, dan Pengesahan (Daftar Belanja).
 * Ubah kolom di sini → keempat tabel ikut berubah.
 *
 * Urutan kolom: Uraian Kegiatan · No. Dokumen · Jenis Dokumen · Penyedia · Sumber Dana · Akun · Nilai
 * Kode MAK (Mata Anggaran Kegiatan) tampil di bawah uraian kegiatan.
 */
import { Fragment } from "react";
import Icon from "./Icon";
import { useStore } from "./StoreProvider";
import { Badge } from "./ui";
import { infoJenisDokumen } from "@/lib/data";
import { rupiah } from "@/lib/format";
import type { Kegiatan } from "@/lib/types";

export const JUMLAH_KOLOM_KEGIATAN = 7;

export function KepalaKegiatan() {
  return (
    <>
      <th>Uraian Kegiatan</th>
      <th>No. Dokumen</th>
      <th>Jenis Dokumen</th>
      <th>Penyedia</th>
      <th>Sumber Dana</th>
      <th>Akun</th>
      <th className="r">Nilai</th>
    </>
  );
}

export function SelKegiatan({ k }: { k: Kegiatan }) {
  const { namaUnit, namaAkun, cariMak } = useStore();
  const dok = infoJenisDokumen(k.jenisDokumen);
  const mak = cariMak(k.mak);
  return (
    <>
      <td className="main">
        <div className="act">
          <span className="ai">
            <Icon name={dok.ikon} />
          </span>
          <div>
            {k.uraian}
            <span className="mak-keg" title={mak ? `${mak.subKomponen.uraian} · ${mak.akunUraian}` : undefined}>
              <b>MAK</b>
              {/* <wbr> agar kode hanya terpotong di titik pemisah bila kolom sempit */}
              {k.mak.split(".").map((seg, i, arr) => (
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
            <small>{namaUnit(k.unit)}</small>
          </div>
        </div>
      </td>
      <td className="mono full" data-label="No. Dokumen">{k.noDokumen}</td>
      <td data-label="Jenis Dokumen">
        <Badge tone={dok.tone}>{k.jenisDokumen}</Badge>
      </td>
      <td data-label="Penyedia">{k.penyedia}</td>
      <td data-label="Sumber Dana">
        <Badge>{k.dana}</Badge>
      </td>
      <td data-label="Akun" title={namaAkun(k.akun)}>
        <span className="mono">{k.akun}</span>
        <div className="note akun-ur">{namaAkun(k.akun)}</div>
      </td>
      <td className="r num" data-label="Nilai">
        <b>{rupiah(k.nilai)}</b>
      </td>
    </>
  );
}
