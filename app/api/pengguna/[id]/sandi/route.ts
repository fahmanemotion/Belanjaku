/**
 * POST /api/pengguna/:id/sandi — Administrator mengatur ulang kata sandi pengguna lain.
 * Body: { sandi }. Header Authorization: Bearer <access token Administrator>.
 */
import { GalatApi, bacaJson, galatRpc, sandiValid, supabaseAdmin, tangani, wajibAdministrator } from "@/lib/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return tangani(async () => {
    const aktor = await wajibAdministrator(req);
    const { id } = await ctx.params;
    if (!UUID.test(id)) throw new GalatApi(400, "ID pengguna tidak valid");
    const sandi = sandiValid((await bacaJson(req)).sandi);
    const sb = supabaseAdmin();
    const { data: p } = await sb.from("pengguna").select("auth_id").eq("id", id).is("deleted_at", null).maybeSingle();
    if (!p?.auth_id) throw new GalatApi(404, "Akun login pengguna tidak ditemukan");
    if (id === aktor.id) throw new GalatApi(400, "Ganti kata sandi Anda sendiri lewat menu akun → Ganti kata sandi");
    const { error } = await sb.auth.admin.updateUserById(p.auth_id, { password: sandi });
    if (error) throw new GalatApi(400, /password/i.test(error.message) ? "Kata sandi ditolak Supabase (terlalu lemah)" : error.message);
    const { data, error: e2 } = await sb.rpc("admin_catat_sandi", { p_aktor: aktor.id, p_id: id });
    galatRpc(e2);
    return { aktivitas: data.aktivitas };
  });
}
