import { z } from "zod";

import type { PrototypeAdministratorRequestContext } from "@/features/admin/prototype-administrator.middleware";

import {
  findOwnedSellerProfileIdentity,
  sellerProfileDatabaseError,
  type SellerProfileAdministrator,
  type SellerProfileIdentity,
  type SellerProfileRequester,
} from "./seller-profile-working-copy.service";

const sellerProfileSubmissionSchema = z.object({
  id: z.string().uuid(),
  seller_id: z.string().uuid(),
  revision: z.number().int().positive(),
  submission_kind: z.enum(["initial", "update"]),
  status: z.enum(["pending", "changes_requested", "approved", "rejected", "withdrawn"]),
  name: z.string(),
  slug: z.string(),
  city: z.string().nullable(),
  country: z.string().nullable(),
  whatsapp: z.string().nullable(),
  email: z.string().nullable(),
  about: z.string().nullable(),
  logo_asset_id: z.string().uuid().nullable(),
  cover_asset_id: z.string().uuid().nullable(),
  established_year: z.number().int().nullable(),
  seller_request_id: z.string().uuid(),
  submitted_by_user_id: z.string().uuid(),
  submitted_at: z.string(),
  administrator_user_id: z.string().uuid().nullable(),
  decision_request_id: z.string().uuid().nullable(),
  seller_visible_reason: z.string().nullable(),
  decided_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

const sellerIdentityResultSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  company_code: z.string(),
  company_code_locked_at: z.string().nullable(),
  primary_category_id: z.string().uuid().nullable(),
  approved_profile_submission_id: z.string().uuid().nullable(),
  storefront_enabled: z.boolean(),
  published: z.boolean(),
});

export type SellerProfileSubmission = z.infer<typeof sellerProfileSubmissionSchema>;
export type SellerProfileDecision = "approve" | "request_changes" | "reject";

export async function submitOwnedSellerProfile({
  requester,
  administrator,
  userId,
  expectedRevision,
  requestId,
}: {
  requester: SellerProfileRequester;
  administrator: SellerProfileAdministrator;
  userId: string;
  expectedRevision: number;
  requestId: string;
}): Promise<{ seller: SellerProfileIdentity; submission: SellerProfileSubmission }> {
  const seller = await requireOwnedSeller({ requester, userId });
  const submission = await runSubmissionOperation(
    administrator,
    "submit_seller_profile_working_copy",
    {
      p_seller_id: seller.id,
      p_expected_revision: expectedRevision,
      p_seller_request_id: requestId,
      p_submitted_by_user_id: userId,
    },
  );
  return { seller, submission };
}

export async function withdrawOwnedSellerProfileSubmission({
  requester,
  administrator,
  userId,
  submissionId,
  expectedRevision,
  requestId,
}: {
  requester: SellerProfileRequester;
  administrator: SellerProfileAdministrator;
  userId: string;
  submissionId: string;
  expectedRevision: number;
  requestId: string;
}): Promise<{ seller: SellerProfileIdentity; submission: SellerProfileSubmission }> {
  const seller = await requireOwnedSeller({ requester, userId });
  const submission = await runSubmissionOperation(
    administrator,
    "withdraw_seller_profile_submission",
    {
      p_seller_id: seller.id,
      p_submission_id: submissionId,
      p_expected_revision: expectedRevision,
      p_request_id: requestId,
      p_actor_user_id: userId,
    },
  );
  return { seller, submission };
}

export async function setOwnedSellerStorefrontEnabled({
  requester,
  administrator,
  userId,
  enabled,
  requestId,
}: {
  requester: SellerProfileRequester;
  administrator: SellerProfileAdministrator;
  userId: string;
  enabled: boolean;
  requestId: string;
}): Promise<{ seller: SellerProfileIdentity }> {
  const seller = await requireOwnedSeller({ requester, userId });
  const result = await runSingleRowOperation(
    administrator,
    "set_seller_storefront_enabled",
    {
      p_seller_id: seller.id,
      p_enabled: enabled,
      p_request_id: requestId,
      p_actor_user_id: userId,
    },
    sellerIdentityResultSchema,
  );
  return { seller: result };
}

export async function decideSellerProfileSubmission({
  authorization,
  administrator,
  sellerId,
  submissionId,
  expectedRevision,
  decision,
  reason,
  requestId,
}: {
  authorization: PrototypeAdministratorRequestContext;
  administrator: SellerProfileAdministrator;
  sellerId: string;
  submissionId: string;
  expectedRevision: number;
  decision: SellerProfileDecision;
  reason: string | null;
  requestId: string;
}): Promise<{ submission: SellerProfileSubmission }> {
  if (authorization.prototypeAdministrator !== true) {
    throw new Error("prototype_administrator_required");
  }
  const submission = await runSubmissionOperation(
    administrator,
    "decide_seller_profile_submission",
    {
      p_seller_id: sellerId,
      p_submission_id: submissionId,
      p_expected_revision: expectedRevision,
      p_decision: decision,
      p_reason: reason,
      p_decision_request_id: requestId,
      p_administrator_user_id: authorization.userId,
    },
  );
  return { submission };
}

async function requireOwnedSeller(input: {
  requester: SellerProfileRequester;
  userId: string;
}): Promise<SellerProfileIdentity> {
  const seller = await findOwnedSellerProfileIdentity(input);
  if (!seller) throw new Error("seller_approval_not_found");
  return seller;
}

async function runSubmissionOperation(
  administrator: SellerProfileAdministrator,
  operation: string,
  parameters: Record<string, unknown>,
): Promise<SellerProfileSubmission> {
  return runSingleRowOperation(administrator, operation, parameters, sellerProfileSubmissionSchema);
}

async function runSingleRowOperation<T>(
  administrator: SellerProfileAdministrator,
  operation: string,
  parameters: Record<string, unknown>,
  schema: z.ZodType<T>,
): Promise<T> {
  const { data, error } = await administrator.rpc(operation, parameters);
  if (error) throw sellerProfileDatabaseError(error);
  const parsed = z.array(schema).safeParse(data);
  if (!parsed.success || parsed.data.length !== 1) {
    console.error("[Seller profile moderation] Database response was invalid.", { operation });
    throw new Error("seller_approval_unavailable");
  }
  return parsed.data[0]!;
}
