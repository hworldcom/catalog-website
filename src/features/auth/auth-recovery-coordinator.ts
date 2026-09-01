import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";

import { getInitializedRuntimePublicConfig } from "@/lib/runtime-public-config";
import { supabase } from "@/lib/supabase/client";

import {
  buildAuthRecoveryMarkerKey,
  markerMatchesValidatedSession,
  parseAuthRecoveryMarker,
  serializeAuthRecoveryMarker,
  type AuthRecoveryMarker,
  type AuthRecoverySessionIdentity,
} from "./auth-recovery-marker";

export type AuthRecoverySnapshot =
  | { status: "inactive" }
  | { status: "invalid" }
  | { status: "active"; userId: string; expiresAt: number };

export interface AuthRecoveryClient {
  getSession(): Promise<{ data: { session: Session | null }; error: unknown }>;
  getUser(): Promise<{ data: { user: User | null }; error: unknown }>;
  onAuthStateChange(callback: (event: AuthChangeEvent, session: Session | null) => void): {
    data: { subscription: { unsubscribe(): void } };
  };
}

interface AuthRecoveryCoordinatorOptions {
  auth: AuthRecoveryClient;
  storage: Storage;
  eventTarget: Pick<Window, "addEventListener" | "removeEventListener">;
  supabaseUrl: string;
  now?: () => number;
}

type AuthRecoverySubscriber = (snapshot: AuthRecoverySnapshot) => void;

export class AuthRecoveryCoordinator {
  readonly markerKey: string;

  private readonly auth: AuthRecoveryClient;
  private readonly storage: Storage;
  private readonly eventTarget: Pick<Window, "addEventListener" | "removeEventListener">;
  private readonly now: () => number;
  private readonly subscribers = new Set<AuthRecoverySubscriber>();
  private snapshot: AuthRecoverySnapshot = { status: "inactive" };
  private authSubscription: { unsubscribe(): void } | null = null;
  private started = false;
  private recoveryUserId: string | null = null;
  private operationQueue = Promise.resolve();
  private expiryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: AuthRecoveryCoordinatorOptions) {
    this.auth = options.auth;
    this.storage = options.storage;
    this.eventTarget = options.eventTarget;
    this.markerKey = buildAuthRecoveryMarkerKey(options.supabaseUrl);
    this.now = options.now ?? (() => Date.now());
  }

  async start(): Promise<AuthRecoverySnapshot> {
    if (!this.started) {
      this.started = true;
      const { data } = this.auth.onAuthStateChange((event, session) => {
        if (event === "PASSWORD_RECOVERY") {
          this.recoveryUserId = session?.user.id ?? null;
        }
        this.enqueueAuthEvent(event, session);
      });
      this.authSubscription = data.subscription;
      this.eventTarget.addEventListener("storage", this.handleStorage);
    }

    return this.refreshFromStorage();
  }

  stop(): void {
    this.authSubscription?.unsubscribe();
    this.authSubscription = null;
    this.eventTarget.removeEventListener("storage", this.handleStorage);
    this.clearExpiryTimer();
    this.started = false;
  }

  subscribe(subscriber: AuthRecoverySubscriber): () => void {
    this.subscribers.add(subscriber);
    return () => this.subscribers.delete(subscriber);
  }

  getSnapshot(): AuthRecoverySnapshot {
    return this.snapshot;
  }

  async validateCurrentRecovery(): Promise<AuthRecoverySnapshot> {
    return this.refreshFromStorage();
  }

  clear(): void {
    this.recoveryUserId = null;
    this.removeMarker();
    this.setSnapshot({ status: "inactive" });
  }

  private readonly handleStorage = (event: StorageEvent): void => {
    if (event.storageArea !== this.storage || event.key !== this.markerKey) return;
    this.enqueue(() => this.refreshFromStorage());
  };

  private enqueueAuthEvent(event: AuthChangeEvent, session: Session | null): void {
    this.enqueue(async () => {
      if (event === "PASSWORD_RECOVERY") {
        await this.activateRecovery(session);
        return;
      }
      if (event === "TOKEN_REFRESHED") {
        await this.handleTokenRefresh(session);
        return;
      }
      if (event === "SIGNED_OUT") {
        this.clear();
        return;
      }
      if (event === "SIGNED_IN") {
        this.handleOrdinarySignIn(session);
      }
    });
  }

  private enqueue(operation: () => void | Promise<void>): void {
    this.operationQueue = this.operationQueue.then(operation, operation);
  }

  private async activateRecovery(eventSession: Session | null): Promise<void> {
    const validated = await this.loadValidatedSession();
    if (!validated || !eventSession || !sessionIdentityMatches(eventSession, validated)) {
      this.invalidate();
      return;
    }

    this.recoveryUserId = validated.userId;
    this.persistActiveMarker(validated);
  }

  private async handleTokenRefresh(eventSession: Session | null): Promise<void> {
    if (this.snapshot.status !== "active" || !eventSession) return;
    if (eventSession.user.id !== this.snapshot.userId) {
      this.invalidate();
      return;
    }

    const validated = await this.loadValidatedSession();
    if (!validated || validated.userId !== this.snapshot.userId) {
      this.invalidate();
      return;
    }
    this.persistActiveMarker(validated);
  }

  private handleOrdinarySignIn(session: Session | null): void {
    if (!this.hasStoredMarker()) return;
    if (session && this.recoveryUserId === session.user.id) return;
    this.clear();
  }

  private async refreshFromStorage(): Promise<AuthRecoverySnapshot> {
    const rawMarker = this.readMarker();
    if (rawMarker === null) {
      this.recoveryUserId = null;
      this.setSnapshot({ status: "inactive" });
      return this.snapshot;
    }

    const marker = parseAuthRecoveryMarker(rawMarker);
    if (!marker) {
      this.invalidate();
      return this.snapshot;
    }

    const validated = await this.loadValidatedSession();
    if (
      !validated ||
      !markerMatchesValidatedSession({
        marker,
        session: validated,
        nowEpochSeconds: this.nowEpochSeconds(),
      })
    ) {
      this.invalidate();
      return this.snapshot;
    }

    this.recoveryUserId = marker.userId;
    this.setActiveSnapshot(marker);
    return this.snapshot;
  }

  private async loadValidatedSession(): Promise<AuthRecoverySessionIdentity | null> {
    try {
      const sessionResult = await this.auth.getSession();
      const session = sessionResult.error ? null : sessionResult.data.session;
      if (!session?.expires_at || session.expires_at <= this.nowEpochSeconds()) return null;

      const userResult = await this.auth.getUser();
      const user = userResult.error ? null : userResult.data.user;
      if (!user || user.id !== session.user.id) return null;

      return { userId: user.id, expiresAt: session.expires_at };
    } catch {
      return null;
    }
  }

  private persistActiveMarker(session: AuthRecoverySessionIdentity): void {
    const marker: AuthRecoveryMarker = {
      version: 1,
      userId: session.userId,
      expiresAt: session.expiresAt,
    };
    try {
      this.storage.setItem(this.markerKey, serializeAuthRecoveryMarker(marker));
      this.setActiveSnapshot(marker);
    } catch {
      this.invalidate();
    }
  }

  private setActiveSnapshot(marker: AuthRecoveryMarker): void {
    this.setSnapshot({
      status: "active",
      userId: marker.userId,
      expiresAt: marker.expiresAt,
    });
    this.scheduleExpiry(marker.expiresAt);
  }

  private invalidate(): void {
    this.recoveryUserId = null;
    this.removeMarker();
    this.setSnapshot({ status: "invalid" });
  }

  private readMarker(): string | null {
    try {
      return this.storage.getItem(this.markerKey);
    } catch {
      return null;
    }
  }

  private hasStoredMarker(): boolean {
    return this.readMarker() !== null;
  }

  private removeMarker(): void {
    try {
      this.storage.removeItem(this.markerKey);
    } catch {
      // Recovery remains blocked by the in-memory invalid snapshot in this tab.
    }
    this.clearExpiryTimer();
  }

  private setSnapshot(next: AuthRecoverySnapshot): void {
    if (snapshotsEqual(this.snapshot, next)) return;
    this.snapshot = next;
    for (const subscriber of this.subscribers) subscriber(next);
  }

  private scheduleExpiry(expiresAt: number): void {
    this.clearExpiryTimer();
    const delay = Math.max(0, expiresAt * 1_000 - this.now());
    this.expiryTimer = setTimeout(
      () => {
        this.expiryTimer = null;
        if (expiresAt <= this.nowEpochSeconds()) {
          this.invalidate();
        } else {
          this.scheduleExpiry(expiresAt);
        }
      },
      Math.min(delay, 2_147_483_647),
    );
  }

  private clearExpiryTimer(): void {
    if (this.expiryTimer !== null) clearTimeout(this.expiryTimer);
    this.expiryTimer = null;
  }

  private nowEpochSeconds(): number {
    return Math.floor(this.now() / 1_000);
  }
}

