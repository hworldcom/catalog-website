import type { SellerProductPublicationStatus } from "@/features/seller/seller-product-publication.types";

export function isActiveProductPublication(
  status: SellerProductPublicationStatus | undefined,
): boolean {
  return status === "pending" || status === "running";
}
