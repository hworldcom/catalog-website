import { SellerClassifierBatchError } from "../seller-classifier-batch.types";
import type {
  RegisterSellerClassifierUploadsInput,
  SellerClassifierFinalizeResult,
  SellerClassifierProcessingImage,
  SellerClassifierProcessingSnapshot,
  SellerClassifierUploadImage,
  SellerClassifierUploadRegistration,
  SellerClassifierUploadSnapshot,
} from "../seller-classifier-workflow.types";
import {
  ClassifierWorkflowClientError,
  type ClassifierProcessingSnapshot,
  type ClassifierUploadRegistration,
  type ClassifierUploadSnapshot,
  type ClassifierWorkflowClient,
  type ClassifierWorkflowOperation,
} from "./classifier-workflow-api";
import type {
  SellerClassifierBatchObservationKind,
  SellerClassifierBatchRecord,
  SellerClassifierBatchRepository,
} from "./seller-classifier-batch.repository";

const knownUploadErrors = new Set(["object_missing", "content_type_mismatch", "size_mismatch"]);

export class SellerClassifierWorkflowService {
  constructor(
    private readonly repository: SellerClassifierBatchRepository,
    private readonly classifier: ClassifierWorkflowClient,
    private readonly classifierOrganizationId: string,
  ) {}

  async register(
    sellerId: string,
    input: RegisterSellerClassifierUploadsInput,
  ): Promise<SellerClassifierUploadRegistration> {
    const workflow = await this.requireReadyWorkflow(input.workflowId, sellerId);
    validateFiles(input.files, workflow);

    let registration: ClassifierUploadRegistration;
    try {
      registration = await this.classifier.registerUploads(
        requireClassifierBatchId(workflow),
        input.files,
      );
    } catch (error) {
      throw mapClassifierError(error, "register");
    }
    verifyRegistration(registration, workflow, input.files);

    await this.recordObservation(workflow, sellerId, {
      observationKind: "upload",
      stage: "upload",
      originalFileCount: registration.uploads.length,
      processedFileCount: 0,
      errorCode: null,
      retryable: false,
    });

    return {
      workflowId: workflow.id,
      status: registration.status,
      uploads: registration.uploads.map((upload) => ({
        imageId: upload.imageId,
        uploadOrder: upload.uploadOrder,
        originalFilename: upload.originalFilename,
        uploadUrl: upload.uploadUrl,
      })),
    };
  }

  async retryUploads(
    workflowId: string,
    sellerId: string,
    imageIds: string[],
  ): Promise<SellerClassifierUploadRegistration> {
    const workflow = await this.requireReadyWorkflow(workflowId, sellerId);
    const current = await this.readUpload(workflow, sellerId);
    const selected = new Set(imageIds);

    if (
      current.status !== "uploading" ||
      current.images.filter((image) => selected.has(image.imageId)).length !== selected.size ||
      current.images.some(
        (image) =>
          selected.has(image.imageId) && (image.status !== "failed" || !image.retryAllowed),
      )
    ) {
      throw uploadInvalid("Only failed images in an uploading batch can be retried.");
    }

    let registration: ClassifierUploadRegistration;
    try {
      registration = await this.classifier.retryUploads(
        requireClassifierBatchId(workflow),
        imageIds,
      );
    } catch (error) {
      throw mapClassifierError(error, "retry_upload");
    }
    verifyRetryRegistration(registration, workflow, selected);

    return {
      workflowId,
      status: registration.status,
      uploads: registration.uploads.map((upload) => ({
        imageId: upload.imageId,
        uploadOrder: upload.uploadOrder,
        originalFilename: upload.originalFilename,
        uploadUrl: upload.uploadUrl,
      })),
    };
  }

  async getUploads(workflowId: string, sellerId: string): Promise<SellerClassifierUploadSnapshot> {
    const workflow = await this.requireReadyWorkflow(workflowId, sellerId);
    return this.readUpload(workflow, sellerId);
  }

