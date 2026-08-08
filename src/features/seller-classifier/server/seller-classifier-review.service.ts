import { SellerClassifierBatchError } from "../seller-classifier-batch.types";
import type {
  CreateSellerClassifierGroupInput,
  MergeSellerClassifierGroupsInput,
  MoveSellerClassifierImageInput,
  SelectSellerClassifierCategoryInput,
  SelectSellerClassifierCoverInput,
  SellerClassifierCategory,
  SellerClassifierGroupImageInput,
  SellerClassifierGroupInput,
  SellerClassifierReviewGroup,
  SellerClassifierReviewSnapshot,
  SetSellerClassifierDuplicateInput,
  SplitSellerClassifierGroupInput,
} from "../seller-classifier-review.types";
import {
  ClassifierReviewClientError,
  type ClassifierCategory,
  type ClassifierReviewClient,
  type ClassifierReviewOperation,
  type ClassifierReviewSnapshot,
} from "./classifier-review-api";
import type {
  SellerClassifierBatchRecord,
  SellerClassifierBatchRepository,
} from "./seller-classifier-batch.repository";

type OwnedReview = {
  workflow: SellerClassifierBatchRecord;
  safe: SellerClassifierReviewSnapshot;
};

export class SellerClassifierReviewService {
  constructor(
    private readonly repository: SellerClassifierBatchRepository,
    private readonly classifier: ClassifierReviewClient,
    private readonly classifierOrganizationId: string,
  ) {}

  async getReview(workflowId: string, sellerId: string): Promise<SellerClassifierReviewSnapshot> {
    return (await this.loadOwnedReview(workflowId, sellerId)).safe;
  }

  async listCategories(): Promise<SellerClassifierCategory[]> {
    let categories: ClassifierCategory[];
    try {
      categories = await this.classifier.listCategories();
    } catch (error) {
      throw mapClassifierError(error, "list_categories");
    }
    return safeCategories(categories);
  }

  async createGroup(
    sellerId: string,
    input: CreateSellerClassifierGroupInput,
  ): Promise<SellerClassifierReviewSnapshot> {
    const owned = await this.loadOwnedReview(input.workflowId, sellerId);
    const groups = input.imageIds.map((imageId) => requireImage(owned.safe, imageId).group);
    requireEditableGroups(groups);
    return this.applyMutation(owned, sellerId, "create_group", () =>
      this.classifier.createGroup(requireBatchId(owned.workflow), input.imageIds),
    );
  }

  async mergeGroups(
    sellerId: string,
    input: MergeSellerClassifierGroupsInput,
  ): Promise<SellerClassifierReviewSnapshot> {
    const owned = await this.loadOwnedReview(input.workflowId, sellerId);
    const groups = [
      requireGroup(owned.safe, input.targetGroupId),
      ...input.sourceGroupIds.map((groupId) => requireGroup(owned.safe, groupId)),
    ];
    requireEditableGroups(groups);
    return this.applyMutation(owned, sellerId, "merge_groups", () =>
      this.classifier.mergeGroups(input.targetGroupId, input.sourceGroupIds),
    );
  }

  async splitGroup(
    sellerId: string,
    input: SplitSellerClassifierGroupInput,
  ): Promise<SellerClassifierReviewSnapshot> {
    const owned = await this.loadOwnedReview(input.workflowId, sellerId);
    const group = requireGroup(owned.safe, input.groupId);
    requireEditableGroups([group]);
    input.imageIds.forEach((imageId) => requireImageInGroup(group, imageId));
    return this.applyMutation(owned, sellerId, "split_group", () =>
      this.classifier.splitGroup(input.groupId, input.imageIds),
    );
  }

  async moveImage(
    sellerId: string,
    input: MoveSellerClassifierImageInput,
  ): Promise<SellerClassifierReviewSnapshot> {
    const owned = await this.loadOwnedReview(input.workflowId, sellerId);
    const target = requireGroup(owned.safe, input.targetGroupId);
    const source = requireImage(owned.safe, input.imageId).group;
    requireEditableGroups([target, source]);
    if (target.groupId === source.groupId) {
      throw invalidReview("The image already belongs to the selected group.");
    }
    return this.applyMutation(owned, sellerId, "move_image", () =>
      this.classifier.moveImage(input.targetGroupId, input.imageId),
    );
  }

