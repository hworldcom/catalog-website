# Bazoria Homepage & Join Page — UI Implementation Brief

## 1. Objective

Update the existing **Bazoria homepage** and **Join Us page** to match the visual direction of the approved mockup:

* editorial / premium marketplace aesthetic
* warm ivory background
* strong black typography
* restrained orange accents
* large product and supplier photography
* significantly more whitespace
* simplified navigation
* fashion-focused imagery
* **bazoria.** lowercase wordmark

The implementation should be a **visual redesign of the existing application**, not a separate static landing page.

Existing routes, language handling, product links, seller links and application behavior should continue working.

The current homepage already contains marketplace navigation, product cards, supplier cards, a “How it works” section and seller CTA.

The Join page already contains seller and buyer benefits, onboarding steps, “How it works”, trust messaging and final CTAs.

---

# 2. General Design Direction

## Brand

Use:

**bazoria.**

not:

**Bazoria**

The desktop logo should be the full wordmark.

The small **b.** mark should only be used where there is insufficient space, for example:

* favicon
* mobile icon
* PWA/app icon
* very small responsive states

Do not use the existing boxed `B` logo in the desktop header.

### Suggested typography

For implementation consistency:

**Display / headings / logo**

* Bodoni Moda
* fallback: Georgia, serif

**UI / body text**

* Inter
* fallback: system sans-serif

Example:

```css
--font-display: "Bodoni Moda", Georgia, serif;
--font-sans: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
```

Do not use the display serif for every UI element.

Use it primarily for:

* logo
* H1
* H2
* selected editorial headings

Navigation, buttons, product metadata and body copy should remain sans-serif.

---

# 3. Color System

Use a restrained neutral palette.

```css
--background: #fbf9f5;
--surface: #ffffff;
--surface-soft: #f6f1ea;

--text: #171512;
--text-muted: #716b63;

--border: #e7e1d8;

--orange: #e94b0c;
--orange-hover: #d64108;

--orange-soft: #fff0e8;
```

Orange is an **accent**, not the dominant page color.

Use orange for:

* primary buttons
* links / arrows
* small section labels
* selected navigation indicators
* subtle icon backgrounds

Avoid large orange blocks.

---

# 4. Global Layout

Increase the visual width slightly from the current `max-w-6xl`.

Recommended:

```tsx
max-w-[1320px] mx-auto px-5 sm:px-6 lg:px-8
```

Target desktop content width:

**1280–1320 px**

Section spacing:

```text
desktop: 72–96px
tablet: 56–72px
mobile: 40–56px
```

Avoid excessive borders around every component.

Prefer:

* whitespace
* subtle `#e7e1d8` borders
* image hierarchy
* typography

Cards should generally have:

```css
border-radius: 6px;
```

or at most `8px`.

Do not make the design excessively rounded.

---

# 5. Header

The current application has a top header and two navigation rows.

Keep the existing functionality but simplify the visual treatment.

## Desktop

Row 1:

```text
bazoria.                                    EN PL DE VI   Sign in
```

Row 2:

```text
All    Women    Men    Kids                         Join Us

Clothing ▾    Sellers ▾
```

The existing audience and marketplace navigation behaviors should remain intact.

### Important

There is **no Home & Living section**.

Do not introduce:

* Home & Living navigation
* Home & Living category tiles
* home décor examples
* ceramic/vase sample products

Navigation should reflect the actual marketplace taxonomy.

### Header styling

* warm ivory / white background
* black wordmark
* subtle bottom border
* sticky behavior can remain
* approximately 64–68 px first-row height
* no boxed logo

`Sign in` can remain black:

```text
black background
white text
```

`Join Us` should be orange outlined.

### Language selector

Keep:

```text
EN PL DE VI
```

Selected language:

* black background
* white text

Unselected languages:

* transparent background
* muted text

Do not make the language selector visually dominant.

---

# 6. Homepage

The homepage should immediately feel like a **marketplace**, not primarily like a SaaS landing page.

The current homepage already has live product and seller sections.

Use those actual data sources.

---

# 7. Homepage Hero

Desktop structure:

