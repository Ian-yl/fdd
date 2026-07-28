# Capability Synthesis

Evidence precedence is `confirmed`, `documented`, `observed`, `designed`, `inferred`, then `blocked`. Higher authority does not silently erase a contradiction; incompatible facts produce an unresolved item.

## Synthesis is driven by visual interaction closures, not architecture leaves

Under schema 2.3 the unit of synthesis is a **page interaction closure**, not an architecture leaf. The authoring agent reads each released page's complete semantics and identifies every closed loop the page supports; one closed loop is one capability. The page architecture, system architecture, and product context are **context evidence** that enriches a closure's business meaning — its purpose, entities, rules, and downstream use — but they never generate, bound, cap, or split capabilities. An architecture leaf is not a capability; a matching system node is not an operation; a module boundary is not a capability boundary. The visual release and its observed behavior decide what closures exist, and the context evidence explains what each closure means.

A closure operates in interaction-local scope: the input controls, the primary trigger, the result surface, and the states that participate in one user-initiated outcome on one page. Whole-page words do not classify every capability on that page, and one page may host several independent closures.

## The interaction closure model

Each closure is the loop **input set → primary trigger control → system processing → processing state → success result region → failure state → downstream actions**. The agent identifies these seven elements per page and closes them into one capability. For example, on an image-generation page: upload a product image, enter selling points, choose a style, choose a ratio, choose a quantity (input set) → click 立即生成 (primary trigger) → create a task and deduct credits (system processing) → 生成中 (processing state) → the 套图 result grid (success result region) → 余额不足/生成失败 (failure state) → download / regenerate / open history (downstream actions). That whole loop is one capability, not seven.

The closure's elements map onto the **existing** contract structures — schema 2.3 adds no parallel capability shape:

- **input set** → the capability's `closure.userInput` and `inputSchema`; each input control is dispositioned to this capability (see the control-disposition ledger).
- **primary trigger control** → a `control-dispositions.json` entry with `disposition: 'primary-trigger'` naming this `capabilityId` and its primary `operationId`, mirrored by `control-capability-map.json` and `presentation.primaryOperationId`.
- **system processing** → `closure.systemBehavior` and the primary `operation` (method, path, effects, provider contract).
- **processing / success / failure states** → `closure.resultDestination.states.processing|success|failure` (and `resultPresentation.states` where a business product is presented).
- **success result region** → `closure.resultDestination` (`targetKind: 'region'` with response-bound elements, or `'field'` for field-assist, or `'headless'`) and `resultPresentation.targetRegion`.
- **failure state** → `closure.failures` and the failure state semantics of the result destination.
- **downstream actions** → `closure.downstreamUse`, plus each follow-up control dispositioned `secondary-action` to this capability.

When several form or configuration sections feed one submit, the closure is an `aggregateSubmission` (below). When the closure produces a collection of independent media items, it additionally carries the independent-media item contract. These are the same existing structures a closure resolves into; the agent never invents a new capability container to hold "the loop."

## Control disposition ledger

Every interaction control the release exposes is accounted for in `control-dispositions.json`. Each entry is `{ controlId, pageId, disposition, capabilityId?, operationId?, rationale? }`, and `disposition` is exactly one of:

- `primary-trigger` — the control that submits a closure. Carries `capabilityId` and `operationId`; the operation is that capability's primary operation and its business result participates in a result presentation.
- `input` — a field, upload, or selector whose value feeds a closure. Carries the `capabilityId` that consumes it.
- `secondary-action` — a follow-up action of a closure (download, retry, regenerate, open detail). Carries `capabilityId`, and `operationId` when it triggers its own server operation.
- `navigation` — a menu, route, or history entry that only changes location or view. Carries no capability and can never bind a state-writing operation.
- `presentation-only` — a display element, status label, or result-surface chrome with no command behavior. Carries no capability.
- `ignored-with-reason` — a control deliberately excluded from business behavior. Carries a non-empty `rationale`.

The scaffold seeds every discovered control with `disposition: 'unresolved'`; the authoring agent must replace every seed with one of the six real dispositions before the package validates. A residual `unresolved` entry, a control present in the release inventory but missing from the ledger, and a ledger entry for a control absent from the inventory are each fail-closed rejections. This ledger — not an architecture-leaf classification — is how completeness is proven: the six business questions are answered for every closure, and every control the user can touch is either wired into a closure or honestly excluded.

A `primary-trigger` control is identified only from structured evidence: a native submit type, an explicit submission role or form scope, or an observed submit interaction. Labels and DOM proximity are never classifiers of a trigger. Menu, history, and other navigation controls can never serve as a submit trigger; a control that cannot be honestly assigned a business disposition is `ignored-with-reason`, never a button-shaped capability or a generic endpoint.

