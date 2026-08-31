import { redirect } from "@tanstack/react-router";

import { getInitializedRuntimePublicConfig } from "@/lib/runtime-public-config";

import { CLASSIFIER_ASSISTED_UPLOAD_DISABLED_CODE } from "./classifier-assisted-upload";

type ClassifierRouteSearch = {
  lang?: unknown;
  audience?: unknown;
};

export function guardSellerClassifierRoute(
  search: ClassifierRouteSearch,
  enabled = getInitializedRuntimePublicConfig().classifierAssistedUploadEnabled,
): void {
  if (enabled) return;
  throw redirect({ href: buildSellerClassifierDisabledHref(search) });
}

export function guardAdministratorClassifierRoute(
  search: ClassifierRouteSearch,
  enabled = getInitializedRuntimePublicConfig().classifierAssistedUploadEnabled,
): void {
  if (enabled) return;
  throw redirect({ href: buildAdministratorClassifierDisabledHref(search) });
}

export function buildSellerClassifierDisabledHref(search: ClassifierRouteSearch): string {
  const query = new URLSearchParams({
    notice: CLASSIFIER_ASSISTED_UPLOAD_DISABLED_CODE,
  });
  appendString(query, "lang", search.lang);
  appendString(query, "audience", search.audience);
  return `/seller/products?${query}`;
}

export function buildAdministratorClassifierDisabledHref(search: ClassifierRouteSearch): string {
  const query = new URLSearchParams({
    limit: "25",
    notice: CLASSIFIER_ASSISTED_UPLOAD_DISABLED_CODE,
  });
  appendString(query, "lang", search.lang);
  return `/admin/product-drafts?${query}`;
}

function appendString(query: URLSearchParams, name: string, value: unknown): void {
  if (typeof value === "string" && value.trim()) query.set(name, value);
}
