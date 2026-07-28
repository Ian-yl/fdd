import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { appendFileSync, cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const golden = path.join(root, 'assets/golden-approved/functional-domain');
const validate = (dir, ...flags) => spawnSync('node', [path.join(root, 'scripts/validate-package.mjs'), dir, ...flags], { encoding: 'utf8' });

// Copy the approved golden, apply a mutation, and return the temp dir. Spec mutations are
// mirrored into capability-definitions so the copy stays internally consistent.
function withGolden(mutate) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'fdd-23-'));
  cpSync(golden, dir, { recursive: true });
  const read = (file) => JSON.parse(readFileSync(path.join(dir, file), 'utf8'));
  const write = (file, value) => writeFileSync(path.join(dir, file), `${JSON.stringify(value, null, 2)}\n`);
  const patchSpec = (fn) => { const spec = read('functional-spec.json'); fn(spec); write('functional-spec.json', spec); const defs = read('capability-definitions.json'); for (const group of ['capabilities', 'entities', 'valueObjects', 'relationships', 'consistencyBoundaries', 'journeys', 'rules', 'permissions', 'integrations']) defs[group] = spec[group] || []; write('capability-definitions.json', defs); };
  const ledger = (fn) => { const doc = read('control-dispositions.json'); fn(doc.dispositions, doc); write('control-dispositions.json', doc); };
  mutate({ dir, read, write, patchSpec, ledger, cap: (id, fn) => patchSpec((spec) => fn(spec.capabilities.find((item) => item.id === id))) });
  return dir;
}
function rejects(dir, pattern) { const result = validate(dir); rmSync(dir, { recursive: true, force: true }); assert.notEqual(result.status, 0, 'expected validation to fail'); if (pattern) assert.match(result.stderr, pattern); }

// ---- positives ----
test('a fully authored schema 2.3 package validates, reviews, and replays under the trusted validator', () => {
  assert.equal(validate(golden).status, 0, validate(golden).stderr);
  const approved = validate(golden, '--require-approved', '--check-lock');
  assert.equal(approved.status, 0, approved.stderr);
});

test('a capability closed purely from evidence anchors can be complete', () => {
  const dir = withGolden(({ cap }) => cap('cap-submit', (capability) => { delete capability.synthesisAnalysis; }));
  const result = validate(dir); rmSync(dir, { recursive: true, force: true });
  assert.equal(result.status, 0, result.stderr);
});

test('a field-assist write-back capability is complete', () => {
  const spec = JSON.parse(readFileSync(path.join(golden, 'functional-spec.json'), 'utf8'));
  const assist = spec.capabilities.find((item) => item.closure?.resultDestination?.targetKind === 'field');
  assert.ok(assist && assist.specificationStatus === 'complete');
  assert.equal(assist.closure.resultDestination.targetFieldId, 'title');
  assert.ok(assist.closure.resultDestination.responsePath?.startsWith('response.'));
  assert.equal(validate(golden).status, 0);
});

// ---- negatives ----
test('an indexed evidence item that is neither referenced nor dispositioned fails the bookkeeping gate', () => {
  rejects(withGolden(({ write }) => write('evidence-dispositions.json', { schemaVersion: '1.0', dispositions: [] })), /evidence bookkeeping is incomplete/);
});

test('schema 2.3 requires evidence dispositions as a formal package artifact', () => {
  rejects(withGolden(({ dir }) => rmSync(path.join(dir, 'evidence-dispositions.json'))), /evidence-dispositions\.json|ENOENT/);
});

test('an authored annotation the closure never anchors or dispositions is rejected', () => {
  rejects(withGolden(({ read, write }) => { const index = read('evidence-index.json'); index.evidence.push({ id: 'annotation:orphan', kind: 'annotation', text: 'an annotation the closure forgot', source: { file: 'page-architecture.json', itemId: 'orphan' } }); write('evidence-index.json', index); }), /evidence bookkeeping is incomplete/);
});

