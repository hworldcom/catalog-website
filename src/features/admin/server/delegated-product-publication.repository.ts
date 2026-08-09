import type { Database } from "@/lib/supabase/types";

import type { DelegatedProductCategory } from "../delegated-product-publication.types";

type Product = Database["public"]["Tables"]["products"]["Row"];

export type DelegatedProductDraftRecord = {
  workflowId: string;
  seller: {
    id: string;
    name: string;
    slug: string;
    published: boolean;
  };
  source: {
    classifierOrganizationId: string;
    classifierBatchId: string;
    classifierGroupId: string;
  };
  product: Product;
  audiences: string[];
};

export type DelegatedProductPublicationRunRecord = {
  status: "pending" | "running" | "failed" | "cleanup_required" | "completed";
  delegatedActionRequestId: string | null;
  delegatedActionRequestFingerprint: string | null;
};

export interface DelegatedProductPublicationRepository {
  findAdministratorWorkflow(workflowId: string): Promise<{
    workflowId: string;
    sellerId: string;
    classifierOrganizationId: string;
    classifierBatchId: string | null;
  } | null>;
  resolve(workflowId: string, productDraftId: string): Promise<DelegatedProductDraftRecord | null>;
  listCategories(): Promise<DelegatedProductCategory[]>;
  categoryExists(categoryId: string): Promise<boolean>;
  getPublicationRun(
    productDraftId: string,
    sellerId: string,
  ): Promise<DelegatedProductPublicationRunRecord | null>;
}

export class DelegatedProductPublicationRepositoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DelegatedProductPublicationRepositoryError";
  }
}