  async setDuplicate(
    sellerId: string,
    input: SetSellerClassifierDuplicateInput,
  ): Promise<SellerClassifierReviewSnapshot> {
    const owned = await this.loadOwnedReview(input.workflowId, sellerId);
    const group = requireGroup(owned.safe, input.groupId);
    requireEditableGroups([group]);
    const image = requireImageInGroup(group, input.imageId);
    if (image.isRejected) {
      throw invalidReview("A rejected image cannot be marked as a duplicate.");
    }
    if (input.duplicateOfImageId) {
      const retained = requireImageInGroup(group, input.duplicateOfImageId);
      if (retained.isRejected) {
        throw invalidReview("The duplicate target must be an active image in the same group.");
      }
    }
    return this.applyMutation(owned, sellerId, "set_duplicate", () =>
      this.classifier.setDuplicate(input.groupId, input.imageId, input.duplicateOfImageId),
    );
  }

  async selectCover(
    sellerId: string,
    input: SelectSellerClassifierCoverInput,
  ): Promise<SellerClassifierReviewSnapshot> {
    const owned = await this.loadOwnedReview(input.workflowId, sellerId);
    const group = requireGroup(owned.safe, input.groupId);
    requireEditableGroups([group]);
    const image = requireImageInGroup(group, input.imageId);
    if (image.isRejected || image.isDuplicate) {
      throw invalidReview("The cover must be an active non-duplicate image.");
    }
    return this.applyMutation(owned, sellerId, "select_cover", () =>
      this.classifier.selectCover(input.groupId, input.imageId),
    );
  }

  async selectCategory(
    sellerId: string,
    input: SelectSellerClassifierCategoryInput,
  ): Promise<SellerClassifierReviewSnapshot> {
    const owned = await this.loadOwnedReview(input.workflowId, sellerId);
    const group = requireGroup(owned.safe, input.groupId);
    requireEditableGroups([group]);

    let categoryId: string | null = null;
    if (input.categorySlug) {
      let categories: ClassifierCategory[];
      try {
        categories = await this.classifier.listCategories();
      } catch (error) {
        throw mapClassifierError(error, "list_categories");
      }
      const safe = safeCategories(categories);
      const index = safe.findIndex((category) => category.slug === input.categorySlug);
      if (index < 0 || !safe[index]?.selectableLeaf) {
        throw invalidReview("Select an active leaf category.");
      }
      categoryId = categories[index]?.id ?? null;
      if (!categoryId) throw classifierUnavailable();
    }

    return this.applyMutation(owned, sellerId, "select_category", () =>
      this.classifier.selectCategory(input.groupId, categoryId),
    );
  }

  async rejectImage(
    sellerId: string,
    input: SellerClassifierGroupImageInput,
  ): Promise<SellerClassifierReviewSnapshot> {
    return this.applyImageMutation(sellerId, input, "reject_image", (groupId, imageId) =>
      this.classifier.rejectImage(groupId, imageId),
    );
  }

  async restoreImage(
    sellerId: string,
    input: SellerClassifierGroupImageInput,
  ): Promise<SellerClassifierReviewSnapshot> {
    return this.applyImageMutation(sellerId, input, "restore_image", (groupId, imageId) =>
      this.classifier.restoreImage(groupId, imageId),
    );
  }

  async approveGroup(
    sellerId: string,
    input: SellerClassifierGroupInput,
  ): Promise<SellerClassifierReviewSnapshot> {
    const owned = await this.loadOwnedReview(input.workflowId, sellerId);
    const group = requireGroup(owned.safe, input.groupId);
    requireEditableGroups([group]);
    return this.applyMutation(owned, sellerId, "approve_group", () =>
      this.classifier.approveGroup(input.groupId),
    );
  }

