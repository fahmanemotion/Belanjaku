"use client";

/**
 * Combobox: kotak isian yang bisa diketik untuk mencari, dengan daftar pilihan di bawahnya.
 * - Ketik untuk menyaring, ↑ ↓ untuk berpindah, Enter untuk memilih, Esc untuk menutup
 * - Pilihan bisa dikelompokkan lewat `grup` (judul kelompok tampil di daftar)
 * - Daftar terbuka ke atas bila ruang di bawah tidak cukup
 */
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import Icon from "./Icon";

export interface OpsiCombo {
  value: string;
  label: string;
  /** keterangan kecil di sisi kanan pilihan */
  info?: string;
  /** judul kelompok; pilihan dengan grup sama sebaiknya berurutan */
  grup?: string;
  /** baris kedua (deskripsi) di bawah label */
  keterangan?: string;
  /** tampilkan label dengan huruf monospace (untuk kode) */
  mono?: boolean;
}

interface Props {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  opsi: OpsiCombo[];
  placeholder?: string;
  disabled?: boolean;
  /** teks saat tidak ada pilihan yang cocok */
  kosong?: string;
}

export default function Combobox({ id, value, onChange, opsi, placeholder = "Pilih…", disabled = false, kosong = "Tidak ada pilihan yang cocok" }: Props) {
  const listId = useId();
  const wrap = useRef<HTMLDivElement>(null);
  const [buka, setBuka] = useState(false);
  const [keAtas, setKeAtas] = useState(false);
  const [tinggi, setTinggi] = useState(260);
  const [cari, setCari] = useState("");
  const [aktif, setAktif] = useState(0);

  const terpilih = opsi.find((o) => o.value === value);

  const saring = useMemo(() => {
    const q = cari.trim().toLowerCase();
    if (!q) return opsi;
    return opsi.filter((o) => [o.label, o.info ?? "", o.value, o.grup ?? "", o.keterangan ?? ""].join(" ").toLowerCase().includes(q));
  }, [opsi, cari]);

  const tutup = () => {
    setBuka(false);
    setCari("");
  };

  /** buka daftar; `awal` = teks yang sudah diketik (saat mengetik di kotak yang masih tertutup) */
  const bukaDaftar = (awal = "") => {
    if (disabled || buka) return;
    // Hitung ruang kosong di dalam wadah yang bisa digulir (mis. modal) agar daftar tidak terpotong
    const el = wrap.current;
    if (el) {
      const r = el.getBoundingClientRect();
      let atas = 0;
      let bawah = window.innerHeight;
      for (let p = el.parentElement; p; p = p.parentElement) {
        const oy = getComputedStyle(p).overflowY;
        if (oy === "auto" || oy === "scroll" || oy === "hidden") {
          const pr = p.getBoundingClientRect();
          atas = Math.max(atas, pr.top);
          bawah = Math.min(bawah, pr.bottom);
          break;
        }
      }
      const ruangBawah = bawah - r.bottom - 10;
      const ruangAtas = r.top - atas - 10;
      const naik = ruangBawah < 200 && ruangAtas > ruangBawah;
      setKeAtas(naik);
      setTinggi(Math.max(140, Math.min(260, naik ? ruangAtas : ruangBawah)));
    }
    setBuka(true);
    setCari(awal);
    setAktif(awal ? 0 : Math.max(0, opsi.findIndex((o) => o.value === value)));
  };

  const pilih = (o: OpsiCombo) => {
    onChange(o.value);
    tutup();
  };

  // Tutup bila klik di luar komponen
  useEffect(() => {
    if (!buka) return;
    const h = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) tutup();
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [buka]);

  // Pilihan yang disorot selalu terlihat saat berpindah dengan keyboard
  useEffect(() => {
    if (buka) document.getElementById(`${listId}-${aktif}`)?.scrollIntoView({ block: "nearest" });
  }, [aktif, buka, listId]);

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!buka) bukaDaftar();
      else setAktif((a) => Math.min(saring.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setAktif((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter") {
      e.preventDefault(); // jangan kirim form
      if (buka && saring[aktif]) pilih(saring[aktif]);
      else bukaDaftar();
    } else if (e.key === "Escape" && buka) {
      e.stopPropagation(); // tutup daftar saja, bukan modalnya
      tutup();
    } else if (e.key === "Tab") {
      tutup();
    }
  };

  return (
    <div ref={wrap} className={`combo ${buka ? "buka" : ""} ${keAtas ? "atas" : ""} ${disabled ? "mati" : ""}`}>
      <div className="combo-input">
        <input
          id={id}
          role="combobox"
          aria-expanded={buka}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={buka && saring[aktif] ? `${listId}-${aktif}` : undefined}
          autoComplete="off"
          disabled={disabled}
          className={terpilih?.mono && !buka ? "isi-mono" : undefined}
          placeholder={buka && terpilih ? terpilih.label : placeholder}
          value={buka ? cari : (terpilih?.label ?? value)}
          onChange={(e) => {
            if (!buka) return bukaDaftar(e.target.value);
            setCari(e.target.value);
            setAktif(0);
          }}
          onClick={() => bukaDaftar()}
          onKeyDown={onKey}
          onBlur={tutup}
        />
        <Icon name="chevron" />
      </div>

      {buka && (
        <ul id={listId} role="listbox" className="combo-list" style={{ maxHeight: tinggi }} onMouseDown={(e) => e.preventDefault()}>
          {saring.length === 0 ? (
            <li className="combo-kosong" role="presentation">{kosong}</li>
          ) : (
            saring.map((o, i) => (
              <ComboItem
                key={o.value}
                o={o}
                id={`${listId}-${i}`}
                judulGrup={o.grup && o.grup !== saring[i - 1]?.grup ? o.grup : undefined}
                aktif={i === aktif}
                dipilih={o.value === value}
                onPilih={() => pilih(o)}
                onSorot={() => setAktif(i)}
              />
            ))
          )}
        </ul>
      )}
    </div>
  );
}

function ComboItem({
  o,
  id,
  judulGrup,
  aktif,
  dipilih,
  onPilih,
  onSorot,
}: {
  o: OpsiCombo;
  id: string;
  judulGrup?: string;
  aktif: boolean;
  dipilih: boolean;
  onPilih: () => void;
  onSorot: () => void;
}) {
  return (
    <>
      {judulGrup && <li className="combo-grup" role="presentation">{judulGrup}</li>}
      <li
        id={id}
        role="option"
        aria-selected={dipilih}
        className={`${aktif ? "aktif" : ""} ${dipilih ? "pilih" : ""}`}
        onMouseDown={(e) => {
          e.preventDefault(); // fokus tetap di input
          onPilih();
        }}
        onClick={(e) => e.preventDefault()} // cegah label pembungkus membuka ulang daftar
        onMouseEnter={onSorot}
      >
        <span className="combo-teks">
          <span className={o.mono ? "mono" : undefined}>{o.label}</span>
          {o.keterangan && <em>{o.keterangan}</em>}
        </span>
        {o.info && <small>{o.info}</small>}
        {dipilih && <Icon name="check" />}
      </li>
    </>
  );
}
