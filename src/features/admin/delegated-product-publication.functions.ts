import { createServerFn } from "@tanstack/react-start";

import { ProductDraftDescriptionError } from "@/features/product-draft-descriptions/product-draft-descriptions.types";
import { ProductDraftFactsError } from "@/features/product-draft-facts/product-draft-facts.types";
import { ProductDraftTitleError } from "@/features/product-draft-title/product-draft-title.types";
import { SellerProductPublicationError } from "@/features/seller/seller-product-publication.types";

import {
  delegatedProductDraftUnavailable,
  DelegatedProductDraftError,
  parseDelegatedProductDescriptionsUpdate,
  parseDelegatedProductFactsUpdate,
  parseDelegatedProductPublish,
  parseDelegatedProductRetry,
  parseDelegatedProductSave,
  parseDelegatedProductScope,
  parseDelegatedProductWorkflow,
} from "./delegated-product-publication.types";
import { DelegatedClassifierContinuationError } from "./delegated-classifier-review-import.types";
import {
  requirePrototypeAdministrator,
  type PrototypeAdministratorRequestContext,
} from "./prototype-administrator.middleware";

export const getDelegatedProductDraft = createServerFn({ method: "GET" })
  .middleware([requirePrototypeAdministrator])
  .validator(parseDelegatedProductScope)
  .handler(async ({ data }) => run((service) => service.get(data)));

export const saveDelegatedProductDraft = createServerFn({ method: "POST" })
  .middleware([requirePrototypeAdministrator])
  .validator(parseDelegatedProductSave)
  .handler(async ({ data }) => run((service) => service.save(data)));

export const listDelegatedProductCategories = createServerFn({ method: "GET" })
  .middleware([requirePrototypeAdministrator])
  .validator(parseDelegatedProductWorkflow)
  .handler(async ({ data }) => run((service) => service.listCategories(data.workflowId)));

export const getDelegatedProductDraftFacts = createServerFn({ method: "GET" })
  .middleware([requirePrototypeAdministrator])
  .validator(parseDelegatedProductScope)
  .handler(async ({ data }) => run((service) => service.getFacts(data)));

export const updateDelegatedProductDraftFacts = createServerFn({ method: "POST" })
  .middleware([requirePrototypeAdministrator])
  .validator(parseDelegatedProductFactsUpdate)
  .handler(async ({ data }) => run((service) => service.updateFacts(data)));

export const getDelegatedProductDraftDescriptions = createServerFn({ method: "GET" })
  .middleware([requirePrototypeAdministrator])
  .validator(parseDelegatedProductScope)
  .handler(async ({ data }) => run((service) => service.getDescriptions(data)));

export const updateDelegatedProductDraftDescriptions = createServerFn({ method: "POST" })
  .middleware([requirePrototypeAdministrator])
  .validator(parseDelegatedProductDescriptionsUpdate)
  .handler(async ({ data }) => run((service) => service.updateDescriptions(data)));

export const getDelegatedProductPublication = createServerFn({ method: "GET" })
  .middleware([requirePrototypeAdministrator])
  .validator(parseDelegatedProductScope)
  .handler(async ({ data }) => run((service) => service.getPublication(data)));

export const publishDelegatedProduct = createServerFn({ method: "POST" })
  .middleware([requirePrototypeAdministrator])
  .validator(parseDelegatedProductPublish)
  .handler(async ({ data, context }) =>
    run((service) =>
      service.publish(data, (context as PrototypeAdministratorRequestContext).userId),
    ),
  );

export const retryDelegatedProductPublication = createServerFn({ method: "POST" })
  .middleware([requirePrototypeAdministrator])
  .validator(parseDelegatedProductRetry)
  .handler(async ({ data, context }) =>
    run((service) => service.retry(data, (context as PrototypeAdministratorRequestContext).userId)),
  );

async function run<TResult>(
  operation: (service: Awaited<ReturnType<typeof getService>>) => Promise<TResult>,
): Promise<TResult> {
  return handleDelegatedProductPublicationOperation(async () => operation(await getService()));
}

export async function handleDelegatedProductPublicationOperation<TResult>(
  operation: () => Promise<TResult>,
): Promise<TResult> {
  try {
    return await operation();
  } catch (error) {
    if (
      error instanceof DelegatedProductDraftError ||
      error instanceof DelegatedClassifierContinuationError ||
      error instanceof ProductDraftTitleError ||
      error instanceof ProductDraftFactsError ||
      error instanceof ProductDraftDescriptionError ||
      error instanceof SellerProductPublicationError
    ) {
      throw error;
    }
    console.error("[Delegated ProductDraft publication] Operation failed.", {
      exceptionClass: error instanceof Error ? error.constructor.name : "UnknownError",
    });
    throw delegatedProductDraftUnavailable();
  }
}

async function getService() {
  const { getDelegatedProductPublicationService } =
    await import("./server/delegated-product-publication.runtime");
  return getDelegatedProductPublicationService();
}