test('a planned capability without a missing-decision record is rejected', () => {
  rejects(withGolden(({ cap }) => cap('cap-export', (capability) => { delete capability.missingDecision; })), /lacks a missing-decision record/);
});

test('a residual draft-pending-authoring skeleton is rejected', () => {
  rejects(withGolden(({ cap }) => cap('cap-upload', (capability) => { capability.specificationStatus = 'draft-pending-authoring'; })), /un-authored skeleton/);
});

test('a closure evidence anchor pointing at a non-indexed id is rejected', () => {
  rejects(withGolden(({ cap }) => cap('cap-submit', (capability) => { capability.closure.userInput.evidenceAnchors.push('annotation:missing'); })), /unknown evidence anchor/);
});

test('a core implementation journey that includes a planned capability is rejected', () => {
  rejects(withGolden(({ patchSpec }) => patchSpec((spec) => { spec.journeys[0].capabilityIds.push('cap-export'); })), /includes non-complete capability/);
});

test('a complete state-writing capability cannot hide its missing operation behind a client presentation', () => {
  rejects(withGolden(({ cap }) => cap('cap-submit', (capability) => { capability.operations = []; capability.presentation.behavior = 'client-state'; delete capability.presentation.primaryOperationId; })), /complete server-required capability .* has no operation/);
});

test('strict presentation validation rejects a non-headless capability with neither activation nor surface', () => {
  rejects(withGolden(({ cap }) => cap('cap-submit', (capability) => { delete capability.presentation.activation; delete capability.presentation.surface; })), /has no activation or surface contract/);
});

test('a core capability cannot remain planned', () => {
  rejects(withGolden(({ patchSpec }) => patchSpec((spec) => { const capability = spec.capabilities.find((item) => item.id === 'cap-export'); spec.journeys[0].capabilityIds.push(capability.id); })), /core capability .* cannot remain planned|includes non-complete capability/);
});

test('an operation without entity effects is not implementation-complete', () => {
  rejects(withGolden(({ cap }) => cap('cap-submit', (capability) => { capability.operations[0].effects = []; })), /has no entity effect/);
});

test('a field-assist output type incompatible with its target field is rejected', () => {
  rejects(withGolden(({ cap }) => cap('cap-assist', (capability) => { capability.outputSchema.properties.suggestion = { type: 'integer' }; })), /incompatible with target field/);
});

test('an acceptance example with a symbolic runtime-value placeholder is rejected', () => {
  rejects(withGolden(({ cap }) => cap('cap-submit', (capability) => { capability.acceptanceExamples[0].given.title = 'runtime-value-1'; })), /symbolic runtime-value placeholder/);
});

test('a schema 2.3 package without manifest visualReleaseDigest is rejected', () => {
  rejects(withGolden(({ read, write }) => { const manifest = read('manifest.json'); delete manifest.visualReleaseDigest; write('manifest.json', manifest); }), /visual release digest is missing or inconsistent/);
});

test('a manifest digest different from functional-spec visualSource is rejected', () => {
  rejects(withGolden(({ read, write }) => { const manifest = read('manifest.json'); manifest.visualReleaseDigest = '0'.repeat(64); write('manifest.json', manifest); }), /visual release digest is missing or inconsistent/);
});

test('a disposition with a blank rationale is rejected', () => {
  rejects(withGolden(({ read, write }) => { const dispositions = read('evidence-dispositions.json'); dispositions.dispositions[0].rationale = '   '; write('evidence-dispositions.json', dispositions); }), /disposition has no rationale/);
});

