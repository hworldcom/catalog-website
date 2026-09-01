import { redirect } from "@tanstack/react-router";

import { normalizeLanguage } from "@/lib/i18n";
import { supabase } from "@/lib/supabase/client";

import { validateCurrentAuthRecovery } from "./auth-recovery-coordinator";
import { safeAuthRedirect } from "./auth-redirect";

export async function requireAuthenticatedUser(location: { href: string }) {
  const sessionResult = await supabase.auth.getSession();
  const userResult = await supabase.auth.getUser();
  if (
    sessionResult.error ||
    !sessionResult.data.session ||
    userResult.error ||
    !userResult.data.user ||
    sessionResult.data.session.user.id !== userResult.data.user.id
  ) {
    throw redirect({
      to: "/auth",
      search: { redirect: location.href },
    });
  }

  const recovery = await validateCurrentAuthRecovery();
  if (recovery.status === "active") {
    throw redirect({
      to: "/auth/recovery",
      search: {
        lang: languageFromLocation(location.href),
        redirect: safeAuthRedirect(location.href),
      },
    });
  }

  return { user: userResult.data.user };
}

function languageFromLocation(href: string) {
  try {
    return normalizeLanguage(new URL(href, "https://bazoria.invalid").searchParams.get("lang"));
  } catch {
    return "EN" as const;
  }
}