## Candidate grouping is a hint, never a conclusion

To help the agent group inputs and triggers into closures, the scaffold emits grouping **candidates** computed from same-container/DOM containment and visual distance, button-text hierarchy, field required/type/default affinity, spatial association to a result region, architecture annotations, and observed network interactions. These candidates are advisory hints recorded in `grouping-candidates.json`; they never become the final grouping. The authoring agent confirms, splits, or merges them from evidence, and the validator never treats a candidate grouping as a decided closure. No field-name heuristic, label match, or proximity score substitutes for the agent's grouping decision.

## Closing a capability

Each capability closes user goal, outcome, trigger, prerequisites, typed input and output, processing semantics, side effects, downstream use, quality, failures, presentation, and executable acceptance. Core operation patterns are domain-neutral: navigation/local state, resource transfer, create/update/delete, query/history/status, retry, download/preview, and external operation. A presentable non-aggregate create, retry, or external operation without an evidence-backed capability-specific output schema stays planned; synthesis never manufactures a result contract from the capability name. Product-specific external semantics come from source claims and accepted design decisions, not a built-in product vocabulary.

Text and label matching is only candidate analysis recorded in `synthesisAnalysis`. A `complete` capability additionally requires a resolved interaction closure — a real primary trigger, real inputs, and a real result destination on a released page — plus minimum implementable information. Complex external behavior needs capability-specific documented, observed, confirmed, or input-bound designed fields; a generic resource ID or synthetic target alone is insufficient. When that information is absent for one closure, synthesis emits a `planned` capability with a reachable planned presentation and no business input/output schema, operation, effect, or success fixture.

Persistent workflows produce entities appropriate to the observed operation roles; relationships, aggregate ownership, state machines, permissions, consistency boundaries, and journeys are generated from operation lifecycles. Runtime values crossing operations use `dataDependencies`; fixed IDs are explicitly forbidden in acceptance bindings.

## Cross-region aggregate submission

Multiple form or configuration sections become one `aggregateSubmission` only when they are inside one closure and one primary submit action consumes their values to produce one final product. Evidence is accepted in this order: an `observed-interactions` request carrying the declared fields across the sections, a confirmed user decision, or an explicit architecture declaration. DOM proximity and similar labels are not evidence. If the relationship or final-product semantics cannot be proven, the primary capability is `planned` with an unresolved item and has no operation, schema, or acceptance fixture.

`aggregateSubmission.sections` preserves field groups and source regions. The final JSON operation has exactly one body schema covering every section field, including local-only configuration fields. Its `configurationAggregate` is an aggregate-root entity and the operation persists it atomically. `finalProduct` declares type, quantity (a fixed integer or a `sourceField` included in the aggregate request), lifecycle, and downstream usage.

Section leaves do not become capabilities or APIs. Menu modes remain separate capabilities. Two independently evidenced submit actions remain two operations and are never merged merely because they share a page. Resource uploads remain independent multipart operations using `resourceTransfer`; their runtime resource IDs enter the aggregate request through `dataDependencies`.

The authoring agent closes a primary submit as the trigger of one aggregate business capability. The primary `POST` operation covers every evidenced field in its submission scope, is named by the control's `primary-trigger` disposition and by `control-capability-map.json` and `presentation.primaryOperationId`, and returns the capability's business result. Navigation, history, and other entry controls cannot serve as aggregate-submit triggers. A submit candidate that cannot be assigned honestly remains blocked rather than receiving a generic operation.

## Result presentation binding

Aggregate submission and result presentation are the input and output halves of one capability closure. A complete capability that creates a business product declares `resultPresentation`: an observed, documented, or confirmed `targetRegion` from `frontend-semantic-inventory.json`; response-path-to-element bindings; dynamic cardinality derived from the response or a request quantity field; and processing, success, and failure region semantics. A status message is not a result element.

Static release assets are classified from the semantic role of their source reference. `decorative` requires evidence that the asset is visual chrome and carries no business data. `business-sample` requires `api-data`, `user-input`, or `empty-state` replacement. Ambiguous assets default to `business-sample` with an unresolved item. Filename patterns are discovery hints only.

Every multipart `resourceTransfer` declares `interaction: file-selection`. This is an observable browser action contract, independent of whether another operation consumes the returned resource.