  async approveBatchForImport(
    workflowId: string,
    sellerId: string,
  ): Promise<SellerClassifierReviewSnapshot> {
    const owned = await this.loadOwnedReview(workflowId, sellerId);
    if (
      owned.safe.groups.length === 0 ||
      owned.safe.groups.some((group) => group.status !== "approved")
    ) {
      throw groupsNotApproved();
    }
    if (owned.safe.stage === "approved") return owned.safe;

    let snapshot: ClassifierReviewSnapshot;
    try {
      snapshot = await this.classifier.approveBatch(requireBatchId(owned.workflow));
    } catch (error) {
      if (
        error instanceof ClassifierReviewClientError &&
        error.statusCode === 409 &&
        error.classifierCode === "review_approval_not_allowed"
      ) {
        throw groupsNotApproved();
      }
      throw mapClassifierError(error, "approve_batch");
    }

    const safe = await this.acceptSnapshot(owned.workflow, sellerId, snapshot);
    if (
      safe.stage !== "approved" ||
      safe.groups.length === 0 ||
      safe.groups.some((group) => group.status !== "approved")
    ) {
      throw classifierUnavailable();
    }
    return safe;
  }

  async getThumbnail(workflowId: string, imageId: string, sellerId: string): Promise<Uint8Array> {
    const owned = await this.loadOwnedReview(workflowId, sellerId);
    requireImage(owned.safe, imageId);
    try {
      return await this.classifier.getThumbnail(requireBatchId(owned.workflow), imageId);
    } catch (error) {
      if (error instanceof ClassifierReviewClientError && error.statusCode === 404) {
        throw thumbnailNotFound();
      }
      throw mapClassifierError(error, "read_thumbnail");
    }
  }

  private async applyImageMutation(
    sellerId: string,
    input: SellerClassifierGroupImageInput,
    operation: ClassifierReviewOperation,
    mutation: (groupId: string, imageId: string) => Promise<ClassifierReviewSnapshot>,
  ): Promise<SellerClassifierReviewSnapshot> {
    const owned = await this.loadOwnedReview(input.workflowId, sellerId);
    const group = requireGroup(owned.safe, input.groupId);
    requireEditableGroups([group]);
    requireImageInGroup(group, input.imageId);
    return this.applyMutation(owned, sellerId, operation, () =>
      mutation(input.groupId, input.imageId),
    );
  }

  private async applyMutation(
    owned: OwnedReview,
    sellerId: string,
    operation: ClassifierReviewOperation,
    mutation: () => Promise<ClassifierReviewSnapshot>,
  ): Promise<SellerClassifierReviewSnapshot> {
    let snapshot: ClassifierReviewSnapshot;
    try {
      snapshot = await mutation();
    } catch (error) {
      throw mapClassifierError(error, operation);
    }
    return this.acceptSnapshot(owned.workflow, sellerId, snapshot);
  }

  private async loadOwnedReview(workflowId: string, sellerId: string): Promise<OwnedReview> {
    const workflow = await this.requireReadyWorkflow(workflowId, sellerId);
    let snapshot: ClassifierReviewSnapshot;
    try {
      snapshot = await this.classifier.getReview(requireBatchId(workflow));
    } catch (error) {
      throw mapClassifierError(error, "read_review");
    }
    const safe = await this.acceptSnapshot(workflow, sellerId, snapshot);
    return { workflow, safe };
  }

  private async acceptSnapshot(
    workflow: SellerClassifierBatchRecord,
    sellerId: string,
    snapshot: ClassifierReviewSnapshot,
  ): Promise<SellerClassifierReviewSnapshot> {
    const safe = safeReviewSnapshot(workflow, snapshot);
    const observation =
      safe.stage === "approved"
        ? await this.repository.recordApproved({
            workflowId: workflow.id,
            sellerId,
            groupCount: safe.groups.length,
          })
        : await this.repository.recordReviewObservation({
            workflowId: workflow.id,
            sellerId,
            stage: safe.stage,
            groupCount: safe.groups.length,
          });
    if (observation.operation === "not_found" || !observation.record) {
      throw workflowNotFound();
    }
    if (observation.operation === "not_ready") {
      throw reviewNotAllowed();
    }
    return safe;
  }

  private async requireReadyWorkflow(
    workflowId: string,
    sellerId: string,
  ): Promise<SellerClassifierBatchRecord> {
    const workflow = await this.repository.findOwned(workflowId, sellerId);
    if (!workflow) throw workflowNotFound();
    if (workflow.provisioningStatus !== "ready" || !workflow.classifierBatchId) {
      throw reviewNotAllowed();
    }
    if (workflow.classifierOrganizationId !== this.classifierOrganizationId) {
      throw configurationInvalid();
    }
    return workflow;
  }
}