  async finalize(workflowId: string, sellerId: string): Promise<SellerClassifierFinalizeResult> {
    const workflow = await this.requireReadyWorkflow(workflowId, sellerId);
    let finalized: ClassifierUploadSnapshot;
    try {
      finalized = await this.classifier.finalize(requireClassifierBatchId(workflow));
    } catch (error) {
      throw mapClassifierError(error, "finalize");
    }
    verifyBatchId(finalized.batchId, workflow);
    const upload = await this.persistUploadSnapshot(workflow, sellerId, finalized);

    if (finalized.status !== "queued") {
      return { upload, processing: null };
    }

    const processing = await this.startProcessingForWorkflow(workflow, sellerId);
    return { upload, processing };
  }

  async startProcessing(
    workflowId: string,
    sellerId: string,
  ): Promise<SellerClassifierProcessingSnapshot> {
    const workflow = await this.requireReadyWorkflow(workflowId, sellerId);
    return this.startProcessingForWorkflow(workflow, sellerId);
  }

  async getProcessing(
    workflowId: string,
    sellerId: string,
  ): Promise<SellerClassifierProcessingSnapshot> {
    const workflow = await this.requireReadyWorkflow(workflowId, sellerId);
    let processing: ClassifierProcessingSnapshot;
    try {
      processing = await this.classifier.getProcessing(requireClassifierBatchId(workflow));
    } catch (error) {
      throw mapClassifierError(error, "read_processing");
    }
    return this.persistProcessingSnapshot(workflow, sellerId, processing, "processing");
  }

  private async readUpload(
    workflow: SellerClassifierBatchRecord,
    sellerId: string,
  ): Promise<SellerClassifierUploadSnapshot> {
    let upload: ClassifierUploadSnapshot;
    try {
      upload = await this.classifier.getUpload(requireClassifierBatchId(workflow));
    } catch (error) {
      throw mapClassifierError(error, "read_upload");
    }
    verifyBatchId(upload.batchId, workflow);
    return this.persistUploadSnapshot(workflow, sellerId, upload);
  }

  private async startProcessingForWorkflow(
    workflow: SellerClassifierBatchRecord,
    sellerId: string,
  ): Promise<SellerClassifierProcessingSnapshot> {
    let processing: ClassifierProcessingSnapshot;
    try {
      processing = await this.classifier.startProcessing(requireClassifierBatchId(workflow));
    } catch (error) {
      throw mapClassifierError(error, "start_processing");
    }
    return this.persistProcessingSnapshot(
      workflow,
      sellerId,
      processing,
      workflow.lastKnownStage === "failed" ? "processing_retry" : "processing",
    );
  }

  private async persistUploadSnapshot(
    workflow: SellerClassifierBatchRecord,
    sellerId: string,
    upload: ClassifierUploadSnapshot,
  ): Promise<SellerClassifierUploadSnapshot> {
    verifyBatchId(upload.batchId, workflow);
    const stage = uploadObservationStage(upload.status);
    const observationKind = stage === "upload" ? "upload" : "processing";
    const result = await this.recordObservation(workflow, sellerId, {
      observationKind,
      stage,
      originalFileCount: upload.originalFileCount,
      processedFileCount: upload.processedFileCount,
      errorCode: stage === "failed" ? "seller_classifier_processing_failed" : null,
      retryable: false,
    });

    return {
      workflowId: workflow.id,
      status: upload.status,
      stage: browserStage(result.lastKnownStage),
      originalFileCount: upload.originalFileCount,
      processedFileCount: upload.processedFileCount,
      finalizedAt: upload.finalizedAt,
      images: upload.images.map((image): SellerClassifierUploadImage => {
        const errorCode =
          image.errorCode && knownUploadErrors.has(image.errorCode)
            ? image.errorCode
            : image.status === "failed"
              ? "upload_failed"
              : null;
        return {
          imageId: image.imageId,
          uploadOrder: image.uploadOrder,
          originalFilename: image.originalFilename,
          status: image.status,
          errorCode,
          retryAllowed: upload.status === "uploading" && image.status === "failed",
        };
      }),
    };
  }

