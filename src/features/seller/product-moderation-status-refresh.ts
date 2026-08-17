import { useCallback, useEffect, useRef, useState } from "react";

import type {
  ProductModerationStatusDetail,
  ProductModerationSubmittedImage,
} from "./product-moderation-status.types";

export const PRODUCT_MODERATION_POLL_INTERVAL_MS = 2_000;
export const PRODUCT_MODERATION_IMAGE_REFRESH_MARGIN_MS = 15_000;
const FOREGROUND_READ_DEBOUNCE_MS = 50;
const MAXIMUM_TIMER_DELAY_MS = 2_147_483_647;

const pollableActivationStates = new Set([
  "waiting_for_dispatch",
  "publishing",
  "abandonment_cleanup",
  "public_cleanup",
]);

type ProductModerationStatusRefreshOptions = {
  status: ProductModerationStatusDetail;
  readStatus(): Promise<ProductModerationStatusDetail>;
  onStatus(status: ProductModerationStatusDetail): void;
};

export function useProductModerationStatusRefresh({
  status,
  readStatus,
  onStatus,
}: ProductModerationStatusRefreshOptions) {
  const statusRef = useRef(status);
  const readStatusRef = useRef(readStatus);
  const onStatusRef = useRef(onStatus);
  const inFlightRef = useRef<Promise<ProductModerationStatusDetail> | null>(null);
  const foregroundTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const failedReadRef = useRef(false);
  const mountedRef = useRef(true);
  const automaticFailureAttemptsRef = useRef(new Set<string>());
  const automaticExpiryAttemptsRef = useRef(new Set<string>());
  const [failedCredentialIdentities, setFailedCredentialIdentities] = useState<Set<string>>(
    () => new Set(),
  );
  const [refreshing, setRefreshing] = useState(false);
  const [readWarning, setReadWarning] = useState(false);
  const [visible, setVisible] = useState(() =>
    typeof document === "undefined" ? true : document.visibilityState === "visible",
  );

  statusRef.current = status;
  readStatusRef.current = readStatus;
  onStatusRef.current = onStatus;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const requestStatus = useCallback((): Promise<ProductModerationStatusDetail> => {
    if (inFlightRef.current) return inFlightRef.current;

    if (mountedRef.current) setRefreshing(true);
    const request = Promise.resolve()
      .then(() => readStatusRef.current())
      .then((next) => {
        failedReadRef.current = false;
        if (mountedRef.current) {
          setReadWarning(false);
          onStatusRef.current(next);
        }
        return next;
      })
      .catch((error: unknown) => {
        failedReadRef.current = true;
        if (mountedRef.current) setReadWarning(true);
        throw error;
      })
      .finally(() => {
        if (inFlightRef.current === request) inFlightRef.current = null;
        if (mountedRef.current) setRefreshing(false);
      });
    inFlightRef.current = request;
    return request;
  }, []);

  const markCredentialsFailed = useCallback((identities: string[]) => {
    if (!mountedRef.current || identities.length === 0) return;
    setFailedCredentialIdentities((current) => {
      const next = new Set(current);
      for (const identity of identities) next.add(identity);
      return next;
    });
  }, []);

  useEffect(() => {
    const clearForegroundTimer = () => {
      if (foregroundTimerRef.current === null) return;
      clearTimeout(foregroundTimerRef.current);
      foregroundTimerRef.current = null;
    };
    const scheduleForegroundRead = () => {
      if (document.visibilityState !== "visible") return;
      clearForegroundTimer();
      foregroundTimerRef.current = setTimeout(() => {
        foregroundTimerRef.current = null;
        if (
          document.visibilityState === "visible" &&
          shouldRefreshProductModerationOnForeground(
            statusRef.current,
            failedReadRef.current,
            automaticExpiryAttemptsRef.current,
            Date.now(),
          )
        ) {
          void requestStatus().catch(() => undefined);
        }
      }, FOREGROUND_READ_DEBOUNCE_MS);
    };
    const handleVisibility = () => {
      const nextVisible = document.visibilityState === "visible";
      setVisible(nextVisible);
      if (!nextVisible) {
        clearForegroundTimer();
        return;
      }
      scheduleForegroundRead();
    };

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", scheduleForegroundRead);
    return () => {
      clearForegroundTimer();
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", scheduleForegroundRead);
    };
  }, [requestStatus]);

  useEffect(() => {
    if (!visible || !shouldPollProductModerationStatus(status)) return;
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") {
        void requestStatus().catch(() => undefined);
      }
    }, PRODUCT_MODERATION_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [requestStatus, status, visible]);

  useEffect(() => {
    if (!visible) return;
    const next = earliestUnattemptedCredentialRefresh(status, automaticExpiryAttemptsRef.current);
    if (!next) return;

    const timer = setTimeout(
      () => {
        if (document.visibilityState !== "visible") return;
        const due = dueUnattemptedCredentials(
          statusRef.current,
          automaticExpiryAttemptsRef.current,
          Date.now(),
        );
        if (due.length === 0) return;
        for (const identity of due) automaticExpiryAttemptsRef.current.add(identity);
        void requestStatus().catch(() => markCredentialsFailed(due));
      },
      Math.min(Math.max(0, next.refreshAt - Date.now()), MAXIMUM_TIMER_DELAY_MS),
    );
    return () => clearTimeout(timer);
  }, [markCredentialsFailed, requestStatus, status, visible]);

  const handleImageError = useCallback(
    (submissionId: string, image: ProductModerationSubmittedImage) => {
      const identity = productModerationImageCredentialIdentity(submissionId, image);
      if (!identity || automaticFailureAttemptsRef.current.has(identity)) return;
      automaticFailureAttemptsRef.current.add(identity);
      markCredentialsFailed([identity]);
      void requestStatus().catch(() => undefined);
    },
    [markCredentialsFailed, requestStatus],
  );

  return {
    failedCredentialIdentities,
    handleImageError,
    readWarning,
    refreshStatus: requestStatus,
    refreshing,
  };
}

