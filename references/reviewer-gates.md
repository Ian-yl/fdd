# Reviewer Gates

Independent review checks semantic closure in addition to structural validity. Approval is rejected when:

- architecture and release page IDs/routes are not an exact, identity-preserving set;
- a `complete` complex capability has only a generic resource ID, a synthetic target, or another unowned reference without documented, observed, confirmed, or input-bound designed business fields; such a capability must instead be `planned` with no implementation semantics;
- same-scope non-alias capabilities have indistinguishable schemas, processing, effects, and failures;
- unconstrained generic objects replace business data;
- frontend release semantics were not parsed and digest-bound;
- a non-headless capability has no observed or designed control mapping;
- a `complete` capability's primary operation, authorization, failures, idempotency, concurrency, or acceptance is absent;
- resource transfer lacks field, type, ownership, lifecycle, checksum, size, or multiplicity constraints;
- a `complete` external operation's parameters or required transferred-resource bindings are incomplete;
- provider operations omit integrated success/timeout/unavailable scenarios;
- generated rules are not bound through both capability `ruleIds` and operation `ruleIds`;
- runtime data dependency paths do not exist in source/target schemas;
- writes lack effects or related writes lack transaction/consistency;
- an open blocker or blocked capability remains.

Passing JSON Schema validation alone is insufficient. Approval means an implementation Agent can implement from the locked package and handoff without guessing domain semantics.

Planned capabilities are reviewed differently: the capability identity and entry must be evidenced, the planned reason must be explicit, the planned surface must be capability-specific, and no operation, business schema, entity effect, or fabricated acceptance result may remain.

For cross-region submissions, review also rejects:

- one primary submit action mapped to multiple final submit operations;
- an input/configuration section inside an aggregate scope emitted as a separate capability or API;
- an aggregate request schema or configuration aggregate that omits a declared section field;
- quantity bound to a field absent from the aggregate request;
- incomplete final product type, lifecycle, quantity semantics, or downstream usage;
- an upload folded into the JSON submit instead of remaining a `resourceTransfer` operation with runtime `dataDependencies`;
- unrelated menu capabilities or independently evidenced submit actions merged together;
- inferred aggregation evidence approved instead of remaining fail-closed `planned`.
