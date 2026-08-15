import { supabaseAdmin } from "@/lib/supabase/client.server";

import { SellerProfileMediaService } from "./seller-profile-media.service";
import { SupabaseSellerProfileMediaRepository } from "./supabase-seller-profile-media.repository";
import { SupabaseSellerProfileMediaStorage } from "./seller-profile-media.storage";

let service: SellerProfileMediaService | null = null;

export function getSellerProfileMediaService(): SellerProfileMediaService {
  if (service) return service;
  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("seller_profile_image_configuration_invalid");
  }

  service = new SellerProfileMediaService(
    new SupabaseSellerProfileMediaRepository(supabaseAdmin),
    new SupabaseSellerProfileMediaStorage({
      database: supabaseAdmin,
      supabaseUrl,
      serviceRoleKey,
    }),
  );
  return service;
}
