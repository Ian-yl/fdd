import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { interactiveControls } from '../scripts/lib/visual-release.mjs';

const root = path.resolve(import.meta.dirname, '..');
const release = path.resolve(root, '../ai-restore/releases/sample-suite/843a1541f8b1517dd996580cb467fa1534df8a320ce059e097910f01d92cb957');
const controls = ['email-input', 'password-input', 'login-button', 'signup-link'];

test('builds and independently reviews a handoff bound to a real ai-restore release', () => withFixture(({ functional, output }) => {
  assert.equal(build(functional, release, output).status, 0);
  const review = run('scripts/review-implementation-handoff.mjs', ['--handoff', output, '--reviewer-agent', 'handoff-reviewer']);
  assert.equal(review.status, 0, review.stderr);
  assert.equal(readJson(`${output}/handoff-manifest.json`).status, 'approved');
  assert.equal(readJson(`${output}/visual-source.json`).releaseDigest, readJson(`${output}/release-manifest.json`).releaseDigest);
}));

test('rejects a tampered ai-restore release manifest', () => withFixture(({ functional, output, temp }) => {
  const copy = `${temp}/release`; cpSync(release, copy, { recursive: true });
  patchJson(`${copy}/release-manifest.json`, (value) => ({ ...value, suiteId: 'tampered-suite' }));
  const result = build(functional, copy, output);
  assert.notEqual(result.status, 0); assert.match(result.stderr, /release manifest digest mismatch/);
}));

test('rejects a forged release digest', () => withFixture(({ functional, output, temp }) => {
  const copy = `${temp}/release`; cpSync(release, copy, { recursive: true });
  patchJson(`${copy}/release-manifest.json`, (value) => ({ ...value, releaseDigest: '0'.repeat(64) }));
  const result = build(functional, copy, output);
  assert.notEqual(result.status, 0); assert.match(result.stderr, /release manifest digest mismatch/);
}));

test('allows a capability to add UI absent from the visual release', () => withFixture(({ functional, output }) => {
  patchCapability(functional, (capability) => { capability.presentation = { mode: 'add-control', targetPageId: 'sample', preferredRegion: 'form-actions', control: { type: 'primary-button', label: 'Submit' } }; });
  relock(functional);
  const result = build(functional, release, output);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(readJson(`${output}/ui-implementation-plan.json`).capabilities[0].presentation.mode, 'add-control');
  assert.equal(existsSync(`${output}/interaction-manifest.json`), false);
}));

test('functional validation rejects an invalid presentation mode', () => withFixture(({ functional }) => {
  patchJson(`${functional}/functional-spec.json`, (value) => { value.capabilities[0].presentation.mode = 'guess-control'; return value; });
  const result = run('scripts/validate-package.mjs', [functional, '--require-approved']);
  assert.notEqual(result.status, 0); assert.match(result.stderr, /no valid presentation mode/);
}));

test('functional review rejects an incomplete mode-specific presentation intent', () => withFixture(({ functional }) => {
  patchJson(`${functional}/functional-spec.json`, (value) => { value.capabilities[0].presentation = { mode: 'add-control', targetPageId: 'sample' }; return value; });
  patchJson(`${functional}/manifest.json`, (value) => ({ ...value, status: 'draft', approval: undefined }));
  const result = run('scripts/review-package.mjs', ['--package', functional, '--reviewer-agent', 'new-domain-reviewer']);
  assert.notEqual(result.status, 0);
  const rejection = readFileSync(`${functional}/review-rejection.json`, 'utf8');
  assert.match(rejection, /preferredRegion/);
  assert.match(rejection, /control.type/);
  assert.match(rejection, /control.label/);
}));

test('functional validation rejects server-operation behavior without an operation', () => withFixture(({ functional }) => {
  patchJson(`${functional}/functional-spec.json`, (value) => { value.capabilities[0].operations = []; value.capabilities[0].presentation.behavior = 'server-operation'; return value; });
  const result = run('scripts/validate-package.mjs', [functional, '--require-approved']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /server-operation behavior without an operation/);
}));

test('handoff review rejects a target entry page absent from the visual release', () => withFixture(({ functional, output }) => {
  assert.equal(build(functional, release, output).status, 0);
  patchJson(`${output}/ui-implementation-plan.json`, (value) => { value.capabilities[0].presentation.targetPageId = 'wrong-page'; return value; });
  const result = run('scripts/review-implementation-handoff.mjs', ['--handoff', output, '--reviewer-agent', 'handoff-reviewer']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /target page is absent from the visual release/);
}));

