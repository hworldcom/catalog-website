import { z } from "zod";

export const PUBLIC_AUDIENCES = ["all", "women", "men", "kids"] as const;

export type PublicAudience = (typeof PUBLIC_AUDIENCES)[number];

export function normalizePublicAudience(value: unknown): PublicAudience {
  if (typeof value !== "string") return "all";
  const normalized = value.trim().toLowerCase();
  return PUBLIC_AUDIENCES.includes(normalized as PublicAudience)
    ? (normalized as PublicAudience)
    : "all";
}

export const publicAudienceSchema = z.preprocess(normalizePublicAudience, z.enum(PUBLIC_AUDIENCES));

export function marketplaceHomeSearch<T extends object>(previous: T): T & { audience: "all" } {
  return { ...previous, audience: "all" };
}
