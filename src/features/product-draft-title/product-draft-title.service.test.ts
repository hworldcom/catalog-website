import { describe, expect, it } from "vitest";

import type {
  HumanProductDraftTitleWrite,
  ProductDraftTitleCreateResult,
  ProductDraftTitleRecord,
  ProductDraftTitleRepository,
  ProductDraftTitleUpdateResult,
  SellerProductFields,
} from "./product-draft-title.repository";
import {
  ProductDraftTitleService,
  type ProductDraftTitleAccess,
} from "./product-draft-title.service";

const productDraftId = "00000000-0000-4000-8000-000000000001";
const sellerId = "00000000-0000-4000-8000-000000000002";

const draftRecord: ProductDraftTitleRecord = {
  productDraftId,
  title: "Draft title",
  titleSource: "human",
  productStatus: "draft",
};

const ownerAccess: ProductDraftTitleAccess = {
  mode: "seller",
  expectedSellerId: sellerId,
};

class MemoryRepository implements ProductDraftTitleRepository {
  expectedSellerIds: Array<string | null> = [];
  titleWrites: Array<HumanProductDraftTitleWrite | null> = [];
  productFields: SellerProductFields[] = [];
  readResult: ProductDraftTitleRecord | null = draftRecord;
  updateResult: ProductDraftTitleUpdateResult = {
    result: "updated",
    ...draftRecord,
  };
  createResult: ProductDraftTitleCreateResult = {
    result: "created",
    ...draftRecord,
  };

  async get(_productDraftId: string, expectedSellerId: string | null) {
    this.expectedSellerIds.push(expectedSellerId);
    return this.readResult;
  }

  async update(
    _productDraftId: string,
    expectedSellerId: string,
    titleWrite: HumanProductDraftTitleWrite | null,
    productFields: SellerProductFields,
  ) {
    this.expectedSellerIds.push(expectedSellerId);
    this.titleWrites.push(titleWrite);
    this.productFields.push(productFields);
    return this.updateResult;
  }

  async updateTitle(
    _productDraftId: string,
    expectedSellerId: string | null,
    titleWrite: HumanProductDraftTitleWrite,
  ) {
    this.expectedSellerIds.push(expectedSellerId);
    this.titleWrites.push(titleWrite);
    return this.updateResult;
  }

  async create(
    expectedSellerId: string,
    titleWrite: HumanProductDraftTitleWrite | null,
    productFields: SellerProductFields,
  ) {
    this.expectedSellerIds.push(expectedSellerId);
    this.titleWrites.push(titleWrite);
    this.productFields.push(productFields);
    return this.createResult;
  }
}

