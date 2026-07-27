# Features

Domain-owned application code lives here. TanStack Start route files stay in
`src/routes` and should import route-rendered screens, query options, and server
functions from these feature folders.

Feature convention:

- `README.md` documents ownership and boundaries.
- `screens/` contains route-rendered view components.
- `components/` contains UI used only by that feature.
- `*.functions.ts` contains focused TanStack server functions that may be
  imported by route and client code through TanStack Start's RPC bridge.
- `server/` is reserved for server-only helpers that must never be imported by
  client code.
- `queries.ts` can be added when the feature owns TanStack Query options.

Do not create `pages/` folders. `src/routes` owns URLs.