  private async persistProcessingSnapshot(
    workflow: SellerClassifierBatchRecord,
    sellerId: string,
    processing: ClassifierProcessingSnapshot,
    observationKind: SellerClassifierBatchObservationKind,
  ): Promise<SellerClassifierProcessingSnapshot> {
    verifyBatchId(processing.batchId, workflow);
    const stage = processingStage(processing.status);
    const retryAllowed =
      processing.status === "processing" &&
      processing.images.some(
        (image) => image.processJobStatus === "failed" || image.classifyJobStatus === "failed",
      );
    const result = await this.recordObservation(workflow, sellerId, {
      observationKind,
      stage,
      originalFileCount: processing.originalFileCount,
      processedFileCount: processing.processedFileCount,
      errorCode: stage === "failed" ? "seller_classifier_processing_failed" : null,
      retryable: stage === "failed" ? retryAllowed : false,
    });

    return {
      workflowId: workflow.id,
      status: processing.status,
      stage: processingBrowserStage(result.lastKnownStage),
      originalFileCount: processing.originalFileCount,
      processedFileCount: processing.processedFileCount,
      pipelineVersion: processing.pipelineVersion,
      retryAllowed,
      images: processing.images.map(safeProcessingImage),
    };
  }

  private async requireReadyWorkflow(
    workflowId: string,
    sellerId: string,
  ): Promise<SellerClassifierBatchRecord> {
    const workflow = await this.repository.findOwned(workflowId, sellerId);
    if (!workflow) throw workflowNotFound();
    if (
      workflow.provisioningStatus !== "ready" ||
      !workflow.classifierBatchId ||
      !workflow.maxFiles ||
      !workflow.maxFileSizeBytes
    ) {
      throw uploadNotAllowed();
    }
    if (workflow.classifierOrganizationId !== this.classifierOrganizationId) {
      throw configurationInvalid();
    }
    return workflow;
  }

  private async recordObservation(
    workflow: SellerClassifierBatchRecord,
    sellerId: string,
    observation: {
      observationKind: SellerClassifierBatchObservationKind;
      stage: "upload" | "processing" | "review" | "approved" | "failed";
      originalFileCount: number;
      processedFileCount: number;
      errorCode: string | null;
      retryable: boolean;
    },
  ): Promise<SellerClassifierBatchRecord> {
    const result = await this.repository.recordObservation({
      workflowId: workflow.id,
      sellerId,
      ...observation,
    });
    if (result.operation === "not_found" || !result.record) throw workflowNotFound();
    if (result.operation === "not_ready") throw uploadNotAllowed();
    return result.record;
  }
}

function validateFiles(
  files: RegisterSellerClassifierUploadsInput["files"],
  workflow: SellerClassifierBatchRecord,
): void {
  const maxFiles = workflow.maxFiles ?? 0;
  const maxFileSizeBytes = workflow.maxFileSizeBytes ?? 0;
  if (
    files.length < 1 ||
    files.length > maxFiles ||
    files.some(
      (file) =>
        !file.originalFilename.trim() ||
        file.mimeType !== "image/jpeg" ||
        file.sizeBytes < 1 ||
        file.sizeBytes > maxFileSizeBytes,
    )
  ) {
    throw uploadInvalid("The selected files do not satisfy the classifier upload limits.");
  }
}

function verifyRegistration(
  registration: ClassifierUploadRegistration,
  workflow: SellerClassifierBatchRecord,
  files: RegisterSellerClassifierUploadsInput["files"],
): void {
  verifyBatchId(registration.batchId, workflow);
  if (
    registration.uploads.length !== files.length ||
    new Set(registration.uploads.map((upload) => upload.imageId)).size !==
      registration.uploads.length ||
    registration.uploads.some(
      (upload, index) =>
        upload.uploadOrder !== index || upload.originalFilename !== files[index]?.originalFilename,
    )
  ) {
    throw classifierUnavailable();
  }
}

function verifyRetryRegistration(
  registration: ClassifierUploadRegistration,
  workflow: SellerClassifierBatchRecord,
  selected: Set<string>,
): void {
  verifyBatchId(registration.batchId, workflow);
  if (
    registration.uploads.length !== selected.size ||
    new Set(registration.uploads.map((upload) => upload.imageId)).size !== selected.size ||
    registration.uploads.some((upload) => !selected.has(upload.imageId))
  ) {
    throw classifierUnavailable();
  }
}

function verifyBatchId(batchId: string, workflow: SellerClassifierBatchRecord): void {
  if (batchId !== workflow.classifierBatchId) throw classifierUnavailable();
}

