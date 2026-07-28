# Implementation Handoff Contract

`implementation-handoff` carries one explicit input mode. `release-backed` binds the approved domain package to an immutable AI Restore release and includes `visual-source.json` plus `web/`. `design-led` binds it to the finalized design manifest through `design-source.json`; it contains no frontend source, so PI implements the complete frontend and backend. The functional package remains the authority for product behavior in both modes.

Every schema 2.3 handoff contains `handoff-manifest.json`, `frontend-manifest.json`, `functional-spec.json`, the four semantic artifacts, `handoff-anchor-manifest.json`, `visual-controls.json`, `ui-implementation-plan.json`, `api-contract.json`, `domain-bindings.json`, `runtime-contract.json`, `handoff-review-receipt.json`, and `handoff-lock.json`. Release-backed handoffs additionally contain `visual-source.json`, release/Gate/approval files, and `web/`; design-led handoffs contain `design-source.json`.

The handoff is a pure transformation of the approved package: it projects the complete operations into `api-contract.json`, the presentations and result contracts into `ui-implementation-plan.json`, and copies the approved `control-capability-map.json` unchanged. It never re-infers a capability, changes a capability boundary, or re-binds a trigger control; handoff review rejects any operation set, capability set, control mapping, or result contract that diverges from the approved functional package. The `control-dispositions.json` ledger stays inside the functional package as an authoring-completeness record; PI consumes the projected `control-capability-map.json`.

The semantic artifacts are implementation inputs, not advisory prose. They connect the immutable visual baseline to typed capability inputs, operation requests, UI states, result surfaces, and runtime data dependencies. PI may choose frameworks and code organization but may not invent missing business semantics.

Every capability declares one presentation intent:

- `reuse-control`: `targetPageId` and `visualHint` locate a suitable existing control during implementation.
- `add-control`: `targetPageId`, `preferredRegion`, and `control.type`/`control.label` describe a control added with the existing visual system.
- `extend-flow`: `targetPageId` identifies the existing entry; `flow.type`, `flow.trigger`, and `flow.destination` or `flow.destinationId` describe a page, region, drawer, dialog, or related flow.
- `headless`: implement the capability through services and APIs.
- `display-only`: `targetPageId` plus `content` or `region` describe rendered state or results without a direct command interaction.

Every non-headless `targetPageId` resolves to a page in the visual baseline. An `extend-flow` destination may identify a new surface created during implementation.

Named capability menus also declare `activation`, `surface.contentContract`, and `deliveryPolicy`. The content contract identifies the heading, input IDs, primary action and operation, empty state, and required regions that must change with the active capability. Final verification requires every `requiredForCompletion` capability to report `implemented`. A capability explicitly specified as `planned` is instead required to remain reachable, replace the active content with its capability-specific “功能待实现” state, emit no business request, and never claim or fabricate successful implementation.

`visual-controls.json` is an advisory inventory. References may use IDs, selectors, text, kind, and inventory position. Handoff approval is based on business-contract closure, operation semantics, immutable release integrity, and valid presentation intents.

`visual-source.json.sourceTreeDigest` describes the original ai-restore publication. Project implementation works on a copy, records its own frontend digest, and produces the actual `interaction-manifest.json` and `control-bindings.json` after wiring and UI additions are complete.