function safeReviewSnapshot(
  workflow: SellerClassifierBatchRecord,
  snapshot: ClassifierReviewSnapshot,
): SellerClassifierReviewSnapshot {
  if (
    snapshot.batchId !== workflow.classifierBatchId ||
    snapshot.organizationId !== workflow.classifierOrganizationId
  ) {
    throw classifierUnavailable();
  }

  const groupIds = new Set<string>();
  const globalImageIds = new Set<string>();
  for (const group of snapshot.groups) {
    if (groupIds.has(group.groupId)) throw classifierUnavailable();
    groupIds.add(group.groupId);
    const groupImageIds = new Set(group.images.map((image) => image.imageId));
    if (groupImageIds.size !== group.images.length) throw classifierUnavailable();
    if (new Set(group.images.map((image) => image.position)).size !== group.images.length) {
      throw classifierUnavailable();
    }
    for (const image of group.images) {
      if (globalImageIds.has(image.imageId)) throw classifierUnavailable();
      globalImageIds.add(image.imageId);
      if (image.isDuplicate !== (image.duplicateOfImageId !== null)) {
        throw classifierUnavailable();
      }
      if (
        image.duplicateOfImageId &&
        (image.duplicateOfImageId === image.imageId || !groupImageIds.has(image.duplicateOfImageId))
      ) {
        throw classifierUnavailable();
      }
      const duplicateTarget = image.duplicateOfImageId
        ? group.images.find((candidate) => candidate.imageId === image.duplicateOfImageId)
        : null;
      if (duplicateTarget?.isRejected) throw classifierUnavailable();
    }
    if (group.coverImageId) {
      const cover = group.images.find((image) => image.imageId === group.coverImageId);
      if (!cover || cover.isDuplicate || cover.isRejected) throw classifierUnavailable();
    }
    const categorySourceIsConsistent = group.approvedCategorySlug
      ? group.approvedCategorySource === "machine_suggestion" ||
        group.approvedCategorySource === "reviewer_selection"
      : group.approvedCategorySource === null ||
        group.approvedCategorySource === "reviewer_cleared";
    if (!categorySourceIsConsistent) throw classifierUnavailable();
    if (
      group.status === "approved" &&
      (!group.coverImageId ||
        !group.images.some((image) => !image.isDuplicate && !image.isRejected))
    ) {
      throw classifierUnavailable();
    }
    if (group.warnings.some((warning) => !/^[a-z0-9_]{1,64}$/.test(warning))) {
      throw classifierUnavailable();
    }
  }
  if (
    snapshot.status === "approved" &&
    snapshot.groups.some((group) => group.status !== "approved")
  ) {
    throw classifierUnavailable();
  }

  const stage = snapshot.status === "review_required" ? "review" : "approved";
  return {
    workflowId: workflow.id,
    stage,
    pipelineVersion: snapshot.pipelineVersion,
    groups: snapshot.groups.map((group) => ({
      groupId: group.groupId,
      status: group.status,
      confidence: group.confidence,
      coverImageId: group.coverImageId,
      suggestedCategorySlug: group.suggestedCategorySlug,
      approvedCategorySlug: group.approvedCategorySlug,
      categorySuggestionStatus: group.categorySuggestionStatus,
      approvedCategorySource: group.approvedCategorySource,
      warnings: [...group.warnings],
      images: group.images.map((image) => ({
        imageId: image.imageId,
        originalFilename: image.originalFilename,
        uploadOrder: image.uploadOrder,
        thumbnailUrl:
          `/v1/seller/classifier-batches/${encodeURIComponent(workflow.id)}` +
          `/images/${encodeURIComponent(image.imageId)}/thumbnail`,
        position: image.position,
        isDuplicate: image.isDuplicate,
        isRejected: image.isRejected,
        duplicateOfImageId: image.duplicateOfImageId,
        membershipSource: image.membershipSource,
        membershipConfidence: image.membershipConfidence,
      })),
    })),
  };
}

