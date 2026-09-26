# Contributing to StockSense

These rules are project quality gates. Every feature, bug fix, and pull request should follow them.

## Non-negotiable engineering principles

### Use real, dynamic data

- Product, stock, operation, and ledger data must flow through the API and SQLite database.
- Static JSON is acceptable only for a clearly labeled prototype, test fixture, or first-run seed.
- User actions must refresh or update the visible state without requiring a page reload.
- Stock-changing operations must remain transactional and auditable.

### Keep the interface responsive and consistent

- Verify each workflow at mobile, tablet, and desktop widths.
- Reuse the existing color, spacing, typography, form, table, modal, and status patterns.
- Navigation must be predictable, keyboard-accessible, and placed consistently.
- Avoid adding menu items until the destination provides a useful state or clearly communicates its roadmap status.
- Empty, loading, error, and success states are part of every feature.

### Validate input at every boundary

- Use native client constraints for immediate feedback and Zod validation at the API boundary.
- Never trust IDs, quantities, dates, stock levels, or status transitions received from the client.
- Reject negative stock, duplicate SKUs, invalid routes, same-location transfers, and illegal operation transitions.
- Return concise, actionable error messages without exposing implementation details.

### Use Git as a team workflow

- Create a focused feature branch for each milestone or fix.
- Keep commits small, descriptive, and independently buildable.
- Use pull requests for integration and request review from another team member.
- Give all active team members appropriate repository access; the repository must not depend on one person.
- Never commit databases, secrets, generated builds, or local environment files.

## Local-first architecture

- The core inventory workflow must work with the local Express API and SQLite database.
- Cloud services may enhance the product, but core stock visibility and movement must not depend on them.
- Prefer a graceful offline or reconnecting state over silent failure.
- Keep data access behind API boundaries so synchronization can be added later without rewriting the UI.

## Using AI-assisted code responsibly

- Understand the behavior and failure modes before merging generated code.
- Adapt suggestions to StockSense's data model, naming, UI system, and security constraints.
- Remove unused abstractions and dependencies.
- Verify behavior with a build, targeted tests, and a real workflow—not by visual inspection alone.

## Technology choices

Adopt a new dependency only when it provides clear value. Consider bundle size, maintenance, security, offline behavior, team familiarity, and whether the existing stack already solves the problem.

## Definition of done

Before a change is ready for review:

- [ ] Data comes from the API/database rather than embedded production JSON.
- [ ] Client and server validation cover invalid and boundary inputs.
- [ ] Stock mutations are atomic and recorded in the ledger.
- [ ] Mobile, tablet, and desktop layouts have been checked.
- [ ] Loading, empty, error, and success states are handled.
- [ ] Navigation and keyboard behavior remain intuitive.
- [ ] `npm run format` and `npm run build` pass.
- [ ] Targeted tests or a documented smoke test pass.
- [ ] No secrets, local databases, or generated output are staged.
- [ ] The change is on a focused branch with a clear commit and reviewer.
