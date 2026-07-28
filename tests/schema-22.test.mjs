import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { appendFileSync, cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
  const dir = mkdtempSync(path.join(os.tmpdir(), 'fdd-22-'));
  cpSync(golden, dir, { recursive: true });
  const read = (file) => JSON.parse(readFileSync(path.join(dir, file), 'utf8'));
  const write = (file, value) => writeFileSync(path.join(dir, file), `${JSON.stringify(value, null, 2)}\n`);
  const patchSpec = (fn) => { const spec = read('functional-spec.json'); fn(spec); write('functional-spec.json', spec); const defs = read('capability-definitions.json'); for (const group of ['capabilities', 'entities', 'valueObjects', 'relationships', 'consistencyBoundaries', 'journeys', 'rules', 'permissions', 'integrations']) defs[group] = spec[group] || []; write('capability-definitions.json', defs); };
  mutate({ dir, read, write, patchSpec, cap: (id, fn) => patchSpec((spec) => fn(spec.capabilities.find((item) => item.id === id))) });
  return dir;
}
function rejects(dir, pattern) { const result = validate(dir); rmSync(dir, { recursive: true, force: true }); assert.notEqual(result.status, 0, 'expected validation to fail'); if (pattern) assert.match(result.stderr, pattern); }

// ---- positives ----
test('① a fully authored schema 2.2 package validates, reviews, and replays under the trusted validator', () => {
  assert.equal(validate(golden).status, 0, validate(golden).stderr);
  const approved = validate(golden, '--require-approved', '--check-lock');
  assert.equal(approved.status, 0, approved.stderr);
});

test('② a capability closed purely from evidence anchors, with no classifier hint, can be complete (no wordlist ceiling)', () => {
  const dir = withGolden(({ cap }) => cap('cap-submit', (capability) => { delete capability.synthesisAnalysis; }));
  const result = validate(dir); rmSync(dir, { recursive: true, force: true });
  assert.equal(result.status, 0, result.stderr);
});

test('③ a field-assist write-back capability is complete', () => {
  const spec = JSON.parse(readFileSync(path.join(golden, 'functional-spec.json'), 'utf8'));
  const assist = spec.capabilities.find((item) => item.closure?.resultDestination?.targetKind === 'field');
  assert.ok(assist && assist.specificationStatus === 'complete');
  assert.equal(assist.closure.resultDestination.targetFieldId, 'title');
  assert.ok(assist.closure.resultDestination.responsePath?.startsWith('response.'));
  assert.equal(validate(golden).status, 0);
});

// ---- negatives ----
test('④ an indexed evidence item that is neither referenced nor dispositioned fails the bookkeeping gate', () => {
  rejects(withGolden(({ write }) => write('evidence-dispositions.json', { schemaVersion: '1.0', dispositions: [] })), /evidence bookkeeping is incomplete/);
});

test('schema 2.2 requires evidence dispositions as a formal package artifact', () => {
  rejects(withGolden(({ dir }) => rmSync(path.join(dir, 'evidence-dispositions.json'))), /evidence-dispositions\.json|ENOENT/);
});

test('⑤ an authored annotation the closure never anchors or dispositions is rejected', () => {
  rejects(withGolden(({ read, write }) => { const index = read('evidence-index.json'); index.evidence.push({ id: 'annotation:orphan', kind: 'annotation', text: 'an annotation the closure forgot', source: { file: 'page-architecture.json', itemId: 'orphan' } }); write('evidence-index.json', index); }), /evidence bookkeeping is incomplete/);
});

test('⑥ a planned capability without a missing-decision record is rejected', () => {
  rejects(withGolden(({ cap }) => cap('cap-export', (capability) => { delete capability.missingDecision; })), /lacks a missing-decision record/);
});

test('⑦ a residual draft-pending-authoring skeleton is rejected', () => {
  rejects(withGolden(({ cap }) => cap('cap-upload', (capability) => { capability.specificationStatus = 'draft-pending-authoring'; })), /un-authored skeleton/);
});

test('⑧ a closure evidence anchor pointing at a non-indexed id is rejected', () => {
  rejects(withGolden(({ cap }) => cap('cap-submit', (capability) => { capability.closure.userInput.evidenceAnchors.push('annotation:missing'); })), /unknown evidence anchor/);
});

test('⑨ a core implementation journey that includes a planned capability is rejected', () => {
  rejects(withGolden(({ patchSpec }) => patchSpec((spec) => { spec.journeys[0].capabilityIds.push('cap-export'); })), /includes non-complete capability/);
});

