import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  requirePrototypeAdministrator,
  type PrototypeAdministratorRequestContext,
} from "./prototype-administrator.middleware";

const decisionSchema = z
  .object({
    sellerId: z.string().uuid(),
    submissionId: z.string().uuid(),
    expectedRevision: z.number().int().positive(),
    decision: z.enum(["approve", "request_changes", "reject"]),
    reason: z.string().trim().max(1000).nullable().optional(),
    requestId: z.string().uuid(),
  })
  .superRefine((value, context) => {
    const reason = value.reason?.trim() ?? "";
    if ((value.decision === "request_changes" || value.decision === "reject") && !reason) {
      context.addIssue({
        code: "custom",
        path: ["reason"],
        message: "A reason is required for this decision.",
      });
    }
    if (value.decision === "approve" && reason) {
      context.addIssue({
        code: "custom",
        path: ["reason"],
        message: "Approval does not accept a reason.",
      });
    }
  })
  .transform((value) => ({ ...value, reason: value.reason?.trim() || null }));

export const decideSellerProfile = createServerFn({ method: "POST" })
  .middleware([requirePrototypeAdministrator])
  .validator((input) => {
    const parsed = decisionSchema.safeParse(input);
    if (!parsed.success) throw new Error("seller_approval_submission_invalid");
    return parsed.data;
  })
  .handler(async ({ data, context }) => {
    const authorization = context as PrototypeAdministratorRequestContext;
    const [{ supabaseAdmin }, { decideSellerProfileSubmission }] = await Promise.all([
      import("@/lib/supabase/client.server"),
      import("@/features/seller/server/seller-profile-moderation.service"),
    ]);
    return decideSellerProfileSubmission({
      authorization,
      administrator: supabaseAdmin,
      sellerId: data.sellerId,
      submissionId: data.submissionId,
      expectedRevision: data.expectedRevision,
      decision: data.decision,
      reason: data.reason,
      requestId: data.requestId,
    });
  });
