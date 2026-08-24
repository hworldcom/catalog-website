import { describe, expect, it } from "vitest";

import {
  BAZORIA_FALLBACK_SOCIAL_IMAGE_PATH,
  buildProductSocialPreview,
  buildSellerSocialPreview,
  buildSocialMeta,
  isUsablePublicSocialImageUrl,
} from "./social-sharing";

type ProductPreviewInput = Parameters<typeof buildProductSocialPreview>[0];
type SellerPreviewInput = Parameters<typeof buildSellerSocialPreview>[0];

function productPreview(overrides: Partial<ProductPreviewInput> = {}) {
  return buildProductSocialPreview({
    origin: "https://bazoria.example",
    productId: "product-id",
    productTitle: "Product",
    productDescription: null,
    price: null,
    currency: "USD",
    supplierName: "Supplier",
    coverImageUrl: null,
    galleryImageUrls: [],
    language: "EN",
    audience: "all",
    ...overrides,
  });
}

function sellerPreview(overrides: Partial<SellerPreviewInput> = {}) {
  return buildSellerSocialPreview({
    origin: "https://bazoria.example",
    canonicalSlug: "supplier",
    sellerName: "Supplier",
    sellerAbout: null,
    sellerCity: null,
    sellerCountry: null,
    logoImageUrl: null,
    coverImageUrl: null,
    language: "EN",
    audience: "all",
    ...overrides,
  });
}

describe("product social preview data", () => {
  it("builds deterministic localized rich metadata from published data", () => {
    const preview = productPreview({
      productId: "00000000-0000-4000-8000-000000000001",
      productTitle: "Bawełniana koszula",
      productDescription: "  Lekka   koszula\nz bawełny.  ",
      price: "12.5",
      currency: "PLN",
      supplierName: "Tkaniny Polska",
      coverImageUrl: "https://images.example/product-cover.jpg",
      galleryImageUrls: ["https://images.example/gallery.jpg"],
      language: "PL",
      audience: "women",
    });

    expect(preview).toEqual({
      title: "Bawełniana koszula — Bazoria",
      description: "Lekka koszula z bawełny. · Cena: PLN 12.50 · Dostawca: Tkaniny Polska",
      imageUrl: "https://images.example/product-cover.jpg",
      imageAlt: "Bawełniana koszula",
      url: "https://bazoria.example/p/00000000-0000-4000-8000-000000000001?lang=PL&audience=women",
    });

    expect(buildSocialMeta(preview)).toEqual(
      expect.arrayContaining([
        { title: preview.title },
        { name: "description", content: preview.description },
        { property: "og:description", content: preview.description },
        { name: "twitter:description", content: preview.description },
        { property: "og:image", content: preview.imageUrl },
        { property: "og:image:alt", content: preview.imageAlt },
        { property: "og:url", content: preview.url },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:image", content: preview.imageUrl },
      ]),
    );
  });

  it.each([
    ["EN", "Price: USD 0.00", "Supplier: Seller"],
    ["PL", "Cena: USD 0.00", "Dostawca: Seller"],
    ["DE", "Preis: USD 0.00", "Lieferant: Seller"],
    ["VI", "Giá: USD 0.00", "Nhà cung cấp: Seller"],
  ] as const)("uses %s interface-owned labels", (language, price, supplier) => {
    const preview = productPreview({
      productDescription: "Description",
      price: 0,
      supplierName: "Seller",
      language,
    });

    expect(preview.description).toBe(`Description · ${price} · ${supplier}`);
  });

  it("uses the generic product fallback and omits an invalid price segment", () => {
    const preview = productPreview({
      productDescription: "  \n ",
      price: "1e2",
      currency: "USD",
    });

    expect(preview.description).toBe(
      "Discover wholesale products from real suppliers and contact sellers directly on Bazoria. · Supplier: Supplier",
    );
    expect(preview.description).not.toContain("Price:");
  });

  it("budgets the excerpt while preserving complete price and supplier segments", () => {
    const preview = productPreview({
      productDescription: "Detailed wholesale description ".repeat(12),
      price: 9_999_999_999.99,
      currency: "ABCDEF",
      supplierName: "International Wholesale Supplier Group ".repeat(4),
    });

    expect(Array.from(preview.description).length).toBeLessThanOrEqual(200);
    expect(Array.from(preview.description).length).toBeGreaterThan(150);
    expect(preview.description).toContain(" · Price: ABCDEF 9999999999.99 · Supplier: ");
    expect(preview.description).toMatch(/Supplier: .+…$/u);
  });

  it("truncates unbroken Unicode content without splitting a code point", () => {
    const preview = productPreview({
      productDescription: "😀".repeat(150),
      supplierName: "供".repeat(80),
    });

    expect(Array.from(preview.description).length).toBeLessThanOrEqual(200);
    expect(preview.description).not.toContain("�");
    expect(preview.description).toMatch(/^😀+… · Supplier: 供+…$/u);
  });

  it("falls back from a missing cover to the first safe gallery image", () => {
    const preview = productPreview({
      galleryImageUrls: [
        "https://storage.example/object/sign/private.jpg?token=secret",
        "https://images.example/first-public.jpg",
        "https://images.example/second-public.jpg",
      ],
    });

    expect(preview.imageUrl).toBe("https://images.example/first-public.jpg");
  });

  it("uses the repository fallback when a product has no safe public image", () => {
    const preview = productPreview({
      origin: "http://localhost:8080",
      coverImageUrl: "http://private.example/image.jpg",
    });

    expect(preview.imageUrl).toBe(`http://localhost:8080${BAZORIA_FALLBACK_SOCIAL_IMAGE_PATH}`);
  });
});