test('an evidence id present only in a non-anchor string field is still counted as unhandled', () => {
  rejects(withGolden(({ patchSpec }) => patchSpec((spec) => {
    const id = 'page-module:category-field'; // an input control the submit closure anchors
    for (const capability of spec.capabilities) {
      for (const question of ['userInput', 'systemBehavior', 'output', 'resultDestination', 'failures', 'downstreamUse']) if (capability.closure?.[question]?.evidenceAnchors) capability.closure[question].evidenceAnchors = capability.closure[question].evidenceAnchors.filter((anchor) => anchor !== id);
      capability.evidenceAnchors = (capability.evidenceAnchors || []).filter((anchor) => anchor !== id);
      if (capability.missingDecision?.evidenceAnchors) capability.missingDecision.evidenceAnchors = capability.missingDecision.evidenceAnchors.filter((anchor) => anchor !== id);
    }
    // the id now appears only as prose inside a summary — a non-anchor string field
    spec.capabilities[0].closure.userInput.summary = `${spec.capabilities[0].closure.userInput.summary} (mentions ${id} in prose only)`;
  })), /evidence bookkeeping is incomplete/);
});

test('an independent-media itemContract missing a required uniqueness flag is rejected', () => {
  rejects(withGolden(({ cap }) => cap('cap-submit', (capability) => { delete capability.closure.resultDestination.itemContract.uniqueUrlRequired; })), /independent-media itemContract must set uniqueUrlRequired/);
});

test('an independent-items provider contract without oneProviderResultPerItem is rejected', () => {
  rejects(withGolden(({ cap }) => cap('cap-submit', (capability) => { delete capability.operations[0].providerContract.oneProviderResultPerItem; })), /independent-items provider must set oneProviderResultPerItem/);
});

test('a provider operation requires an Agent-authored executable controlled response', () => {
  rejects(withGolden(({ cap }) => cap('cap-submit', (capability) => { delete capability.operations[0].providerContract.controlledResponse; })), /has no executable controlled response/);
  rejects(withGolden(({ cap }) => cap('cap-submit', (capability) => { capability.operations[0].providerContract.controlledResponse.resultIdPath = 'missing.id'; })), /has no executable controlled response/);
  rejects(withGolden(({ cap }) => cap('cap-submit', (capability) => { delete capability.operations[0].providerContract.providerResultLineage; })), /provider result lineage/);
});

test('an independent result review declaration requires explicit Agent-authored assertions', () => {
  rejects(withGolden(({ cap }) => cap('cap-submit', (capability) => { capability.operations[0].integrationVerification.resultReview = { required: true, assertions: [] }; })), /invalid independent result review contract/);
});

test('an inconsistent quantity chain is rejected', () => {
  rejects(withGolden(({ cap }) => cap('cap-submit', (capability) => { capability.finalProduct.quantity.sourceField = 'title'; })), /quantity chain is inconsistent/);
});

test('an independent-items capability without itemContract is rejected', () => {
  rejects(withGolden(({ cap }) => cap('cap-submit', (capability) => { delete capability.closure.resultDestination.itemContract; })), /omits resultDestination\.itemContract/);
});

test('an inputUtilization ledger that omits a declared input is rejected', () => {
  rejects(withGolden(({ cap }) => cap('cap-submit', (capability) => { capability.closure.inputUtilization = capability.closure.inputUtilization.filter((item) => item.requestPath !== 'body.title'); })), /exactly one disposition for request field: body\.title/);
});

test('a provider-mapped input with no provider mapping is rejected', () => {
  rejects(withGolden(({ cap }) => cap('cap-submit', (capability) => { delete capability.closure.inputUtilization.find((item) => item.requestPath === 'body.resourceIds').mapping; })), /lacks a mapping to a provider parameter/);
});

test('a provider-mapped resource input with no resourceResolution is rejected', () => {
  rejects(withGolden(({ cap }) => cap('cap-submit', (capability) => { delete capability.closure.inputUtilization.find((item) => item.requestPath === 'body.resourceIds').resourceResolution; })), /lacks a resourceResolution/);
  rejects(withGolden(({ cap }) => cap('cap-submit', (capability) => { capability.closure.inputUtilization.find((item) => item.requestPath === 'body.resourceIds').resourceResolution.verificationMode = 'guess'; })), /lacks a resourceResolution verificationMode/);
});

