---
name: functional-domain-design
description: Convert an immutable frontend release, three architecture JSON inputs, finalized designs, and optional user business decisions into an approved functional-domain package and implementation handoff for project-implementation by identifying each page's visual interaction closures.
---

# Functional Domain Design

## North Star

交付可执行的业务权威：PI 只读批准的领域包和 handoff，就能实现完整产品。能力来自视觉页面的交互闭环（输入集合→主触发→系统处理→处理中→成功结果区→失败→后续操作），一个闭环=一个能力；架构与产品上下文只补业务语义、不生成也不限制能力。无法安全闭合的语义必须明确 planned 或 blocked，不能用通用模板伪装完成。

## Workflow

1. Import the three architecture inputs when needed:
   ```bash
   node <skill-dir>/scripts/import-productforge.mjs \
     --db ~/.productforge/productforge.db \
     --project "<project name or id>" \
     --output <workspace>/architecture-input
   ```
2. Extract the release's complete page semantics and build the evidence workspace (no capability is synthesized):
   ```bash
   node <skill-dir>/scripts/scaffold-package.mjs \
     --input <workspace>/architecture-input \
     --designs <finalized-design-export-directory> \
     --visual-release <ai-restore-release> \
     --decisions <optional-user-business-decisions.json> \
     --output <workspace>/functional-domain \
     --author-agent <stable-agent-id>
   ```
3. Read [input-contract.md](references/input-contract.md), [frontend-semantics.md](references/frontend-semantics.md), [capability-synthesis.md](references/capability-synthesis.md), [package-contract.md](references/package-contract.md), and [reviewer-gates.md](references/reviewer-gates.md). Read each page's semantics and identify its interaction closures; the architecture is context evidence, never a capability generator.
4. For each closure, author one capability's intent, operations, schemas, entities, relationships, rules, permissions, consistency, presentation, failures, and executable acceptance from traceable evidence, and disposition every interaction control. Read each anchored `design:<id>` export with vision and write the design's semantics — each mode's interface, fields, states, and flow — into the owning closure, anchoring `design:<id>`; a complete capability grounds both evidence axes (intent and anchor). The release is the implementation baseline. Architecture or design gaps are context for Agent judgment and may be completed with evidence-backed designed controls or flows; only a complete product-identity mismatch is an automatic blocker.
5. Design the complete business behavior of each closure while preserving the immutable release and its semantic anchors.
6. Mark implementation-safe designed semantics `complete`; use reachable `planned` contracts for insufficient but non-contradictory semantics; reserve blockers for contradictions requiring an authoritative decision.
7. Record planned reasons and blockers in `unresolved-items.json`.
8. Validate artifact structure, then have a distinct reviewer Agent read the source evidence and judge omitted or incorrectly merged closures:
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

## Schema 2.3 Authoring

Schema 2.3 makes the agent the author and the scripts the index-and-check layer. Generation relies on understanding the page's interaction closures; verification stays deterministic.

1. Scaffold the evidence workspace:
   ```bash
   node <skill-dir>/scripts/scaffold-package.mjs \
     --input <workspace>/architecture-input --designs <finalized-design-export-directory> \
     --visual-release <ai-restore-release> \
     --output <workspace>/functional-domain --author-agent <stable-agent-id>
   ```
   This emits `evidence-index.json` (every page, module, control, full `#` annotation, system node, observed interaction, product-context paragraph, and finalized design, each with a stable id), `control-dispositions.json` (every interaction control seeded `unresolved`), and `grouping-candidates.json` (advisory closure hints). It synthesizes no capability.
2. Read each page's semantics and identify its interaction closures. For each closure, create one capability and author its `closure` six-question answer — `userInput`, `systemBehavior`, `output` (+`outputSchema`), `resultDestination` (`region`, field-assist `field`, or `headless`), `failures`, `downstreamUse` — with `evidenceAnchors` on every field, plus typed schemas, entities, relationships, rules, permissions, consistency, operations, and concrete-literal `acceptanceExamples`. Group inputs and the primary trigger into one aggregate capability; do not split one closure into a capability per control, and do not merge two independently evidenced closures.
3. Disposition every interaction control in `control-dispositions.json`: `primary-trigger` (with its `capabilityId` and `operationId`), `input` or `secondary-action` (with `capabilityId`), `navigation`, `presentation-only`, or `ignored-with-reason` (with a rationale). You cannot finish authoring while any control remains `unresolved`; a menu, history, or navigation control never carries a submit operation. Mirror each `primary-trigger` in `control-capability-map.json`, and give each required request field an approved release-control, agent-designed-control, evidenced application-state, or prior-operation origin.
4. Keep a capability `planned` only with a `missingDecision` citing the unanswered source evidence.
5. Record every indexed evidence item you do not anchor in `evidence-dispositions.json` with a reason (`out-of-scope`, `decorative`, `duplicate-of:<id>`).
6. Validate structure, then review (independent agent confirms meaning fidelity against the release and the anchored evidence):
   ```bash
   node <skill-dir>/scripts/validate-package.mjs <workspace>/functional-domain
   node <skill-dir>/scripts/review-package.mjs --package <workspace>/functional-domain --reviewer-agent <id>
   node <skill-dir>/scripts/validate-package.mjs <workspace>/functional-domain --require-approved --check-lock
   ```

Schema 2.3 is the only supported functional-domain and implementation-handoff contract.

## Judgment Rules

- Define business WHAT and WHY; leave frameworks, files, functions, and component choices to PI.
- One interaction closure is one capability. The inputs, the primary trigger, the result region, and the three states of one closure fold into that one capability; never manufacture an API per control, and never merge two independently evidenced closures because they share a page.
- Distinguish confirmed, documented, observed, designed, inferred, and blocked facts; never hide contradictions through precedence.
- Identify a primary trigger from structured evidence — a native submit type, a form scope, or an observed submit interaction — never from a label or DOM proximity. Collect the closure's scoped inputs into one operation and bind that operation back to the release control; never create a capability or endpoint merely for the button.
- Account for every interaction control with exactly one disposition; a control you cannot honestly wire into a closure is `ignored-with-reason`, never a hidden capability.
- Treat resource selection and field-assist write-back as their own evidenced interaction closures when they have independent processing/results. The reviewer, not the validator, judges whether the author omitted or incorrectly merged them.
- Infer only when architecture, release behavior, and product context jointly support an implementation-safe decision.
- Give distinct business capabilities distinct intent, schemas, outcomes, failures, quality criteria, and acceptance.
- Return genuinely authoritative unknowns as precise decisions with affected scope; do not request caller-authored capability definitions.
- Keep the package concise and traceable so downstream implementation never needs product-specific hidden context.

- Declare the concurrency behavior the business and provider require; the validator checks the declaration, not the scheduling choice. Missing visual controls may be designed and added with evidence; the release is a baseline, not a feature ceiling.

All artifact schemas, evidence levels, synthesis rules, review gates, and handoff requirements live only in the linked references.
