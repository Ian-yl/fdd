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

FDD planning reads page architecture, system architecture, product context, the AI Restore release, and optional user business decisions. It emits `frontend-semantic-inventory.json`, `observed-interactions.json`, `control-capability-map.json`, `asset-role-inventory.json`, `planning-manifest.json`, `planning-artifacts.json`, and generated `capability-definitions.json`. Independent review emits `planning-review-receipt.json`. The formal domain package is derived from and locked with these artifacts.

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

## Aggregate submission

`aggregateSubmission` groups multiple evidenced form sections under one capability and one primary submit operation. Its request schema covers every section field, including locally managed configuration. Independent transfers remain separate `resourceTransfer` operations and feed runtime-produced resource IDs into the aggregate request through `dataDependencies`. Two independently evidenced submit actions remain separate operations. Insufficient aggregation or final-product evidence keeps the capability planned.

## Result presentation

Every complete capability that produces a business product declares `resultPresentation`: an observed or documented release region, response-to-element semantic bindings, dynamic cardinality, and processing, success, and failure states. History effects also identify their rendered entry binding. A status message alone, an invented region, or fixed result count does not close the contract.

## Asset role inventory

`asset-role-inventory.json` binds every release-referenced static asset to its digest and evidence-backed role. `decorative` assets remain part of the visual baseline. `business-sample` assets declare replacement by `api-data`, `user-input`, or `empty-state`. Unknown roles fail closed as business samples and produce an unresolved item.

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

## Schema 2.2 authored closure

Schema 2.2 is the only supported contract. `scaffold-package.mjs` emits `evidence-index.json`, an initially empty required `evidence-dispositions.json`, and capability skeletons (`specificationStatus: 'draft-pending-authoring'`, identity, pageId, anchored evidence ids, and non-authoritative classifier hints under `synthesisAnalysis.classifierRole: 'candidate-hint'`). The author agent then closes each capability and dispositions every indexed item not used by the authored contract.

`evidence-index.json` mechanically indexes every input evidence item — page, module, control, full `#` annotation text, system node, observed interaction, and product-context paragraph — with a stable id derived only from its source location (`page:`, `page-module:`, `annotation:`, `system-node:`, `observed-interaction:`, `product-context:`). Generation is deterministic and interprets no meaning.

Every authored capability carries a `closure` answering the six questions, each field with `evidenceAnchors: [<index id>]`:

- `userInput` — what the user provides;
- `systemBehavior` — what the system does;
- `output` — what is produced (with the capability `outputSchema`);
- `resultDestination` — where the result goes: `targetKind: 'region'` (a release region with response-bound elements) or `targetKind: 'field'` (field-assist write-back: `targetFieldId`, `responsePath`, `writeBehavior`, with the output type compatible with the target field type) or `targetKind: 'headless'`;
- `failures` — how failure is handled;
- `downstreamUse` — how the result is later used.

A `complete` capability's `acceptanceExamples` carry concrete literal values: real `given` inputs and real expected `then` values, never symbolic `runtime-value-N` placeholders. A `planned` capability carries a `missingDecision` record (`question`, `missingBusinessDecision`, `sourceEvidenceUnanswered: true`, `evidenceAnchors`) proving the source genuinely leaves the business decision open. When the source shows an external capability is required, the author writes an abstract `providerContract` (`requiredCapability` plus input/output mappings) without naming a vendor unless a user decision does.

`evidence-dispositions.json` records every indexed evidence item the closure does not anchor, each with a reason (`out-of-scope`, `decorative`, or `duplicate-of:<id>`). The bookkeeping gate fails the package when any indexed evidence item is neither referenced by an authored closure nor dispositioned, listing each gap. Non-headless `complete` capabilities bind their trigger to an observed release control in `control-capability-map.json` (control provenance).
# Structured Capability Contract

Every complete capability declares machine-readable `inputSchema`, `outputSchema`, and `acceptanceExamples`. Each operation declares content type, location-specific request schemas, response schema, errors, effects, and transaction or consistency behavior where related writes occur. Natural-language input names are descriptive context, not an implementation contract.

Cross-operation workflows declare `dataDependencies`: source operation and response path, target operation and request path, plus applicable ownership, status, or consistency requirements. Implementations must propagate the runtime-produced value; a fixed ID or separately prepared fixture is not equivalent.

Transfer and integration semantics use `resourceTransfer`, `resourceValidation`, `resourcePersistence`, `integrationBindings`, and `externalEffects`. A file upload is one possible resource-transfer instance. Validators and implementation tools must not infer these semantics from operation IDs, labels, filenames, framework choices, product categories, or vocabulary.