test('resource transfer file-count ranges are structurally valid', () => {
  rejects(withGolden(({ cap }) => cap('cap-upload', (capability) => { capability.operations[0].resourceTransfer.minFiles = 1.5; })), /minFiles must be a positive integer/);
  rejects(withGolden(({ cap }) => cap('cap-upload', (capability) => { capability.operations[0].resourceTransfer.minFiles = 0; })), /minFiles must be a positive integer/);
  rejects(withGolden(({ cap }) => cap('cap-upload', (capability) => { Object.assign(capability.operations[0].resourceTransfer, { minFiles: 3, maxFiles: 2 }); })), /minFiles exceeds maxFiles/);
});

test('every provider operation has its own complete input utilization ledger', () => {
  rejects(withGolden(({ cap }) => cap('cap-submit', (capability) => { const second = structuredClone(capability.operations[0]); second.id = 'create-submission-second-provider'; second.path = '/api/submissions/second'; capability.operations.push(second); })), /create-submission-second-provider inputUtilization must contain exactly one disposition/);
});

test('provider ledger, parameter mapping, and integration binding cannot disagree', () => {
  rejects(withGolden(({ cap }) => cap('cap-submit', (capability) => { capability.closure.inputUtilization.find((item) => item.requestPath === 'body.resourceIds').mapping.providerParam = 'provider.wrong'; })), /disagrees across inputUtilization/);
});

test('provider mapping source must exist in the operation request schema', () => {
  rejects(withGolden(({ cap }) => cap('cap-submit', (capability) => { capability.operations[0].providerContract.parameterMappings[0].source = 'request.missing'; capability.operations[0].integrationBindings[0].source = 'request.missing'; })), /mapping source is absent from its request schema/);
});

test('an independent-items provider without a concurrency contract is rejected', () => {
  rejects(withGolden(({ cap }) => cap('cap-submit', (capability) => { delete capability.operations[0].providerContract.concurrency; })), /must declare a concurrency contract/);
});

test('application-only provider input requires an evidence-backed application reason', () => {
  rejects(withGolden(({ cap }) => cap('cap-submit', (capability) => { const entry = capability.closure.inputUtilization.find((item) => item.disposition === 'application-only'); delete entry.reason; entry.evidenceAnchors = []; })), /application-only input .* lacks a reason or evidence/);
});

test('a required field absent from the release must have an authored designed-control binding', () => {
  rejects(withGolden(({ cap }) => cap('cap-upload', (capability) => {
    capability.inputSchema.properties.description = { type: 'string', minLength: 1 }; capability.inputSchema.required.push('description');
    const operation = capability.operations[0]; operation.request.bodySchema.properties.description = { type: 'string', minLength: 1 }; operation.request.bodySchema.required.push('description');
    operation.acceptanceExample.given.description = 'fresh description'; capability.acceptanceExamples[0].given.description = 'fresh description';
  })), /required request field .*body\.description has no authored/);
});

test('an agent-designed control may supply a required field not shown in the release', () => {
  const dir = withGolden(({ cap, read, write }) => {
    cap('cap-upload', (capability) => {
      capability.inputSchema.properties.description = { type: 'string', minLength: 1 }; capability.inputSchema.required.push('description');
      const operation = capability.operations[0]; operation.request.bodySchema.properties.description = { type: 'string', minLength: 1 }; operation.request.bodySchema.required.push('description');
      operation.acceptanceExample.given.description = 'fresh description'; capability.acceptanceExamples[0].given.description = 'fresh description';
    });
    const map = read('control-capability-map.json'); map.mappings.find((item) => item.capabilityId === 'cap-upload').fieldBindings.push({ inputId: 'description', controlId: 'designed-upload-description', operationId: 'upload-resource-op', statePath: 'form.description', requestPath: 'body.description', source: 'designed-control', designedControl: { type: 'textarea', label: 'Description', targetRegion: 'upload-panel' } }); write('control-capability-map.json', map);
  });
  const result = validate(dir); rmSync(dir, { recursive: true, force: true }); assert.equal(result.status, 0, result.stderr);
});