test('a complete state-writing capability cannot hide its missing operation behind a client presentation', () => {
  rejects(withGolden(({ cap }) => cap('cap-submit', (capability) => { capability.operations = []; capability.presentation.behavior = 'client-state'; delete capability.presentation.primaryOperationId; })), /complete server-required capability .* has no operation/);
});

test('a core capability cannot remain planned', () => {
  rejects(withGolden(({ patchSpec }) => patchSpec((spec) => { const capability = spec.capabilities.find((item) => item.id === 'cap-export'); spec.journeys[0].capabilityIds.push(capability.id); })), /core capability .* cannot remain planned|includes non-complete capability/);
});

test('an operation without entity effects is not implementation-complete', () => {
  rejects(withGolden(({ cap }) => cap('cap-submit', (capability) => { capability.operations[0].effects = []; })), /has no entity effect/);
});

test('⑩ a field-assist output type incompatible with its target field is rejected', () => {
  rejects(withGolden(({ cap }) => cap('cap-assist', (capability) => { capability.outputSchema.properties.suggestion = { type: 'integer' }; })), /incompatible with target field/);
});

test('⑪ an acceptance example with a symbolic runtime-value placeholder is rejected', () => {
  rejects(withGolden(({ cap }) => cap('cap-submit', (capability) => { capability.acceptanceExamples[0].given.title = 'runtime-value-1'; })), /symbolic runtime-value placeholder/);
});

test('⑫ a schema 2.2 package without manifest visualReleaseDigest is rejected', () => {
  rejects(withGolden(({ read, write }) => { const manifest = read('manifest.json'); delete manifest.visualReleaseDigest; write('manifest.json', manifest); }), /visual release digest is missing or inconsistent/);
});

test('⑬ a manifest digest different from functional-spec visualSource is rejected', () => {
  rejects(withGolden(({ read, write }) => { const manifest = read('manifest.json'); manifest.visualReleaseDigest = '0'.repeat(64); write('manifest.json', manifest); }), /visual release digest is missing or inconsistent/);
});

test('⑭ (F1) a disposition with a blank rationale is rejected as a laundering channel', () => {
  rejects(withGolden(({ read, write }) => { const dispositions = read('evidence-dispositions.json'); dispositions.dispositions[0].rationale = '   '; write('evidence-dispositions.json', dispositions); }), /disposition has no rationale/);
});

