const DEFAULT_AUTH_REDIRECT = "/seller";

export function safeAuthRedirect(input: string | undefined): string {
  if (!input) return DEFAULT_AUTH_REDIRECT;
  if (!input.startsWith("/") || input.startsWith("//")) return DEFAULT_AUTH_REDIRECT;

  try {
    const baseUrl = new URL("https://bazoria.invalid");
    const destination = new URL(input, baseUrl);
    if (destination.origin !== baseUrl.origin) return DEFAULT_AUTH_REDIRECT;
    return `${destination.pathname}${destination.search}${destination.hash}`;
  } catch {
    return DEFAULT_AUTH_REDIRECT;
  }
}

export function buildAuthCallbackUrl({
  canonicalSiteOrigin,
  redirect,
}: {
  canonicalSiteOrigin: string;
  redirect?: string;
}): string {
  const callbackUrl = new URL("/auth", canonicalSiteOrigin);
  callbackUrl.searchParams.set("redirect", safeAuthRedirect(redirect));
  return callbackUrl.toString();
}
