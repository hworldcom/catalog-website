import { useCallback, useMemo, useRef, useState } from "react";

export type ProductModerationMutationCoordinator = {
  revision: number;
  busy: boolean;
  run<T>(
    operation: (expectedRevision: number) => Promise<T>,
    revisionFromResult: (result: T) => number,
  ): Promise<T>;
  replaceRevision(revision: number): void;
};

export class ProductModerationMutationInProgressError extends Error {
  readonly code = "product_moderation_mutation_in_progress";

  constructor() {
    super("Another private product change is still being saved.");
    this.name = "ProductModerationMutationInProgressError";
  }
}

export function useProductModerationMutationCoordinator(
  initialRevision: number,
  onRevisionChange?: (revision: number) => void,
): ProductModerationMutationCoordinator {
  const revisionRef = useRef(initialRevision);
  const lockRef = useRef(false);
  const [revision, setRevision] = useState(initialRevision);
  const [busy, setBusy] = useState(false);

  const replaceRevision = useCallback(
    (nextRevision: number) => {
      if (!Number.isSafeInteger(nextRevision) || nextRevision < 1) {
        throw new Error("The moderation revision is invalid.");
      }
      revisionRef.current = nextRevision;
      setRevision(nextRevision);
      onRevisionChange?.(nextRevision);
    },
    [onRevisionChange],
  );

  const run = useCallback(
    async <T>(
      operation: (expectedRevision: number) => Promise<T>,
      revisionFromResult: (result: T) => number,
    ) => {
      if (lockRef.current) throw new ProductModerationMutationInProgressError();
      lockRef.current = true;
      setBusy(true);
      try {
        const result = await operation(revisionRef.current);
        replaceRevision(revisionFromResult(result));
        return result;
      } finally {
        lockRef.current = false;
        setBusy(false);
      }
    },
    [replaceRevision],
  );

  return useMemo(
    () => ({ revision, busy, run, replaceRevision }),
    [busy, replaceRevision, revision, run],
  );
}