describe("ProductDraftTitleService", () => {
  it("returns seller and administrator snapshots with draft editability", async () => {
    const repository = new MemoryRepository();
    const service = new ProductDraftTitleService(repository);

    await expect(service.get(productDraftId, ownerAccess)).resolves.toEqual({
      ...draftRecord,
      editable: true,
    });
    await expect(
      service.get(productDraftId, {
        mode: "prototype_administrator",
      }),
    ).resolves.toMatchObject({ editable: true });
    expect(repository.expectedSellerIds).toEqual([sellerId, null]);
  });

  it("uses the delegated administrator's immutable expected seller", async () => {
    const repository = new MemoryRepository();
    repository.readResult = null;
    const service = new ProductDraftTitleService(repository);
    await expect(
      service.get(productDraftId, {
        mode: "delegated_administrator",
        expectedSellerId: sellerId,
      }),
    ).rejects.toMatchObject({
      statusCode: 404,
      code: "product_draft_not_found",
    });
    expect(repository.expectedSellerIds).toEqual([sellerId]);
  });

  it("normalizes administrator edits and derives human or null sources", async () => {
    const repository = new MemoryRepository();
    const service = new ProductDraftTitleService(repository);

    await service.update(productDraftId, "  Black \n trousers ", ownerAccess);
    expect(repository.titleWrites).toEqual([{ title: "Black trousers", titleSource: "human" }]);

    await service.update(productDraftId, " \t ", ownerAccess);
    expect(repository.titleWrites[1]).toEqual({ title: "", titleSource: null });
  });

  it("creates a blank draft and rejects a blank published product", async () => {
    const repository = new MemoryRepository();
    repository.createResult = {
      result: "created",
      ...draftRecord,
      title: "",
      titleSource: null,
    };
    const service = new ProductDraftTitleService(repository);

    await expect(
      service.saveSellerProduct({
        sellerId,
        title: " ",
        productFields: { status: "draft" },
      }),
    ).resolves.toMatchObject({ title: "", titleSource: null });

    await expect(
      service.saveSellerProduct({
        sellerId,
        title: " ",
        productFields: { status: "published" },
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: "product_draft_title_required",
    });
  });

  it("creates a draft when the title property is omitted", async () => {
    const repository = new MemoryRepository();
    repository.createResult = {
      result: "created",
      ...draftRecord,
      title: "",
      titleSource: null,
    };
    const service = new ProductDraftTitleService(repository);

    await expect(
      service.saveSellerProduct({
        sellerId,
        productFields: { status: "draft", category_id: null },
      }),
    ).resolves.toMatchObject({ title: "", titleSource: null });

    expect(repository.titleWrites).toEqual([null]);
    expect(repository.productFields).toEqual([{ status: "draft", category_id: null }]);
  });

  it("rejects create-and-publish when the title property is omitted", async () => {
    const repository = new MemoryRepository();
    const service = new ProductDraftTitleService(repository);

    await expect(
      service.saveSellerProduct({
        sellerId,
        productFields: { status: "published", category_id: productDraftId },
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: "product_draft_title_required",
    });
    expect(repository.titleWrites).toEqual([]);
  });

  it.each([
    ["product_category_required", 400],
    ["product_category_not_supported", 400],
    ["product_code_company_unconfigured", 409],
    ["product_code_category_unconfigured", 500],
    ["product_code_allocation_failed", 503],
  ] as const)("maps %s creation failures to status %s", async (result, statusCode) => {
    const repository = new MemoryRepository();
    repository.createResult = { result };
    const service = new ProductDraftTitleService(repository);

    await expect(
      service.saveSellerProduct({
        sellerId: sellerId,
        title: "Cotton shirt",
        productFields: { status: "draft", category_id: productDraftId },
      }),
    ).rejects.toMatchObject({ code: result, statusCode });
  });

  it("omits an untouched seller title while persisting other fields atomically", async () => {
    const repository = new MemoryRepository();
    repository.updateResult = {
      result: "updated",
      ...draftRecord,
      title: "Model title",
      titleSource: "model",
    };
    const service = new ProductDraftTitleService(repository);
    const productFields: SellerProductFields = {
      description: "Changed",
      status: "draft",
    };

    await expect(
      service.saveSellerProduct({
        productDraftId,
        sellerId,
        productFields,
      }),
    ).resolves.toMatchObject({
      title: "Model title",
      titleSource: "model",
    });
    expect(repository.titleWrites).toEqual([null]);
    expect(repository.productFields).toEqual([productFields]);
  });

  it("sends a touched seller title and all other fields in one repository operation", async () => {
    const repository = new MemoryRepository();
    const service = new ProductDraftTitleService(repository);
    const productFields: SellerProductFields = {
      description: "Changed",
      status: "draft",
    };

    await service.saveSellerProduct({
      productDraftId,
      sellerId,
      title: " New   title ",
      productFields,
    });

    expect(repository.titleWrites).toEqual([{ title: "New title", titleSource: "human" }]);
    expect(repository.productFields).toEqual([productFields]);
  });

  it("maps repository outcomes to stable errors", async () => {
    const repository = new MemoryRepository();
    const service = new ProductDraftTitleService(repository);

    repository.updateResult = { result: "not_found" };
    await expect(service.update(productDraftId, "Title", ownerAccess)).rejects.toMatchObject({
      statusCode: 404,
      code: "product_draft_not_found",
    });

    repository.updateResult = {
      result: "not_editable",
      productDraftId,
      productStatus: "published",
    };
    await expect(service.update(productDraftId, "Title", ownerAccess)).rejects.toMatchObject({
      statusCode: 409,
      code: "product_draft_title_not_editable",
    });

    repository.updateResult = { result: "invalid" };
    await expect(service.update(productDraftId, "Title", ownerAccess)).rejects.toMatchObject({
      statusCode: 400,
      code: "product_draft_title_invalid",
    });

    repository.updateResult = { result: "title_required" };
    await expect(
      service.saveSellerProduct({
        productDraftId,
        sellerId,
        productFields: { status: "published" },
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: "product_draft_title_required",
    });
  });
});
