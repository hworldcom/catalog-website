import type { Database } from "@/lib/supabase/types";

export type ClassifierImportRun = Database["public"]["Tables"]["classifier_import_runs"]["Row"];
export type ClassifierImportGroupOutcome =
  Database["public"]["Tables"]["classifier_import_group_outcomes"]["Row"];

export type ApprovedGroupImage = {
  imageId: string;
  position: number;
  isDuplicate: boolean;
  duplicateOfImageId: string | null;
};

export type ApprovedGroup = {
  groupId: string;
  approvedCategorySlug: string | null;
  suggestedCategorySlug: string | null;
  coverImageId: string;
  confidence: number | null;
  images: ApprovedGroupImage[];
};

export type ApprovedGroupsSnapshot = {
  batchId: string;
  organizationId: string;
  status: "approved";
  pipelineVersion: string;
  groups: ApprovedGroup[];
};

export type ImageImportActionState = {
  hasRetryableFailures: boolean;
  hasAnyFailures: boolean;
  hasPromotedImages: boolean;
};

export type GroupImagePreparationResult =
  { status: "complete" } | { status: "failed"; errorCode: string; retryable: boolean };

export type ReconciliationResult = {
  missingGroupIds: ReadonlySet<string>;
  conflictingGroupIds: ReadonlySet<string>;
};

export interface GroupImagePreparationService {
  getImageImportActionState(importRunId: string): Promise<ImageImportActionState>;
  prepareGroupImages(
    run: ClassifierImportRun,
    runAttemptToken: string,
    group: ApprovedGroup,
  ): Promise<GroupImagePreparationResult>;
  reconcilePromotedImages(
    run: ClassifierImportRun,
    runAttemptToken: string,
  ): Promise<ReconciliationResult>;
}

export type ClassifierImportActions = {
  canDispatch: boolean;
  canRetryTemporary: boolean;
  canRetryAll: boolean;
  canReconcile: boolean;
};

export type ClassifierImportStatusSnapshot = {
  importId: string;
  classifierBatchId: string;
  destinationSeller: {
    id: string;
    name: string | null;
  };
  status: ClassifierImportRun["status"];
  operationKind: ClassifierImportRun["operation_kind"];
  errorCode: string | null;
  pendingGroupCount: number;
  processingGroupCount: number;
  completeGroupCount: number;
  failedGroupCount: number;
  actions: ClassifierImportActions;
  groups: {
    classifierGroupId: string;
    productDraftId: string | null;
    status: ClassifierImportGroupOutcome["status"];
    errorCode: string | null;
  }[];
};

export class ClassifierImportError extends Error {
  constructor(
    public readonly code: string,
    public readonly retryable: boolean,
    message = code,
  ) {
    super(message);
    this.name = "ClassifierImportError";
  }
}

export class ClassifierImportClaimLostError extends Error {
  constructor() {
    super("The classifier import attempt no longer owns its claim.");
    this.name = "ClassifierImportClaimLostError";
  }
}

export class ClassifierImportApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message = code,
    public readonly details: { importId?: string } = {},
  ) {
    super(message);
    this.name = "ClassifierImportApiError";
  }
}