test('a design evidence item neither anchored nor dispositioned fails bookkeeping', () => {
  rejects(withGolden(({ cap }) => cap('cap-submit', (capability) => { capability.closure.userInput.evidenceAnchors = capability.closure.userInput.evidenceAnchors.filter((anchor) => anchor !== 'design:submission'); })), /bookkeeping is incomplete|design:submission/);
});

test('a design-manifest digest mismatch is rejected', () => {
  rejects(withGolden(({ read, write }) => { const manifest = read('design-manifest.json'); manifest.images[0].sha256 = '0'.repeat(64); write('design-manifest.json', manifest); }), /design-manifest digest does not match/);
});

test('schema 2.3 cannot validate without the finalized design manifest', () => {
  rejects(withGolden(({ dir }) => rmSync(path.join(dir, 'design-manifest.json'))), /design-manifest\.json|ENOENT/);
});

test('a design page hint must identify an architecture page', () => {
  rejects(withGolden(({ read, write }) => { const manifest = read('design-manifest.json'); manifest.images[0].pageHint = 'unknown-page'; write('design-manifest.json', manifest); }), /pageHint does not match/);
});

test('changing a design invalidates an input-bound BMAD decision', () => {
  rejects(withGolden(({ read, write, cap }) => {
    const oldDigest = read('planning-manifest.json').synthesisInputDigest;
    cap('cap-assist', (capability) => { capability.synthesisAnalysis.bmadDecision = { status: 'accepted', inputDigest: oldDigest }; });
    const manifest = read('design-manifest.json'); manifest.provenance = { source: 'replacement-design-export' }; write('design-manifest.json', manifest);
    const planning = read('planning-manifest.json'); planning.inputDigests.designs = createHash('sha256').update(JSON.stringify(manifest)).digest('hex'); planning.synthesisInputDigest = 'replacement-synthesis-input'; write('planning-manifest.json', planning);
    const evidence = read('evidence-index.json'); evidence.synthesisInputDigest = planning.synthesisInputDigest; write('evidence-index.json', evidence);
  }), /BMAD decision is not bound/);
});

test('a complete capability without intent evidence is rejected', () => {
  rejects(withGolden(({ cap }) => cap('cap-submit', (capability) => { const strip = (list) => (list || []).filter((anchor) => !/^(product-context|annotation|design):/.test(anchor)); for (const field of ['userInput', 'systemBehavior', 'output', 'resultDestination', 'failures', 'downstreamUse']) if (capability.closure[field]) capability.closure[field].evidenceAnchors = strip(capability.closure[field].evidenceAnchors); capability.evidenceAnchors = strip(capability.evidenceAnchors); })), /anchors no intent-axis evidence/);
});

const stripToIntent = (capability) => { const keepIntent = (list) => (list || []).filter((anchor) => /^(product-context|annotation|design):/.test(anchor)); for (const field of ['userInput', 'systemBehavior', 'output', 'resultDestination', 'failures', 'downstreamUse']) if (capability.closure[field]) capability.closure[field].evidenceAnchors = keepIntent(capability.closure[field].evidenceAnchors); capability.evidenceAnchors = keepIntent(capability.evidenceAnchors); };

test('a non-headless complete capability without UI anchor evidence is rejected', () => {
  rejects(withGolden(({ cap }) => cap('cap-submit', stripToIntent)), /no anchor-axis evidence/);
});

test('a headless complete capability does not require UI anchor evidence', () => {
  const dir = withGolden(({ cap }) => cap('cap-assist', (capability) => { capability.presentation.mode = 'headless'; capability.closure.resultDestination = { targetKind: 'headless', evidenceAnchors: [] }; stripToIntent(capability); }));
  const result = validate(dir); rmSync(dir, { recursive: true, force: true });
  assert.doesNotMatch(`${result.stdout}${result.stderr}`, /cap-assist closure anchors no anchor-axis/);
});

