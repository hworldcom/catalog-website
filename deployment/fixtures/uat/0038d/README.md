# UAT Marketplace Fixture Assets

This directory contains the synthetic image bundle used to reproduce the
moderated User Acceptance Testing marketplace. The files contain no customer
data or third-party branding.

`assets/manifest.json` is the authoritative bundle inventory. Fixture commands
verify every declared file's path, media type, byte size, and SHA-256 checksum
before performing any database, authentication, or storage mutation.

This directory is intentionally tracked in Git and excluded from all production
container build contexts and runtime images.