test('⑮ (F2) an evidence id present only in a non-anchor string field is still counted as unhandled', () => {
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

test('⑯ (wave5) an independent-media itemContract missing a required uniqueness flag is rejected', () => {
  rejects(withGolden(({ cap }) => cap('cap-submit', (capability) => { delete capability.closure.resultDestination.itemContract.uniqueUrlRequired; })), /independent-media itemContract must set uniqueUrlRequired/);
});

test('⑰ (wave5) an independent-items provider contract without oneProviderResultPerItem is rejected', () => {
  rejects(withGolden(({ cap }) => cap('cap-submit', (capability) => { delete capability.operations[0].providerContract.oneProviderResultPerItem; })), /independent-items provider must set oneProviderResultPerItem/);
});

test('⑱ (wave5) an inconsistent quantity chain (count path vs finalProduct sourceField) is rejected', () => {
  rejects(withGolden(({ cap }) => cap('cap-submit', (capability) => { capability.finalProduct.quantity.sourceField = 'title'; })), /quantity chain is inconsistent/);
});

test('⑲ (fix) deleting the itemContract entirely from an independent-items capability is rejected', () => {
  rejects(withGolden(({ cap }) => cap('cap-submit', (capability) => { delete capability.closure.resultDestination.itemContract; })), /omits resultDestination\.itemContract/);
});

test('⑳ (wave7) an inputUtilization ledger that omits a disposition for a declared input is rejected', () => {
  rejects(withGolden(({ cap }) => cap('cap-submit', (capability) => { capability.closure.inputUtilization = capability.closure.inputUtilization.filter((item) => item.inputId !== 'title'); })), /omits a disposition for input: title/);
});

test('㉑ (wave7) a provider-mapped input with no provider mapping is rejected', () => {
  rejects(withGolden(({ cap }) => cap('cap-submit', (capability) => { delete capability.closure.inputUtilization.find((item) => item.inputId === 'resourceIds').mapping; })), /lacks a mapping to a provider parameter/);
});

test('㉑b (wave7) a provider-mapped resource input with no resourceResolution is rejected', () => {
  rejects(withGolden(({ cap }) => cap('cap-submit', (capability) => { delete capability.closure.inputUtilization.find((item) => item.inputId === 'resourceIds').resourceResolution; })), /lacks a resourceResolution/);
});

test('㉒f (wave7) an independent-items provider without a concurrency contract is rejected', () => {
  rejects(withGolden(({ cap }) => cap('cap-submit', (capability) => { delete capability.operations[0].providerContract.concurrency; })), /must declare a concurrency contract/);
});

test('㉓s (wave7) minting a new approval against a superseded validator revision is rejected (signing pins latest)', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'fdd-22-sign-'));
  try {
    cpSync(golden, dir, { recursive: true });
    const result = spawnSync('node', [path.join(root, 'scripts/review-package.mjs'), '--package', dir, '--reviewer-agent', 'golden-domain-reviewer-22', '--validator-version', '2.2.1'], { encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /superseded validator revision/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('㉕ (wave8) a design evidence item neither anchored nor dispositioned fails bookkeeping', () => {
  rejects(withGolden(({ cap }) => cap('cap-submit', (capability) => { capability.closure.userInput.evidenceAnchors = capability.closure.userInput.evidenceAnchors.filter((anchor) => anchor !== 'design:submission'); })), /bookkeeping is incomplete|design:submission/);
});

test('㉖ (wave8) a design-manifest whose recorded digest does not match the image bytes is rejected', () => {
  rejects(withGolden(({ read, write }) => { const manifest = read('design-manifest.json'); manifest.images[0].sha256 = '0'.repeat(64); write('design-manifest.json', manifest); }), /design-manifest digest does not match/);
});

test('schema 2.2 cannot validate without the finalized design manifest', () => {
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

test('㉗d (wave8) a complete capability anchoring no intent-axis evidence is rejected (dual-axis)', () => {
  rejects(withGolden(({ cap }) => cap('cap-submit', (capability) => { const strip = (list) => (list || []).filter((anchor) => !/^(product-context|annotation|design):/.test(anchor)); for (const field of ['userInput', 'systemBehavior', 'output', 'resultDestination', 'failures', 'downstreamUse']) if (capability.closure[field]) capability.closure[field].evidenceAnchors = strip(capability.closure[field].evidenceAnchors); capability.evidenceAnchors = strip(capability.evidenceAnchors); })), /anchors no intent-axis evidence/);
});

const stripToIntent = (capability) => { const keepIntent = (list) => (list || []).filter((anchor) => /^(product-context|annotation|design):/.test(anchor)); for (const field of ['userInput', 'systemBehavior', 'output', 'resultDestination', 'failures', 'downstreamUse']) if (capability.closure[field]) capability.closure[field].evidenceAnchors = keepIntent(capability.closure[field].evidenceAnchors); capability.evidenceAnchors = keepIntent(capability.evidenceAnchors); };

test('㉗a (wave8) a non-headless complete capability with no anchor-axis evidence is rejected (dual-axis)', () => {
  rejects(withGolden(({ cap }) => cap('cap-submit', stripToIntent)), /no anchor-axis evidence/);
});

test('㉗h (wave8) a headless complete capability is exempt from the anchor axis (intent-only is enough)', () => {
  const dir = withGolden(({ cap }) => cap('cap-assist', (capability) => { capability.presentation.mode = 'headless'; capability.closure.resultDestination = { targetKind: 'headless', evidenceAnchors: [] }; stripToIntent(capability); }));
  const result = validate(dir); rmSync(dir, { recursive: true, force: true });
  assert.doesNotMatch(`${result.stdout}${result.stderr}`, /cap-assist closure anchors no anchor-axis/);
});

test('the trusted 2.2 validator tree digest detects a tampered imported library on replay', () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'fdd-22-tamper-'));
  try {
    for (const name of ['scripts', 'validators']) cpSync(path.join(root, name), path.join(temp, name), { recursive: true });
    cpSync(golden, path.join(temp, 'domain'), { recursive: true });
    appendFileSync(path.join(temp, 'validators/fdd-2.2.4/lib/evidence-index.mjs'), '\n// tampered\n');
    const result = spawnSync('node', [path.join(temp, 'scripts/validate-package.mjs'), path.join(temp, 'domain'), '--require-approved'], { encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /does not reference the immutable trusted repository validator/);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});