test('the trusted 2.3 validator tree digest detects a tampered imported library on replay', () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'fdd-23-tamper-'));
  try {
    for (const name of ['scripts', 'validators']) cpSync(path.join(root, name), path.join(temp, name), { recursive: true });
    cpSync(golden, path.join(temp, 'domain'), { recursive: true });
    const receipt = JSON.parse(readFileSync(path.join(temp, 'domain/review-receipt.json'), 'utf8'));
    appendFileSync(path.join(temp, `validators/${receipt.trustedValidatorId.replace('fdd-validator-', 'fdd-')}/lib/evidence-index.mjs`), '\n// tampered\n');
    const result = spawnSync('node', [path.join(temp, 'scripts/validate-package.mjs'), path.join(temp, 'domain'), '--require-approved'], { encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /does not reference the immutable trusted repository validator/);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});

test('control disposition and mapping inconsistencies are rejected', () => {
  const cases = [
    [({ ledger }) => ledger((d) => { d.find((x) => x.controlId === 'title-input').disposition = 'unresolved'; }), /unresolved or invalid disposition/],
    [({ ledger }) => ledger((d, doc) => { doc.dispositions = d.filter((x) => x.controlId !== 'title-input'); }), /release control submission:title-input has no control-disposition entry/],
    [({ ledger }) => ledger((d) => { d.push({ controlId: 'ghost-control', pageId: 'submission', disposition: 'input', capabilityId: 'cap-submit' }); }), /absent from the release inventory: submission:ghost-control/],
    [({ ledger }) => ledger((d) => { d.find((x) => x.controlId === 'submit-button').operationId = 'does-not-exist'; }), /names an operation that is not on capability/],
    [({ ledger }) => ledger((d) => { const item = d.find((x) => x.controlId === 'title-input'); Object.assign(item, { disposition: 'primary-trigger', capabilityId: 'cap-submit', operationId: 'create-submission' }); }), /is not an actionable control/],
    [({ ledger }) => ledger((d) => { const item = d.find((x) => x.controlId === 'title-input'); item.disposition = 'navigation'; item.capabilityId = 'cap-submit'; }), /navigation control submission:title-input must not bind a capability/],
    [({ ledger }) => ledger((d) => { const item = d.find((x) => x.controlId === 'title-input'); item.disposition = 'ignored-with-reason'; delete item.capabilityId; }), /ignored-with-reason control submission:title-input lacks a rationale/],
    [({ read, write }) => { const map = read('control-capability-map.json'); map.mappings = map.mappings.filter((x) => x.controlId !== 'submit-button'); write('control-capability-map.json', map); }, /not mirrored .*control-capability-map/],
    [({ ledger }) => ledger((d) => { const item = d.find((x) => x.controlId === 'submit-button'); item.disposition = 'presentation-only'; delete item.capabilityId; delete item.operationId; }), /operation create-submission has no trigger source/],
    [({ read, write }) => { const map = read('control-capability-map.json'); map.mappings.find((item) => item.capabilityId === 'cap-submit').fieldBindings = []; write('control-capability-map.json', map); }, /exactly one field binding/],
    [({ read, write }) => { const ledger = read('control-dispositions.json'); const item = ledger.dispositions.find((entry) => entry.controlId === 'assist-title-button'); Object.assign(item, { disposition: 'secondary-action', capabilityId: 'cap-submit', operationId: 'assist-title-op' }); write('control-dispositions.json', ledger); }, /operation that is not on capability cap-submit/],
    [({ read, write }) => { const map = read('control-capability-map.json'); map.mappings.find((item) => item.capabilityId === 'cap-submit').primaryOperationId = 'assist-title-op'; write('control-capability-map.json', map); }, /not mirrored with the same operation|mapping differs/],
  ];
  for (const [mutate, pattern] of cases) rejects(withGolden(mutate), pattern);
});
