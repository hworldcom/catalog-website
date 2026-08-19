import { useCallback, useEffect, useRef, useState } from "react";

import type { ProductActivationDisplayState } from "@/features/seller/product-moderation-status.types";

export const READ_ONLY_MODERATION_POLL_INTERVAL_MS = 2_000;
export const READ_ONLY_MODERATION_IMAGE_REFRESH_MARGIN_MS = 15_000;
const FOREGROUND_READ_DEBOUNCE_MS = 50;
const MAXIMUM_TIMER_DELAY_MS = 2_147_483_647;

const pollableActivationStates = new Set<ProductActivationDisplayState>([
  "waiting_for_dispatch",
  "publishing",
  "abandonment_cleanup",
  "public_cleanup",
]);

export type ReadOnlyModerationImageCredential = {
  productDraftImageId: string;
  deliveryStatus: string;
  url: string | null;
  expiresAt: string | null;
};

export type ReadOnlyModerationDescriptor = {
  activationDisplayState: ProductActivationDisplayState | null;
  reviewStatus: string | null;
  imageCredentials: ReadonlyArray<{
    submissionId: string;
    image: ReadOnlyModerationImageCredential;
  }>;
};

type ReadOnlyModerationRefreshOptions<TDetail> = {
  detail: TDetail;
  readDetail(): Promise<TDetail>;
  onDetail(detail: TDetail): void;
  describe(detail: TDetail): ReadOnlyModerationDescriptor;
};

export function useReadOnlyModerationRefresh<TDetail>({
  detail,
  readDetail,
  onDetail,
  describe,
}: ReadOnlyModerationRefreshOptions<TDetail>) {
  const detailRef = useRef(detail);
  const readDetailRef = useRef(readDetail);
  const onDetailRef = useRef(onDetail);
  const describeRef = useRef(describe);
  const inFlightRef = useRef<Promise<TDetail> | null>(null);
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

  detailRef.current = detail;
  readDetailRef.current = readDetail;
  onDetailRef.current = onDetail;
  describeRef.current = describe;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const requestDetail = useCallback((): Promise<TDetail> => {
    if (inFlightRef.current) return inFlightRef.current;

    if (mountedRef.current) setRefreshing(true);
    const request = Promise.resolve()
      .then(() => readDetailRef.current())
      .then((next) => {
        failedReadRef.current = false;
        if (mountedRef.current) {
          setReadWarning(false);
          onDetailRef.current(next);
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
          shouldRefreshOnForeground(
            describeRef.current(detailRef.current),
            failedReadRef.current,
            automaticExpiryAttemptsRef.current,
            Date.now(),
          )
        ) {
          void requestDetail().catch(() => undefined);
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
  }, [requestDetail]);

  useEffect(() => {
    const descriptor = describe(detail);
    if (!visible || !shouldPollReadOnlyModeration(descriptor)) return;
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") {
        void requestDetail().catch(() => undefined);
      }
    }, READ_ONLY_MODERATION_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [describe, detail, requestDetail, visible]);

  useEffect(() => {
    if (!visible) return;
    const descriptor = describe(detail);
    const next = earliestUnattemptedCredentialRefresh(
      descriptor,
      automaticExpiryAttemptsRef.current,
    );
    if (!next) return;

    const timer = setTimeout(
      () => {
        if (document.visibilityState !== "visible") return;
        const due = dueUnattemptedCredentials(
          describeRef.current(detailRef.current),
          automaticExpiryAttemptsRef.current,
          Date.now(),
        );
        if (due.length === 0) return;
        for (const identity of due) automaticExpiryAttemptsRef.current.add(identity);
        void requestDetail().catch(() => markCredentialsFailed(due));
      },
      Math.min(Math.max(0, next.refreshAt - Date.now()), MAXIMUM_TIMER_DELAY_MS),
    );
    return () => clearTimeout(timer);
  }, [describe, detail, markCredentialsFailed, requestDetail, visible]);

  const handleImageError = useCallback(
    (submissionId: string, image: ReadOnlyModerationImageCredential) => {
      const identity = readOnlyModerationImageCredentialIdentity(submissionId, image);
      if (!identity || automaticFailureAttemptsRef.current.has(identity)) return;
      automaticFailureAttemptsRef.current.add(identity);
      markCredentialsFailed([identity]);
      void requestDetail().catch(() => undefined);
    },
    [markCredentialsFailed, requestDetail],
  );

  return {
    failedCredentialIdentities,
    handleImageError,
    readWarning,
    refreshDetail: requestDetail,
    refreshing,
  };
}

export function shouldPollReadOnlyModeration(descriptor: ReadOnlyModerationDescriptor): boolean {
  return Boolean(
    descriptor.activationDisplayState &&
    pollableActivationStates.has(descriptor.activationDisplayState),
  );
}

export function readOnlyModerationImageCredentialIdentity(
  submissionId: string,
  image: ReadOnlyModerationImageCredential,
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

function shouldRefreshOnForeground(
  descriptor: ReadOnlyModerationDescriptor,
  failedRead: boolean,
  attemptedExpiryCredentials: ReadonlySet<string>,
  now: number,
): boolean {
  return (
    failedRead ||
    shouldPollReadOnlyModeration(descriptor) ||
    descriptor.reviewStatus === "pending" ||
    dueUnattemptedCredentials(descriptor, attemptedExpiryCredentials, now).length > 0
  );
}

function earliestUnattemptedCredentialRefresh(
  descriptor: ReadOnlyModerationDescriptor,
  attempted: ReadonlySet<string>,
): { identity: string; refreshAt: number } | null {
  let earliest: { identity: string; refreshAt: number } | null = null;
  for (const credential of descriptor.imageCredentials) {
    const { image, submissionId } = credential;
    const identity = readOnlyModerationImageCredentialIdentity(submissionId, image);
    if (!identity || attempted.has(identity) || image.expiresAt === null) continue;
    const refreshAt = Date.parse(image.expiresAt) - READ_ONLY_MODERATION_IMAGE_REFRESH_MARGIN_MS;
    if (!earliest || refreshAt < earliest.refreshAt) earliest = { identity, refreshAt };
  }
  return earliest;
}

function dueUnattemptedCredentials(
  descriptor: ReadOnlyModerationDescriptor,
  attempted: ReadonlySet<string>,
  now: number,
): string[] {
  return descriptor.imageCredentials.flatMap(({ image, submissionId }) => {
    const identity = readOnlyModerationImageCredentialIdentity(submissionId, image);
    if (!identity || attempted.has(identity) || image.expiresAt === null) return [];
    return Date.parse(image.expiresAt) - READ_ONLY_MODERATION_IMAGE_REFRESH_MARGIN_MS <= now
      ? [identity]
      : [];
  });
}
