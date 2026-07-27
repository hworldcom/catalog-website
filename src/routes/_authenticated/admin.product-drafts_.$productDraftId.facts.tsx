import { createFileRoute, redirect } from "@tanstack/react-router";

import { parseAdminProductDraftReviewSearch } from "@/features/admin/admin-product-draft-review.navigation";

export const Route = createFileRoute("/_authenticated/admin/product-drafts_/$productDraftId/facts")(
  {
    head: () => ({ meta: [{ title: "Review ProductDraft facts · Bazoria" }] }),
    validateSearch: parseAdminProductDraftReviewSearch,
    beforeLoad: ({ params, search }) => {
      throw redirect({
        to: "/admin/product-drafts/$productDraftId",
        params: { productDraftId: params.productDraftId },
        search,
        replace: true,
      });
    },
  },
);
