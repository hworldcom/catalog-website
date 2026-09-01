export const AUTH_RECOVERY_MARKER_SCHEMA_VERSION = 1 as const;
export const AUTH_RECOVERY_MARKER_PREFIX = "bazoria.auth.recovery.v1:";

export interface AuthRecoveryMarker {
  version: typeof AUTH_RECOVERY_MARKER_SCHEMA_VERSION;
  userId: string;
  expiresAt: number;
}

export interface AuthRecoverySessionIdentity {
  userId: string;
  expiresAt: number;
}

export function buildAuthRecoveryMarkerKey(supabaseUrl: string): string {
  return `${AUTH_RECOVERY_MARKER_PREFIX}${new URL(supabaseUrl).host.toLowerCase()}`;
}

export function serializeAuthRecoveryMarker(marker: AuthRecoveryMarker): string {
  return JSON.stringify({
    version: AUTH_RECOVERY_MARKER_SCHEMA_VERSION,
    userId: marker.userId,
    expiresAt: marker.expiresAt,
  });
}

export function parseAuthRecoveryMarker(value: string | null): AuthRecoveryMarker | null {
  if (value === null) return null;

  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    if (Object.keys(parsed).sort().join(",") !== "expiresAt,userId,version") return null;
    if (parsed.version !== AUTH_RECOVERY_MARKER_SCHEMA_VERSION) return null;
    if (typeof parsed.userId !== "string" || parsed.userId.length === 0) return null;
    if (!Number.isInteger(parsed.expiresAt) || Number(parsed.expiresAt) <= 0) return null;

    return {
      version: AUTH_RECOVERY_MARKER_SCHEMA_VERSION,
      userId: parsed.userId,
      expiresAt: Number(parsed.expiresAt),
    };
  } catch {
    return null;
  }
}

export function markerMatchesValidatedSession({
  marker,
  session,
  nowEpochSeconds,
}: {
  marker: AuthRecoveryMarker;
  session: AuthRecoverySessionIdentity;
  nowEpochSeconds: number;
}): boolean {
  return (
    marker.userId === session.userId &&
    marker.expiresAt === session.expiresAt &&
    marker.expiresAt > nowEpochSeconds
  );
}
