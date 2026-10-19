/**
 * Supabase untuk API server (app/api/**) — memakai kunci RAHASIA (secret / service_role).
 * JANGAN diimpor dari komponen browser. Kunci rahasia hanya diisi di Environment Variables Vercel
 * (tanpa awalan NEXT_PUBLIC_) dan di .env.local komputer pengembang.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Peran } from "./types";

export class GalatApi extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

let klien: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient {
  if (!klien) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const kunci = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !kunci) throw new GalatApi(500, "Server belum dikonfigurasi: isi SUPABASE_SECRET_KEY di Environment Variables");
    klien = createClient(url, kunci, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  }
  return klien;
}

export interface ProfilAktor {
  id: string;
  nama: string;
  peran: Peran;
}

/** Pastikan permintaan berasal dari Administrator aktif (token Bearer dari sesi login) */
export async function wajibAdministrator(req: Request): Promise<ProfilAktor> {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new GalatApi(401, "Sesi tidak ditemukan. Silakan masuk kembali.");
  const sb = supabaseAdmin();
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data.user) throw new GalatApi(401, "Sesi berakhir. Silakan masuk kembali.");
  const { data: profil, error: e2 } = await sb
    .from("pengguna")
    .select("id, nama, peran, aktif, deleted_at")
    .eq("auth_id", data.user.id)
    .maybeSingle();
  if (e2) throw new GalatApi(500, "Profil pengguna tidak dapat dibaca");
  if (!profil || !profil.aktif || profil.deleted_at) throw new GalatApi(403, "Akun Anda nonaktif atau belum terdaftar");
  if (profil.peran !== "Administrator") throw new GalatApi(403, "Hanya Administrator yang dapat mengelola pengguna");
  return { id: profil.id, nama: profil.nama, peran: profil.peran };
}

/** Bungkus handler agar galat selalu dikembalikan sebagai JSON { pesan } dengan status yang sesuai */
export async function tangani(fn: () => Promise<unknown>): Promise<Response> {
  try {
    const hasil = await fn();
    return Response.json(hasil ?? { ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof GalatApi) return Response.json({ pesan: e.message }, { status: e.status });
    console.error("[api/pengguna]", e);
    return Response.json({ pesan: "Terjadi kesalahan di server. Coba lagi beberapa saat." }, { status: 500 });
  }
}

/** Ambil & validasi body JSON */
export async function bacaJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const b = await req.json();
    if (!b || typeof b !== "object" || Array.isArray(b)) throw new Error();
    return b as Record<string, unknown>;
  } catch {
    throw new GalatApi(400, "Format permintaan tidak valid");
  }
}

export const PERAN_VALID: Peran[] = ["Administrator", "Operator Pengadaan", "Operator Keuangan", "Bendahara Pengeluaran", "PPK", "PPSPM"];
export const EMAIL_VALID = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function teks(v: unknown, nama: string, min = 1, maks = 200): string {
  const s = typeof v === "string" ? v.trim() : "";
  if (s.length < min || s.length > maks) throw new GalatApi(400, `${nama} wajib diisi (${min}–${maks} karakter)`);
  return s;
}

/** Kata sandi minimal 8 karakter, berisi huruf dan angka */
export function sandiValid(v: unknown): string {
  const s = typeof v === "string" ? v : "";
  if (s.length < 8 || s.length > 72 || !/[A-Za-z]/.test(s) || !/[0-9]/.test(s))
    throw new GalatApi(400, "Kata sandi minimal 8 karakter dan berisi huruf serta angka");
  return s;
}

/** Ubah pesan galat Postgres/RPC menjadi GalatApi 400 */
export function galatRpc(error: { message: string; code?: string } | null): never | void {
  if (!error) return;
  throw new GalatApi(error.code === "42501" ? 403 : 400, error.message);
}
