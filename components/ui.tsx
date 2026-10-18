"use client";

import { useEffect, useRef, type FormEvent, type ReactNode } from "react";
import Icon from "./Icon";

/* ---------- Judul halaman ---------- */
export function PageHead({ title, subtitle, actions }: { title: ReactNode; subtitle: string; actions?: ReactNode }) {
  return (
    <div className="head">
      <div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      <div className="tbar">
        {actions}
        <span className="chip-ex">Data contoh</span>
      </div>
    </div>
  );
}

/* ---------- Status & badge ---------- */
export type Tone = "g" | "w" | "b" | "i" | "m" | "p" | "";

export function Status({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={`st ${tone}`}>{children}</span>;
}

export function Badge({ tone = "", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

/* ---------- Kolom pencarian ---------- */
export function SearchBox({
  id,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <label className="search" htmlFor={id}>
      <Icon name="search" />
      <input id={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </label>
  );
}

/* ---------- Tab pill ---------- */
export function Tabs<T extends string>({
  items,
  value,
  onChange,
  label,
}: {
  items: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {items.map((it) => (
        <button
          key={it.value}
          type="button"
          role="tab"
          aria-selected={it.value === value}
          className={it.value === value ? "on" : ""}
          onClick={() => onChange(it.value)}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

/* ---------- Modal dengan form ---------- */
export function Modal({
  title,
  description,
  submitLabel,
  onSubmit,
  onClose,
  children,
  bahaya = false,
}: {
  title: string;
  description: string;
  submitLabel: string;
  onSubmit: () => void;
  onClose: () => void;
  children: ReactNode;
  /** tombol konfirmasi berwarna merah untuk tindakan yang tidak bisa dibatalkan */
  bahaya?: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    formRef.current?.querySelector<HTMLElement>("input,select,textarea")?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handle = (e: FormEvent) => {
    e.preventDefault();
    onSubmit();
  };

  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form ref={formRef} className="modal" role="dialog" aria-modal="true" aria-label={title} onSubmit={handle}>
        <div className="mhead">
          <h3>{title}</h3>
          <button type="button" className="more" onClick={onClose} aria-label="Tutup">
            <Icon name="close" size={16} />
          </button>
        </div>
        <p>{description}</p>
        <div className="form">{children}</div>
        <div className="mfoot">
          <button type="button" className="btn soft" onClick={onClose}>
            Batal
          </button>
          <button type="submit" className={`btn ${bahaya ? "danger-solid" : "dark"}`}>
            {submitLabel}
          </button>
        </div>
      </form>
    </div>
  );
}

export function Field({ label, full, children }: { label: string; full?: boolean; children: ReactNode }) {
  return (
    <label className={full ? "full" : undefined}>
      {label}
      {children}
    </label>
  );
}

/* ---------- Dropdown penyaring ringkas (nilai "Semua" = tidak menyaring) ---------- */
export function Saring<T extends string>({
  label,
  value,
  onChange,
  opsi,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  opsi: { value: T; label: string }[];
}) {
  return (
    <label className={`sel saring ${value !== "Semua" ? "aktif" : ""}`}>
      <span className="sr">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value as T)} aria-label={label}>
        {opsi.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}

/* ---------- Baris kosong tabel ---------- */
export function EmptyRow({ cols, children }: { cols: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={cols} className="empty">
        {children}
      </td>
    </tr>
  );
}