Schema 2.2 uses `resourceTransfer` exclusively. A multipart operation without `resourceTransfer` cannot be approved or prepared.

Version binding uses the immutable repository-owned Schema 2.2 entrypoints under `validators/fdd-2.2.0/` and `validators/handoff-2.2/`. FDD is the canonical validator source; PI synchronizes this registry and tests the complete cross-project tree digest. Package-supplied JavaScript, snapshot paths, and self-reported hashes are data only and are never executed.

Every capability input carries ownership evidence. Valid sources are the same business region as its trigger, an architecture owner module, a reliable semantic match, a cross-operation data dependency, or a confirmed user decision. Merely existing on the same page is not ownership evidence.

`synthesisAnalysis.confidence` is `confirmed`, `high`, `medium`, or `low`. Low-confidence capability semantics are `planned`: they retain a reachable, capability-specific planned presentation but expose no operation or state-changing domain contract. Medium confidence carries a reviewable `bmadDecision`, and an approved package records its independent reviewer. Every provider parameter mapping is also an operation `integrationBinding`.

Architecture leaves are classified before synthesis as `business-capability`, `operation`, `input-field`, `local-control`, `display-requirement`, `navigation`, `state`, or `acceptance-constraint`. Only business capabilities, independent operations, and explicitly observed embedded operations may create capability records.

The planning manifest binds every accepted medium-confidence BMAD decision to `synthesisInputDigest`. The decision records its chosen pattern, rejected alternatives with reasons, and reviewer identity. Package review never promotes a pending decision.

`manifest.capabilitySummary.blockedCapabilities` counts blocked capability records. `openBlockers` counts unresolved blocker items. They are separate measures and are never added together.

`specificationStatus` is `complete`, `planned`, or `blocked`. A `complete` capability is required for implementation completion. A `planned` capability has `deliveryPolicy.requiredForCompletion: false`, `uiBehavior: show-planned-state`, a concrete `planningReason`, and no operation, effect, state write, or fabricated output contract. `blocked` is reserved for contradictions or source-integrity conditions that make approval unsafe.

A planned capability must have a reachable UI entry and therefore cannot be `headless`. Implementation journeys contain only complete capabilities and use `acceptanceCriteria`; planned capabilities participate only in their reachability and replacement-surface contract. A non-aggregate create that presents a business product, retry, or external operation requires a documented or confirmed output schema. A result-region observation or a capability-name wrapper around status/references is not an output contract. Create, update, retry, and external-operation capabilities are complete only when their output schema contains capability-specific fields and constraints, explicit quality properties, downstream consumption, operation-specific failures, and executable response/quality assertions.

## Quantity integrity and independent media items

A capability that produces a collection of independent media results extends the existing result contract; it does not introduce a parallel mechanism.

- The dynamic count binding (`resultDestination.bindings[].count`, mode `request-field`, `fixedValueForbidden: true`) additionally sets `nonDefaultValueRequired: true`: the browser value must differ from the control's default, so a page that shows N by default but silently submits 1 is rejected at runtime. Where the capability also declares `finalProduct.quantity`, it sets the same `nonDefaultValueRequired` flag and its `sourceField` must equal the count binding's request field (one quantity chain: request field == count requestPath == `finalProduct.quantity.sourceField`, and at runtime request quantity == response collection length == visible element count == provider-call count).
- `resultDestination.itemContract` declares `{ mode: 'independent-media', uniqueIdRequired, uniqueUrlRequired, uniqueFileRequired, compositeMediaForbidden }` (all true). Collection items are either media-URL strings (the value is the media resource) or objects that name their own `idField`/`urlField`. Runtime verification fetches each item URL and requires a 200 with a byte digest distinct from every other item — a single collage or grid reused across N slots, or the same URL repeated, fails.
- When the business genuinely needs one composite image, it is modelled as a separate `composite-output` capability; independent-media and composite-output are never mixed.
- A media `operation.providerContract` sets `outputMode: 'independent-items'`, `oneProviderResultPerItem: true`, `batchSupportAssumed: false` (loop per item when batch support is unconfirmed), and `perCallConstraints` carrying the single-item output constraint. This contractualizes the established practice of looping single-item provider calls when the provider does not confirm `n>1`.

Validate proves the contract is structurally complete and its quantity chain and item fields resolve to real schema paths; the independent-media runtime facts (non-default value, count agreement, per-item uniqueness) are enforced by the implementation runner. A content-level collage — N separate images each internally containing a grid — cannot be detected mechanically; it is bounded by the provider `perCallConstraints`, integrated observation, and manual spot-check.
