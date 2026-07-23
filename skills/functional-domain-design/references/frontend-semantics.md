# Frontend Release Semantics

`frontend-semantic-inventory.json` records release/source digests, routes, regions, controls, labels, placeholders, requiredness, multiplicity, accepted media, defaults, options, hierarchy, result surfaces, visible states, and source references.

`observed-interactions.json` records handlers, state reads/writes, submit/change/click events, and observable network method, URL, and request fields. Absence of a network call is preserved as absence; it is not converted into a server operation claim.

`control-capability-map.json` links each capability to an observed trigger or an explicit designed control, field bindings, and primary operation. A visual control need not have a stable ID; selector, inventory position, text, and source evidence remain advisory locator material for PI.

The extractor combines structured visual inventory with publication source observation. Every semantic artifact is bound to the same immutable release digest and source tree digest.