describe("seller social preview data", () => {
  it("uses the canonical slug, localized fallback, location, and fallback image", () => {
    const preview = sellerPreview({
      canonicalSlug: "canonical-seller",
      sellerName: "Supplier & Sons",
      sellerCity: "Berlin",
      sellerCountry: "Germany",
      language: "DE",
      audience: "men",
    });

    expect(preview.title).toBe("Supplier & Sons — Wholesale Storefront on Bazoria");
    expect(preview.description).toBe(
      "Entdecken Sie den Großhandelskatalog dieses Anbieters und kontaktieren Sie ihn direkt über Bazoria. · Berlin, Germany",
    );
    expect(preview.url).toBe("https://bazoria.example/s/canonical-seller?lang=DE&audience=men");
    expect(preview.imageUrl).toBe(`https://bazoria.example${BAZORIA_FALLBACK_SOCIAL_IMAGE_PATH}`);
  });

  it("normalizes published about and location text without repeating equal values", () => {
    const preview = sellerPreview({
      sellerAbout: "  Independent\n\n wholesale   studio. ",
      sellerCity: "  Berlin ",
      sellerCountry: "Berlin",
    });

    expect(preview.description).toBe("Independent wholesale studio. · Berlin");
  });

  it("budgets a long about excerpt around the complete capped location", () => {
    const rawLocation = "東京".repeat(60);
    const expectedLocation = `${Array.from(rawLocation).slice(0, 79).join("")}…`;
    const preview = sellerPreview({
      sellerAbout: "Independent wholesale supplier with an extensive catalog. ".repeat(8),
      sellerCity: rawLocation,
    });

    expect(Array.from(preview.description).length).toBeLessThanOrEqual(200);
    expect(Array.from(preview.description).length).toBeGreaterThan(150);
    expect(preview.description.endsWith(` · ${expectedLocation}`)).toBe(true);
  });

  it("prefers a safe published logo over the cover image", () => {
    const preview = sellerPreview({
      sellerAbout: "Nhà cung cấp thời trang bán buôn.",
      sellerCity: "Hà Nội",
      sellerCountry: "Việt Nam",
      logoImageUrl: "/v1/public/sellers/supplier-id/profile-images/logo?revision=3",
      coverImageUrl: "https://images.example/supplier-cover.jpg",
      language: "VI",
      audience: "kids",
    });

    expect(preview.imageUrl).toBe(
      "https://bazoria.example/v1/public/sellers/supplier-id/profile-images/logo?revision=3",
    );
    expect(preview.description).toBe("Nhà cung cấp thời trang bán buôn. · Hà Nội, Việt Nam");
  });

  it("falls back from an unsafe seller logo to the safe published cover", () => {
    const preview = sellerPreview({
      logoImageUrl: "https://storage.example/object/sign/logo.jpg?token=secret",
      coverImageUrl: "https://images.example/supplier-cover.jpg",
    });

    expect(preview.imageUrl).toBe("https://images.example/supplier-cover.jpg");
  });

  it("rejects a protocol-relative seller logo instead of resolving another host", () => {
    const preview = sellerPreview({
      logoImageUrl: "//untrusted.example/logo.jpg",
      coverImageUrl: "https://images.example/supplier-cover.jpg",
    });

    expect(preview.imageUrl).toBe("https://images.example/supplier-cover.jpg");
  });
});

describe("isUsablePublicSocialImageUrl", () => {
  it.each(["https://images.example/public.jpg", "https://images.example/public.jpg?width=1200"])(
    "accepts a durable HTTPS image: %s",
    (url) => {
      expect(isUsablePublicSocialImageUrl(url)).toBe(true);
    },
  );

  it.each([
    "http://images.example/public.jpg",
    "https://images.example/object/sign/private.jpg?token=secret",
    "https://images.example/private.jpg?X-Amz-Signature=secret",
    "https://user:password@images.example/private.jpg",
    "not a URL",
  ])("rejects a private, temporary, or invalid image: %s", (url) => {
    expect(isUsablePublicSocialImageUrl(url)).toBe(false);
  });
});
