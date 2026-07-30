import { z } from "zod";

const categorySchema = z
  .object({
    id: z.string().uuid(),
    slug: z.string().min(1),
    parentId: z.string().uuid().nullable(),
    nameEn: z.string().min(1),
  })
  .strict();

const imageSchema = z
  .object({
    imageId: z.string().uuid(),
    originalFilename: z.string(),
    uploadOrder: z.number().int().nonnegative(),
    thumbnailUrl: z.string().min(1),
    position: z.number().int().nonnegative(),
    isDuplicate: z.boolean(),
    isRejected: z.boolean(),
    duplicateOfImageId: z.string().uuid().nullable(),
    membershipSource: z.enum(["engine", "exact_duplicate", "singleton", "manual_review"]),
    membershipConfidence: z.number().finite().min(0).max(1).nullable(),
  })
  .strict();

const groupSchema = z
  .object({
    groupId: z.string().uuid(),
    status: z.enum(["proposed", "approved"]),
    confidence: z.number().finite().min(0).max(1).nullable(),
    coverImageId: z.string().uuid().nullable(),
    suggestedCategorySlug: z.string().nullable(),
    approvedCategorySlug: z.string().nullable(),
    categorySuggestionStatus: z.enum(["pending", "ready", "unavailable"]).nullable(),
    approvedCategorySource: z
      .enum(["machine_suggestion", "reviewer_selection", "reviewer_cleared"])
      .nullable(),
    possibleExistingProductId: z.string().uuid().nullable(),
    warnings: z.array(z.string()),
    images: z.array(imageSchema),
  })
  .strict();

const reviewSchema = z
  .object({
    batchId: z.string().uuid(),
    organizationId: z.string().uuid(),
    status: z.enum(["review_required", "approved"]),
    pipelineVersion: z.string().min(1).nullable(),
    groups: z.array(groupSchema),
  })
  .strict();

const categoriesSchema = z.array(categorySchema);

