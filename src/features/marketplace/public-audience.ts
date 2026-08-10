import { z } from "zod";

export const PUBLIC_AUDIENCES = ["women", "men", "kids"] as const;

export type PublicAudience = (typeof PUBLIC_AUDIENCES)[number];

export function normalizePublicAudience(value: unknown): PublicAudience {
  if (typeof value !== "string") return "women";
  const normalized = value.trim().toLowerCase();
  return PUBLIC_AUDIENCES.includes(normalized as PublicAudience)
    ? (normalized as PublicAudience)
    : "women";
}

export const publicAudienceSchema = z.preprocess(normalizePublicAudience, z.enum(PUBLIC_AUDIENCES));
