# Ticket 020 - Seller Storefront Subdomains

## Goal

Support admin-created seller storefront subdomains while keeping the existing path-based storefront URLs.

## Desired Behavior

Existing path URL remains valid:

```text
bazoria.com/s/kesar-textiles
```

Optional seller subdomain:

```text
kesar-textiles.bazoria.com
```

Only admins can create, change, disable, or delete seller subdomains.

## Feasibility

This is feasible if the production hosting setup supports wildcard hostnames.

Required infrastructure:

- wildcard Domain Name System (DNS) record for `*.bazoria.com`;
- hosting platform support for wildcard domains;
- Transport Layer Security (TLS) certificate coverage for `*.bazoria.com`;
- runtime access to the incoming `Host` header;
- reserved-name policy for protected subdomains.

Do not start implementation until hosting support is confirmed for the production environment.

## Scope

- Add a seller subdomain field or mapping table.
- Add admin-only server functions for:
  - creating a subdomain;
  - changing a subdomain;
  - disabling a subdomain;
  - deleting a subdomain.
- Validate subdomains:
  - lowercase letters, digits, and hyphens only;
  - no leading or trailing hyphen;
  - reasonable length limit;
  - globally unique;
  - not in the reserved list.
- Resolve requests by hostname:
  - known seller subdomain -> render public seller storefront;
  - unknown subdomain -> not found;
  - root domain and `www` -> normal marketplace.
- Keep `/s/$sellerSlug` working.
- Add canonical URL handling once the preferred storefront URL policy is chosen.

## Reserved Names

Initial reserved list:

```text
admin
api
app
auth
blog
cdn
dashboard
dev
docs
help
mail
marketplace
seller
staging
static
support
www
```

## Admin Authorization

- Sellers must not be able to self-assign subdomains.
- Buyer/account users must not be able to assign subdomains.
- Admin-only checks must happen server-side, not only in the user interface.
- Database constraints should backstop application-level authorization where possible.

## Out Of Scope

- Seller-managed subdomains.
- Custom seller domains such as `seller-own-domain.com`.
- Automatic DNS provisioning for custom domains.
- Admin, seller, or account panels on separate subdomains.
- Moving classifier admin to a Bazoria subdomain.

## Data Model Options

Option A: add columns to `sellers`:

```text
subdomain text unique null
subdomain_enabled boolean not null default false
```

Option B: create `seller_domains`:

```text
id uuid primary key
seller_id uuid not null
host text unique not null
kind text not null -- subdomain/custom_domain later
status text not null
created_by uuid not null
created_at timestamptz not null
```

Option B is better if custom domains are likely later.

## Acceptance Criteria

- Admin can assign a valid available subdomain to a seller.
- Non-admin users cannot assign or change subdomains.
- Reserved names cannot be assigned.
- Duplicate subdomains cannot be assigned.
- Existing `/s/$sellerSlug` storefront URLs still work.
- Requests to an assigned seller subdomain render that seller storefront.
- Requests to an unknown subdomain return not found or a controlled fallback.
- `npm run lint:node22` passes with no new errors.
- `npm run build:node22` passes.

