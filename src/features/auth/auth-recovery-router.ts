import { subscribeToAuthRecovery, type AuthRecoverySnapshot } from "./auth-recovery-coordinator";

export function subscribeToAuthRecoveryRouterInvalidation({
  invalidate,
  subscribe = subscribeToAuthRecovery,
}: {
  invalidate: () => void | Promise<void>;
  subscribe?: (subscriber: (snapshot: AuthRecoverySnapshot) => void) => () => void;
}): () => void {
  return subscribe(() => {
    void invalidate();
  });
}
