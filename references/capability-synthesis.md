# Capability Synthesis

Evidence precedence is `confirmed`, `documented`, `observed`, `designed`, `inferred`, then `blocked`. Higher authority does not silently erase a contradiction; incompatible facts produce an unresolved item.

Synthesis operates in local scope: current page module, architecture leaf, matching system node, matching frontend region/control, and targeted user decision. Whole-page words do not classify every capability on that page.

Text classification is only candidate analysis recorded in `synthesisAnalysis`. A `complete` capability additionally requires matching product pages/routes and minimum implementable information. Complex external behavior needs capability-specific documented, observed, confirmed, or input-bound designed fields; a generic resource ID or synthetic target alone is insufficient. When that information is absent for one capability, synthesis emits a `planned` capability with a reachable planned presentation and no business input/output schema, operation, effect, or success fixture.

Each capability closes user goal, outcome, trigger, prerequisites, typed input and output, processing semantics, side effects, downstream use, quality, failures, presentation, and executable acceptance. Core operation patterns are domain-neutral: navigation/local state, resource transfer, create/update/delete, query/history/status, retry, download/preview, and external operation. A presentable non-aggregate create, retry, or external operation without an evidence-backed capability-specific output schema stays planned; synthesis never manufactures a result contract from the capability name. Product-specific external semantics come from source claims and accepted design decisions, not a built-in product vocabulary.

Persistent workflows produce entities appropriate to the observed operation roles; relationships, aggregate ownership, state machines, permissions, consistency boundaries, and journeys are generated from operation lifecycles. Runtime values crossing operations use `dataDependencies`; fixed IDs are explicitly forbidden in acceptance bindings.

## Cross-region aggregate submission

Multiple form or configuration sections become one `aggregateSubmission` only when they are inside one declared capability scope and one primary submit action consumes their values to produce one final product. Evidence is accepted in this order: an `observed-interactions` request carrying the declared fields across the sections, a confirmed user decision, or an explicit architecture declaration. DOM proximity and similar labels are not evidence. If the relationship or final-product semantics cannot be proven, the primary capability is `planned` with an unresolved item and has no operation, schema, or acceptance fixture.

`aggregateSubmission.sections` preserves field groups and source regions. The final JSON operation has exactly one body schema covering every section field, including local-only configuration fields. Its `configurationAggregate` is an aggregate-root entity and the operation persists it atomically. `finalProduct` declares type, quantity (a fixed integer or a `sourceField` included in the aggregate request), lifecycle, and downstream usage.

Section leaves do not become capabilities or APIs. Menu modes remain separate capabilities. Two independently evidenced submit actions remain two operations and are never merged merely because they share a page. Resource uploads remain independent multipart operations using `resourceTransfer`; their runtime resource IDs enter the aggregate request through `dataDependencies`.

## Result presentation binding

Aggregate submission and result presentation are the input and output halves of one capability closure. A complete capability that creates a business product declares `resultPresentation`: an observed, documented, or confirmed `targetRegion` from `frontend-semantic-inventory.json`; response-path-to-element bindings; dynamic cardinality derived from the response or a request quantity field; and processing, success, and failure region semantics. A status message is not a result element.

Static release assets are classified from the semantic role of their source reference. `decorative` requires evidence that the asset is visual chrome and carries no business data. `business-sample` requires `api-data`, `user-input`, or `empty-state` replacement. Ambiguous assets default to `business-sample` with an unresolved item. Filename patterns are discovery hints only.

Every multipart `resourceTransfer` declares `interaction: file-selection`. This is an observable browser action contract, independent of whether another operation consumes the returned resource.

Implementations expose semantic markers `data-result-region-id`, `data-result-status`, and `data-result-binding-id` to locate the result surface. Runtime values come from browser-observed text content, media sources, links, or form values and are never trusted from a data attribute. The contract never constrains pixels, layout, or styling, but runtime verification does require computed visibility and non-zero bounds. Missing region or binding evidence leaves the capability planned and creates an unresolved item.

Entities are derived from operation roles (`resource`, `task`, `configuration`, `asset`, `result`) rather than creating a page-level task aggregate for every product. Rules are attached to their capabilities and operations. External operations include contract-driven integrated verification scenarios and artifact assertions.

FDD chooses business contracts, not frameworks, packages, components, tables, directories, or source-code organization.

## Schema 2.2: classifiers are candidate hints, authoring closes meaning

Under schema 2.2 the keyword classifiers, pattern detectors, and vocabulary lists in this document are retained but demoted to `synthesisAnalysis` candidate hints; they never become the final conclusion. The scaffold emits skeletons plus the deterministic `evidence-index.json`; the author agent reads each capability's anchored evidence (rereading the raw architecture, annotations, observed interactions, and product context when needed) and writes the closed semantics.

This removes the wordlist ceiling: a capability may be `complete` even when no classifier pattern matches its name, as long as its closure is authored from resolvable evidence anchors and passes structural validation. A capability stays `planned` only when the source genuinely does not answer a required business decision — recorded as a `missingDecision` citing the unanswered evidence — never merely because a regular expression failed to fire. An annotation such as “根据上传图片生成文案并回填文本域” is authored into a field-assist capability (`resultDestination.targetKind: 'field'`) rather than compressed into a button label and marked planned.

## Hard constraint: agent autonomy

Agent autonomy is a hard constraint. Deterministic tooling may require that a disposition, contract, or ledger entry exists, and may check structural completeness and reference validity — it never infers, defaults, or judges the entry's content. Every business judgment (what an input is for, how it maps, why something is excluded, what a capability means) belongs to the authoring agent, based on evidence; the honesty of those judgments is audited by the independent reviewer, not by scripts. No field-name heuristic or built-in default may substitute for an agent's decision.

## Media generation: loop per item until batch is confirmed

When source evidence shows a capability produces N independent media results through an external provider, the author closes it with an `operation.providerContract` whose `outputMode` is `independent-items` and `oneProviderResultPerItem` is true. Unless the source explicitly confirms the provider supports batch generation (`n>1`), `batchSupportAssumed` is false and the implementation loops one provider call per item, each carrying the contract's single-item `perCallConstraints`. This contractualizes the established practice of single-item looping and prevents a single provider result (a collage) from being presented as N independent items.
