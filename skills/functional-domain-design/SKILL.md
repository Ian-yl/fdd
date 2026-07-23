---
name: functional-domain-design
description: Use internal BMAD planning to convert three architecture JSON inputs, an AI Restore release, and optional user business decisions into an approved functional-domain package and implementation handoff for project-implementation.
---

# Functional Domain Design

Produce business authority for downstream design and implementation. Classify architectural hints by their actual evidence status.

## Workflow

1. Import the architecture inputs. For ProductForge projects, run:

   ```bash
   node <skill-dir>/scripts/import-productforge.mjs \
     --db ~/.productforge/productforge.db \
     --project "<project name or id>" \
     --output <workspace>/architecture-input
   ```

   The formal input set consists of the page architecture JSON, system architecture JSON, product context JSON, AI Restore release, and optional user business decisions.

2. Parse the immutable release into `frontend-semantic-inventory.json`, `observed-interactions.json`, and `control-capability-map.json`. Capture pages, routes, regions, controls, labels, requiredness, options, handlers, state changes, network observations, result surfaces, and source digests. Run internal BMAD project understanding, requirements analysis, and domain design while generating a candidate package. Generation always produces `draft`:

   ```bash
   node <skill-dir>/scripts/scaffold-package.mjs \
     --input <workspace>/architecture-input \
     --visual-release <ai-restore-release> \
     --decisions <optional-user-business-decisions.json> \
     --output <workspace>/functional-domain \
     --author-agent <stable-agent-id>
   ```

   Read and reason over all inputs. Persist internal planning as `planning-manifest.json`, `planning-artifacts.json`, and generated `capability-definitions.json`. User decisions act as optional overrides during planning. For every capability close actor/scenario, business data, relationships, prerequisites, requiredness, rules, state transitions, execution mode, failure/recovery, idempotency, permissions, transaction, integration, UI-operation mapping, and executable acceptance.

3. Read `<skill-dir>/references/input-contract.md`, `frontend-semantics.md`, `capability-synthesis.md`, `package-contract.md`, and `reviewer-gates.md`. Classify every architecture leaf before synthesis. Only `business-capability`, independent `operation`, and an explicitly observed embedded operation create capability records. Fold `input-field`, `local-control`, `display-requirement`, `state`, and `acceptance-constraint` leaves into their owning capability contract; keep navigation in page mapping. When only a menu name exists, combine the page workspace, system responsibility, shared operations, and frontend evidence into an implementation-ready `designed` capability.
4. Verify and refine explicit inputs, outcomes, rules, failure states, entities, relationships, consistency boundaries, and acceptance criteria. Define identity fields, aggregate roots, cardinality, association keys, cascades, uniqueness, requiredness, lifecycle constraints, ownership scope, and operation transactions. Preserve references to the three input documents.
5. Define the complete business workflow independently of the current visual controls. Assign each capability a presentation mode: `reuse-control`, `add-control`, `extend-flow`, `headless`, or `display-only`.
   Named menu capabilities also define activation, active surface regions, input IDs, primary action/operation, empty state, and delivery policy. Distinct non-alias capabilities receive distinct content contracts, not heading-only variants.
6. Mark semantics created by FDD planning as `designed`. When one capability still lacks enough evidence for an implementation-safe contract, mark that capability `planned`, remove guessed operations/effects/state writes, and define a reachable capability-specific “功能待实现” presentation. Record a package blocker only when source identity, authoritative inputs, or business decisions contradict each other and make approval unsafe.
7. Record planned reasons and genuine contradictions in `unresolved-items.json`; only the latter use blocker severity.
8. Validate during iteration. Independent review covers both FDD planning and the formal package, producing `planning-review-receipt.json` and `review-receipt.json`. Approval requires explicit decisions that resolve every blocker:

   ```bash
   node <skill-dir>/scripts/validate-package.mjs <workspace>/functional-domain
   node <skill-dir>/scripts/validate-package.mjs <workspace>/functional-domain --require-approved
   ```
9. Build and independently review the implementation handoff:

   ```bash
   node <skill-dir>/scripts/build-implementation-handoff.mjs --functional <approved-package> --visual-release <ai-restore-release> --output <handoff> --author-agent <id>
   node <skill-dir>/scripts/review-implementation-handoff.mjs --handoff <handoff> --reviewer-agent <id>
   ```

## Required Outputs

- `manifest.json`
- `frontend-semantic-inventory.json`
- `observed-interactions.json`
- `control-capability-map.json`
- `functional-spec.json`
- `page-function-map.json`
- `unresolved-items.json`
- `package-lock.json`

Keep the package concise. Use stable IDs and references rather than repeating prose. Downstream agents should load only capabilities linked to their current page or operation.

## Rules

- Define WHAT and WHY. Leave framework, file, and function choices to implementation.
- Give every non-navigation page at least one capability.
- Give every write capability an entity effect, failure behavior, and acceptance criterion.
- Give every persistent entity an identity, lifecycle, constraints, and aggregate-root declaration. Give every relationship cardinality, ownership, association keys, delete behavior, and invariants.
- Give operations that write associated entities an atomic transaction boundary or explicit consistency strategy.
- Separate `observed`, `documented`, `confirmed`, and `inferred` facts.
- Record authorization, deletion, billing, concurrency, retention, and external-provider rules only when supported by evidence or an explicit design decision.
- Fail closed on unresolved blockers and broken references.
- Never promote a pending BMAD decision during package review. Medium-confidence decisions are accepted inside FDD planning, bind to the planning input digest, record the chosen pattern, rejected alternatives with reasons, and an internal reviewer identity.
- Exclude shared header, toolbar, navigation, and global-search controls from capability-specific trigger matching.
- Give named functions distinct provider contracts. Share one contract only for aliases declared by the approved domain package.
- Every `complete` menu capability must receive dedicated inputs, processing semantics, output quality, failures, and an acceptance example. A capability that cannot meet this bar becomes `planned` with no guessed business operation and an explicit reachable planned state. Use `blocked` only when a contradiction makes package approval unsafe.
- Never translate page labels into a uniform CRUD or `{ input: object } -> { result: object }` template. Schema validity alone is not domain completion.
- Do not request caller-authored capability definitions. Do not implement code or modify the immutable visual release.
- Evidence priority is `confirmed`, `documented`, `observed`, `designed`, `inferred`, then `blocked`. Contradictions become unresolved items instead of silent precedence choices.
- PI receives enough locked semantics to implement without reopening raw architecture or product-specific references; framework and code organization remain PI decisions.
