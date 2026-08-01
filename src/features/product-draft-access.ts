export type ProductDraftAccess =
  | {
      mode: "seller";
      expectedSellerId: string;
    }
  | {
      mode: "prototype_administrator";
    }
  | {
      mode: "delegated_administrator";
      expectedSellerId: string;
    };

export function expectedProductDraftSellerId(access: ProductDraftAccess): string | null {
  return access.mode === "prototype_administrator" ? null : access.expectedSellerId;
}
