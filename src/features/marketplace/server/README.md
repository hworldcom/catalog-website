# Marketplace Server-Only Helpers

Server-only marketplace helpers live here.

Do not place TanStack `createServerFn` exports in this folder if they need to be
imported by route or client code. Put focused `*.functions.ts` files at the
feature root instead.

Keep public catalog read functions separate from seller/admin write workflows.
