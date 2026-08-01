import { describe, expect, it } from "vitest";

import { routeTree } from "@/routeTree.gen";

type RouteNode = {
  children?: RouteNode[];
  options: {
    getParentRoute?: () => RouteNode;
    id?: string;
    path?: string;
  };
};

const continuationPaths = [
  "/admin/classifier-uploads/$workflowId/review",
  "/admin/classifier-uploads/$workflowId/import",
  "/admin/classifier-uploads/$workflowId/products/$productDraftId",
] as const;

describe("delegated classifier continuation route hierarchy", () => {
  it.each(continuationPaths)("keeps %s outside the workflow screen route", (fullPath) => {
    const route = findRoute(routeTree as unknown as RouteNode, fullPath);

    expect(route).toBeDefined();
    expect(route?.options.getParentRoute?.().options.id).toBe("/_authenticated");
  });
});

function findRoute(route: RouteNode, fullPath: string): RouteNode | undefined {
  if (route.options.path === fullPath) return route;
  for (const child of route.children ?? []) {
    const found = findRoute(child, fullPath);
    if (found) return found;
  }
  return undefined;
}
