import { setResponseHeader } from "@tanstack/react-start/server";

export const PRODUCT_DRAFT_IMAGE_DELIVERY_CACHE_CONTROL = "private, no-store";

type ResponseHeaderSetter = (name: string, value: string) => void;

export function applyPrivateProductDraftImageResponseHeaders(
  setHeader: ResponseHeaderSetter = setResponseHeader,
): void {
  setHeader("Cache-Control", PRODUCT_DRAFT_IMAGE_DELIVERY_CACHE_CONTROL);
}
