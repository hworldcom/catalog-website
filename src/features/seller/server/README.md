# Seller Server-Only Helpers

Server-only seller helpers live here.

Do not place TanStack `createServerFn` exports in this folder if they need to be
imported by route or client code. Put focused `*.functions.ts` files at the
feature root instead.

Keep onboarding, storefront, product, leads, category picker, and role helpers
in smaller modules instead of one broad seller server file.
