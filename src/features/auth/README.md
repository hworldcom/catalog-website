# Auth Feature

Owns authentication entry points and session-related user interface.

Current status: owns `/auth`, `/auth/forgot-password`, `/auth/recovery`, the
browser recovery coordinator, and the shared authenticated-route guard helper.

Boundaries:

- Keep protected route wrappers in `src/routes` where they own routing behavior.
- Keep seller onboarding and seller role workflows in `src/features/seller`.
- Keep account profile workflows in `src/features/account`.
- Use the project-owned Supabase client for email/password and Google OAuth.
- Keep post-login redirects local to Bazoria routes.
- Build account-confirmation and provider callback URLs from the validated
  runtime `canonicalSiteOrigin`, never from the browser request origin.
- Treat `googleSignInEnabled` as an operator-controlled release gate. Hide the
  provider control and separator when it is false; provider secrets remain in
  Supabase and never enter runtime public configuration.
- New credentials use the shared 8-through-128-character password policy and
  exact confirmation matching. Sign-in does not prevalidate legacy passwords.
- Render Bazoria-owned translated authentication errors rather than complete
  provider messages.

## Password Recovery

- Reset-email requests use the canonical public site origin and preserve only
  a validated local redirect plus a supported language.
- Every Supabase response to a syntactically valid reset request renders the
  same neutral accepted state. Only a definite status-zero browser transport
  failure renders a generic retry state.
- `src/client.tsx` registers the recovery coordinator after runtime public
  configuration and before route hydration.
- Recovery routing state is stored in `localStorage` under
  `bazoria.auth.recovery.v1:<configured-supabase-host>`. The marker contains
  only its schema version, Supabase user identifier, and session expiry; it is
  not an authentication credential.
- Marker acceptance requires `getSession()` followed by `getUser()`, matching
  user identifiers, an exact expiry match, and a future expiry.
- Storage events propagate recovery state across tabs. The root subscriber
  invalidates the router so already-open seller and administrator routes run
  their protected guard again and redirect to `/auth/recovery`.
- Token refresh may update only an already-active marker for the same user. A
  refresh cannot create recovery state.
- Password completion and explicit cancellation use local-scope Supabase
  sign-out. If sign-out fails after a successful password update, the password
  form remains locked and only sign-out can be retried.
- Never log reset links, access or refresh tokens, passwords, complete provider
  responses, email addresses, or account-existence inferences.
