export type UatMarketplaceProductFixture = {
  categorySlug: string;
  currency: "EUR";
  description: string;
  imageFiles: string[];
  minimumOrderQuantity: number;
  packSize: string;
  price: number;
  stock: "in_stock" | "low_stock" | "made_to_order";
  title: string;
  trending: boolean;
};

export type UatMarketplaceSellerFixture = {
  about: string;
  audience: "women" | "men" | "kids";
  city: string;
  companyCode: string;
  country: string;
  coverFile: string;
  email: string;
  establishedYear: number;
  logoFile: string;
  name: string;
  products: UatMarketplaceProductFixture[];
  slug: string;
};

export const UAT_MARKETPLACE_FIXTURE_PREFIX = "uat-marketplace-fixtures";

export const UAT_MARKETPLACE_SELLERS: readonly UatMarketplaceSellerFixture[] = [
  {
    name: "Luna Atelier",
    slug: "luna-atelier",
    email: "qa.luna-atelier@bazoria.test",
    companyCode: "LTR",
    audience: "women",
    city: "Berlin",
    country: "Germany",
    establishedYear: 2018,
    about: "Refined womenswear with clean silhouettes, soft tailoring, and versatile layers.",
    logoFile: "luna-atelier/logo.jpg",
    coverFile: "luna-atelier/storefront-cover.jpg",
    products: [
      product(
        "Moonlight Midi Dress",
        "dresses",
        "Fluid navy midi dress with a fitted waist, long sleeves, and a softly pleated skirt.",
        72,
        "luna-atelier/moonlight-midi-dress-cover.jpg",
        "luna-atelier/moonlight-midi-dress-back.jpg",
      ),
      product(
        "Satin Column Skirt",
        "skirts",
        "Bias-cut champagne satin skirt with a smooth waistband and ankle-length column shape.",
        49,
        "luna-atelier/satin-column-skirt-cover.jpg",
      ),
      product(
        "Pearl Knit Cardigan",
        "cardigans",
        "Cream fine-knit cardigan with pearl-style buttons, ribbed edges, and a neat cropped fit.",
        58,
        "luna-atelier/pearl-knit-cardigan-cover.jpg",
      ),
      product(
        "Soft Tailored Blazer",
        "blazers",
        "Warm beige single-breasted blazer with soft shoulders, flap pockets, and a relaxed fit.",
        89,
        "luna-atelier/soft-tailored-blazer-cover.jpg",
      ),
    ],
  },
  {
    name: "Vela Essentials",
    slug: "vela-essentials",
    email: "qa.vela-essentials@bazoria.test",
    companyCode: "VSS",
    audience: "women",
    city: "Hamburg",
    country: "Germany",
    establishedYear: 2020,
    about: "Everyday womenswear built around comfortable fabrics, calm colors, and useful layers.",
    logoFile: "vela-essentials/logo.jpg",
    coverFile: "vela-essentials/storefront-cover.jpg",
    products: [
      product(
        "Contour Everyday Leggings",
        "leggings",
        "Black high-rise stretch leggings with a wide waistband and clean ankle-length finish.",
        34,
        "vela-essentials/contour-everyday-leggings-cover.jpg",
        "vela-essentials/contour-everyday-leggings-detail.jpg",
      ),
      product(
        "Cloud Crew Sweater",
        "sweaters",
        "Pale grey crew-neck sweater in a soft mid-weight knit with dropped shoulders.",
        52,
        "vela-essentials/cloud-crew-sweater-cover.jpg",
      ),
      product(
        "Belted Wool Blend Coat",
        "coats",
        "Camel wool-blend coat with a removable belt, wide lapels, and side pockets.",
        118,
        "vela-essentials/belted-wool-blend-coat-cover.jpg",
      ),
      product(
        "Quilted Layering Vest",
        "vests",
        "Olive lightweight quilted vest with a stand collar, zip front, and curved hem.",
        64,
        "vela-essentials/quilted-layering-vest-cover.jpg",
      ),
    ],
  },
  {
    name: "Northline Menswear",
    slug: "northline-menswear",
    email: "qa.northline-menswear@bazoria.test",
    companyCode: "NER",
    audience: "men",
    city: "Copenhagen",
    country: "Denmark",
    establishedYear: 2016,
    about:
      "Practical menswear with durable construction, modern proportions, and understated color.",
    logoFile: "northline-menswear/logo.jpg",
    coverFile: "northline-menswear/storefront-cover.jpg",
    products: [
      product(
        "Tapered Travel Trousers",
        "trousers",
        "Charcoal tapered trousers with a flat front, stretch weave, and concealed zip pocket.",
        68,
        "northline-menswear/tapered-travel-trousers-cover.jpg",
        "northline-menswear/tapered-travel-trousers-back.jpg",
      ),
      product(
        "Straight Indigo Jeans",
        "jeans",
        "Dark indigo straight-leg jeans in rigid cotton denim with classic five-pocket styling.",
        62,
        "northline-menswear/straight-indigo-jeans-cover.jpg",
      ),
      product(
        "Utility Field Jacket",
        "jackets",
        "Forest green cotton field jacket with four patch pockets and a concealed zip closure.",
        104,
        "northline-menswear/utility-field-jacket-cover.jpg",
      ),
      product(
        "Heavyweight Crew T-Shirt",
        "t-shirts",
        "Off-white heavyweight cotton T-shirt with a ribbed crew neck and relaxed straight fit.",
        32,
        "northline-menswear/heavyweight-crew-tshirt-cover.jpg",
      ),
    ],
  },
  {
    name: "Little Orbit Kids",
    slug: "little-orbit-kids",
    email: "qa.little-orbit@bazoria.test",
    companyCode: "LRS",
    audience: "kids",
    city: "Utrecht",
    country: "Netherlands",
    establishedYear: 2021,
    about:
      "Play-ready childrenswear with bright details, comfortable shapes, and easy-care fabrics.",
    logoFile: "little-orbit-kids/logo.jpg",
    coverFile: "little-orbit-kids/storefront-cover.jpg",
    products: [
      product(
        "Comet Zip Hoodie",
        "hoodies",
        "Cobalt blue kids zip hoodie with a lined hood, kangaroo pockets, and contrast drawcord.",
        39,
        "little-orbit-kids/comet-zip-hoodie-cover.jpg",
        "little-orbit-kids/comet-zip-hoodie-back.jpg",
      ),
      product(
        "Adventure Cotton Shorts",
        "shorts",
        "Sand-colored kids cotton shorts with an elastic waist, drawcord, and roomy patch pockets.",
        27,
        "little-orbit-kids/adventure-cotton-shorts-cover.jpg",
      ),
      product(
        "Orbit Fleece Sweatpants",
        "sweatpants",
        "Heather grey kids fleece sweatpants with ribbed cuffs, an elastic waist, and side pockets.",
        31,
        "little-orbit-kids/orbit-fleece-sweatpants-cover.jpg",
      ),
      product(
        "Colorblock Tracksuit Set",
        "tracksuit-sets",
        "Two-piece kids tracksuit with a teal zip jacket and matching navy pull-on trousers.",
        55,
        "little-orbit-kids/colorblock-tracksuit-set-cover.jpg",
      ),
    ],
  },
] as const;

function product(
  title: string,
  categorySlug: string,
  description: string,
  price: number,
  ...imageFiles: string[]
): UatMarketplaceProductFixture {
  return {
    title,
    categorySlug,
    description,
    price,
    currency: "EUR",
    minimumOrderQuantity: 4,
    packSize: "Pack of 4",
    stock: "in_stock",
    trending: true,
    imageFiles,
  };
}

export function fixtureSellerSlugs(): string[] {
  return UAT_MARKETPLACE_SELLERS.map((seller) => seller.slug);
}

export function fixtureAssetFiles(): string[] {
  return UAT_MARKETPLACE_SELLERS.flatMap((seller) => [
    seller.logoFile,
    seller.coverFile,
    ...seller.products.flatMap((product) => product.imageFiles),
  ]);
}