```text
┌─────────────────────────────┬────────────────────────────┐
│                             │       LARGE IMAGE          │
│  LABEL                      │                            │
│                             ├────────────┬───────────────┤
│  HEADLINE                   │ WOMEN      │ PRODUCT /     │
│                             │ FASHION    │ ACCESSORY     │
│  DESCRIPTION                │ IMAGE      │ IMAGE         │
│                             │            │               │
│  CTA CTA                    │            │               │
│                             │            │               │
│  TRUST POINTS               │            │               │
└─────────────────────────────┴────────────┴───────────────┘
```

Approximately:

```text
left: 48%
right: 52%
```

### Hero copy

The existing message is strong and can remain close to:

**Find wholesale products
from real suppliers.**

The current homepage describes Bazoria as a place where retailers, online sellers and market vendors browse wholesale catalogs and contact suppliers directly.

Do not add unnecessary marketing copy.

### Eyebrow

Example:

```text
BRINGING EUROPE'S TRADITIONAL WHOLESALE MARKETS ONLINE.
```

Small uppercase sans-serif, orange.

### CTAs

Primary:

**Browse products**

Secondary:

**Sell on Bazoria**

or:

**Join the network**

Prefer **two CTAs**, not three competing primary actions.

Primary button:

```css
background: var(--orange);
color: white;
```

Secondary:

```css
background: transparent;
border: 1px solid var(--orange);
color: var(--orange);
```

---

# 8. Hero Photography

Use a 3-image editorial composition.

Example:

```text
┌─────────────────────┐
│ Clothing rack       │
│ / wholesale fashion │
├──────────┬──────────┤
│ Women's  │ Fashion  │
│ fashion  │ product  │
└──────────┴──────────┘
```

### Important change

The lower-left image should show **women's fashion**, not a vase or interior object.

Suitable examples:

* female model wearing wholesale clothing
* blouse / dress / jacket
* garment detail
* styled fashion editorial

The third image can be:

* handbag
* shoes
* another clothing category
* fashion accessory

The hero must remain clearly associated with **fashion wholesale**.

Use:

```css
object-fit: cover;
```

and consistent neutral photography.

---

# 9. Hero Trust Points

Below the hero CTAs add three compact trust points:

```text
Real suppliers        Direct contact        Global reach
```

Each consists of:

* small simple line icon
* short heading
* one-line supporting statement

Example:

**Real suppliers**
Wholesale businesses across Europe.

**Direct contact**
Inquire and negotiate directly.

**Global reach**
Discover suppliers beyond your existing network.

Do not make these full cards.

---

# 10. Product Section

Rename the current:

**Trending this week**

to preferably:

**New this week**

unless the backend genuinely calculates trending popularity.

Current product cards already expose:

* product image
* name
* price / quote state
* inventory status
* MOQ metadata
* product detail route

Preserve this functionality.

## Desktop layout

Prefer:

```text
5 cards visible
```

with horizontal continuation/carousel if necessary.

Example:

```text
New this week                                  View all →

[ product ][ product ][ product ][ product ][ product ]
```

### Product card

Image should dominate.

Structure:

```text
IMAGE

Product name
Supplier
Price
MOQ / stock where relevant
```

Remove heavy borders.

Suggested:

```css
background: transparent;
border: none;
```

Image:

```css
aspect-ratio: 4 / 5;
border-radius: 5px;
```

or square if required by current product photography.

Hover:

```css
transform: scale(1.025);
transition: 250ms ease;
```

Do not use fake product information from the mockup.

Use actual API/database values already feeding the current cards.

---

# 11. Category Section

Add a visual category section after products.

Title:

**Explore categories**

Categories must come from the **actual fashion taxonomy**.

At minimum the top audience segmentation can correspond to:

```text
Women
Men
Kids
```

Additional category cards should only be shown if supported by the application taxonomy, for example:

```text
Dresses
Sportswear
Jackets
Trousers
```

Do **not** hardcode unsupported categories simply because they appeared in a mockup.

Specifically:

**No Home & Living.**

Category tile structure:

```text
┌──────────────────┐
│                  │
│    IMAGE         │
│                  │
│ Women's fashion  │
└──────────────────┘
```

Text overlays the lower-left of the image.

Use a subtle dark gradient so the white category name remains readable.

---

# 12. Featured Suppliers

The existing homepage already shows:

* Luna Atelier
* tiger muay thai
* Warsaw Runners

from current seller data.

Do not hardcode these names as part of the design.

Continue rendering the seller data dynamically.

Rename section to:

**Discover suppliers**

or retain:

