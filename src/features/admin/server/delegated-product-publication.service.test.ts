import { describe, expect, it, vi } from "vitest";

import type { ProductDraftDescriptionService } from "@/features/product-draft-descriptions/product-draft-descriptions.service";
import type { ProductDraftFactsService } from "@/features/product-draft-facts/product-draft-facts.service";
import type { ProductDraftTitleService } from "@/features/product-draft-title/product-draft-title.service";
import type { SellerProductDraftImageGalleryService } from "@/features/seller/server/seller-product-draft-image-gallery.service";
import type { SellerProductPublicationService } from "@/features/seller/server/seller-product-publication.service";

import type { DelegatedAdministratorActionService } from "./delegated-administrator-action.service";
import type {
  DelegatedProductDraftRecord,
  DelegatedProductPublicationRepository,
} from "./delegated-product-publication.repository";
import { DelegatedProductPublicationService } from "./delegated-product-publication.service";

describe("DelegatedProductPublicationService", () => {
  it("returns the canonical workflow-scoped snapshot and gallery", async () => {
    const subject = setup();

    await expect(subject.service.get({ workflowId, productDraftId })).resolves.toMatchObject({
      workflowId,
      productDraftId,
      seller: { id: sellerId, storefrontPublished: true },
      source: {
        classifierOrganizationId: uuid(4),
        classifierBatchId: uuid(5),
        classifierGroupId: uuid(6),
      },
      product: {
        audiences: ["women"],
        title: "Cotton shirt",
        categoryId,
        imagePublicationMode: "durable",
        editable: true,
      },
      gallery: { status: "available", images: [] },
    });
    expect(subject.gallery.get).toHaveBeenCalledWith(
      expect.objectContaining({ id: productDraftId, seller_id: sellerId }),
    );
  });

  it("persists a complete normalized draft without changing descriptions or cover", async () => {
    const subject = setup();

    await subject.service.save({
      workflowId,
      productDraftId,
      title: "  Cotton \n shirt ",
      audiences: ["women"],
      categoryId,
      minimumOrderQuantity: 10,
      packSize: " box ",
      price: 12.5,
      currency: " EUR ",
      stock: "in_stock",
      trending: true,
    });

    expect(subject.titles.saveSellerProduct).toHaveBeenCalledWith({
      productDraftId,
      sellerId,
      title: "Cotton shirt",
      productFields: {
        audiences: ["women"],
        category_id: categoryId,
        moq: 10,
        pack_size: "box",
        price: 12.5,
        currency: "EUR",
        stock: "in_stock",
        trending: true,
        status: "draft",
      },
    });
    expect(subject.repository.categoryExists).toHaveBeenCalledWith(categoryId);
  });

  it("passes immutable seller scope to reusable facts writes", async () => {
    const subject = setup();
    await subject.service.updateFacts({
      workflowId,
      productDraftId,
      patch: { colors: ["Black"] },
    });
    expect(subject.facts.update).toHaveBeenCalledWith(
      productDraftId,
      { colors: ["Black"] },
      { mode: "delegated_administrator", expectedSellerId: sellerId },
    );
  });

  it("audits normalized publication and correlates the durable publication run", async () => {
    const subject = setup();
    await subject.service.publish(
      {
        workflowId,
        productDraftId,
        requestId,
        title: " Cotton shirt ",
        audiences: ["women"],
        categoryId,
        minimumOrderQuantity: null,
        packSize: null,
        price: null,
        currency: "EUR",
        stock: "made_to_order",
        trending: false,
      },
      administratorUserId,
    );

    expect(subject.actions.run).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId,
        workflowId,
        expectedSellerId: sellerId,
        administratorUserId,
        actionType: "publish_product_draft",
        targetId: productDraftId,
        payload: expect.objectContaining({ title: "Cotton shirt", categoryId }),
      }),
    );
    expect(subject.publications.publish).toHaveBeenCalledWith(
      sellerId,
      expect.objectContaining({
        id: productDraftId,
        audiences: ["women"],
        title: "Cotton shirt",
        category_id: categoryId,
      }),
      {
        requestId,
        requestFingerprint: expect.stringMatching(/^[0-9a-f]{64}$/),
      },
    );
  });

  it("does not disclose a ProductDraft with inconsistent workflow ownership", async () => {
    const subject = setup();
    subject.repository.resolve.mockResolvedValueOnce(null);
    await expect(subject.service.get({ workflowId, productDraftId })).rejects.toMatchObject({
      statusCode: 404,
      code: "delegated_product_draft_not_found",
    });
  });

  it("claims publication before resolving ProductDraft ownership", async () => {
    const subject = setup();
    subject.repository.resolve.mockResolvedValueOnce(null);

    await expect(
      subject.service.publish(
        {
          workflowId,
          productDraftId,
          requestId,
          title: "Cotton shirt",
          audiences: ["women"],
          categoryId,
          minimumOrderQuantity: null,
          packSize: null,
          price: null,
          currency: "EUR",
          stock: "made_to_order",
          trending: false,
        },
        administratorUserId,
      ),
    ).rejects.toMatchObject({
      statusCode: 404,
      code: "delegated_product_draft_not_found",
    });

    expect(subject.actions.run).toHaveBeenCalledOnce();
    expect(subject.publications.publish).not.toHaveBeenCalled();
  });
});

