/**
 * PATCH  /api/pengguna/:id — ubah nama, email, peran, unit, status aktif (nonaktif = akun login diblokir)
 * DELETE /api/pengguna/:id — hapus akun login; profil disimpan agar riwayat tetap terbaca
 * Hanya Administrator (header Authorization: Bearer <access token>).
 */
import { kePengguna } from "@/lib/db";
import {
  EMAIL_VALID,
  GalatApi,
  PERAN_VALID,
  bacaJson,
  galatRpc,
  supabaseAdmin,
  tangani,
  teks,
  wajibAdministrator,
} from "@/lib/supabaseServer";
import type { Peran } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Konteks = { params: Promise<{ id: string }> };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function idValid(ctx: Konteks) {
  const { id } = await ctx.params;
  if (!UUID.test(id)) throw new GalatApi(400, "ID pengguna tidak valid");
  return id;
}

export async function PATCH(req: Request, ctx: Konteks) {
  return tangani(async () => {
    const aktor = await wajibAdministrator(req);
    const id = await idValid(ctx);
    const b = await bacaJson(req);
    const nama = teks(b.nama, "Nama", 2, 120);
    const email = teks(b.email, "Email", 5, 200).toLowerCase();
    if (!EMAIL_VALID.test(email)) throw new GalatApi(400, "Format email tidak valid");
    const peran = b.peran as Peran;
    if (!PERAN_VALID.includes(peran)) throw new GalatApi(400, "Peran tidak dikenal");
    const unit = typeof b.unit === "string" ? b.unit.trim() : "";
    if (typeof b.aktif !== "boolean") throw new GalatApi(400, "Status aktif tidak valid");
    const aktif = b.aktif;

    const sb = supabaseAdmin();
    const { data: lama } = await sb.from("pengguna").select("auth_id, email, aktif").eq("id", id).is("deleted_at", null).maybeSingle();
    if (!lama) throw new GalatApi(404, "Pengguna tidak ditemukan");

    // 1. email login diganti lebih dulu (gagal bila email sudah dipakai akun lain)
    const gantiEmail = lama.auth_id && email !== lama.email;
    if (gantiEmail) {
      const { error } = await sb.auth.admin.updateUserById(lama.auth_id, { email, email_confirm: true });
      if (error) throw new GalatApi(409, /already|registered|exists/i.test(error.message) ? "Email ini sudah dipakai akun login lain" : error.message);
    }
    // 2. profil + riwayat aktivitas (aturan: bukan akun sendiri, minimal satu Administrator aktif)
    const { data, error } = await sb.rpc("admin_ubah_pengguna", {
      p_aktor: aktor.id,
      p_id: id,
      p_nama: nama,
      p_email: email,
      p_peran: peran,
      p_unit: unit || null,
      p_aktif: aktif,
    });
    if (error) {
      if (gantiEmail) await sb.auth.admin.updateUserById(lama.auth_id, { email: lama.email, email_confirm: true });
      galatRpc(error);
    }
    // 3. akun nonaktif tidak bisa login sama sekali
    if (lama.auth_id && aktif !== lama.aktif) {
      const { error: e3 } = await sb.auth.admin.updateUserById(lama.auth_id, { ban_duration: aktif ? "none" : "876000h" });
      if (e3) console.error("[api/pengguna] gagal mengubah blokir akun", e3.message);
    }
    return { pengguna: kePengguna(data.pengguna), aktivitas: data.aktivitas };
  });
}

export async function DELETE(req: Request, ctx: Konteks) {
  return tangani(async () => {
    const aktor = await wajibAdministrator(req);
    const id = await idValid(ctx);
    const sb = supabaseAdmin();
    const { data, error } = await sb.rpc("admin_hapus_pengguna", { p_aktor: aktor.id, p_id: id });
    galatRpc(error);
    if (data.authId) {
      const { error: e2 } = await sb.auth.admin.deleteUser(data.authId);
      if (e2) {
        // profil sudah nonaktif; blokir akun login bila penghapusan gagal
        await sb.auth.admin.updateUserById(data.authId, { ban_duration: "876000h" });
        console.error("[api/pengguna] gagal menghapus akun login", e2.message);
      }
    }
    return { aktivitas: data.aktivitas };
  });
}
