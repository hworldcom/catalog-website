import { createServerFn } from "@tanstack/react-start";
import { requireClassifierAssistedUpload } from "@/features/classifier-release/classifier-assisted-upload.middleware";

import {
  delegatedClassifierUnavailable,
  DelegatedClassifierContinuationError,
  parseDelegatedApproveBatchInput,
  parseDelegatedApproveGroupInput,
  parseDelegatedCategoryInput,
  parseDelegatedClassifierReviewInput,
  parseDelegatedCoverInput,
  parseDelegatedCreateGroupInput,
  parseDelegatedDuplicateInput,
  parseDelegatedGroupImageInput,
  parseDelegatedMergeGroupsInput,
  parseDelegatedMoveImageInput,
  parseDelegatedRetryImportInput,
  parseDelegatedSplitGroupInput,
} from "./delegated-classifier-review-import.types";
import { DelegatedClassifierUploadError } from "./delegated-classifier-upload.types";
import {
  requirePrototypeAdministrator,
  type PrototypeAdministratorRequestContext,
} from "./prototype-administrator.middleware";

export const getDelegatedClassifierReview = createServerFn({ method: "GET" })
  .middleware([requirePrototypeAdministrator, requireClassifierAssistedUpload])
  .validator(parseDelegatedClassifierReviewInput)
  .handler(async ({ data }) =>
    runDelegatedContinuation((service) => service.getReview(data.workflowId)),
  );

export const listDelegatedClassifierCategories = createServerFn({ method: "GET" })
  .middleware([requirePrototypeAdministrator, requireClassifierAssistedUpload])
  .validator(parseDelegatedClassifierReviewInput)
  .handler(async ({ data }) =>
    runDelegatedContinuation((service) => service.listCategories(data.workflowId)),
  );

export const createDelegatedClassifierGroup = createServerFn({ method: "POST" })
  .middleware([requirePrototypeAdministrator, requireClassifierAssistedUpload])
  .validator(parseDelegatedCreateGroupInput)
  .handler(async ({ data }) => runDelegatedContinuation((service) => service.createGroup(data)));

export const mergeDelegatedClassifierGroups = createServerFn({ method: "POST" })
  .middleware([requirePrototypeAdministrator, requireClassifierAssistedUpload])
  .validator(parseDelegatedMergeGroupsInput)
  .handler(async ({ data }) => runDelegatedContinuation((service) => service.mergeGroups(data)));

export const splitDelegatedClassifierGroup = createServerFn({ method: "POST" })
  .middleware([requirePrototypeAdministrator, requireClassifierAssistedUpload])
  .validator(parseDelegatedSplitGroupInput)
  .handler(async ({ data }) => runDelegatedContinuation((service) => service.splitGroup(data)));

export const moveDelegatedClassifierImage = createServerFn({ method: "POST" })
  .middleware([requirePrototypeAdministrator, requireClassifierAssistedUpload])
  .validator(parseDelegatedMoveImageInput)
  .handler(async ({ data }) => runDelegatedContinuation((service) => service.moveImage(data)));

export const setDelegatedClassifierImageDuplicate = createServerFn({ method: "POST" })
  .middleware([requirePrototypeAdministrator, requireClassifierAssistedUpload])
  .validator(parseDelegatedDuplicateInput)
  .handler(async ({ data }) => runDelegatedContinuation((service) => service.setDuplicate(data)));

export const selectDelegatedClassifierGroupCover = createServerFn({ method: "POST" })
  .middleware([requirePrototypeAdministrator, requireClassifierAssistedUpload])
  .validator(parseDelegatedCoverInput)
  .handler(async ({ data }) => runDelegatedContinuation((service) => service.selectCover(data)));

export const selectDelegatedClassifierGroupCategory = createServerFn({ method: "POST" })
  .middleware([requirePrototypeAdministrator, requireClassifierAssistedUpload])
  .validator(parseDelegatedCategoryInput)
  .handler(async ({ data }) => runDelegatedContinuation((service) => service.selectCategory(data)));

export const rejectDelegatedClassifierImage = createServerFn({ method: "POST" })
  .middleware([requirePrototypeAdministrator, requireClassifierAssistedUpload])
  .validator(parseDelegatedGroupImageInput)
  .handler(async ({ data }) => runDelegatedContinuation((service) => service.rejectImage(data)));

export const restoreDelegatedClassifierImage = createServerFn({ method: "POST" })
  .middleware([requirePrototypeAdministrator, requireClassifierAssistedUpload])
  .validator(parseDelegatedGroupImageInput)
  .handler(async ({ data }) => runDelegatedContinuation((service) => service.restoreImage(data)));

export const approveDelegatedClassifierGroup = createServerFn({ method: "POST" })
  .middleware([requirePrototypeAdministrator, requireClassifierAssistedUpload])
  .validator(parseDelegatedApproveGroupInput)
  .handler(async ({ data, context }) =>
    runDelegatedContinuation((service) =>
      service.approveGroup(data, (context as PrototypeAdministratorRequestContext).userId),
    ),
  );

export const approveDelegatedClassifierBatchAndCreateDrafts = createServerFn({
  method: "POST",
})
  .middleware([requirePrototypeAdministrator, requireClassifierAssistedUpload])
  .validator(parseDelegatedApproveBatchInput)
  .handler(async ({ data, context }) =>
    runDelegatedContinuation((service) =>
      service.approveBatchAndCreateDrafts(
        data,
        (context as PrototypeAdministratorRequestContext).userId,
      ),
    ),
  );

export const getDelegatedClassifierDraftImport = createServerFn({ method: "GET" })
  .middleware([requirePrototypeAdministrator, requireClassifierAssistedUpload])
  .validator(parseDelegatedClassifierReviewInput)
  .handler(async ({ data }) =>
    runDelegatedContinuation((service) => service.getDraftImport(data.workflowId)),
  );

export const retryDelegatedClassifierDraftImport = createServerFn({ method: "POST" })
  .middleware([requirePrototypeAdministrator, requireClassifierAssistedUpload])
  .validator(parseDelegatedRetryImportInput)
  .handler(async ({ data, context }) =>
    runDelegatedContinuation((service) =>
      service.retryDraftImport(data, (context as PrototypeAdministratorRequestContext).userId),
    ),
  );

async function runDelegatedContinuation<TResult>(
  operation: (service: Awaited<ReturnType<typeof getContinuationService>>) => Promise<TResult>,
): Promise<TResult> {
  try {
    return await operation(await getContinuationService());
  } catch (error) {
    if (
      error instanceof DelegatedClassifierContinuationError ||
      error instanceof DelegatedClassifierUploadError
    ) {
      throw error;
    }
    console.error("[Delegated classifier continuation] Operation failed.", {
      exceptionClass: error instanceof Error ? error.constructor.name : "UnknownError",
    });
    throw delegatedClassifierUnavailable();
  }
}

async function getContinuationService() {
  const { getDelegatedClassifierReviewImportService } =
    await import("./server/delegated-classifier-review-import.runtime");
  return getDelegatedClassifierReviewImportService();
}
