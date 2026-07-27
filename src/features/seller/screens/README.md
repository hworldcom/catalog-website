# Seller Screens

Route-rendered seller dashboard view components live here.

TanStack route files stay in `src/routes` and import screens from this folder.

The ProductDraft edit screen also embeds the shared structured-facts editor.
Seller ownership and draft editability are enforced by the facts server
functions rather than by browser state.
