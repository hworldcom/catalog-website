import { createFileRoute } from "@tanstack/react-router";

import {
  buildAdminProductDraftBackHref,
  parseAdminProductDraftReviewSearch,
} from "@/features/admin/admin-product-draft-review.navigation";
import { AdminProductDraftReviewScreen } from "@/features/admin/screens/admin-product-draft-review-screen";
import { useLang } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/admin/product-drafts_/$productDraftId")({
  head: () => ({ meta: [{ title: "Review ProductDraft · Bazoria" }] }),
  validateSearch: parseAdminProductDraftReviewSearch,
  component: AdminProductDraftReviewRoute,
});

function AdminProductDraftReviewRoute() {
  const { productDraftId } = Route.useParams();
  const search = Route.useSearch();
  const lang = useLang();
  return (
    <AdminProductDraftReviewScreen
      productDraftId={productDraftId}
      backHref={buildAdminProductDraftBackHref(search, lang)}
    />
  );
}