test('extend-flow accepts a new destination behind an existing entry page', () => withFixture(({ functional, output }) => {
  patchCapability(functional, (capability) => { capability.presentation = { mode: 'extend-flow', targetPageId: 'sample', flow: { type: 'page', trigger: { text: 'History' }, destinationType: 'new-page', destinationId: 'generation-history' } }; });
  relock(functional);
  assert.equal(build(functional, release, output).status, 0);
  const review = run('scripts/review-implementation-handoff.mjs', ['--handoff', output, '--reviewer-agent', 'handoff-reviewer']);
  assert.equal(review.status, 0, review.stderr);
}));

test('review rejects copied source that differs from the visual release digest', () => withFixture(({ functional, output }) => {
  assert.equal(build(functional, release, output).status, 0);
  writeFileSync(`${output}/web/pages/sample/index.html`, `${readFileSync(`${output}/web/pages/sample/index.html`, 'utf8')}\n<!-- changed -->\n`);
  const result = run('scripts/review-implementation-handoff.mjs', ['--handoff', output, '--reviewer-agent', 'handoff-reviewer']);
  assert.notEqual(result.status, 0); assert.match(result.stderr, /web source tree digest mismatch/);
}));

test('visual controls remain advisory without stable or unique IDs', () => {
  const result = interactiveControls({ items: [{ kind: 'button', selector: '.submit' }, { kind: 'button', id: 'submit' }, { kind: 'input', id: 'submit' }] });
  assert.equal(result.length, 3);
  assert.equal(result[0].referenceId, null);
  assert.equal(result[1].referenceId, 'submit');
});

test('handoff review rejects an incomplete operation semantic closure', () => withFixture(({ functional, output }) => {
  assert.equal(build(functional, release, output).status, 0);
  patchJson(`${output}/api-contract.json`, (value) => { value.operations[0].ruleIds = ['rule-missing']; value.operations[0].effects = []; return value; });
  const result = run('scripts/review-implementation-handoff.mjs', ['--handoff', output, '--reviewer-agent', 'handoff-reviewer']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /references unknown rule/);
  assert.match(result.stderr, /lacks effects or errors/);
}));

test('handoff migrates legacy transfer contracts without dropping browser transfer semantics', () => withFixture(({ functional, output }) => {
  patchCapability(functional, (capability) => { const operation = capability.operations[0]; operation.request.contentType = 'multipart/form-data'; operation.assetTransfer = { contentType: 'multipart/form-data', interaction: 'file-selection', fileField: 'files', responseIdPath: 'response.assetIds[]' }; });
  relock(functional);
  const result = build(functional, release, output); assert.equal(result.status, 0, result.stderr);
  const operation = readJson(`${output}/api-contract.json`).operations[0];
  assert.equal(Object.hasOwn(operation, 'assetTransfer'), false);
  assert.equal(operation.resourceTransfer.interaction, 'file-selection');
}));

test('handoff rejects conflicting legacy and canonical transfer contracts', () => withFixture(({ functional, output }) => {
  patchCapability(functional, (capability) => { const operation = capability.operations[0]; operation.assetTransfer = { fileField: 'files', responseIdPath: 'response.oldIds[]' }; operation.resourceTransfer = { fileField: 'files', responseIdPath: 'response.newIds[]' }; });
  relock(functional);
  const result = build(functional, release, output); assert.notEqual(result.status, 0); assert.match(result.stderr, /conflicting assetTransfer and resourceTransfer/);
}));

