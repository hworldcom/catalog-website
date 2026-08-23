import { getSupabaseAccessToken } from "@/lib/supabase/client";

export type ClassifierImportStatus =
  "pending" | "running" | "completed" | "completed_with_errors" | "failed";

export type ClassifierImportGroupStatus = "pending" | "processing" | "complete" | "failed";

export type ClassifierImportSnapshot = {
  importId: string;
  classifierBatchId: string;
  destinationSeller: {
    id: string;
    name: string | null;
  };
  status: ClassifierImportStatus;
  operationKind: "import" | "reconcile";
  errorCode: string | null;
  pendingGroupCount: number;
  processingGroupCount: number;
  completeGroupCount: number;
  failedGroupCount: number;
  actions: {
    canDispatch: boolean;
    canRetryTemporary: boolean;
    canRetryAll: boolean;
    canReconcile: boolean;
  };
  groups: {
    classifierGroupId: string;
    productDraftId: string | null;
    status: ClassifierImportGroupStatus;
    errorCode: string | null;
  }[];
};

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type AccessTokenProvider = () => Promise<string | null>;

export class ClassifierImportRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly importId?: string,
  ) {
    super(message);
    this.name = "ClassifierImportRequestError";
  }
}

export type ClassifierImportClient = ReturnType<typeof createClassifierImportClient>;

export function createClassifierImportClient(
  fetcher: Fetcher = globalThis.fetch.bind(globalThis),
  getAccessToken: AccessTokenProvider = getSupabaseAccessToken,
) {
  return {
    getStatus(importId: string, signal?: AbortSignal): Promise<ClassifierImportSnapshot> {
      return request(fetcher, getAccessToken, importPath(importId), { signal });
    },

    retry(importId: string, includeNonRetryable: boolean): Promise<ClassifierImportSnapshot> {
      const init: RequestInit = { method: "POST" };
      if (includeNonRetryable) {
        init.headers = { "Content-Type": "application/json" };
        init.body = JSON.stringify({ includeNonRetryable: true });
      }
      return request(fetcher, getAccessToken, `${importPath(importId)}/retry`, init);
    },

    reconcile(importId: string): Promise<ClassifierImportSnapshot> {
      return request(fetcher, getAccessToken, `${importPath(importId)}/reconcile`, {
        method: "POST",
      });
    },

    dispatch(importId: string): Promise<ClassifierImportSnapshot> {
      return request(fetcher, getAccessToken, `${importPath(importId)}/dispatch`, {
        method: "POST",
      });
    },
  };
}

export function classifierImportErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "The classifier import request failed.";
}

async function request<T>(
  fetcher: Fetcher,
  getAccessToken: AccessTokenProvider,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const token = await getAccessToken();
  const response = await fetcher(path, withAccessToken(init, token));
  const payload = await readJson(response);

  if (!response.ok) {
    const detail = isRecord(payload) && isRecord(payload.detail) ? payload.detail : undefined;
    const code = typeof detail?.code === "string" ? detail.code : "classifier_import_unavailable";
    const message =
      typeof detail?.message === "string"
        ? detail.message
        : "The classifier import request failed.";
    const importId = typeof detail?.importId === "string" ? detail.importId : undefined;
    throw new ClassifierImportRequestError(response.status, code, message, importId);
  }

  return payload as T;
}

function withAccessToken(
  init: RequestInit | undefined,
  token: string | null,
): RequestInit | undefined {
  if (!token) return init;

  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${token}`);
  return { ...init, headers };
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    if (response.ok) {
      throw new ClassifierImportRequestError(
        response.status,
        "classifier_import_response_invalid",
        "The classifier import response was invalid.",
      );
    }
    return null;
  }
}

function importPath(importId: string): string {
  return `/v1/admin/classifier-imports/${encodeURIComponent(importId)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
