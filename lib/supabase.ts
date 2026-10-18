/**
 * Klien Supabase untuk browser.
 * Kunci yang dipakai di sini adalah kunci PUBLIK (publishable / anon) — aman berada di browser
 * karena semua tabel dilindungi Row Level Security dan perubahan data hanya lewat fungsi RPC.
 * Kunci rahasia (secret / service_role) hanya dipakai di server: lihat lib/supabaseServer.ts.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL_SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KUNCI_PUBLIK = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** false bila .env.local / Environment Variables Vercel belum diisi */
export const supabaseTerkonfigurasi = Boolean(URL_SUPABASE && KUNCI_PUBLIK);

let klien: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (!klien) {
    if (!URL_SUPABASE || !KUNCI_PUBLIK) throw new Error("Supabase belum dikonfigurasi (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)");
    klien = createClient(URL_SUPABASE, KUNCI_PUBLIK, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: "belanjaku-auth" },
      realtime: { params: { eventsPerSecond: 5 } },
    });
  }
  return klien;
}