function withFixture(callback) {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'handoff-workflow-')); const functional = `${temp}/functional`; const output = `${temp}/handoff`;
  try { writeFunctional(functional); callback({ temp, functional, output }); } finally { rmSync(temp, { recursive: true, force: true }); }
}
function writeFunctional(dir) {
  const visualReleaseDigest = readJson(`${release}/release-manifest.json`).releaseDigest;
  const schema = (fields) => ({ type: 'object', required: fields, properties: Object.fromEntries(fields.map((field) => [field, { type: 'string' }])) });
  const capabilities = ['sample', 'suite-sample-detail'].map((pageId) => ({ id: `cap-${pageId}`, name: `Use ${pageId}`, purpose: 'Submit the visual form', actor: 'user', pageIds: [pageId], presentation: { mode: 'reuse-control', targetPageId: pageId, visualHint: { text: 'Log in', kind: 'button' } }, operations: [{ id: `submit-${pageId}`, method: 'POST', path: `/api/${pageId}`, request: { contentType: 'application/json', body: ['email', 'password'], bodySchema: schema(['email', 'password']) }, response: { fields: ['ok'], bodySchema: schema(['ok']) }, effects: [{ entityId: 'entity-submission', effect: 'create' }], errors: ['INVALID_INPUT'] }], inputSchema: schema(['email', 'password']), outputSchema: schema(['ok']), acceptanceExamples: [{ given: { email: 'unique@example.test', password: 'unique-password' }, when: 'submit', then: [{ assertion: 'ok', equals: true }] }], inputs: ['email', 'password'], outcomes: ['submitted'], entityEffects: [{ entityId: 'entity-submission', effect: 'create' }], writesState: true, ruleIds: [], failures: ['invalid input'], acceptanceCriteria: ['form submits'], specificationStatus: 'complete', evidence: { status: 'documented', sources: ['test'] } }));
  const manifest = { schemaVersion: '2.0', packageType: 'functional-domain', projectId: 'handoff-test', projectName: 'Handoff Test', status: 'approved', authorAgentId: 'domain-author', visualReleaseDigest, approval: { reviewerAgentId: 'domain-reviewer' } };
  const spec = { schemaVersion: '2.0', project: { id: 'handoff-test' }, visualSource: { sourceType: 'ai-restore-release', releaseDigest: visualReleaseDigest }, domains: [{ id: 'domain-submission', pageIds: ['sample', 'suite-sample-detail'], entityIds: ['entity-submission'] }], entities: [{ id: 'entity-submission', domainId: 'domain-submission', identity: { fields: ['id'] }, aggregateRoot: true, lifecycle: ['created', 'submitted'], constraints: { required: ['id'], unique: [['id']], status: { field: 'status', allowed: ['created', 'submitted'] } }, accessScope: { ownerActor: 'user', scope: 'owner', ownershipField: 'userId' } }], relationships: [], consistencyBoundaries: [{ id: 'boundary-submission', aggregateRootEntityId: 'entity-submission', entityIds: ['entity-submission'], strategy: 'atomic' }], capabilities, journeys: [], rules: [], permissions: [{ id: 'permission-submission-owner', actor: 'user', resourceIds: ['entity-submission'], actions: ['create', 'read'], decision: 'allow' }], integrations: [] };
  const pages = capabilities.map((item) => ({ pageId: item.pageIds[0], navigationOnly: false, capabilityIds: [item.id] }));
  const groups = ['capabilities', 'entities', 'relationships', 'consistencyBoundaries', 'journeys', 'rules', 'permissions', 'integrations'];
  const values = { 'manifest.json': manifest, 'planning-manifest.json': { schemaVersion: '1.0', packageType: 'fdd-bmad-planning', status: 'approved', authorAgentId: 'domain-author', artifacts: ['planning-artifacts.json', 'capability-definitions.json'] }, 'planning-artifacts.json': { schemaVersion: '1.0', method: 'bmad-planning', phases: ['project-understanding', 'requirements-analysis', 'domain-design', 'independent-domain-review'].map((id) => ({ id, status: 'completed', outputs: {} })) }, 'capability-definitions.json': { schemaVersion: '1.0', generatedBy: 'functional-domain-design/bmad-planning', ...Object.fromEntries(groups.map((group) => [group, spec[group] || []])) }, 'functional-spec.json': spec, 'page-function-map.json': { schemaVersion: '2.0', pages }, 'unresolved-items.json': { schemaVersion: '2.0', items: [] }, 'planning-review-receipt.json': { schemaVersion: '1.0', status: 'approved', workflow: 'fdd-bmad-planning', authorAgentId: 'domain-author', reviewerAgentId: 'domain-reviewer' }, 'review-receipt.json': { schemaVersion: '1.0', status: 'approved', authorAgentId: 'domain-author', reviewerAgentId: 'domain-reviewer' } };
  for (const [file, value] of Object.entries(values)) writeJson(`${dir}/${file}`, value);
  relock(dir);
}
function relock(dir) { const result = run('scripts/validate-package.mjs', [dir, '--require-approved']); assert.equal(result.status, 0, result.stderr); }
function build(functional, visual, output) { return run('scripts/build-implementation-handoff.mjs', ['--functional', functional, '--visual-release', visual, '--output', output, '--author-agent', 'handoff-author']); }
function run(script, args) { return spawnSync('node', [path.join(root, script), ...args], { encoding: 'utf8' }); }
function readJson(file) { return JSON.parse(readFileSync(file, 'utf8')); }
function writeJson(file, value) { const parent = path.dirname(file); spawnSync('mkdir', ['-p', parent]); writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); }
function patchJson(file, transform) { writeJson(file, transform(readJson(file))); }
function patchCapability(dir, transform) { for (const file of ['functional-spec.json', 'capability-definitions.json']) patchJson(`${dir}/${file}`, (value) => { transform(value.capabilities[0]); return value; }); }
