export type DelegatedBrowserActionType =
  | "approve_group"
  | "approve_and_create_drafts"
  | "retry_draft_import"
  | "publish_product_draft"
  | "retry_product_publication";

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

type DelegatedActionRequestDependencies = {
  createRequestId?: () => string;
  getStorage?: () => StorageLike | null;
};

export type DelegatedActionRequestRecord<TPayload = unknown> = {
  version: 1;
  requestId: string;
  normalizedPayload: TPayload | null;
};

type DelegatedActionScope = {
  workflowId: string;
  actionType: DelegatedBrowserActionType;
  target: string;
};

type RunDelegatedActionInput<TResult, TPayload> = DelegatedActionScope & {
  newRequest?: boolean;
  normalizedPayload?: TPayload;
  execute: (requestId: string, normalizedPayload: TPayload | null) => Promise<TResult>;
};

const TERMINAL_SAFE_FAILURES = new Set([
  "delegated_review_invalid",
  "delegated_review_resource_not_found",
  "delegated_review_not_allowed",
  "delegated_import_retry_not_allowed",
  "delegated_upload_workflow_not_found",
  "delegated_product_draft_invalid",
  "delegated_product_draft_not_found",
  "delegated_product_draft_not_editable",
  "product_publication_invalid",
  "product_not_found",
  "product_publication_title_required",
  "product_publication_title_invalid",
  "product_publication_description_invalid",
  "product_publication_category_required",
  "product_publication_image_required",
  "product_publication_images_not_ready",
  "product_publication_in_progress",
  "product_publication_not_allowed",
]);

export class DelegatedActionRequestManager {
  private readonly fallback = new Map<string, DelegatedActionRequestRecord>();
  private readonly createRequestId: () => string;
  private readonly getStorage: () => StorageLike | null;

  constructor(dependencies: DelegatedActionRequestDependencies = {}) {
    this.createRequestId = dependencies.createRequestId ?? (() => crypto.randomUUID());
    this.getStorage =
      dependencies.getStorage ??
      (() => {
        if (typeof window === "undefined") return null;
        return window.sessionStorage;
      });
  }

  async run<TResult, TPayload = undefined>(
    input: RunDelegatedActionInput<TResult, TPayload>,
  ): Promise<TResult> {
    const key = delegatedActionStorageKey(input);
    if (input.newRequest) this.remove(key);

    const record =
      this.read<TPayload>(key) ??
      this.createAndStore(
        key,
        input.normalizedPayload === undefined ? null : input.normalizedPayload,
      );
    try {
      const result = await input.execute(record.requestId, record.normalizedPayload);
      this.remove(key);
      return result;
    } catch (error) {
      if (TERMINAL_SAFE_FAILURES.has(errorCode(error) ?? "")) this.remove(key);
      throw error;
    }
  }

  getPending<TPayload = unknown>(
    scope: DelegatedActionScope,
  ): DelegatedActionRequestRecord<TPayload> | null {
    return this.read<TPayload>(delegatedActionStorageKey(scope));
  }

  discardPending(scope: DelegatedActionScope): void {
    this.remove(delegatedActionStorageKey(scope));
  }

  private createAndStore<TPayload>(
    key: string,
    normalizedPayload: TPayload | null,
  ): DelegatedActionRequestRecord<TPayload> {
    const record: DelegatedActionRequestRecord<TPayload> = {
      version: 1,
      requestId: this.createRequestId(),
      normalizedPayload,
    };
    this.fallback.set(key, record);
    try {
      this.getStorage()?.setItem(key, JSON.stringify(record));
    } catch {
      // Component-lifetime memory remains available when session storage is blocked.
    }
    return record;
  }

  private read<TPayload>(key: string): DelegatedActionRequestRecord<TPayload> | null {
    try {
      const stored = this.getStorage()?.getItem(key);
      if (stored) {
        const record = parseStoredRecord<TPayload>(stored);
        if (!record) {
          this.remove(key);
          return null;
        }
        this.fallback.set(key, record);
        return record;
      }
    } catch {
      // Fall back to component-lifetime memory.
    }
    return (this.fallback.get(key) as DelegatedActionRequestRecord<TPayload> | undefined) ?? null;
  }

  private remove(key: string): void {
    this.fallback.delete(key);
    try {
      this.getStorage()?.removeItem(key);
    } catch {
      // The fallback was still cleared.
    }
  }
}

export function delegatedActionStorageKey(input: {
  workflowId: string;
  actionType: DelegatedBrowserActionType;
  target: string;
}): string {
  return `bazoria:delegated-action:${input.workflowId}:${input.actionType}:${input.target}`;
}

function errorCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("code" in error)) return null;
  return typeof error.code === "string" ? error.code : null;
}

function parseStoredRecord<TPayload>(value: string): DelegatedActionRequestRecord<TPayload> | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("version" in parsed) ||
      parsed.version !== 1 ||
      !("requestId" in parsed) ||
      typeof parsed.requestId !== "string" ||
      !("normalizedPayload" in parsed)
    ) {
      return null;
    }
    return parsed as DelegatedActionRequestRecord<TPayload>;
  } catch {
    // Pre-0029i4 string-only records are unsupported because they cannot
    // prove which publication payload should be replayed.
    return null;
  }
}
