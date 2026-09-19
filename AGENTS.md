# LIVV OTA V2 — Codex Instructions

## Authority

`docs/spec/00_MASTER_SPEC.md` is the highest-priority product and
engineering specification for LIVV OTA V2.

All files under `docs/spec/` are authoritative specifications.

If implementation code, V1 reference code, comments, README files,
or historical behavior conflict with the V2 specifications, the V2
specifications win.

## V1 Reference

The V1 reference repository/worktree is:

`/Users/san/Projects/livv`

V1 is reference material only.

Codex may study V1 for:

- Ctrip collection behavior
- Meituan collection behavior
- Fliggy collection behavior
- Tongcheng collection behavior
- official OTA hotel identity extraction
- dynamic list scrolling / pagination experience
- M04 Quality Gate experience
- Cloudflare Worker / D1 deployment experience
- device authentication experience
- hotel mapping candidate experience

Codex MUST NOT assume V1 architecture should be preserved.

In particular, do not automatically inherit:

- V1 popup architecture
- `lastResults`
- local business logs
- local Market ownership
- fixed `xn-center-huatan`
- `m03-default`
- M03/M04 migration compatibility
- M04 comparison/test UI
- test-period hardcoded city/date/Market values
- legacy parsers unless independently justified
- V1 OTA UI

## Architecture Principle

Cloudflare is the control plane, business-data plane, scheduler,
analytics layer, and authoritative business source.

The Chrome Collector is a lightweight execution terminal.

The Collector executes tasks. It does not own business history.

## Development Rule

Do not implement the whole system in one pass.

Development MUST follow approved milestones.

For every milestone:

1. inspect relevant specifications;
2. implement only the milestone scope;
3. run automated tests;
4. run required acceptance checks;
5. report results;
6. commit only after the milestone passes;
7. do not begin the next milestone without approval.

## Initial Codex Task

Before writing implementation code:

1. read every file under `docs/spec/`;
2. inspect V1 reference where useful;
3. audit the V2 specifications for contradictions, missing contracts,
   unnecessary complexity, security risks, data-model conflicts, and
   implementation risks;
4. produce a specification audit report;
5. propose a milestone implementation plan.

Do not modify implementation code during the specification audit.