**Featured suppliers**

Preferred layout:

```text
Discover suppliers                            View all →

[ supplier ][ supplier ][ supplier ][ supplier ]
```

Supplier card:

```text
COVER IMAGE

Supplier name
Location
Category if available
Product count if available

View storefront →
```

The seller storefront remains one of the central marketplace concepts.

Supplier photography should be prominent.

---

# 13. Homepage “How It Works”

The existing homepage explains:

1. Browse
2. Inquire
3. Deal

Restyle this as one wide soft-background section.

Example:

```text
Wholesale from businesses you can actually reach.

01 Discover        02 Meet the supplier        03 Contact directly
```

Suggested wording can continue to communicate the existing behavior:

### 01 Discover

Browse wholesale products and suppliers.

### 02 Meet the supplier

Open their Bazoria storefront and catalogue.

### 03 Contact directly

Send an inquiry or continue through WhatsApp / direct contact.

Do not imply Bazoria currently provides checkout if it does not.

The current site explicitly describes direct inquiry and off-platform negotiation.

---

# 14. Seller CTA

Retain the existing seller CTA near the bottom of the homepage.

Restyle to:

```text
soft peach / orange-tinted background

Sell wholesale on Bazoria

Create a digital catalogue, showcase your products and
reach professional buyers.

                         [ Create seller account ]
```

Do not use a dark SaaS-style banner.

---

# 15. Join Page

Keep the **same global header** as the marketplace homepage.

The current Join page already distinguishes sellers and buyers and contains detailed benefits for both sides.

The redesign should improve visual hierarchy without throwing away this content.

---

# 16. Join Page Hero

Recommended:

```text
                JOIN THE WHOLESALE NETWORK

                   Join Bazoria

        More visibility for sellers.
           Easier sourcing for buyers.

Bazoria connects wholesalers and professional buyers
across Europe while keeping direct business relationships.

              [ I'm a seller ] [ I'm a buyer ]
```

Use a very subtle peach radial or linear background.

Do not use a giant solid orange section.

---

# 17. Seller / Buyer Choice

Immediately below the hero provide two large audience cards:

```text
┌────────────────────────┐ ┌────────────────────────┐
│ FOR BUYERS             │ │ FOR SELLERS            │
│                        │ │                        │
│ Discover suppliers     │ │ Create your catalogue  │
│ Browse catalogues      │ │ Share products         │
│ Contact directly       │ │ Reach new buyers       │
│ Source across Europe   │ │ Keep direct sales      │
│                        │ │                        │
│ Browse products        │ │ Create seller account  │
└────────────────────────┘ └────────────────────────┘
```

Use the application's existing terminology:

**buyers** and **sellers**.

Do not introduce a separate user type called “retailer” if that changes application semantics.

Retailers can still be described as part of the buyer audience.

---

# 18. Seller Benefits

Retain the existing seller message:

**Show more. Send less. Reach further.**

and:

**Upload once. Share everywhere.**

The existing five seller benefits should remain:

1. Create your digital catalogue
2. Share products anywhere
3. Open the rest of your range
4. Reach new professional buyers
5. Keep selling your way

Visually present these with:

* simple icons
* generous whitespace
* 2-column desktop grid
* no heavy card borders

---

# 19. Seller Onboarding

Retain:

**Start selling in three steps**

Existing flow:

1. Create your account
2. Set up your seller profile
3. Build your catalogue

Render this as a horizontal step component on desktop.

Example:

```text
01 ---------------- 02 ---------------- 03

Create account      Seller profile       Build catalogue
```

Mobile:

stack vertically.

Primary CTA underneath:

**Create seller account**

---

# 20. Buyer Benefits

Retain the current buyer section:

**Discover more. Search faster. Source closer.**

Existing benefits:

1. Discover new wholesalers
2. Browse current catalogues
3. Browse before travelling
4. Source closer to home

Use similar visual treatment to the seller benefits.

Alternate background slightly:

```css
background: #f8f4ee;
```

to create separation.

---

# 21. Join Page “How It Works”

Retain the existing business logic:

```text
01 Seller publishes
02 Buyer discovers
03 Both sides connect
```

The current page correctly describes Bazoria as connecting the parties through inquiry, WhatsApp or a physical showroom rather than forcing the transaction through the platform.

This is important messaging and should remain.

Use three large horizontal steps.

---

