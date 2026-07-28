# Frontend Release Semantics

`frontend-semantic-inventory.json` records the release's complete page semantics: release/source digests, routes, regions, and per-control identity, kind, native type, field name, form and submission scope, submission role, label, placeholder, requiredness, multiplicity, accepted media, defaults, options, DOM hierarchy, owning region/container, and source references. It also records result surfaces and each page's visible states (loading, empty, success, error) so a closure's processing/success/failure states resolve to observed surfaces. This is the substrate the author reads to identify interaction closures.

`observed-interactions.json` records handlers, state reads/writes, submit/change/click events, and observable network method, URL, and request fields. Absence of a network call is preserved as absence; it is not converted into a server operation claim.

`control-dispositions.json` accounts for every interaction control the inventory exposes: the scaffold seeds each `unresolved`, and the author assigns exactly one disposition (`primary-trigger`, `input`, `secondary-action`, `navigation`, `presentation-only`, `ignored-with-reason`). `grouping-candidates.json` carries advisory closure groupings; both are described in the package contract.

`control-capability-map.json` links each capability to an observed trigger or an explicit designed control, field bindings, and primary operation; the scaffold emits it empty and the author fills it, keeping each `primary-trigger` disposition mirrored here. A visual control need not have a stable ID; selector, inventory position, text, and source evidence remain advisory locator material for PI.

The extractor combines structured visual inventory with publication source observation. It interprets no business meaning — a seeded control, a candidate grouping, and a visible state are mechanical observations, not decisions. Every semantic artifact is bound to the same immutable release digest and source tree digest.
