import { describe, expect, it } from "vitest";

import { buildInquirySubmission } from "./inquiry";

const fields = {
  buyerName: " Buyer ",
  buyerEmail: " buyer@example.com ",
  buyerPhone: " +49 123 ",
  buyerCountry: " Germany ",
  message: " Please quote. ",
};

describe("buildInquirySubmission", () => {
  it("includes product context for product-detail inquiries", () => {
    expect(
      buildInquirySubmission({
        fields,
        sellerId: "seller-1",
        productId: "product-1",
        source: "form",
      }),
    ).toEqual({
      sellerId: "seller-1",
      productId: "product-1",
      buyerName: "Buyer",
      buyerEmail: "buyer@example.com",
      buyerPhone: "+49 123",
      buyerCountry: "Germany",
      message: "Please quote.",
      source: "form",
    });
  });

  it("omits product context for storefront inquiries", () => {
    const submission = buildInquirySubmission({
      fields,
      sellerId: "seller-1",
      source: "whatsapp",
    });

    expect(submission).not.toHaveProperty("productId");
    expect(submission.sellerId).toBe("seller-1");
  });
});
