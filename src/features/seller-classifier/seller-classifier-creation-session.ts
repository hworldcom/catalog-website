import { z } from "zod";

const STORAGE_KEY = "bazoria.seller-classifier.creation";
const sessionSchema = z
  .object({
    requestId: z.string().uuid(),
    workflowId: z.string().uuid().optional(),
  })
  .strict();

export type SellerClassifierCreationSession = z.infer<typeof sessionSchema>;

export function loadSellerClassifierCreationSession(
  storage: Pick<Storage, "getItem"> = sessionStorage,
): SellerClassifierCreationSession | null {
  try {
    const value = storage.getItem(STORAGE_KEY);
    if (!value) return null;
    const parsed = sessionSchema.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function saveSellerClassifierCreationSession(
  value: SellerClassifierCreationSession,
  storage: Pick<Storage, "setItem"> = sessionStorage,
): void {
  storage.setItem(STORAGE_KEY, JSON.stringify(sessionSchema.parse(value)));
}

export function clearSellerClassifierCreationSession(
  storage: Pick<Storage, "removeItem"> = sessionStorage,
): void {
  storage.removeItem(STORAGE_KEY);
}

export function newSellerClassifierCreationSession(): SellerClassifierCreationSession {
  return { requestId: crypto.randomUUID() };
}
