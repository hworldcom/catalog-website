# Ticket 028 - Repository Publish Preparation

## Status

Implemented locally on 2026-07-27.

## Goal

Prepare the initial GitHub commit by excluding secrets, generated deployment output, and local
tool state while keeping source code, database migrations, and planning notes versioned.

## Expected Behavior

- Ignore all environment files except a future `.env.example` template.
- Ignore Vercel build output and Supabase Command Line Interface internal state.
- Ignore common test coverage and TypeScript or lint caches.
- Keep `tickets/`, `supabase/config.toml`, Supabase migrations, tests, and application source
  available to Git.

## Edge Cases

- A committed `.env.example` must remain visible to Git and contain placeholders only.
- Supabase configuration must not contain hard-coded credentials before it is committed.

## Non-Goals

- Do not create a remote repository, stage files, commit, or push.
- Do not modify application code or rotate credentials that have not been committed.

## Validation Notes

- Use `git check-ignore` to confirm local-only paths are ignored.
- Use `git status --short` to confirm tickets and source files remain visible to Git.
