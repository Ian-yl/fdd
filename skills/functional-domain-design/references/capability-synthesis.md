# Capability Synthesis

Evidence precedence is `confirmed`, `documented`, `observed`, `designed`, `inferred`, then `blocked`. Higher authority does not silently erase a contradiction; incompatible facts produce an unresolved item.

Synthesis operates in local scope: current page module, architecture leaf, matching system node, matching frontend region/control, and targeted user decision. Whole-page words do not classify every capability on that page.

Text classification is only candidate analysis recorded in `synthesisAnalysis`. A `complete` capability additionally requires matching product pages/routes and minimum implementable information. Complex external behavior needs capability-specific documented, observed, confirmed, or input-bound designed fields; a generic resource ID or synthetic target alone is insufficient. When that information is absent for one capability, synthesis emits a `planned` capability with a reachable planned presentation and no business input/output schema, operation, effect, or success fixture.

Each capability closes user goal, outcome, trigger, prerequisites, typed input and output, processing semantics, side effects, downstream use, quality, failures, presentation, and executable acceptance. Core operation patterns are domain-neutral: navigation/local state, resource transfer, create/update/delete, query/history/status, retry, download/preview, and external operation. Product-specific external semantics come from source claims and accepted design decisions, not a built-in product vocabulary.

Persistent workflows produce entities appropriate to the observed operation roles; relationships, aggregate ownership, state machines, permissions, consistency boundaries, and journeys are generated from operation lifecycles. Runtime values crossing operations use `dataDependencies`; fixed IDs are explicitly forbidden in acceptance bindings.

## Cross-region aggregate submission

Multiple form or configuration sections become one `aggregateSubmission` only when they are inside one declared capability scope and one primary submit action consumes their values to produce one final product. Evidence is accepted in this order: an `observed-interactions` request carrying the declared fields across the sections, a confirmed user decision, or an explicit architecture declaration. DOM proximity and similar labels are not evidence. If the relationship or final-product semantics cannot be proven, the primary capability is `planned` with an unresolved item and has no operation, schema, or acceptance fixture.

`aggregateSubmission.sections` preserves field groups and source regions. The final JSON operation has exactly one body schema covering every section field, including local-only configuration fields. Its `configurationAggregate` is an aggregate-root entity and the operation persists it atomically. `finalProduct` declares type, quantity (a fixed integer or a `sourceField` included in the aggregate request), lifecycle, and downstream usage.

Section leaves do not become capabilities or APIs. Menu modes remain separate capabilities. Two independently evidenced submit actions remain two operations and are never merged merely because they share a page. Resource uploads remain independent multipart operations using `resourceTransfer`; their runtime resource IDs enter the aggregate request through `dataDependencies`.

Entities are derived from operation roles (`resource`, `task`, `configuration`, `asset`, `result`) rather than creating a page-level task aggregate for every product. Rules are attached to their capabilities and operations. External operations include contract-driven integrated verification scenarios and artifact assertions.

FDD chooses business contracts, not frameworks, packages, components, tables, directories, or source-code organization.
