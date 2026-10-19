/**
 * POST /api/pengguna — Administrator menambah pengguna (akun login Supabase Auth + profil Belanjaku).
 * Butuh header Authorization: Bearer <access token sesi Administrator>.
 */
import { kePengguna } from "@/lib/db";
import {
  EMAIL_VALID,
  GalatApi,
  PERAN_VALID,
  bacaJson,
  galatRpc,
  sandiValid,
  supabaseAdmin,
  tangani,
  teks,
  wajibAdministrator,
} from "@/lib/supabaseServer";
import type { Peran } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return tangani(async () => {
    const aktor = await wajibAdministrator(req);
    const b = await bacaJson(req);
    const nama = teks(b.nama, "Nama", 2, 120);
    const email = teks(b.email, "Email", 5, 200).toLowerCase();
    if (!EMAIL_VALID.test(email)) throw new GalatApi(400, "Format email tidak valid");
    const peran = b.peran as Peran;
    if (!PERAN_VALID.includes(peran)) throw new GalatApi(400, "Peran tidak dikenal");
    const unit = typeof b.unit === "string" ? b.unit.trim() : "";
    const sandi = sandiValid(b.sandi);

    const sb = supabaseAdmin();
    const { data: ada } = await sb.from("pengguna").select("id").eq("email", email).is("deleted_at", null).maybeSingle();
    if (ada) throw new GalatApi(409, "Email ini sudah dipakai pengguna lain");

    const { data: akun, error } = await sb.auth.admin.createUser({ email, password: sandi, email_confirm: true, user_metadata: { nama } });
    if (error || !akun.user) {
      if (/already|registered|exists/i.test(error?.message ?? ""))
        throw new GalatApi(409, "Email ini sudah terdaftar sebagai akun login di Supabase. Gunakan email lain atau hapus akun lama di dashboard Supabase.");
      if (/password/i.test(error?.message ?? "")) throw new GalatApi(400, "Kata sandi ditolak Supabase (terlalu lemah)");
      throw new GalatApi(400, error?.message ?? "Akun login gagal dibuat");
    }

    const { data, error: e2 } = await sb.rpc("admin_tambah_pengguna", {
      p_aktor: aktor.id,
      p_auth_id: akun.user.id,
      p_nama: nama,
      p_email: email,
      p_peran: peran,
      p_unit: unit || null,
    });
    if (e2) {
      await sb.auth.admin.deleteUser(akun.user.id); // batalkan akun login bila profil gagal dibuat
      galatRpc(e2);
    }
    return { pengguna: kePengguna(data.pengguna), aktivitas: data.aktivitas };
  });
}
