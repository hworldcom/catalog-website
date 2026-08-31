import { createServerFn } from "@tanstack/react-start";
import { requireClassifierAssistedUpload } from "@/features/classifier-release/classifier-assisted-upload.middleware";

import {
  delegatedUploadUnavailable,
  DelegatedClassifierUploadError,
  parseCreateDelegatedClassifierBatchInput,
  parseDelegatedClassifierCommandInput,
  parseDelegatedClassifierWorkflowInput,
  parseDelegatedRegisterUploadsInput,
  parseDelegatedRetryUploadsInput,
  parseDelegatedUploadSellerSearchRequest,
} from "./delegated-classifier-upload.types";
import { SellerClassifierBatchError } from "@/features/seller-classifier/seller-classifier-batch.types";
import {
  requirePrototypeAdministrator,
  type PrototypeAdministratorRequestContext,
} from "./prototype-administrator.middleware";

export const searchDelegatedUploadSellers = createServerFn({ method: "GET" })
  .middleware([requirePrototypeAdministrator, requireClassifierAssistedUpload])
  .validator(parseDelegatedUploadSellerSearchRequest)
  .handler(async ({ data }) => runDelegatedOperation((delegated) => delegated.searchSellers(data)));

export const createDelegatedClassifierBatch = createServerFn({ method: "POST" })
  .middleware([requirePrototypeAdministrator, requireClassifierAssistedUpload])
  .validator(parseCreateDelegatedClassifierBatchInput)
  .handler(async ({ data, context }) =>
    runDelegatedOperation((delegated) =>
      delegated.create(data, (context as PrototypeAdministratorRequestContext).userId),
    ),
  );

export const getDelegatedClassifierBatch = createServerFn({ method: "GET" })
  .middleware([requirePrototypeAdministrator, requireClassifierAssistedUpload])
  .validator(parseDelegatedClassifierWorkflowInput)
  .handler(async ({ data }) =>
    runDelegatedOperation((delegated) => delegated.get(data.workflowId)),
  );

export const retryDelegatedClassifierBatchProvisioning = createServerFn({ method: "POST" })
  .middleware([requirePrototypeAdministrator, requireClassifierAssistedUpload])
  .validator(parseDelegatedClassifierWorkflowInput)
  .handler(async ({ data }) =>
    runDelegatedOperation((delegated) => delegated.retryProvisioning(data.workflowId)),
  );

export const registerDelegatedClassifierUploads = createServerFn({ method: "POST" })
  .middleware([requirePrototypeAdministrator, requireClassifierAssistedUpload])
  .validator(parseDelegatedRegisterUploadsInput)
  .handler(async ({ data }) => runDelegatedOperation((delegated) => delegated.register(data)));

export const retryDelegatedClassifierUploads = createServerFn({ method: "POST" })
  .middleware([requirePrototypeAdministrator, requireClassifierAssistedUpload])
  .validator(parseDelegatedRetryUploadsInput)
  .handler(async ({ data }) => runDelegatedOperation((delegated) => delegated.retryUploads(data)));

export const getDelegatedClassifierUploads = createServerFn({ method: "GET" })
  .middleware([requirePrototypeAdministrator, requireClassifierAssistedUpload])
  .validator(parseDelegatedClassifierCommandInput)
  .handler(async ({ data }) =>
    runDelegatedOperation((delegated) => delegated.getUploads(data.workflowId)),
  );

export const finalizeDelegatedClassifierUploads = createServerFn({ method: "POST" })
  .middleware([requirePrototypeAdministrator, requireClassifierAssistedUpload])
  .validator(parseDelegatedClassifierCommandInput)
  .handler(async ({ data }) =>
    runDelegatedOperation((delegated) => delegated.finalize(data.workflowId)),
  );

export const startDelegatedClassifierProcessing = createServerFn({ method: "POST" })
  .middleware([requirePrototypeAdministrator, requireClassifierAssistedUpload])
  .validator(parseDelegatedClassifierCommandInput)
  .handler(async ({ data }) =>
    runDelegatedOperation((delegated) => delegated.startProcessing(data.workflowId)),
  );

export const getDelegatedClassifierProcessing = createServerFn({ method: "GET" })
  .middleware([requirePrototypeAdministrator, requireClassifierAssistedUpload])
  .validator(parseDelegatedClassifierCommandInput)
  .handler(async ({ data }) =>
    runDelegatedOperation((delegated) => delegated.getProcessing(data.workflowId)),
  );

async function runDelegatedOperation<T>(
  operation: (delegated: Awaited<ReturnType<typeof service>>) => Promise<T>,
): Promise<T> {
  try {
    return await operation(await service());
  } catch (error) {
    if (
      error instanceof DelegatedClassifierUploadError ||
      error instanceof SellerClassifierBatchError
    ) {
      throw error;
    }
    console.error("[Delegated classifier upload] Operation failed.", {
      exceptionClass: error instanceof Error ? error.constructor.name : "UnknownError",
    });
    throw delegatedUploadUnavailable();
  }
}

async function service() {
  const { getDelegatedClassifierUploadService } =
    await import("./server/delegated-classifier-upload.runtime");
  return getDelegatedClassifierUploadService();
}
