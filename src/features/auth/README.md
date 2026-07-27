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
