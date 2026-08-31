# Auth Feature

Owns authentication entry points and session-related user interface.

Current status: owns the `/auth` screen body and shared authenticated-route
guard helper.

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
