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

For product result presentation, review rejects a complete product-producing capability without `resultPresentation`, a target region absent from the immutable release semantic inventory, missing processing/success/failure semantics, status text used instead of bound result elements, or response values/cardinality without an element binding.

Review rejects an unclassified static asset, a business sample without an explicit replacement mechanism, a multipart transfer without `interaction: file-selection`, and a new approval without the repository-registered immutable validator entrypoint for its contract version. Package-supplied validators are never executable. The validator inspects result structure, not only top-level field names: an arbitrary or capability-derived property whose value is only `kind`, `references`, and `quality` is not sufficient evidence of a complete create, retry, or external capability.

Review also derives server-operation necessity from structured facts rather than product vocabulary. A complete capability requires an operation when it writes state, declares entity effects, participates in a capability-bound permission or integration, declares server behavior, or records business side effects. Changing the presentation label cannot suppress this requirement. A capability in a `core: true` journey, or explicitly required for completion, cannot remain planned. Every operation carries method, path, content type, request and response schemas, authorization, errors, and at least one entity effect.

## Reverse review from the visual release

Schema 2.3 review runs from the visual release back to the specification, not from the spec forward. For each released page the reviewing agent confirms:

- **Every main operation is covered.** Each interaction closure the page supports — an input set with a primary trigger and a result surface — resolves to exactly one capability. A page whose primary action has no capability is rejected.
- **The trigger is the real trigger.** Each `primary-trigger` disposition names the control the page actually submits with, and its semantics match the capability's operation (a create button drives a create operation). A control the release shows as navigation, history, or a menu is never accepted as a submit trigger.
- **Inputs bind to the request.** Every `input`-dispositioned control's value is covered by its capability's operation request (directly or through a resource `dataDependency`); an input the page collects but the request drops is rejected.
- **The result region binds to the response.** The success result surface the page shows is the capability's `resultDestination`/`resultPresentation` target, bound to real response paths; a status message standing in for the result is rejected.
- **The three states close.** The processing, success, and failure states the closure needs are all authored against observed surfaces.
- **No navigation is mis-wired.** A navigation or history entry never carries a business write; a menu mode stays its own capability.
- **No mechanical splitting.** One closure is one capability; a page's inputs are not split into a capability (or an API) per control, and two independently evidenced closures are not merged because they share a page.
- **Every control is honestly dispositioned.** No control is left unaccounted, and no live business control is buried under `navigation`, `presentation-only`, or `ignored-with-reason`.

## Schema 2.3 authoring and review

Under schema 2.3 the scaffold synthesizes no capability; it emits the mechanical evidence index, the `control-dispositions.json` ledger seeded `unresolved`, and advisory grouping candidates. The author agent identifies each page's interaction closures, closes one capability per closure from the anchored evidence, and dispositions every control. Determinism moves to the correct side: generation relies on understanding (the agent), verification relies on determinism (the validator and independent reviewer). The validator and the immutable trusted-replay guarantee for approved packages stay exactly as strong.

The core acceptance principle (enforced by structure in `validate-package.mjs` and by meaning in independent review):

> 对每个领域能力，FDD 产物必须回答：用户提供什么、系统具体做什么、得到什么、结果写到哪里、失败怎么办、后续如何使用。原始资料已回答而产物未回答，FDD 必须失败。

`validate-package.mjs` judges structure and consistency only — the six-question closure is present and evidence-anchored, `outputSchema` and `resultDestination` types are compatible, every `evidenceAnchors` id resolves in `evidence-index.json`, the evidence bookkeeping gate holds, cross-references are consistent, and every acceptance example carries concrete literal values (symbolic `runtime-value-N` placeholders are rejected). It never judges business meaning. Independent review adds meaning fidelity: the reviewing agent reads the anchored source evidence for each capability and confirms the authored closure faithfully preserves it; a distortion or an omission is rejected with the offending evidence ids. Meaning fidelity is a workflow role and does not run in CI.

Schema 2.3 review also rejects: a `planned` capability without a `missingDecision` record citing which business decision the source leaves unanswered; a non-headless `complete` capability whose trigger is not a `primary-trigger` disposition bound to an observed release control (control provenance); a `control-dispositions.json` ledger that is not in exact correspondence with the release control inventory or that leaves any control `unresolved`; a field-assist `resultDestination` whose output type is incompatible with its target field; and any indexed evidence item that is neither anchored by an authored closure nor recorded in `evidence-dispositions.json`.

Independent review owns control-disposition honesty auditing, symmetric to discard and input-utilization honesty. For every ledger entry the reviewing agent reads the release control and confirms the disposition is truthful: a control the page uses for a live business action is not buried under `navigation`, `presentation-only`, or `ignored-with-reason`; a `primary-trigger` names the control the page actually submits with, not a convenient button; and an `input` genuinely feeds the capability it names. A dishonest disposition — the release shows a business action the ledger hides or diverts — is rejected with the offending control ids. Structural validation guarantees every control carries exactly one disposition with its required binding or reason; whether each disposition is honest is the reviewer's role and does not run in CI.

The bookkeeping gate counts only structured evidence anchors — a capability's `evidenceAnchors`, its six closure fields, and a planned capability's `missingDecision` anchors. An id that merely appears as some other string value in the package (a control id, a label, an operation path) does not satisfy bookkeeping; the closure must anchor it deliberately or the package must disposition it. Each disposition carries a recognized `reason` (`out-of-scope`, `decorative`, or `duplicate-of:<id>`) and a non-empty `rationale`; a blank rationale is a laundering channel and is rejected.