Implementations expose semantic markers `data-result-region-id`, `data-result-status`, and `data-result-binding-id` to locate the result surface. Runtime values come from browser-observed text content, media sources, links, or form values and are never trusted from a data attribute. The contract never constrains pixels, layout, or styling, but runtime verification does require computed visibility and non-zero bounds. Missing region or binding evidence leaves the capability planned and creates an unresolved item.

Entities are derived from operation roles (`resource`, `task`, `configuration`, `asset`, `result`) rather than creating a page-level task aggregate for every product. Rules are attached to their capabilities and operations. External operations include contract-driven integrated verification scenarios and artifact assertions.

FDD chooses business contracts, not frameworks, packages, components, tables, directories, or source-code organization.

## Schema 2.3: interaction closures drive capabilities, authoring closes meaning

Under schema 2.3 the scaffold no longer synthesizes any capability. It extracts the release's complete page semantics, indexes every input evidence item into `evidence-index.json`, seeds every interaction control into `control-dispositions.json` as `unresolved`, and emits advisory grouping candidates. The author agent then reads each page's semantics, identifies its interaction closures, creates one capability per closure, and dispositions every control — closing the six business questions from resolvable evidence anchors.

This removes the architecture-leaf ceiling: the number and boundaries of capabilities come from the visual closures, not from how the architecture tree was drawn. A capability may be `complete` even when no architecture leaf named it, as long as its closure is authored from resolvable evidence anchors and passes structural validation. A capability stays `planned` only when the source genuinely does not answer a required business decision — recorded as a `missingDecision` citing the unanswered evidence — never merely because a leaf or a regular expression failed to match. An annotation such as “根据上传图片生成文案并回填文本域” is authored into a field-assist capability (`resultDestination.targetKind: 'field'`) rather than compressed into a button label and marked planned.

## Hard constraint: agent autonomy

Agent autonomy is a hard constraint. Deterministic tooling may require that a disposition, contract, or ledger entry exists, and may check structural completeness and reference validity — it never infers, defaults, or judges the entry's content. Every business judgment (what an input is for, how it maps, why something is excluded, which controls form one closure, what a capability means) belongs to the authoring agent, based on evidence; the honesty of those judgments is audited by the independent reviewer, not by scripts. No field-name heuristic, grouping candidate, or built-in default may substitute for an agent's decision.

## Dual-axis evidence taxonomy

Evidence answers two different questions, and a complete capability's closure grounds both. **Intent evidence** — design exports, `#` annotations, product context, and confirmed decisions — answers *what to build and why*. **Anchor evidence** — release controls, regions, and observed interactions — answers *where it lands*. Validate checks only that a complete capability anchors at least one item of each axis and that every anchor resolves; whether the anchored semantics are faithful is the author's and reviewer's judgment.

Only upstream-selected, finalized design exports enter the evidence index — the design-manifest records the selection provenance, and exploration proposals are never indexed, so they carry no bookkeeping or disposition burden. A design export is `documented`-tier evidence — a written statement of intent — sitting alongside annotations and product context on the intent axis.

Conflict handling: when a design export contradicts the release or observed behavior, the closure never silently adopts either side — the conflict is always raised as an unresolved item citing both. The implementation anchor follows the release (the survivor of the adopted design, the actually-shipped surface), while the intent discrepancy awaits a product decision. This is a conflict-specific rule, not a reordering of the global evidence priority: a design export remains `documented`-tier evidence alongside annotations and product context.

## Media generation: loop per item until batch is confirmed

When source evidence shows a capability produces N independent media results through an external provider, the author closes it with an `operation.providerContract` whose `outputMode` is `independent-items` and `oneProviderResultPerItem` is true. Unless the source explicitly confirms the provider supports batch generation (`n>1`), `batchSupportAssumed` is false and the implementation loops one provider call per item, each carrying the contract's single-item `perCallConstraints`. This contractualizes the established practice of single-item looping and prevents a single provider result (a collage) from being presented as N independent items.

Independent results are independent work, not a serial queue disguised as a multi-result feature. When the requested quantity can exceed one, the contract declares `concurrency.maxParallel >= 2`; PI may choose the scheduling implementation but must exercise real bounded parallelism. A genuinely single-result contract may retain `maxParallel: 1`.

Every required operation input has an authored origin. It may bind an observed release control, an agent-designed control that the implementation will add, a prior operation response, or evidenced application state. A design image is not a feature ceiling: when space or fidelity constraints omit a necessary control, the FDD agent records a `designed-control` binding with its type, label, target region, rationale, and evidence. `application-only` and `not-used` are explicit semantic decisions and therefore carry both a reason and evidence anchors; they are not escape hatches for avoiding provider mappings.
