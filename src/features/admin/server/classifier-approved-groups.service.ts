import { z } from "zod";

import type { ApprovedGroupsSnapshot } from "./classifier-import.types";
import { ClassifierImportError } from "./classifier-import.types";

// Server-only reader for the classifier's approved-group export.

const approvedGroupImageSchema = z.object({
  imageId: z.string().uuid(),
  position: z.number().int().nonnegative(),
  isDuplicate: z.boolean(),
  duplicateOfImageId: z.string().uuid().nullable(),
});

const approvedGroupSchema = z
  .object({
    groupId: z.string().uuid(),
    approvedCategorySlug: z.string().trim().min(1).nullable(),
    suggestedCategorySlug: z.string().trim().min(1).nullable(),
    coverImageId: z.string().uuid(),
    confidence: z.number().min(0).max(1).nullable(),
    images: z.array(approvedGroupImageSchema).min(1),
  })
  .superRefine((group, context) => {
    const imageIds = new Set<string>();
    const positions = new Set<number>();
    for (const [index, image] of group.images.entries()) {
      if (imageIds.has(image.imageId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["images", index, "imageId"],
          message: "image identifiers must be unique within a group",
        });
      }
      if (positions.has(image.position)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["images", index, "position"],
          message: "positions must be unique within a group",
        });
      }
      imageIds.add(image.imageId);
      positions.add(image.position);
    }

    const cover = group.images.find((image) => image.imageId === group.coverImageId);
    if (!cover || cover.isDuplicate) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["coverImageId"],
        message: "cover must reference a non-duplicate membership",
      });
    }

    for (const [index, image] of group.images.entries()) {
      if (image.isDuplicate) {
        if (
          image.duplicateOfImageId === null ||
          !group.images.some(
            (candidate) => candidate.imageId === image.duplicateOfImageId && !candidate.isDuplicate,
          )
        ) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["images", index, "duplicateOfImageId"],
            message: "duplicate must reference a retained membership",
          });
        }
      } else if (image.duplicateOfImageId !== null) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["images", index, "duplicateOfImageId"],
          message: "retained membership cannot contain duplicate metadata",
        });
      }
    }
  });

const approvedGroupsSnapshotSchema = z
  .object({
    batchId: z.string().uuid(),
    organizationId: z.string().uuid(),
    status: z.literal("approved"),
    pipelineVersion: z.string().trim().min(1),
    groups: z.array(approvedGroupSchema),
  })
  .superRefine((snapshot, context) => {
    const groupIds = new Set<string>();
    const imageIds = new Set<string>();
    for (const [groupIndex, group] of snapshot.groups.entries()) {
      if (groupIds.has(group.groupId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["groups", groupIndex, "groupId"],
          message: "group identifiers must be unique",
        });
      }
      groupIds.add(group.groupId);

      for (const [imageIndex, image] of group.images.entries()) {
        if (imageIds.has(image.imageId)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["groups", groupIndex, "images", imageIndex, "imageId"],
            message: "an image cannot appear in more than one approved group",
          });
        }
        imageIds.add(image.imageId);
      }
    }
  });

const classifierErrorSchema = z.object({
  detail: z.object({
    code: z.string(),
  }),
});

const knownClientErrors: Record<string, string> = {
  approved_groups_export_disabled: "approved_groups_export_disabled",
  batch_not_found: "classifier_batch_not_found",
  batch_not_approved: "classifier_batch_not_approved",
  approved_groups_invalid: "approved_groups_invalid",
};

export type ApprovedGroupsClientOptions = {
  baseUrl: string;
  timeoutMs: number;
  fetchImplementation?: typeof fetch;
};

export class ApprovedGroupsClient {
  private readonly fetchImplementation: typeof fetch;

  constructor(private readonly options: ApprovedGroupsClientOptions) {
    this.fetchImplementation = options.fetchImplementation ?? fetch;
  }

  async getApprovedGroups(batchId: string): Promise<ApprovedGroupsSnapshot> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs);

    try {
      const response = await this.fetchImplementation(
        `${this.options.baseUrl}/v1/upload-batches/${encodeURIComponent(batchId)}/approved-groups`,
        {
          method: "GET",
          headers: { Accept: "application/json" },
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        await this.throwResponseError(response);
      }

      let payload: unknown;
      try {
        payload = await response.json();
      } catch (error) {
        if (controller.signal.aborted) {
          throw new ClassifierImportError(
            "approved_groups_request_failed",
            true,
            error instanceof Error ? error.message : undefined,
          );
        }
        throw new ClassifierImportError("approved_groups_response_invalid", false);
      }

      const result = approvedGroupsSnapshotSchema.safeParse(payload);
      if (!result.success || result.data.batchId !== batchId) {
        throw new ClassifierImportError("approved_groups_response_invalid", false);
      }
      return result.data;
    } catch (error) {
      if (error instanceof ClassifierImportError) throw error;
      throw new ClassifierImportError(
        "approved_groups_request_failed",
        true,
        error instanceof Error ? error.message : undefined,
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private async throwResponseError(response: Response): Promise<never> {
    if (response.status >= 500) {
      throw new ClassifierImportError("approved_groups_request_failed", true);
    }

    if (response.status >= 400 && response.status < 500) {
      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new ClassifierImportError("approved_groups_unexpected_client_error", false);
      }

      const parsed = classifierErrorSchema.safeParse(payload);
      const mapped = parsed.success ? knownClientErrors[parsed.data.detail.code] : undefined;
      throw new ClassifierImportError(mapped ?? "approved_groups_unexpected_client_error", false);
    }

    throw new ClassifierImportError("approved_groups_response_invalid", false);
  }
}

export function parseApprovedGroupsSnapshot(payload: unknown): ApprovedGroupsSnapshot {
  const result = approvedGroupsSnapshotSchema.safeParse(payload);
  if (!result.success) {
    throw new ClassifierImportError("approved_groups_response_invalid", false);
  }
  return result.data;
}
