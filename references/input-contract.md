# Input Contract

FDD accepts exactly these authority sources:

- page architecture JSON (`pageTree.json` or `page-architecture.json`);
- system architecture JSON (`systemArchitecture.json` or `system-architecture.json`);
- `product-context.json`;
- a finalized design export directory supplied through `--designs`, containing at least one regular PNG, JPEG, WebP, or SVG file whose filename stem identifies an architecture page; an optional `designBoard.json` records upstream selection provenance;
- one immutable, digest-valid AI Restore release;
- optional user business decisions.

Caller-authored planning, stories, profiles, and `capability-definitions.json` are not required inputs. Capability definitions are generated inside FDD. Unknown files in the architecture directory do not affect synthesis.

The release must contain a valid release manifest, payload manifest, approval, Suite Gate, page results, page restore plans, visual inventories, and publication source. FDD reads it without modification.

Schema 2.2 approval requires the finalized design input. The scaffold copies it into `designs/`, writes `design-manifest.json`, binds the normalized manifest digest into `planning-manifest.inputDigests.designs` and `synthesisInputDigest`, and indexes every selected design as `design:*` evidence. Exploration files, unsupported binaries, non-regular files, empty design directories, and page hints absent from the page architecture are rejected.

User decisions use stable IDs and target an architecture module/capability. A decision overrides only its explicit target. Contradictions with documented requiredness, ownership, lifecycle, or observable frontend behavior become unresolved blockers.
