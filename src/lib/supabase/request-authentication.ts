import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./types";

export type SupabaseAuthenticationErrorCode =
  "authentication_required" | "authentication_configuration_invalid";

export class SupabaseAuthenticationError extends Error {
  constructor(
    public readonly statusCode: 401 | 500,
    public readonly code: SupabaseAuthenticationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "SupabaseAuthenticationError";
  }
}

export type AuthenticatedSupabaseRequest = {
  supabase: SupabaseClient<Database>;
  userId: string;
  claims: Record<string, unknown>;
};

export async function authenticateSupabaseRequest(
  request: Request | undefined,
): Promise<AuthenticatedSupabaseRequest> {
  const config = readSupabaseAuthenticationConfig();
  const token = readBearerToken(request);
  const supabase = createAuthenticatedClient(config, token);
  const { data, error } = await supabase.auth.getClaims(token);

  if (error || !data?.claims || typeof data.claims.sub !== "string") {
    throw authenticationRequired();
  }

  return {
    supabase,
    userId: data.claims.sub,
    claims: data.claims as unknown as Record<string, unknown>,
  };
}

export function readBearerToken(request: Request | undefined): string {
  const value = request?.headers.get("authorization");
  if (!value) throw authenticationRequired();

  const match = /^Bearer ([^\s]+)$/.exec(value);
  if (!match || match[1].split(".").length !== 3) {
    throw authenticationRequired();
  }

  return match[1];
}

function readSupabaseAuthenticationConfig(): {
  supabaseUrl: string;
  publishableKey: string;
} {
  const supabaseUrl = process.env.SUPABASE_URL?.trim();
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY?.trim();

  if (!supabaseUrl || !publishableKey) {
    throw new SupabaseAuthenticationError(
      500,
      "authentication_configuration_invalid",
      "Authentication is not configured.",
    );
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(supabaseUrl);
  } catch {
    throw new SupabaseAuthenticationError(
      500,
      "authentication_configuration_invalid",
      "Authentication is not configured.",
    );
  }
  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    throw new SupabaseAuthenticationError(
      500,
      "authentication_configuration_invalid",
      "Authentication is not configured.",
    );
  }

  return { supabaseUrl: parsedUrl.toString(), publishableKey };
}

function createAuthenticatedClient(
  config: { supabaseUrl: string; publishableKey: string },
  token: string,
): SupabaseClient<Database> {
  return createClient<Database>(config.supabaseUrl, config.publishableKey, {
    global: {
      fetch: createSupabaseFetch(config.publishableKey),
      headers: { Authorization: `Bearer ${token}` },
    },
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function createSupabaseFetch(supabaseKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );

    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }

    if (
      isOpaqueSupabaseKey(supabaseKey) &&
      headers.get("Authorization") === `Bearer ${supabaseKey}`
    ) {
      headers.delete("Authorization");
    }

    headers.set("apikey", supabaseKey);
    return fetch(input, { ...init, headers });
  };
}

function isOpaqueSupabaseKey(value: string): boolean {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

function authenticationRequired(): SupabaseAuthenticationError {
  return new SupabaseAuthenticationError(
    401,
    "authentication_required",
    "Authentication is required.",
  );
}
