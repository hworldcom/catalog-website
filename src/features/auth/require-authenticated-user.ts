import { redirect } from "@tanstack/react-router";

import { supabase } from "@/lib/supabase/client";

export async function requireAuthenticatedUser(location: { href: string }) {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    throw redirect({
      to: "/auth",
      search: { redirect: location.href },
    });
  }
  return { user: data.user };
}