function requireClassifierBatchId(workflow: SellerClassifierBatchRecord): string {
  if (!workflow.classifierBatchId) throw uploadNotAllowed();
  return workflow.classifierBatchId;
}

function uploadObservationStage(
  status: ClassifierUploadSnapshot["status"],
): "upload" | "processing" | "review" | "approved" | "failed" {
  if (status === "created" || status === "uploading" || status === "queued") return "upload";
  if (status === "processing") return "processing";
  if (status === "review_required") return "review";
  if (status === "approved") return "approved";
  return "failed";
}

function processingStage(
  status: ClassifierProcessingSnapshot["status"],
): "processing" | "review" | "approved" | "failed" {
  if (status === "queued" || status === "processing") return "processing";
  if (status === "review_required") return "review";
  if (status === "approved") return "approved";
  return "failed";
}

function browserStage(
  stage: SellerClassifierBatchRecord["lastKnownStage"],
): SellerClassifierUploadSnapshot["stage"] {
  if (stage === "provisioning" || stage === "upload") return "upload";
  if (stage === "processing") return "processing";
  if (stage === "review") return "review";
  if (stage === "failed") return "failed";
  return "approved";
}

function processingBrowserStage(
  stage: SellerClassifierBatchRecord["lastKnownStage"],
): SellerClassifierProcessingSnapshot["stage"] {
  if (stage === "review") return "review";
  if (stage === "failed") return "failed";
  if (stage === "approved" || stage === "importing" || stage === "drafts_ready") {
    return "approved";
  }
  return "processing";
}

function safeProcessingImage(
  image: ClassifierProcessingSnapshot["images"][number],
): SellerClassifierProcessingImage {
  return {
    imageId: image.imageId,
    uploadOrder: image.uploadOrder,
    originalFilename: image.originalFilename,
    imageStatus: image.imageStatus,
    processJobStatus: image.processJobStatus,
    processError:
      image.processJobStatus === "failed"
        ? {
            code: "image_processing_failed",
            message: "Image processing failed.",
          }
        : null,
    classifyJobStatus: image.classifyJobStatus,
    classifyError:
      image.classifyJobStatus === "failed"
        ? {
            code: "image_classification_failed",
            message: "Image classification failed.",
          }
        : null,
    categorySlug: image.categorySlug,
    confidence: image.confidence,
    hasHashes: image.hasHashes,
    hasEmbedding: image.hasEmbedding,
  };
}

function mapClassifierError(
  error: unknown,
  operation: ClassifierWorkflowOperation,
): SellerClassifierBatchError {
  if (error instanceof ClassifierWorkflowClientError && error.statusCode === 400) {
    return uploadInvalid("The classifier rejected the upload request.");
  }
  if (error instanceof ClassifierWorkflowClientError && error.statusCode === 409) {
    return operation === "start_processing" || operation === "read_processing"
      ? processingNotAllowed()
      : uploadNotAllowed();
  }
  return classifierUnavailable();
}

function uploadInvalid(message: string): SellerClassifierBatchError {
  return new SellerClassifierBatchError(400, "seller_classifier_upload_invalid", message);
}

function workflowNotFound(): SellerClassifierBatchError {
  return new SellerClassifierBatchError(
    404,
    "seller_classifier_batch_not_found",
    "The classifier workflow was not found.",
  );
}

function uploadNotAllowed(): SellerClassifierBatchError {
  return new SellerClassifierBatchError(
    409,
    "seller_classifier_upload_not_allowed",
    "The classifier workflow cannot accept this upload command in its current state.",
  );
}

function processingNotAllowed(): SellerClassifierBatchError {
  return new SellerClassifierBatchError(
    409,
    "seller_classifier_processing_not_allowed",
    "Classifier processing cannot start in the current state.",
  );
}

function configurationInvalid(): SellerClassifierBatchError {
  return new SellerClassifierBatchError(
    500,
    "seller_classifier_configuration_invalid",
    "Seller classifier workflows are not configured.",
  );
}

function classifierUnavailable(): SellerClassifierBatchError {
  return new SellerClassifierBatchError(
    503,
    "seller_classifier_unavailable",
    "The classifier is temporarily unavailable.",
  );
}