function setup() {
  const repository = {
    findAdministratorWorkflow: vi.fn(async () => ({
      workflowId,
      sellerId,
      classifierOrganizationId: uuid(4),
      classifierBatchId: uuid(5),
    })),
    resolve: vi.fn<DelegatedProductPublicationRepository["resolve"]>(async () => record()),
    listCategories: vi.fn(async () => [{ id: categoryId, slug: "shirts", name: "Shirts" }]),
    categoryExists: vi.fn(async () => true),
    getPublicationRun: vi.fn(async () => null),
  } satisfies DelegatedProductPublicationRepository;
  const titles = {
    saveSellerProduct: vi.fn(async () => ({
      productDraftId,
      title: "Cotton shirt",
      titleSource: "human" as const,
      productStatus: "draft" as const,
      editable: true,
    })),
  };
  const facts = {
    get: vi.fn(),
    update: vi.fn(async () => ({ productDraftId })),
  };
  const descriptions = {
    get: vi.fn(),
    update: vi.fn(),
  };
  const gallery = {
    get: vi.fn(async () => ({
      status: "available" as const,
      errorCode: null,
      images: [],
    })),
  };
  const publications = {
    get: vi.fn(async () => publicationSnapshot()),
    publish: vi.fn(async () => publicationSnapshot()),
    retry: vi.fn(async () => publicationSnapshot()),
  };
  const actions = {
    run: vi.fn(async (input: { execute: () => Promise<unknown> }) => input.execute()),
  };

  return {
    repository,
    titles,
    facts,
    descriptions,
    gallery,
    publications,
    actions,
    service: new DelegatedProductPublicationService(
      repository,
      titles as unknown as ProductDraftTitleService,
      facts as unknown as ProductDraftFactsService,
      descriptions as unknown as ProductDraftDescriptionService,
      gallery as unknown as SellerProductDraftImageGalleryService,
      publications as unknown as SellerProductPublicationService,
      actions as unknown as DelegatedAdministratorActionService,
    ),
  };
}

function record(): DelegatedProductDraftRecord {
  return {
    workflowId,
    seller: {
      id: sellerId,
      name: "Seller",
      slug: "seller",
      published: true,
    },
    source: {
      classifierOrganizationId: uuid(4),
      classifierBatchId: uuid(5),
      classifierGroupId: uuid(6),
    },
    audiences: ["women"],
    product: {
      id: productDraftId,
      seller_id: sellerId,
      title: "Cotton shirt",
      title_source: "human",
      description: null,
      category_id: categoryId,
      product_code: "SEL-F-TSH-ABCDEFGH",
      moq: null,
      pack_size: null,
      price: null,
      currency: "EUR",
      stock: "in_stock",
      cover_image_id: uuid(7),
      cover_image_url: null,
      image_gallery_revision: 0,
      trending: false,
      status: "draft",
      classifier_group_id: null,
      classifier_organization_id: null,
      created_at: "2026-07-31T10:00:00.000Z",
      updated_at: "2026-07-31T10:00:00.000Z",
    },
  };
}

function publicationSnapshot() {
  return {
    productDraftId,
    productStatus: "draft" as const,
    publicationStatus: "pending" as const,
    attemptCount: 0,
    failureReasonCode: null,
    retryAllowed: false,
    publicProductUrl: null,
  };
}

const workflowId = uuid(1);
const productDraftId = uuid(2);
const sellerId = uuid(3);
const categoryId = uuid(8);
const requestId = uuid(9);
const administratorUserId = uuid(10);

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
}
