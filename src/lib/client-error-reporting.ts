export type ClientErrorContext = Record<string, unknown>;

export function reportClientError(error: unknown, context: ClientErrorContext = {}) {
  if (typeof window === "undefined") return;

  console.error("Client error", error, {
    route: window.location.pathname,
    ...context,
  });
}
