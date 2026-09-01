import { isAuthRetryableFetchError } from "@supabase/supabase-js";
import { z } from "zod";

import { normalizeLanguage, type Lang } from "@/lib/i18n";

import { safeAuthRedirect } from "./auth-redirect";

const emailSchema = z.string().trim().email();

export type PasswordResetRequestResult =
  { status: "invalid_email" } | { status: "accepted" } | { status: "delivery_unavailable" };

export interface PasswordResetAuthClient {
  resetPasswordForEmail(
    email: string,
    options: { redirectTo: string },
  ): Promise<{ error: unknown }>;
}

export function buildPasswordRecoveryCallbackUrl({
  canonicalSiteOrigin,
  lang,
  redirect,
}: {
  canonicalSiteOrigin: string;
  lang: unknown;
  redirect?: string;
}): string {
  const callbackUrl = new URL("/auth/recovery", canonicalSiteOrigin);
  callbackUrl.searchParams.set("lang", normalizeLanguage(lang));
  callbackUrl.searchParams.set("redirect", safeAuthRedirect(redirect));
  return callbackUrl.toString();
}

export async function requestPasswordReset({
  auth,
  email,
  canonicalSiteOrigin,
  lang,
  redirect,
}: {
  auth: PasswordResetAuthClient;
  email: string;
  canonicalSiteOrigin: string;
  lang: Lang;
  redirect?: string;
}): Promise<PasswordResetRequestResult> {
  const parsedEmail = emailSchema.safeParse(email);
  if (!parsedEmail.success) return { status: "invalid_email" };

  const redirectTo = buildPasswordRecoveryCallbackUrl({
    canonicalSiteOrigin,
    lang,
    redirect,
  });

  try {
    const { error } = await auth.resetPasswordForEmail(parsedEmail.data, { redirectTo });
    return isDefiniteBrowserTransportFailure(error)
      ? { status: "delivery_unavailable" }
      : { status: "accepted" };
  } catch (error) {
    return isDefiniteBrowserTransportFailure(error)
      ? { status: "delivery_unavailable" }
      : { status: "accepted" };
  }
}

function isDefiniteBrowserTransportFailure(error: unknown): boolean {
  return isAuthRetryableFetchError(error) && error.status === 0;
}
