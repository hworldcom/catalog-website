import { z } from "zod";

const sellerProfileErrorCodes = [
  "seller_approval_submission_invalid",
  "seller_approval_submission_conflict",
  "seller_profile_revision_conflict",
  "seller_profile_slug_conflict",
  "seller_approval_required",
  "seller_approval_not_found",
  "seller_profile_image_not_ready",
] as const;

const sellerIdentitySchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  company_code: z.string(),
  company_code_locked_at: z.string().nullable(),
  primary_category_id: z.string().uuid().nullable(),
  approved_profile_submission_id: z.string().uuid().nullable(),
  storefront_enabled: z.boolean(),
  published: z.boolean(),
});

const sellerProfileWorkingCopySchema = z.object({
  seller_id: z.string().uuid(),
  revision: z.number().int().positive(),
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
  created_at: z.string(),
  updated_at: z.string(),
});

export type SellerProfileIdentity = z.infer<typeof sellerIdentitySchema>;
export type SellerProfileWorkingCopy = z.infer<typeof sellerProfileWorkingCopySchema>;

type DatabaseError = {
  message: string;
  code?: string;
  details?: string;
  hint?: string;
} | null;

type OwnedSellerResult = {
  data: unknown;
  error: DatabaseError;
};

export type SellerProfileRequester = {
  from: (table: "sellers") => {
    select: (columns: string) => {
      eq: (
        column: "owner_id",
        value: string,
      ) => {
        maybeSingle: () => PromiseLike<OwnedSellerResult>;
      };
    };
  };
};

type RpcResult = {
  data: unknown;
  error: DatabaseError;
};

export type SellerProfileAdministrator = {
  rpc: (operation: string, parameters: Record<string, unknown>) => PromiseLike<RpcResult>;
};

export type SellerProfileScalarPatch = {
  expectedRevision: number;
  name: string;
  slug: string;
  city: string | null;
  country: string | null;
  whatsapp: string | null;
  email: string | null;
  about: string | null;
  establishedYear: number | null;
  logoAssetId: string | null;
  coverAssetId: string | null;
};

const sellerIdentityColumns = [
  "id",
  "slug",
  "company_code",
  "company_code_locked_at",
  "primary_category_id",
  "approved_profile_submission_id",
  "storefront_enabled",
  "published",
].join(",");

export async function findOwnedSellerProfileIdentity({
  requester,
  userId,
}: {
  requester: SellerProfileRequester;
  userId: string;
}): Promise<SellerProfileIdentity | null> {
  const { data, error } = await requester
    .from("sellers")
    .select(sellerIdentityColumns)
    .eq("owner_id", userId)
    .maybeSingle();

  if (error) throw sellerProfileDatabaseError(error);
  if (!data) return null;

  const parsed = sellerIdentitySchema.safeParse(data);
  if (!parsed.success) throw unavailableSellerProfileError();
  return parsed.data;
}

export async function readOwnedSellerProfile({
  requester,
  administrator,
  userId,
}: {
  requester: SellerProfileRequester;
  administrator: SellerProfileAdministrator;
  userId: string;
}): Promise<{ seller: SellerProfileIdentity; workingCopy: SellerProfileWorkingCopy }> {
  const seller = await requireOwnedSellerProfileIdentity({ requester, userId });
  const workingCopy = await runWorkingCopyOperation(
    administrator,
    "read_seller_profile_working_copy",
    { p_seller_id: seller.id },
  );

  return { seller, workingCopy };
}

export async function saveOwnedSellerProfile({
  requester,
  administrator,
  userId,
  patch,
}: {
  requester: SellerProfileRequester;
  administrator: SellerProfileAdministrator;
  userId: string;
  patch: SellerProfileScalarPatch;
}): Promise<{ seller: SellerProfileIdentity; workingCopy: SellerProfileWorkingCopy }> {
  const seller = await requireOwnedSellerProfileIdentity({ requester, userId });
  const workingCopy = await runWorkingCopyOperation(
    administrator,
    "save_seller_profile_working_copy",
    {
      p_seller_id: seller.id,
      p_expected_revision: patch.expectedRevision,
      p_name: patch.name,
      p_slug: patch.slug,
      p_city: patch.city,
      p_country: patch.country,
      p_whatsapp: patch.whatsapp,
      p_email: patch.email,
      p_about: patch.about,
      p_established_year: patch.establishedYear,
      p_logo_asset_id: patch.logoAssetId,
      p_cover_asset_id: patch.coverAssetId,
    },
  );

  return { seller, workingCopy };
}

async function requireOwnedSellerProfileIdentity(input: {
  requester: SellerProfileRequester;
  userId: string;
}): Promise<SellerProfileIdentity> {
  const seller = await findOwnedSellerProfileIdentity(input);
  if (!seller) throw new Error("seller_approval_not_found");
  return seller;
}

async function runWorkingCopyOperation(
  administrator: SellerProfileAdministrator,
  operation: string,
  parameters: Record<string, unknown>,
): Promise<SellerProfileWorkingCopy> {
  const { data, error } = await administrator.rpc(operation, parameters);
  if (error) throw sellerProfileDatabaseError(error);

  const parsed = z.array(sellerProfileWorkingCopySchema).safeParse(data);
  if (!parsed.success || parsed.data.length !== 1) throw unavailableSellerProfileError();
  return parsed.data[0];
}

export function sellerProfileDatabaseError(error: { message: string; code?: string }): Error {
  const code = sellerProfileErrorCodes.find((candidate) => error.message.includes(candidate));
  console.error("[Seller profile] Database operation failed.", {
    databaseCode: error.code ?? "unknown",
    stableCode: code ?? "seller_approval_unavailable",
  });
  return new Error(code ?? "seller_approval_unavailable");
}

function unavailableSellerProfileError(): Error {
  console.error("[Seller profile] Database response did not match the expected contract.");
  return new Error("seller_approval_unavailable");
}
