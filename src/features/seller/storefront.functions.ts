import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/lib/supabase/auth-middleware";

const optionalText = (maximum: number) =>
  z
    .string()
    .trim()
    .max(maximum)
    .nullable()
    .optional()
    .transform((value) => value || null);

const storefrontWorkingCopySchema = z.object({
  expectedRevision: z.number().int().positive(),
  name: z.string().trim().min(2).max(120),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  city: optionalText(80),
  country: optionalText(80),
  whatsapp: optionalText(40),
  email: z
    .string()
    .trim()
    .email()
    .max(255)
    .nullable()
    .optional()
    .or(z.literal(""))
    .transform((value) => value || null),
  about: optionalText(4000),
  establishedYear: z.number().int().min(1800).max(2100).nullable(),
  logoAssetId: z.string().uuid().nullable(),
  coverAssetId: z.string().uuid().nullable(),
});

const profileSubmissionSchema = z.object({
  expectedRevision: z.number().int().positive(),
  requestId: z.string().uuid(),
});

const profileWithdrawalSchema = profileSubmissionSchema.extend({
  submissionId: z.string().uuid(),
});

const storefrontPreferenceSchema = z.object({
  enabled: z.boolean(),
  requestId: z.string().uuid(),
});

export const getMySellerProfileWorkingCopy = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as {
      supabase: import("@supabase/supabase-js").SupabaseClient<
        import("@/lib/supabase/types").Database
      >;
      userId: string;
    };
    const [{ supabaseAdmin }, { readOwnedSellerProfile }] = await Promise.all([
      import("@/lib/supabase/client.server"),
      import("./server/seller-profile-working-copy.service"),
    ]);

    return readOwnedSellerProfile({
      requester: supabase,
      administrator: supabaseAdmin,
      userId,
    });
  });

export const getMySellerProfileModerationSnapshot = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as {
      supabase: import("@supabase/supabase-js").SupabaseClient<
        import("@/lib/supabase/types").Database
      >;
      userId: string;
    };
    const [{ supabaseAdmin }, { readOwnedSellerProfileModerationSnapshot }] = await Promise.all([
      import("@/lib/supabase/client.server"),
      import("./server/seller-profile-moderation.service"),
    ]);

    return readOwnedSellerProfileModerationSnapshot({
      requester: supabase,
      administrator: supabaseAdmin,
      userId,
    });
  });

export const saveMySellerProfileWorkingCopy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => {
    const parsed = storefrontWorkingCopySchema.safeParse(input);
    if (!parsed.success) throw new Error("seller_approval_submission_invalid");
    return parsed.data;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as {
      supabase: import("@supabase/supabase-js").SupabaseClient<
        import("@/lib/supabase/types").Database
      >;
      userId: string;
    };
    const [{ supabaseAdmin }, { saveOwnedSellerProfile }] = await Promise.all([
      import("@/lib/supabase/client.server"),
      import("./server/seller-profile-working-copy.service"),
    ]);

    return saveOwnedSellerProfile({
      requester: supabase,
      administrator: supabaseAdmin,
      userId,
      patch: data,
    });
  });

export const submitMySellerProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => {
    const parsed = profileSubmissionSchema.safeParse(input);
    if (!parsed.success) throw new Error("seller_approval_submission_invalid");
    return parsed.data;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as {
      supabase: import("@supabase/supabase-js").SupabaseClient<
        import("@/lib/supabase/types").Database
      >;
      userId: string;
    };
    const [{ supabaseAdmin }, { submitOwnedSellerProfile }] = await Promise.all([
      import("@/lib/supabase/client.server"),
      import("./server/seller-profile-moderation.service"),
    ]);
    return submitOwnedSellerProfile({
      requester: supabase,
      administrator: supabaseAdmin,
      userId,
      expectedRevision: data.expectedRevision,
      requestId: data.requestId,
    });
  });

export const withdrawMySellerProfileSubmission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => {
    const parsed = profileWithdrawalSchema.safeParse(input);
    if (!parsed.success) throw new Error("seller_approval_submission_invalid");
    return parsed.data;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as {
      supabase: import("@supabase/supabase-js").SupabaseClient<
        import("@/lib/supabase/types").Database
      >;
      userId: string;
    };
    const [{ supabaseAdmin }, { withdrawOwnedSellerProfileSubmission }] = await Promise.all([
      import("@/lib/supabase/client.server"),
      import("./server/seller-profile-moderation.service"),
    ]);
    return withdrawOwnedSellerProfileSubmission({
      requester: supabase,
      administrator: supabaseAdmin,
      userId,
      submissionId: data.submissionId,
      expectedRevision: data.expectedRevision,
      requestId: data.requestId,
    });
  });

export const setMySellerStorefrontEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input) => {
    const parsed = storefrontPreferenceSchema.safeParse(input);
    if (!parsed.success) throw new Error("seller_approval_submission_invalid");
    return parsed.data;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context as {
      supabase: import("@supabase/supabase-js").SupabaseClient<
        import("@/lib/supabase/types").Database
      >;
      userId: string;
    };
    const [{ supabaseAdmin }, { setOwnedSellerStorefrontEnabled }] = await Promise.all([
      import("@/lib/supabase/client.server"),
      import("./server/seller-profile-moderation.service"),
    ]);
    return setOwnedSellerStorefrontEnabled({
      requester: supabase,
      administrator: supabaseAdmin,
      userId,
      enabled: data.enabled,
      requestId: data.requestId,
    });
  });
