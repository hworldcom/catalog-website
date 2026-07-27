export async function ensureSellerRole({ userId }: { userId: string }) {
  const { supabaseAdmin } = await import("@/lib/supabase/client.server");

  await supabaseAdmin
    .from("user_roles")
    .upsert({ user_id: userId, role: "seller" }, { onConflict: "user_id,role" });
}