let applicationCoordinator: AuthRecoveryCoordinator | null = null;

export async function initializeAuthRecoveryCoordinator(): Promise<AuthRecoverySnapshot> {
  return getApplicationCoordinator().start();
}

export function subscribeToAuthRecovery(subscriber: AuthRecoverySubscriber): () => void {
  return getApplicationCoordinator().subscribe(subscriber);
}

export function getAuthRecoverySnapshot(): AuthRecoverySnapshot {
  return getApplicationCoordinator().getSnapshot();
}

export function validateCurrentAuthRecovery(): Promise<AuthRecoverySnapshot> {
  return getApplicationCoordinator().validateCurrentRecovery();
}

export function clearAuthRecoveryState(): void {
  getApplicationCoordinator().clear();
}

export function resetAuthRecoveryCoordinatorForTests(): void {
  applicationCoordinator?.stop();
  applicationCoordinator = null;
}

function getApplicationCoordinator(): AuthRecoveryCoordinator {
  if (applicationCoordinator) return applicationCoordinator;
  if (typeof window === "undefined") {
    throw new Error("Authentication recovery coordination requires a browser environment.");
  }
  const { supabaseUrl } = getInitializedRuntimePublicConfig();
  applicationCoordinator = new AuthRecoveryCoordinator({
    auth: supabase.auth,
    storage: window.localStorage,
    eventTarget: window,
    supabaseUrl,
  });
  return applicationCoordinator;
}

function sessionIdentityMatches(session: Session, identity: AuthRecoverySessionIdentity): boolean {
  return session.user.id === identity.userId && session.expires_at === identity.expiresAt;
}

function snapshotsEqual(left: AuthRecoverySnapshot, right: AuthRecoverySnapshot): boolean {
  if (left.status !== right.status) return false;
  if (left.status !== "active" || right.status !== "active") return true;
  return left.userId === right.userId && left.expiresAt === right.expiresAt;
}
