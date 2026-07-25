---
name: functional-domain-design
description: Use internal BMAD planning to convert three architecture JSON inputs, an immutable frontend release, and optional user business decisions into an approved functional-domain package and implementation handoff for project-implementation.
---

# Functional Domain Design

## North Star

交付可执行的业务权威：PI 只读批准的领域包和 handoff，就能实现完整产品；无法安全闭合的语义必须明确 planned 或 blocked，不能用通用模板伪装完成。

## Workflow

1. Import the three architecture inputs when needed:
   ```bash
   node <skill-dir>/scripts/import-productforge.mjs \
     --db ~/.productforge/productforge.db \
     --project "<project name or id>" \
     --output <workspace>/architecture-input
   ```
2. Extract immutable release semantics and run internal BMAD planning while scaffolding:
   ```bash
   node <skill-dir>/scripts/scaffold-package.mjs \
     --input <workspace>/architecture-input \
     --visual-release <ai-restore-release> \
     --decisions <optional-user-business-decisions.json> \
     --output <workspace>/functional-domain \
     --author-agent <stable-agent-id> \
     --designs <optional-finalized-design-export-directory>
   ```
3. Read [input-contract.md](references/input-contract.md), [frontend-semantics.md](references/frontend-semantics.md), [capability-synthesis.md](references/capability-synthesis.md), [package-contract.md](references/package-contract.md), and [reviewer-gates.md](references/reviewer-gates.md). Classify architecture leaves before synthesizing capabilities.
4. Refine capability intent, operations, schemas, entities, relationships, rules, permissions, consistency, presentation, failures, and executable acceptance from traceable evidence. Read each anchored `design:<id>` export with vision and write the design's semantics — each mode's interface, fields, states, and flow — into the owning capability's closure, anchoring `design:<id>`; a complete capability grounds both evidence axes (intent and anchor). When a design export contradicts the release or observed behavior, do not silently choose — record an unresolved item citing both, and let the release/observed reading prevail.
5. Design the complete business workflow independently of current visual coverage while preserving the immutable release and its semantic anchors.
6. Mark implementation-safe designed semantics `complete`; use reachable `planned` contracts for insufficient but non-contradictory semantics; reserve blockers for contradictions requiring an authoritative decision.
7. Record planned reasons and blockers in `unresolved-items.json`.
8. Validate and independently review:
   ```bash
   node <skill-dir>/scripts/validate-package.mjs <workspace>/functional-domain
   node <skill-dir>/scripts/review-package.mjs --package <workspace>/functional-domain --reviewer-agent <independent-agent-id>
   node <skill-dir>/scripts/validate-package.mjs <workspace>/functional-domain --require-approved --check-lock
   ```
9. Build and independently review the handoff:
   ```bash
   node <skill-dir>/scripts/build-implementation-handoff.mjs --functional <approved-package> --visual-release <ai-restore-release> --output <handoff> --author-agent <id>
   node <skill-dir>/scripts/review-implementation-handoff.mjs --handoff <handoff> --reviewer-agent <id>
   ```

## Schema 2.2 Authoring

Schema 2.2 makes the agent the author and the scripts the index-and-check layer. Generation relies on understanding; verification stays deterministic.

1. Scaffold the skeleton and evidence index:
   ```bash
   node <skill-dir>/scripts/scaffold-package.mjs \
     --input <workspace>/architecture-input --visual-release <ai-restore-release> \
     --output <workspace>/functional-domain --author-agent <stable-agent-id>
   ```
   This emits `evidence-index.json` (every page, module, control, full `#` annotation, system node, observed interaction, and product-context paragraph, each with a stable id) and capability shells in `draft-pending-authoring`.
2. For each capability, read its anchored evidence (reread the raw inputs when needed) and author the `closure` six-question answer — `userInput`, `systemBehavior`, `output` (+`outputSchema`), `resultDestination` (`region`, field-assist `field`, or `headless`), `failures`, `downstreamUse` — with `evidenceAnchors` on every field, plus typed schemas, entities, relationships, rules, permissions, consistency, operations, and concrete-literal `acceptanceExamples`. Bind non-headless complete capabilities to their observed release control.
3. Keep a capability `planned` only with a `missingDecision` citing the unanswered source evidence; never leave a `draft-pending-authoring` residual.
4. Record every indexed evidence item you do not anchor in `evidence-dispositions.json` with a reason (`out-of-scope`, `decorative`, `duplicate-of:<id>`).
5. Validate structure, then review (independent agent confirms meaning fidelity against the anchored evidence):
   ```bash
   node <skill-dir>/scripts/validate-package.mjs <workspace>/functional-domain
   node <skill-dir>/scripts/review-package.mjs --package <workspace>/functional-domain --reviewer-agent <id>
   node <skill-dir>/scripts/validate-package.mjs <workspace>/functional-domain --require-approved --check-lock
   ```

Schema 2.2 is the only supported functional-domain and implementation-handoff contract.

## Judgment Rules

- Define business WHAT and WHY; leave frameworks, files, functions, and component choices to PI.
- Distinguish confirmed, documented, observed, designed, inferred, and blocked facts; never hide contradictions through precedence.
- Fold fields, local controls, display requirements, states, and constraints into their owning capability instead of manufacturing APIs.
- Infer only when architecture, release behavior, and product context jointly support an implementation-safe decision.
- Give distinct business capabilities distinct intent, schemas, outcomes, failures, quality criteria, and acceptance.
- Return genuinely authoritative unknowns as precise decisions with affected scope; do not request caller-authored capability definitions.
- Keep the package concise and traceable so downstream implementation never needs product-specific hidden context.

- For a media capability whose provider has not confirmed batch (multi-item, n greater than 1) support, loop one single-item provider call per requested item, each carrying the contract's single-item output constraint; never present one provider result as N independent items.

All artifact schemas, evidence levels, synthesis rules, review gates, and handoff requirements live only in the linked references.