export function shouldPollProductModerationStatus(status: ProductModerationStatusDetail): boolean {
  return Boolean(status.activation && pollableActivationStates.has(status.activation.displayState));
}

export function productModerationImageCredentialIdentity(
  submissionId: string,
  image: ProductModerationSubmittedImage,
): string | null {
  if (
    image.deliveryStatus !== "available" ||
    image.url === null ||
    image.expiresAt === null ||
    !Number.isFinite(Date.parse(image.expiresAt))
  ) {
    return null;
  }
  return `${submissionId}:${image.productDraftImageId}:${image.expiresAt}`;
}

function shouldRefreshProductModerationOnForeground(
  status: ProductModerationStatusDetail,
  failedRead: boolean,
  attemptedExpiryCredentials: ReadonlySet<string>,
  now: number,
): boolean {
  return (
    failedRead ||
    shouldPollProductModerationStatus(status) ||
    status.review?.status === "pending" ||
    dueUnattemptedCredentials(status, attemptedExpiryCredentials, now).length > 0
  );
}

function earliestUnattemptedCredentialRefresh(
  status: ProductModerationStatusDetail,
  attempted: ReadonlySet<string>,
): { identity: string; refreshAt: number } | null {
  let earliest: { identity: string; refreshAt: number } | null = null;
  const submitted = status.submittedRevision;
  if (!submitted) return null;
  for (const image of submitted.images) {
    const identity = productModerationImageCredentialIdentity(submitted.submissionId, image);
    if (!identity || attempted.has(identity) || image.expiresAt === null) continue;
    const refreshAt = Date.parse(image.expiresAt) - PRODUCT_MODERATION_IMAGE_REFRESH_MARGIN_MS;
    if (!earliest || refreshAt < earliest.refreshAt) earliest = { identity, refreshAt };
  }
  return earliest;
}

function dueUnattemptedCredentials(
  status: ProductModerationStatusDetail,
  attempted: ReadonlySet<string>,
  now: number,
): string[] {
  const submitted = status.submittedRevision;
  if (!submitted) return [];
  return submitted.images.flatMap((image) => {
    const identity = productModerationImageCredentialIdentity(submitted.submissionId, image);
    if (!identity || attempted.has(identity) || image.expiresAt === null) return [];
    return Date.parse(image.expiresAt) - PRODUCT_MODERATION_IMAGE_REFRESH_MARGIN_MS <= now
      ? [identity]
      : [];
  });
}