# 22. Trust Section

Keep:

**One Network. Independent Businesses.**

Two panels:

### Sellers stay in control

Identity, catalogue, prices, customers and relationships remain theirs.

### Buyers gain a clearer view

They can discover published products and contact sellers directly.

Use very subtle cards.

No icons required.

---

# 23. Final CTA

Use a soft peach container.

Example:

```text
Ready to get started?

Create your seller presence or start discovering
wholesale suppliers.

[ Sell on Bazoria ]    [ Browse products ]
```

Preserve the actual links currently used by the application.

---

# 24. Responsive Behaviour

## Desktop ≥ 1024px

* full navigation
* 2-column hero
* 5 product cards where screen width permits
* horizontal supplier cards
* 2-column benefits
* 3-column process steps

## Tablet 768–1023px

* hero remains 2-column where viable
* product grid 3 columns
* categories 3 columns
* seller/buyer benefits 2 columns

## Mobile < 768px

Header:

```text
bazoria.                      menu / sign in
```

Hero:

```text
copy
CTAs
images
trust points
```

Product cards:

```text
2 columns
```

or horizontal snap carousel.

Category cards:

```text
2 columns
```

Join page audience cards:

```text
1 column
```

All tap targets:

minimum `44 × 44 px`.

---

# 25. Image Handling

Use existing product and seller image infrastructure.

For data-driven images:

```tsx
<img
  loading="lazy"
  className="h-full w-full object-cover"
/>
```

Hero images may load eagerly:

```tsx
loading="eager"
fetchPriority="high"
```

Avoid CLS by always defining aspect ratios.

Suggested image treatment:

```css
background: #f1ede6;
```

while loading.

---

# 26. Components

Recommended component structure:

```text
components/
  layout/
    Header
    MarketplaceNavigation
    Footer

  homepage/
    MarketplaceHero
    TrustHighlights
    ProductRail
    ProductCard
    CategoryGrid
    CategoryCard
    SupplierRail
    SupplierCard
    HowItWorks
    SellerCTA

  join/
    JoinHero
    AudienceCards
    SellerBenefits
    SellerOnboarding
    BuyerBenefits
    ConnectionSteps
    TrustSection
    JoinFinalCTA
```

Do not duplicate the header/navigation between the homepage and Join page.

---

# 27. Preserve Existing Behaviour

The redesign must not break:

* `?lang=EN`
* audience query handling
* All / Women / Men / Kids selection
* Clothing dropdown
* Sellers dropdown
* product detail routes
* seller storefront routes
* Join route
* authentication route
* seller signup CTA
* responsive behavior
* keyboard navigation
* focus states

## These behaviors are already present in the current HTML.

# 28. Do Not Hardcode Mockup Content

The visual mockups contain illustrative products and sellers.

They are **design references only**.

Engineers should:

* bind product cards to existing marketplace product data
* bind supplier cards to existing seller data
* derive categories from the supported taxonomy
* preserve translations
* preserve backend-driven prices, currency, MOQ and stock
* avoid introducing fake supplier/product records

---

# 29. Specific Content Corrections

These should be treated as explicit requirements:

* Use **bazoria.** lowercase as the visual brand.
* Remove the existing boxed `B` desktop logo.
* Do not add a **Home & Living** section.
* Do not add a Home & Living category card.
* Do not use a vase / home décor image in the homepage hero.
* Use a **women's fashion image** in that position instead.
* Keep the overall marketplace focused on the supported fashion categories.
* Keep orange as an accent rather than the dominant brand color.

---

# 30. Acceptance Criteria

The implementation is complete when:

* [ ] desktop header uses the `bazoria.` wordmark
* [ ] no Home & Living section appears
* [ ] hero has an editorial two-column design
* [ ] hero imagery is fashion-focused
* [ ] lower-left hero image uses women's fashion
* [ ] homepage product section uses live product data
* [ ] marketplace product cards match the new minimalist visual system
* [ ] category section uses supported marketplace categories
* [ ] suppliers remain dynamically loaded
* [ ] Join page visually matches the homepage
* [ ] seller and buyer benefits remain intact
* [ ] existing authentication and navigation behavior is preserved
* [ ] responsive mobile design is implemented
* [ ] language switching still works
* [ ] keyboard and focus accessibility remain functional
* [ ] no mock/fake products are hardcoded into production
