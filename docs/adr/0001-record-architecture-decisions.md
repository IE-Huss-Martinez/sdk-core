# 0001. Record architecture decisions

- **Status:** Accepted
- **Date:** 2026-11-06

## Context

The SDK family is planned to grow from one SDK (PDF) to twenty or more, maintained in separate repositories by a single maintainer working with coding agents. Decisions made early, such as naming, styling, rendering model and security posture, are expensive to change once many packages depend on them. Without a written record, the reasoning behind a rule is lost and rules get re-argued or quietly broken.

## Decision

Record every significant decision as an architecture decision record (ADR) in `docs/adr` of the repository that owns it. Decisions that apply to the whole SDK family live in `sdk-core`. Decisions specific to one SDK live in that SDK's repository.

A decision is significant when it affects public API, cross-package consistency, security, or is hard to reverse.

Records are immutable once accepted. A changed decision gets a new record that supersedes the old one.

[`STANDARDS.md`](../../STANDARDS.md) summarises the rules that follow from the accepted records. When the two disagree, the newest accepted ADR wins and the standards must be corrected.

## Alternatives considered

- **Decisions only in `STANDARDS.md`:** a rule list without context invites "why can't I just…" and loses the trade-offs that were weighed.
- **Decisions in issues or pull requests:** hard to find later, and scattered across repositories.

## Consequences

- Contributors and agents can check why a rule exists before changing it.
- Writing a record adds a small amount of work to significant changes.
