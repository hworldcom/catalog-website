# Routes

TanStack Start uses **file-based routing**. Every `.tsx` file in this directory
defines a route. Do **not** create `src/pages/`, `src/routes/_app/index.tsx`, or
`app/layout.tsx` — those are Next.js / Remix conventions. The only root layout
is `src/routes/__root.tsx`.

## Conventions

| File                     | URL                                                     |
| ------------------------ | ------------------------------------------------------- |
| `index.tsx`              | `/`                                                     |
| `about.tsx`              | `/about`                                                |
| `users/index.tsx`        | `/users`                                                |
| `users/$id.tsx`          | `/users/:id` (dynamic — bare `$`, no curly braces)      |
| `posts/{-$category}.tsx` | `/posts/:category?` (optional segment)                  |
| `files/$.tsx`            | `/files/*` (splat — read via `_splat` param, never `*`) |
| `_layout.tsx`            | layout route (renders children via `<Outlet />`)        |
| `__root.tsx`             | app shell — wraps every page; preserve `<Outlet />`     |

`routeTree.gen.ts` is auto-generated. Don't edit it by hand.

## Authentication Routes

- `/auth` owns sign-in and account creation. Its optional `notice` value is
  limited to the predefined `password-reset` completion notice.
- `/auth/forgot-password` requests a reset email without disclosing whether an
  account exists.
- `/auth/recovery` is browser-only and exposes password editing only while the
  application recovery coordinator and freshly validated Supabase session
  agree.
- Authentication routes preserve only normalized `lang` values and validated
  local redirect paths. Callback URLs come from runtime canonical origin
  configuration rather than the incoming browser host.
