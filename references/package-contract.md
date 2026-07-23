# Package Contract

## Contents

- [Manifest](#manifest)
- [Functional spec](#functional-spec)
- [Page mapping](#page-mapping)
- [Unresolved items](#unresolved-items)
- [Approval](#approval)

## Manifest

`manifest.json` identifies the source project and schema version. `status` is `draft` or `approved`. Scaffolding always emits `draft`.

## Functional spec

`functional-spec.json` contains:

- `domains`: bounded business areas and owned entity IDs.
- `entities`: data identity, ownership, lifecycle, and sensitive fields.
- `relationships`: entity endpoints, cardinality, aggregate/reference ownership, association keys, requiredness, delete behavior, and invariants.
- `consistencyBoundaries`: aggregate roots, participating entities, and atomic or eventual consistency policy.
- `capabilities`: goal, pages, actor, inputs, outcomes, entity effects, rules, failures, and acceptance criteria.
- `valueObjects`: immutable structured business values shared by operations.
- `journeys`: ordered capability references that produce a user outcome.
- `rules`: reusable business invariants with evidence status.
- `permissions`: actor/action/resource decisions.
- `integrations`: required external capabilities and failure behavior.

FDD planning reads page architecture, system architecture, product context, the AI Restore release, and optional user business decisions. It emits `frontend-semantic-inventory.json`, `observed-interactions.json`, `control-capability-map.json`, `planning-manifest.json`, `planning-artifacts.json`, and generated `capability-definitions.json`. Independent review emits `planning-review-receipt.json`. The formal domain package is derived from and locked with these artifacts.

Every capability includes `capabilityIntent.userGoal`, `businessOutcome`, `trigger`, `prerequisites`, typed `inputs`, `processingSemantics`, typed `outputs`, `sideEffects`, `downstreamUsage`, `qualityCriteria`, `failures`, and evidence. Each operation closes method/path/content type, request/response schemas, authorization, effects, errors, transaction/consistency, idempotency, concurrency, acceptance, and applicable asset/provider contracts. Cross-operation values use explicit `dataDependencies` with runtime propagation, ownership, lifecycle, and consistency requirements.

Relationship example:

```json
{
  "id": "relation-task-results",
  "fromEntityId": "generation-task",
  "toEntityId": "generation-result",
  "cardinality": "one-to-many",
  "ownership": "aggregate",
  "required": false,
  "onDelete": "restrict",
  "associationKey": {
    "fromFields": ["id"],
    "toFields": ["taskId"]
  },
  "invariants": [
    "result.taskId references an existing task",
    "only succeeded tasks may publish available results"
  ]
}
```

An operation that creates or associates multiple related entities declares `transaction.boundary` and `transaction.atomic`, or an explicit eventual `consistency.strategy`.

Every factual item uses one evidence status:

- `observed`: captured from a running system, code, or network evidence.
- `documented`: stated by source documentation.
- `confirmed`: explicitly approved by a responsible user.
- `inferred`: proposed from architecture or UI evidence and still reviewable.
- `designed`: a deliberate functional/domain design added because the source proves the function must exist but does not specify its implementation-ready behavior.
- `blocked`: a consequential fact cannot be safely determined without responsible business authority.

## Page mapping

`page-function-map.json` maps every page ID to capability IDs. A page may be explicitly marked `navigationOnly`.

## Unresolved items

Each item contains `id`, `severity`, `question`, `relatedIds`, and `status`. Severity is `blocker`, `major`, or `minor`; status is `open` or `resolved`.

## Approval

Approval requires:

- no open blocker;
- no capability with `specificationStatus: blocked`;
- no broken ID reference;
- at least one acceptance criterion for every capability;
- explicit effects and failures for every capability that changes state;
- explicit entity identities, lifecycle constraints, relationship cardinality and association keys;
- a transaction boundary or consistency strategy for operations that write associated entities;
- a lock digest matching every formal package file.
- parsed frontend semantic artifacts bound to the immutable release;
- no unconstrained generic object replacing a business schema;
- complete control mappings, operation-specific failures and acceptance, runtime data lineage, asset transfer and provider contracts where applicable;
- distinguishable semantics for non-alias capabilities in the same business scope.

The validator generates `package-lock.json`; regenerate it after formal package files change.

`authorAgentId` and `reviewerAgentId` are workflow metadata. The local receipt proves that the package passed the reviewer script under two declared identities; it is not a cryptographic identity assertion. Environments that use approval as a trust boundary attach their authenticated review record or signature outside this package and verify it before implementation preparation.

A feature-list label proves the function is required. When detailed behavior is absent, this Skill designs distinct inputs, processing semantics, output quality, failure rules, and an acceptance example, marking those additions as `designed`. Named functions receive distinct behavior unless the approved package declares them as aliases. Decisions that require external authority remain blockers.
# Structured Capability Contract

Every complete capability declares machine-readable `inputSchema`, `outputSchema`, and `acceptanceExamples`. Each operation declares content type, location-specific request schemas, response schema, errors, effects, and transaction or consistency behavior where related writes occur. Natural-language input names are descriptive context, not an implementation contract.

Cross-operation workflows declare `dataDependencies`: source operation and response path, target operation and request path, plus applicable ownership, status, or consistency requirements. Implementations must propagate the runtime-produced value; a fixed ID or separately prepared fixture is not equivalent.

Transfer and integration semantics use `resourceTransfer`, `resourceValidation`, `resourcePersistence`, `integrationBindings`, and `externalEffects`. A file upload is one possible resource-transfer instance. Validators and implementation tools must not infer these semantics from operation IDs, labels, filenames, framework choices, product categories, or vocabulary.

`assetTransfer` is a legacy pre-contract-binding field. An old approved package without a recorded contract version may be replayed under its approval-time meaning, but every new or migrated package uses `resourceTransfer`. Handoff construction migrates a lone legacy field and rejects conflicting legacy/canonical definitions. A multipart operation without `resourceTransfer` cannot be approved or prepared. `migrate-package.mjs` writes a new draft plus `migration-receipt.json`; independent review and a new lock are mandatory.

Every capability input carries ownership evidence. Valid sources are the same business region as its trigger, an architecture owner module, a reliable semantic match, a cross-operation data dependency, or a confirmed user decision. Merely existing on the same page is not ownership evidence.

`synthesisAnalysis.confidence` is `confirmed`, `high`, `medium`, or `low`. Low-confidence capability semantics are `planned`: they retain a reachable, capability-specific planned presentation but expose no operation or state-changing domain contract. Medium confidence carries a reviewable `bmadDecision`, and an approved package records its independent reviewer. Every provider parameter mapping is also an operation `integrationBinding`.

Architecture leaves are classified before synthesis as `business-capability`, `operation`, `input-field`, `local-control`, `display-requirement`, `navigation`, `state`, or `acceptance-constraint`. Only business capabilities, independent operations, and explicitly observed embedded operations may create capability records.

The planning manifest binds every accepted medium-confidence BMAD decision to `synthesisInputDigest`. The decision records its chosen pattern, rejected alternatives with reasons, and reviewer identity. Package review never promotes a pending decision.

`manifest.capabilitySummary.blockedCapabilities` counts blocked capability records. `openBlockers` counts unresolved blocker items. They are separate measures and are never added together.

`specificationStatus` is `complete`, `planned`, or `blocked`. A `complete` capability is required for implementation completion. A `planned` capability has `deliveryPolicy.requiredForCompletion: false`, `uiBehavior: show-planned-state`, a concrete `planningReason`, and no operation, effect, state write, or fabricated output contract. `blocked` is reserved for contradictions or source-integrity conditions that make approval unsafe.

A planned capability must have a reachable UI entry and therefore cannot be `headless`. Implementation journeys contain only complete capabilities and use `acceptanceCriteria`; planned capabilities participate only in their reachability and replacement-surface contract. Create, update, retry, and external-operation capabilities are complete only when their output schema contains a capability-specific result field, explicit quality properties, downstream consumption, operation-specific failures, and executable response/quality assertions.
