import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { supabase } from "@/lib/supabase/client";

export function SellerShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="storefront-dark min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b border-border/60 bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center border border-primary/50 bg-primary/10 font-display text-sm font-bold text-primary">
              B
            </span>
            <span className="font-display text-lg font-semibold tracking-tight">Bazoria</span>
            <span className="ml-2 hidden text-xs text-muted-foreground sm:inline">Seller</span>
          </Link>
          <button onClick={signOut} className="text-xs text-muted-foreground hover:text-foreground">
            Sign out
          </button>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