function safeCategories(categories: ClassifierCategory[]): SellerClassifierCategory[] {
  const byId = new Map<string, ClassifierCategory>();
  const slugs = new Set<string>();
  for (const category of categories) {
    if (
      byId.has(category.id) ||
      slugs.has(category.slug) ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(category.slug) ||
      !category.nameEn.trim()
    ) {
      throw classifierUnavailable();
    }
    byId.set(category.id, category);
    slugs.add(category.slug);
  }
  for (const category of categories) {
    if (category.parentId && !byId.has(category.parentId)) throw classifierUnavailable();
    const visited = new Set<string>([category.id]);
    let parentId = category.parentId;
    while (parentId) {
      if (visited.has(parentId)) throw classifierUnavailable();
      visited.add(parentId);
      parentId = byId.get(parentId)?.parentId ?? null;
    }
  }
  const parentIds = new Set(
    categories.flatMap((category) => (category.parentId ? [category.parentId] : [])),
  );
  return categories.map((category) => ({
    slug: category.slug,
    name: category.nameEn,
    parentSlug: category.parentId ? (byId.get(category.parentId)?.slug ?? null) : null,
    selectableLeaf: !parentIds.has(category.id),
  }));
}

function requireGroup(
  snapshot: SellerClassifierReviewSnapshot,
  groupId: string,
): SellerClassifierReviewGroup {
  const group = snapshot.groups.find((candidate) => candidate.groupId === groupId);
  if (!group) throw resourceNotFound();
  return group;
}

function requireImage(
  snapshot: SellerClassifierReviewSnapshot,
  imageId: string,
): { group: SellerClassifierReviewGroup; image: SellerClassifierReviewGroup["images"][number] } {
  for (const group of snapshot.groups) {
    const image = group.images.find((candidate) => candidate.imageId === imageId);
    if (image) return { group, image };
  }
  throw resourceNotFound();
}

function requireImageInGroup(
  group: SellerClassifierReviewGroup,
  imageId: string,
): SellerClassifierReviewGroup["images"][number] {
  const image = group.images.find((candidate) => candidate.imageId === imageId);
  if (!image) throw resourceNotFound();
  return image;
}

function requireEditableGroups(groups: SellerClassifierReviewGroup[]): void {
  if (groups.some((group) => group.status === "approved")) throw reviewNotAllowed();
}

function requireBatchId(workflow: SellerClassifierBatchRecord): string {
  if (!workflow.classifierBatchId) throw reviewNotAllowed();
  return workflow.classifierBatchId;
}

function mapClassifierError(
  error: unknown,
  operation: ClassifierReviewOperation,
): SellerClassifierBatchError {
  if (error instanceof ClassifierReviewClientError) {
    if (error.statusCode === 400) {
      return invalidReview("The classifier rejected the review request.");
    }
    if (
      error.statusCode === 404 &&
      operation !== "read_review" &&
      operation !== "list_categories"
    ) {
      return resourceNotFound();
    }
    if (error.statusCode === 409) return reviewNotAllowed();
  }
  return classifierUnavailable();
}

function invalidReview(message: string): SellerClassifierBatchError {
  return new SellerClassifierBatchError(400, "seller_classifier_review_invalid", message);
}

function workflowNotFound(): SellerClassifierBatchError {
  return new SellerClassifierBatchError(
    404,
    "seller_classifier_batch_not_found",
    "The classifier workflow was not found.",
  );
}

function resourceNotFound(): SellerClassifierBatchError {
  return new SellerClassifierBatchError(
    404,
    "seller_classifier_review_resource_not_found",
    "The classifier review resource was not found.",
  );
}

function thumbnailNotFound(): SellerClassifierBatchError {
  return new SellerClassifierBatchError(
    404,
    "seller_classifier_thumbnail_not_found",
    "The classifier thumbnail is not available.",
  );
}

function reviewNotAllowed(): SellerClassifierBatchError {
  return new SellerClassifierBatchError(
    409,
    "seller_classifier_review_not_allowed",
    "The classifier review cannot be changed in its current state.",
  );
}

function groupsNotApproved(): SellerClassifierBatchError {
  return new SellerClassifierBatchError(
    409,
    "seller_classifier_groups_not_approved",
    "Approve every classifier group before creating product drafts.",
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
