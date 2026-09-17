# Migration Drafts

This directory contains local D1/SQLite-compatible migration drafts.

M01 creates `0001_initial.sql` only as a design artifact. Do not apply it to Cloudflare D1 in this phase.

Migration principles:

- Prefer explicit primary keys, foreign keys, unique indexes, and query indexes.
- Keep original facts immutable.
- Avoid storing core relationships in JSON.
- Use JSON only for safe metadata or evidence where flexible detail is appropriate.
- Do not use triggers for complex business logic unless a later phase proves they are necessary.
- Do not add historical compatibility fields.
- Do not create indexes without a known query path.