const errorSchema = z
  .object({
    detail: z
      .object({
        code: z.string().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export type ClassifierCategory = z.infer<typeof categorySchema>;
export type ClassifierReviewSnapshot = z.infer<typeof reviewSchema>;

export type ClassifierReviewOperation =
  | "read_review"
  | "list_categories"
  | "create_group"
  | "merge_groups"
  | "split_group"
  | "move_image"
  | "set_duplicate"
  | "select_cover"
  | "select_category"
  | "reject_image"
  | "restore_image"
  | "approve_group"
  | "approve_batch"
  | "read_thumbnail";

export class ClassifierReviewClientError extends Error {
  constructor(
    public readonly operation: ClassifierReviewOperation,
    public readonly statusCode: number | null,
    public readonly classifierCode: string | null,
  ) {
    super("The classifier review request failed.");
    this.name = "ClassifierReviewClientError";
  }
}

export interface ClassifierReviewClient {
  getReview(batchId: string): Promise<ClassifierReviewSnapshot>;
  listCategories(): Promise<ClassifierCategory[]>;
  createGroup(batchId: string, imageIds: string[]): Promise<ClassifierReviewSnapshot>;
  mergeGroups(targetGroupId: string, sourceGroupIds: string[]): Promise<ClassifierReviewSnapshot>;
  splitGroup(groupId: string, imageIds: string[]): Promise<ClassifierReviewSnapshot>;
  moveImage(targetGroupId: string, imageId: string): Promise<ClassifierReviewSnapshot>;
  setDuplicate(
    groupId: string,
    imageId: string,
    duplicateOfImageId: string | null,
  ): Promise<ClassifierReviewSnapshot>;
  selectCover(groupId: string, imageId: string): Promise<ClassifierReviewSnapshot>;
  selectCategory(groupId: string, categoryId: string | null): Promise<ClassifierReviewSnapshot>;
  rejectImage(groupId: string, imageId: string): Promise<ClassifierReviewSnapshot>;
  restoreImage(groupId: string, imageId: string): Promise<ClassifierReviewSnapshot>;
  approveGroup(groupId: string): Promise<ClassifierReviewSnapshot>;
  approveBatch(batchId: string): Promise<ClassifierReviewSnapshot>;
  getThumbnail(batchId: string, imageId: string): Promise<Uint8Array>;
}

export type HttpClassifierReviewClientOptions = {
  baseUrl: string;
  timeoutMs: number;
  fetchImplementation?: typeof fetch;
};

export class HttpClassifierReviewClient implements ClassifierReviewClient {
  private readonly fetchImplementation: typeof fetch;

  constructor(private readonly options: HttpClassifierReviewClientOptions) {
    this.fetchImplementation = options.fetchImplementation ?? fetch;
  }

  getReview(batchId: string): Promise<ClassifierReviewSnapshot> {
    return this.request(
      "read_review",
      `/v1/upload-batches/${encodeURIComponent(batchId)}/groups`,
      reviewSchema,
    );
  }

  listCategories(): Promise<ClassifierCategory[]> {
    return this.request("list_categories", "/v1/categories", categoriesSchema);
  }

  createGroup(batchId: string, imageIds: string[]): Promise<ClassifierReviewSnapshot> {
    return this.request(
      "create_group",
      `/v1/upload-batches/${encodeURIComponent(batchId)}/groups`,
      reviewSchema,
      jsonRequest("POST", { imageIds }),
    );
  }

  mergeGroups(targetGroupId: string, sourceGroupIds: string[]): Promise<ClassifierReviewSnapshot> {
    return this.request(
      "merge_groups",
      "/v1/groups/merge",
      reviewSchema,
      jsonRequest("POST", { targetGroupId, sourceGroupIds }),
    );
  }

  splitGroup(groupId: string, imageIds: string[]): Promise<ClassifierReviewSnapshot> {
    return this.request(
      "split_group",
      `/v1/groups/${encodeURIComponent(groupId)}/split`,
      reviewSchema,
      jsonRequest("POST", { imageIds }),
    );
  }

  moveImage(targetGroupId: string, imageId: string): Promise<ClassifierReviewSnapshot> {
    return this.request(
      "move_image",
      `/v1/groups/${encodeURIComponent(targetGroupId)}/images`,
      reviewSchema,
      jsonRequest("POST", { imageId }),
    );
  }

  setDuplicate(
    groupId: string,
    imageId: string,
    duplicateOfImageId: string | null,
  ): Promise<ClassifierReviewSnapshot> {
    return this.request(
      "set_duplicate",
      `/v1/groups/${encodeURIComponent(groupId)}/images/${encodeURIComponent(imageId)}`,
      reviewSchema,
      jsonRequest("PATCH", {
        isDuplicate: duplicateOfImageId !== null,
        duplicateOfImageId,
      }),
    );
  }

  selectCover(groupId: string, imageId: string): Promise<ClassifierReviewSnapshot> {
    return this.request(
      "select_cover",
      `/v1/groups/${encodeURIComponent(groupId)}`,
      reviewSchema,
      jsonRequest("PATCH", { coverImageId: imageId }),
    );
  }

  selectCategory(groupId: string, categoryId: string | null): Promise<ClassifierReviewSnapshot> {
    return this.request(
      "select_category",
      `/v1/groups/${encodeURIComponent(groupId)}`,
      reviewSchema,
      jsonRequest("PATCH", { approvedCategoryId: categoryId }),
    );
  }

  rejectImage(groupId: string, imageId: string): Promise<ClassifierReviewSnapshot> {
    return this.request(
      "reject_image",
      `/v1/groups/${encodeURIComponent(groupId)}/images/${encodeURIComponent(imageId)}/reject`,
      reviewSchema,
      { method: "POST" },
    );
  }

  restoreImage(groupId: string, imageId: string): Promise<ClassifierReviewSnapshot> {
    return this.request(
      "restore_image",
      `/v1/groups/${encodeURIComponent(groupId)}/images/${encodeURIComponent(imageId)}/restore-rejection`,
      reviewSchema,
      { method: "POST" },
    );
  }

  approveGroup(groupId: string): Promise<ClassifierReviewSnapshot> {
    return this.request(
      "approve_group",
      `/v1/groups/${encodeURIComponent(groupId)}/approve`,
      reviewSchema,
      { method: "POST" },
    );
  }

  approveBatch(batchId: string): Promise<ClassifierReviewSnapshot> {
    return this.request(
      "approve_batch",
      `/v1/upload-batches/${encodeURIComponent(batchId)}/approve`,
      reviewSchema,
      { method: "POST" },
    );
  }

  async getThumbnail(batchId: string, imageId: string): Promise<Uint8Array> {
    const operation = "read_thumbnail";
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs);

    try {
      const response = await this.fetchImplementation(
        new URL(
          `/v1/upload-batches/${encodeURIComponent(batchId)}/images/${encodeURIComponent(imageId)}/thumbnail`,
          this.options.baseUrl,
        ),
        {
          headers: { Accept: "image/jpeg" },
          signal: controller.signal,
        },
      );
      if (!response.ok) {
        throw await responseError(operation, response);
      }
      if (!response.headers.get("content-type")?.toLowerCase().startsWith("image/jpeg")) {
        throw new ClassifierReviewClientError(operation, null, null);
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.length === 0) {
        throw new ClassifierReviewClientError(operation, null, null);
      }
      return bytes;
    } catch (error) {
      if (error instanceof ClassifierReviewClientError) throw error;
      throw new ClassifierReviewClientError(operation, null, null);
    } finally {
      clearTimeout(timeout);
    }
  }

  private async request<T>(
    operation: ClassifierReviewOperation,
    path: string,
    schema: z.ZodType<T>,
    init?: RequestInit,
  ): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs);

    try {
      const response = await this.fetchImplementation(new URL(path, this.options.baseUrl), {
        ...init,
        headers: {
          Accept: "application/json",
          ...headersRecord(init?.headers),
        },
        signal: controller.signal,
      });
      if (!response.ok) {
        throw await responseError(operation, response);
      }
      const parsed = schema.safeParse(await readJson(response));
      if (!parsed.success) {
        throw new ClassifierReviewClientError(operation, null, null);
      }
      return parsed.data;
    } catch (error) {
      if (error instanceof ClassifierReviewClientError) throw error;
      throw new ClassifierReviewClientError(operation, null, null);
    } finally {
      clearTimeout(timeout);
    }
  }
}

function jsonRequest(method: "POST" | "PATCH", payload: unknown): RequestInit {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  };
}

async function responseError(
  operation: ClassifierReviewOperation,
  response: Response,
): Promise<ClassifierReviewClientError> {
  const parsed = errorSchema.safeParse(await readJson(response));
  return new ClassifierReviewClientError(
    operation,
    response.status,
    parsed.success ? (parsed.data.detail?.code ?? null) : null,
  );
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function headersRecord(headers: HeadersInit | undefined): Record<string, string> {
  return Object.fromEntries(new Headers(headers).entries());
}