Independent review owns discard-honesty auditing, the mirror image of closure fidelity: for every dispositioned evidence item the reviewing agent reads the anchored source and confirms the disposition is truthful — that an `out-of-scope` item genuinely carries no owned business behavior and a `decorative` asset genuinely carries no business data. A dishonest discard (source evidence the product answers but the closure dropped under an `out-of-scope`/`decorative` label) is rejected with the offending evidence ids, exactly as an unfaithful closure is. Structural validation guarantees every discard is declared with a rationale; meaning fidelity — that the rationale is true — is the reviewer's role and does not run in CI.

Independent review likewise owns input-utilization honesty auditing, symmetric to discard honesty. For a provider-backed capability the reviewing agent reads the anchored source for each `inputUtilization` disposition and confirms it is truthful: an input the source shows must reach the external provider is marked `provider-mapped` with a real mapping (and, for a resource input, a real resolution), not silently downgraded to `application-only` or `not-used`; and a `not-used` reason genuinely holds. A dishonest disposition — source evidence shows the input feeds the provider, but the ledger drops or diverts it — is rejected with the offending evidence ids. Structural validation guarantees every input carries a disposition with its required mapping, resolution, or reason; whether each disposition is true is the reviewer's role and does not run in CI.

## Independent media item review

For a capability declaring `itemContract.mode: 'independent-media'`, review confirms the closure is faithful to the source: that the source genuinely calls for N independent results (not one composite image), that the item schema exposes a distinct media resource per item, and that the quantity chain is honest. Review rejects an independent-media contract on a capability whose source describes a single composite/collage output (which must instead be a `composite-output` capability), a `finalProduct.quantity` that does not carry `nonDefaultValueRequired` alongside its non-default count binding, and a media `providerContract` that assumes batch support the source never confirms. Structural validation guarantees the contract is complete and internally consistent; whether the independence claim matches the source, and whether the runtime later proves per-item uniqueness, are the reviewer's and the runner's responsibilities respectively. A content-level collage cannot be caught mechanically and is bounded by provider `perCallConstraints`, integrated observation, and manual spot-check.

## Design evidence review

For a capability anchoring a `design:<id>` export, meaning-fidelity and discard-honesty auditing extend to the design: the reviewing agent — with vision — re-reads the finalized design export behind each anchor and confirms the authored closure faithfully preserves what the design shows (each mode's interface, fields, states, and flow), and that a design the source selected is not dropped under an out-of-scope/decorative label. A distortion or a dishonest discard is rejected with the offending evidence ids. Design-anchor fidelity is vision-against-vision and therefore carries lower confidence than a text anchor; key semantics are encouraged to carry dual anchors — a design export cross-proven by an annotation or observed interaction. This is a workflow role and does not run in CI.

## Constitution: division of judgment

Before approval, every `primary-trigger` control in `control-dispositions.json` is traced through exactly one `control-capability-map` entry to an existing capability and its existing primary operation. The operation request covers every input explicitly tied to the same submission scope/form or observed request, and its response participates in a business result presentation contract. A navigation or history semantic role is never accepted as a submit trigger. Missing or ambiguous ownership is rejected; reviewers do not resolve it by inventing a button capability or a generic endpoint.

The framework carries four standing guarantees, and no change may weaken any of them:

- **Genericity** — gates activate from contract declarations only; framework code carries no product vocabulary; fixtures stay business-neutral.
- **Agent autonomy** — tooling requires that positions are taken; agents decide the positions' content from evidence; reviewers audit honesty. No inference, defaults, or field-name heuristics substitute for an agent's decision.
- **Completeness** — every evidence item, input, and disposition is accounted for; omissions fail closed; known gaps are registered explicitly, never left silent.
- **Reliability** — bad input fails closed with a non-zero exit; approvals replay against immutable revision-pinned validators; freezes are drift-checked; every change lands with the full suites green and negative coverage for each new gate.

Scripts enforce that positions are taken; agents decide the positions; the reviewer audits that the positions are honest. A framework change that makes a validator infer business content, inject defaults, or encode product/field-name heuristics violates this contract and is itself grounds for rejection.

Validator revisions are append-only within a schema version. A validate semantic change is never re-frozen in place over an existing revision; it is frozen as a new revision (a `2.3.x` increment), the signing path pins the latest revision, and the replay registry retains every prior revision so each approved package replays against the immutable rules it was signed under. In-place re-freezing was admissible only while every consumer was a regenerable golden; once real product packages hold approval receipts, semantic evolution must go through revisions so a shipped approval is never retroactively invalidated nor silently upgraded — an author who wants the new rules re-authors and re-signs against the latest revision, and a package that stays on an older revision keeps replaying its original contract until its author upgrades.

A major-version clean switch is the one sanctioned exception, and only under an explicit user decision that the prior version's products are discardable. When the whole framework moves to a new schema version (as 2.0/2.1 were cleared for 2.2, and 2.2 for 2.3), the superseded version's validator revisions and registry entries are removed and the goldens are rebuilt through the new flow. This is safe only because, at the switch, the remaining consumers are regenerable goldens; any real approval receipt still pinned to the removed version stops replaying and must be re-authored under the new version before it ships again. Inside the new version, append-only resumes from its `.0` revision.
