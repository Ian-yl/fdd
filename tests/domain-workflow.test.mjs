import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const architecture = path.join(root, 'assets/lingling-new-architecture-2/architecture-input');
const release = path.resolve(root, '../lingling-new/3 - 前端/releases/lingling-flow-test/66221abb9fc7dd1387cd82f882bee9c0ea1de335695a1ad2b6a593a0a54df5cd');
const mismatchedRelease = path.resolve(root, '../ai-restore/releases/sample-suite/843a1541f8b1517dd996580cb467fa1534df8a320ce059e097910f01d92cb957');

test('generic scaffold preserves capability-specific fields and blocks unsupported semantics', () => withTemp((output) => {
  const result = run('scripts/scaffold-package.mjs', scaffoldArgs(architecture, output));
  assert.equal(result.status, 0, result.stderr);
  const manifest = readJson(`${output}/manifest.json`);
  assert.equal(Object.hasOwn(manifest, 'profile'), false);
  const spec = readJson(`${output}/functional-spec.json`);
  assert.ok(spec.domains.length && spec.entities.length && spec.consistencyBoundaries.length && spec.journeys.length && spec.permissions.length);
  const complete = spec.capabilities.filter((item) => item.specificationStatus === 'complete');
  const planned = spec.capabilities.filter((item) => item.specificationStatus === 'planned');
  assert.ok(complete.length && complete.every((item) => item.inputSchema && item.outputSchema && item.acceptanceExamples?.length));
  assert.ok(planned.length && planned.every((item) => !item.inputSchema && !item.outputSchema && !item.acceptanceExamples?.length && item.presentation?.behavior === 'planned-state'));
  const productSet = spec.capabilities.find((item) => item.name === '商品套图生成');
  const detail = spec.capabilities.find((item) => item.name === '电商详情页');
  const flat3d = spec.capabilities.find((item) => item.name === '平铺转3D');
  assert.equal(productSet.specificationStatus, 'planned');
  assert.equal(detail.specificationStatus, 'planned');
  assert.equal(flat3d.specificationStatus, 'planned');
  assert.match(productSet.planningReason, /result region/);
  assert.ok(spec.capabilities.length < spec.architecture.leafClassifications.length);
  for (const nonCapability of ['规避内容补充', '生成比例', '分辨率', '顶部展示创作结果四个字', '中间放放大的图片']) assert.equal(spec.capabilities.some((item) => item.name.startsWith(nonCapability)), false);
  assert.equal(spec.capabilities.some((item) => item.name === '商品卖点&要求（必填）'), false);
  assert.ok(spec.capabilities.some((item) => item.synthesisAnalysis.sourceArchitectureLeafId === 'mod-y9' && /ai帮写/i.test(item.name)));
  assert.ok(spec.architecture.leafClassifications.some((item) => item.name.startsWith('生成比例') && item.classification === 'input-field'));
  assert.ok(spec.architecture.leafClassifications.some((item) => item.name === '顶部展示创作结果四个字' && item.classification === 'display-requirement'));
  assert.equal(spec.capabilities.some((item) => item.pageIds.includes('pg-1r')), false);
  assert.equal(readJson(`${output}/planning-manifest.json`).packageType, 'fdd-bmad-planning');
  assert.equal(readJson(`${output}/planning-artifacts.json`).method, 'bmad-planning');
  assert.deepEqual(readJson(`${output}/capability-definitions.json`).capabilities, spec.capabilities);
  assert.ok(readJson(`${output}/frontend-semantic-inventory.json`).pages.some((page) => page.controls.length));
  assert.equal(readJson(`${output}/observed-interactions.json`).releaseDigest, spec.visualSource.releaseDigest);
  assert.equal(readJson(`${output}/control-capability-map.json`).mappings.length, spec.capabilities.length);
  assert.ok(spec.capabilities.every((item) => item.capabilityIntent?.userGoal && item.capabilityIntent?.processingSemantics && item.presentation?.triggerControl));
  assert.ok(spec.capabilities.every((item) => JSON.stringify(item.inputSchema) !== JSON.stringify({ type: 'object', required: ['input'], properties: { input: { type: 'object', additionalProperties: true } } })));
}));

test('generic form architecture does not synthesize media or image-provider semantics', () => withTemp((input) => withTemp((output) => {
  writeGenericFormArchitecture(input);
  const result = run('scripts/scaffold-package.mjs', scaffoldArgs(input, output));
  assert.equal(result.status, 0, result.stderr);
  const spec = readJson(`${output}/functional-spec.json`);
  const capability = spec.capabilities.find((item) => item.name === 'Create customer');
  assert.ok(capability);
  assert.equal(capability.synthesisAnalysis.candidatePattern, 'create');
  assert.equal(capability.specificationStatus, 'planned');
  assert.deepEqual(capability.synthesisAnalysis.reviewedEvidence.meaningfulInputIds.sort(), ['account-tier', 'email-address']);
  assert.equal(capability.operations.some((operation) => operation.providerContract), false);
  assert.doesNotMatch(JSON.stringify(capability), /external-media|process-media|image\/\*/i);
})));

test('generic synthesis core contains no product-specific capability vocabulary', () => {
  const source = readFileSync(`${root}/scripts/scaffold-package.mjs`, 'utf8');
  for (const term of ['external-media', 'external-text', 'external-understanding', 'process-media', '换脸', '试穿', '白底', '商品SKU', '海报']) assert.equal(source.includes(term), false, `generic core contains product term: ${term}`);
});

test('validator rejects an unaccepted or unbound medium-confidence BMAD decision', () => withTemp((output) => {
  assert.equal(run('scripts/scaffold-package.mjs', scaffoldArgs(architecture, output)).status, 0);
  const specFile = `${output}/functional-spec.json`; const definitionsFile = `${output}/capability-definitions.json`;
  patchJson(specFile, (value) => { const capability = value.capabilities.find((item) => item.synthesisAnalysis.confidence === 'medium'); capability.synthesisAnalysis.bmadDecision.status = 'review-pending'; return value; });
  patchJson(definitionsFile, (value) => { value.capabilities = readJson(specFile).capabilities; return value; });
  const validation = run('scripts/validate-package.mjs', [output]);
  assert.notEqual(validation.status, 0); assert.match(validation.stderr, /accepted input-bound BMAD semantic decision/);
}));

test('semantic synthesis keeps supported transfers complete and unsupported result flows planned', () => withTemp((output) => {
  assert.equal(run('scripts/scaffold-package.mjs', scaffoldArgs(architecture, output)).status, 0);
  const operations = readJson(`${output}/functional-spec.json`).capabilities.flatMap((item) => item.operations || []);
  assert.ok(operations.some((item) => item.request.contentType === 'multipart/form-data' && item.resourceTransfer?.responseIdPath));
  assert.equal(operations.some((item) => item.providerContract?.requiredCapability), false);
  const planned = readJson(`${output}/functional-spec.json`).capabilities.filter((item) => item.specificationStatus === 'planned');
  assert.ok(planned.some((item) => item.synthesisAnalysis.candidatePattern === 'external-operation'));
  assert.ok(planned.every((item) => !item.operations.length && item.presentation.behavior === 'planned-state'));
}));

test('schema 2.1 rejects the legacy assetTransfer contract name', () => withTemp((output) => {
  assert.equal(run('scripts/scaffold-package.mjs', scaffoldArgs(architecture, output)).status, 0);
  const specFile = `${output}/functional-spec.json`;
  patchJson(specFile, (value) => { const operation = value.capabilities.flatMap((item) => item.operations).find((item) => item.resourceTransfer); operation.assetTransfer = operation.resourceTransfer; delete operation.resourceTransfer; return value; });
  patchJson(`${output}/capability-definitions.json`, (value) => { value.capabilities = readJson(specFile).capabilities; return value; });
  const validation = run('scripts/validate-package.mjs', [output]);
  assert.notEqual(validation.status, 0);
  assert.match(validation.stderr, /legacy assetTransfer instead of resourceTransfer/);
}));

test('explicit transfer migration produces a draft package and an audit receipt', () => withTemp((output) => withTemp((migrated) => {
  assert.equal(run('scripts/scaffold-package.mjs', scaffoldArgs(architecture, output)).status, 0);
  const specFile = `${output}/functional-spec.json`;
  patchJson(specFile, (value) => { const operation = value.capabilities.flatMap((item) => item.operations).find((item) => item.resourceTransfer); operation.assetTransfer = operation.resourceTransfer; delete operation.resourceTransfer; return value; });
  patchJson(`${output}/capability-definitions.json`, (value) => { value.capabilities = readJson(specFile).capabilities; return value; });
  const result = run('scripts/migrate-package.mjs', ['--package', output, '--output', migrated]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(readJson(`${migrated}/manifest.json`).status, 'draft');
  assert.equal(existsSync(`${migrated}/review-receipt.json`), false);
  assert.equal(readJson(`${migrated}/migration-receipt.json`).status, 'migration-pending-review');
  const operation = readJson(`${migrated}/functional-spec.json`).capabilities.flatMap((item) => item.operations).find((item) => item.resourceTransfer);
  assert.ok(operation.resourceTransfer); assert.equal(Object.hasOwn(operation, 'assetTransfer'), false);
})));

test('semantic validator rejects implementation semantics added to a planned business capability', () => withTemp((output) => {
  assert.equal(run('scripts/scaffold-package.mjs', scaffoldArgs(architecture, output)).status, 0);
  const specFile = `${output}/functional-spec.json`; const definitionsFile = `${output}/capability-definitions.json`;
  patchJson(specFile, (value) => { const capability = value.capabilities.find((item) => ['create', 'external-operation'].includes(item.synthesisAnalysis.candidatePattern)); capability.outputSchema = { type: 'object', required: ['operationId', 'status', 'output'], properties: { operationId: { type: 'string' }, status: { type: 'string' }, output: { type: 'object', properties: {}, additionalProperties: false } }, additionalProperties: false }; return value; });
  patchJson(definitionsFile, (value) => { value.capabilities = readJson(specFile).capabilities; return value; });
  const result = run('scripts/validate-package.mjs', [output]); assert.notEqual(result.status, 0); assert.match(result.stderr, /planned capability .* exposes implementation semantics/);
}));

test('planned capabilities cannot be headless', () => withTemp((output) => {
  assert.equal(run('scripts/scaffold-package.mjs', scaffoldArgs(architecture, output)).status, 0);
  const specFile = `${output}/functional-spec.json`; const definitionsFile = `${output}/capability-definitions.json`;
  patchJson(specFile, (value) => { const capability = value.capabilities[0]; capability.specificationStatus = 'planned'; capability.presentation.mode = 'headless'; return value; });
  patchJson(definitionsFile, (value) => { value.capabilities = readJson(specFile).capabilities; return value; });
  const result = run('scripts/validate-package.mjs', [output]); assert.notEqual(result.status, 0); assert.match(result.stderr, /planned capability .* cannot be headless/);
}));

test('a user decision conflict becomes an approval blocker', () => withTemp((output) => withTemp((decisionDir) => {
  const decisions = `${decisionDir}/decisions.json`;
  writeJson(decisions, { decisions: [{ id: 'force-optional-required', targetId: 'mod-y8', required: true }] });
  const result = run('scripts/scaffold-package.mjs', [...scaffoldArgs(architecture, output), '--decisions', decisions]);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(readJson(`${output}/unresolved-items.json`).items.some((item) => item.severity === 'blocker'));
  assert.ok(readJson(`${output}/manifest.json`).capabilitySummary.blockedCapabilities > 0);
})));

test('semantic validator rejects a generic object substituted for a business schema', () => withTemp((output) => {
  assert.equal(run('scripts/scaffold-package.mjs', scaffoldArgs(architecture, output)).status, 0);
  patchJson(`${output}/functional-spec.json`, (value) => { value.capabilities[0].inputSchema = { type: 'object', required: ['input'], properties: { input: { type: 'object', properties: {}, additionalProperties: true } }, additionalProperties: false }; return value; });
  patchJson(`${output}/capability-definitions.json`, (value) => { value.capabilities[0].inputSchema = readJson(`${output}/functional-spec.json`).capabilities[0].inputSchema; return value; });
  const result = run('scripts/validate-package.mjs', [output]);
  assert.notEqual(result.status, 0); assert.match(result.stderr, /unconstrained generic/);
}));

test('scaffold output is determined only by the three known JSON inputs', () => withTemp((input) => withTemp((first) => withTemp((second) => {
  cpSync(architecture, input, { recursive: true });
  assert.equal(run('scripts/scaffold-package.mjs', scaffoldArgs(input, first)).status, 0);
  writeJson(`${input}/unrecognized-extra.json`, { capabilities: [{ sourceId: 'mod-xm', name: 'forged' }] });
  assert.equal(run('scripts/scaffold-package.mjs', scaffoldArgs(input, second)).status, 0);
  assert.deepEqual(readJson(`${second}/functional-spec.json`), readJson(`${first}/functional-spec.json`));
  assert.deepEqual(readJson(`${second}/page-function-map.json`), readJson(`${first}/page-function-map.json`));
}))));

test('generic scaffold rejects product profile switches', () => withTemp((output) => {
  const result = run('scripts/scaffold-package.mjs', [...scaffoldArgs(architecture, output), '--profile', 'ai-generation']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /product profiles are not supported/);
}));

test('architecture and immutable release with no matching pages are blocked', () => withTemp((output) => {
  const result = run('scripts/scaffold-package.mjs', ['--input', architecture, '--visual-release', mismatchedRelease, '--output', output, '--author-agent', 'author-a']);
  assert.equal(result.status, 0, result.stderr);
  const manifest = readJson(`${output}/manifest.json`); const unresolved = readJson(`${output}/unresolved-items.json`);
  assert.equal(manifest.capabilitySummary.complete, 0);
  assert.ok(manifest.capabilitySummary.blockedCapabilities > 0);
  assert.ok(unresolved.items.some((item) => item.id === 'visual-release-product-mismatch' && item.severity === 'blocker'));
  const review = run('scripts/review-package.mjs', ['--package', output, '--reviewer-agent', 'reviewer-b']);
  assert.notEqual(review.status, 0);
}));

test('provider operations bind rules and integrated verification contracts', () => withTemp((output) => {
  assert.equal(run('scripts/scaffold-package.mjs', scaffoldArgs(architecture, output)).status, 0);
  const spec = readJson(`${output}/functional-spec.json`);
  for (const capability of spec.capabilities.filter((item) => item.operations.length)) {
    assert.ok(capability.ruleIds.length);
    for (const operation of capability.operations) assert.deepEqual(operation.ruleIds, capability.ruleIds);
  }
  for (const operation of spec.capabilities.flatMap((item) => item.operations).filter((item) => item.providerContract)) {
    assert.ok(operation.integrationVerification?.requiredScenarios.includes('success'));
    assert.deepEqual(operation.integrationBindings.map(({ source, target, required }) => ({ source, target, required })), operation.providerContract.parameterMappings);
  }
}));

test('validator rejects a field assigned from another capability module', () => withTemp((output) => {
  assert.equal(run('scripts/scaffold-package.mjs', scaffoldArgs(architecture, output)).status, 0);
  const specFile = `${output}/functional-spec.json`; const definitionsFile = `${output}/capability-definitions.json`;
  patchJson(specFile, (value) => { const capability = value.capabilities.find((item) => item.capabilityIntent.inputs.length); capability.capabilityIntent.inputs[0].ownership.capabilityModuleId = 'another-module'; return value; });
  patchJson(definitionsFile, (value) => { value.capabilities = readJson(specFile).capabilities; return value; });
  const validation = run('scripts/validate-package.mjs', [output]);
  assert.notEqual(validation.status, 0); assert.match(validation.stderr, /belongs to another capability module/);
}));

test('minimum implementable information keeps an under-specified complex capability planned', () => withTemp((output) => {
  assert.equal(run('scripts/scaffold-package.mjs', scaffoldArgs(architecture, output)).status, 0);
  const specFile = `${output}/functional-spec.json`; const definitionsFile = `${output}/capability-definitions.json`;
  patchJson(specFile, (value) => { const capability = value.capabilities.find((item) => item.synthesisAnalysis.candidatePattern === 'external-operation'); assert.ok(capability); assert.equal(capability.specificationStatus, 'planned'); capability.operations = [{ id: 'forbidden-provider-operation', providerContract: { requiredCapability: 'unsupported' } }]; return value; });
  patchJson(definitionsFile, (value) => { const spec = readJson(specFile); value.capabilities = spec.capabilities; return value; });
  const validation = run('scripts/validate-package.mjs', [output]);
  assert.notEqual(validation.status, 0); assert.match(validation.stderr, /planned capability .* exposes implementation semantics/);
}));

test('validator rejects broken capability references', () => withTemp((output) => {
  assert.equal(run('scripts/scaffold-package.mjs', scaffoldArgs(architecture, output)).status, 0);
  patchJson(`${output}/page-function-map.json`, (value) => { value.pages[0].capabilityIds.push('cap-missing'); return value; });
  const result = run('scripts/validate-package.mjs', [output]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /references unknown capability/);
}));

test('validator rejects every formal cross-reference type', () => withTemp((output) => {
  writeMinimalPackage(output, { evidenceStatus: 'documented', approved: false });
  patchJson(`${output}/functional-spec.json`, (value) => ({ ...value,
    domains: [{ id: 'domain-a', pageIds: ['page-missing'], entityIds: ['entity-missing'] }],
    entities: [{ id: 'entity-a', domainId: 'domain-missing' }],
    capabilities: [{ ...value.capabilities[0], pageIds: ['page-missing'], ruleIds: ['rule-missing'] }],
    journeys: [{ id: 'journey-a', capabilityIds: ['cap-missing'] }],
    rules: [{ id: 'rule-a', appliesTo: ['cap-missing'] }],
    permissions: [{ id: 'permission-a', actor: 'actor-missing', resourceIds: ['entity-missing'] }],
    integrations: [{ id: 'integration-a', capabilityIds: ['cap-missing'] }],
  }));
  const result = run('scripts/validate-package.mjs', [output]);
  assert.notEqual(result.status, 0);
  for (const message of ['domain domain-a references unknown page', 'domain domain-a references unknown entity', 'entity entity-a references unknown domain', 'cap-a references unknown rule', 'journey journey-a references unknown capability', 'rule rule-a references unknown capability', 'permission permission-a references unknown actor', 'permission permission-a references unknown entity resource', 'integration integration-a references unknown capability']) assert.match(result.stderr, new RegExp(message));
}));

test('approval gate rejects inferred evidence', () => withTemp((output) => {
  writeMinimalPackage(output, { evidenceStatus: 'inferred', approved: true });
  const result = run('scripts/validate-package.mjs', [output, '--require-approved']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /inferred fact/);
}));

test('schema 2.0 remains valid without a delivery policy', () => withTemp((output) => {
  writeMinimalPackage(output, { evidenceStatus: 'documented', approved: false });
  assert.equal(readJson(`${output}/functional-spec.json`).capabilities[0].deliveryPolicy, undefined);
  const validation = run('scripts/validate-package.mjs', [output]);
  assert.equal(validation.status, 0, validation.stderr);
}));

test('new approvals bind the contract and validator runtime digests', () => withTemp((output) => {
  assert.equal(run('scripts/scaffold-package.mjs', scaffoldArgs(architecture, output)).status, 0);
  const review = run('scripts/review-package.mjs', ['--package', output, '--reviewer-agent', 'reviewer-b']);
  assert.equal(review.status, 0, review.stderr);
  const receipt = readJson(`${output}/review-receipt.json`);
  assert.equal(receipt.contractVersion, 'functional-domain/2.1');
  assert.match(receipt.validatorDigest, /^[a-f0-9]{64}$/);
  assert.match(receipt.runtimeBundleDigest, /^[a-f0-9]{64}$/);
}));

test('review rejects matching author and reviewer identities and returns draft status', () => withTemp((output) => {
  writeMinimalPackage(output, { evidenceStatus: 'documented', approved: false });
  const result = run('scripts/review-package.mjs', ['--package', output, '--reviewer-agent', 'author-a']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /rejected/);
  assert.equal(readJson(`${output}/manifest.json`).status, 'draft');
  assert.equal(readJson(`${output}/review-rejection.json`).status, 'rejected');
}));

test('review rolls approval back when complete package validation fails', () => withTemp((output) => {
  writeMinimalPackage(output, { evidenceStatus: 'documented', approved: false });
  patchJson(`${output}/page-function-map.json`, (value) => { value.pages[0].capabilityIds.push('cap-missing'); return value; });
  const result = run('scripts/review-package.mjs', ['--package', output, '--reviewer-agent', 'reviewer-b']);
  assert.notEqual(result.status, 0);
  assert.equal(readJson(`${output}/manifest.json`).status, 'draft');
  assert.equal(existsSync(`${output}/review-receipt.json`), false);
  assert.equal(readJson(`${output}/review-rejection.json`).status, 'rejected');
}));

test('review rejects a missing acceptance fixture', () => withTemp((output) => {
  writeMinimalPackage(output, { evidenceStatus: 'designed', approved: false });
  patchJson(`${output}/functional-spec.json`, (value) => { value.capabilities[0].evidence.rationale = 'Designed from the supplied product contract.'; value.capabilities[0].acceptanceExamples[0].given.fixture = 'fixtures/missing.bin'; return value; });
  const result = run('scripts/review-package.mjs', ['--package', output, '--reviewer-agent', 'reviewer-b']);
  assert.notEqual(result.status, 0);
  assert.match(readFileSync(`${output}/review-rejection.json`, 'utf8'), /fixture does not exist/);
  assert.equal(readJson(`${output}/manifest.json`).status, 'draft');
}));

test('lock check detects changed formal files', () => withTemp((output) => {
  writeMinimalPackage(output, { evidenceStatus: 'documented', approved: false });
  assert.equal(run('scripts/validate-package.mjs', [output]).status, 0);
  patchJson(`${output}/manifest.json`, (value) => ({ ...value, projectName: 'changed' }));
  const result = run('scripts/validate-package.mjs', [output, '--check-lock']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /package lock mismatch: manifest.json/);
}));

test('validator rejects broken relationship references', () => withTemp((output) => {
  writeMinimalPackage(output, { evidenceStatus: 'documented', approved: false });
  patchJson(`${output}/functional-spec.json`, (value) => { value.entities = [{ id: 'entity-a', domainId: 'domain-a', identity: { fields: ['id'] }, aggregateRoot: true, lifecycle: ['active'], constraints: { required: ['id'] }, accessScope: { ownerActor: 'user', scope: 'owner' } }]; value.relationships = [{ id: 'relation-a', fromEntityId: 'entity-a', toEntityId: 'entity-missing', cardinality: 'one-to-many', ownership: 'aggregate', required: false, onDelete: 'restrict', associationKey: { fromFields: ['id'], toFields: ['aId'] }, invariants: ['reference exists'] }]; return value; });
  const result = run('scripts/validate-package.mjs', [output]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /relationship .* references unknown to entity entity-missing/);
}));

test('validator rejects a data dependency with an unknown source operation', () => withTemp((output) => {
  writeMinimalPackage(output, { evidenceStatus: 'documented', approved: false });
  patchJson(`${output}/functional-spec.json`, (value) => { value.capabilities[0].operations = [{ id: 'read-item', method: 'GET', path: '/items/{itemId}', request: { contentType: 'application/json', pathSchema: { type: 'object', required: ['itemId'], properties: { itemId: { type: 'string' } } } }, response: { bodySchema: { type: 'object', required: ['item'], properties: { item: { type: 'string' } } } }, effects: [], errors: ['NOT_FOUND'], dataDependencies: [{ sourceOperationId: 'missing-operation', sourceField: 'response.id', targetField: 'request.itemId' }] }]; return value; });
  const result = run('scripts/validate-package.mjs', [output]); assert.notEqual(result.status, 0); assert.match(result.stderr, /data dependency references unknown source operation/);
}));

test('validator rejects an incomplete integration verification contract', () => withTemp((output) => {
  writeMinimalPackage(output, { evidenceStatus: 'documented', approved: false });
  patchJson(`${output}/functional-spec.json`, (value) => { value.capabilities[0].operations = [{ id: 'read-external-item', method: 'GET', path: '/external/items', request: { contentType: 'application/json' }, response: { bodySchema: { type: 'object', required: ['item'], properties: { item: { type: 'string' } } } }, effects: [], errors: ['UNAVAILABLE'], integrationVerification: { requiredScenarios: 'success', artifactAssertions: [{ path: '', type: 'string' }], endpointPolicy: { nonLocal: 'yes' } } }]; return value; });
  const result = run('scripts/validate-package.mjs', [output]);
  assert.notEqual(result.status, 0);
  for (const message of ['invalid integration verification scenarios', 'invalid integration artifact assertions', 'invalid integration endpoint policy']) assert.match(result.stderr, new RegExp(message));
}));

function writeMinimalPackage(dir, { evidenceStatus, approved }) {
  const authorAgentId = 'author-a'; const reviewerAgentId = 'reviewer-b'; const status = approved ? 'approved' : 'draft';
  writeJson(`${dir}/manifest.json`, { schemaVersion: '2.0', packageType: 'functional-domain', projectId: 'test', projectName: 'Test', status, authorAgentId, ...(approved ? { approval: { reviewerAgentId } } : {}) });
  const spec = { schemaVersion: '2.0', domains: [], entities: [], relationships: [], consistencyBoundaries: [], capabilities: [{ id: 'cap-a', name: 'Read item', purpose: 'Read an item', actor: 'user', pageIds: ['page-a'], presentation: { mode: 'reuse-control', targetPageId: 'page-a', visualHint: { text: 'Read item' } }, inputs: [], inputSchema: { type: 'object', required: [], properties: {} }, outcomes: ['item'], outputSchema: { type: 'object', required: ['item'], properties: { item: { type: 'string' } } }, entityEffects: [], writesState: false, ruleIds: [], failures: ['not found'], acceptanceCriteria: ['item is returned'], acceptanceExamples: [{ given: {}, when: 'read', then: [{ assertion: 'item', equals: 'value' }] }], specificationStatus: 'complete', evidence: { status: evidenceStatus, sources: ['test'] } }], journeys: [], rules: [], permissions: [], integrations: [] };
  writeJson(`${dir}/functional-spec.json`, spec);
  writePlanningFiles(dir, spec, { authorAgentId, reviewerAgentId, approved });
  writeJson(`${dir}/page-function-map.json`, { schemaVersion: '2.0', pages: [{ pageId: 'page-a', navigationOnly: false, capabilityIds: ['cap-a'] }] });
  writeJson(`${dir}/unresolved-items.json`, { schemaVersion: '2.0', items: [] });
  if (approved) writeJson(`${dir}/review-receipt.json`, { schemaVersion: '1.0', status: 'approved', authorAgentId, reviewerAgentId });
}
function writeGenericFormArchitecture(dir) {
  writeJson(`${dir}/page-architecture.json`, { version: 1, nodes: [
    { id: 'pg-1r', title: 'Home', parentId: null, modules: [] },
    { id: 'pg-1s', title: 'Customers', parentId: 'pg-1r', modules: [
      { id: 'customer-actions', name: '功能列表', children: [{ id: 'create-customer', name: 'Create customer' }] },
      { id: 'customer-form', name: 'Customer form', children: [{ id: 'customer-email', name: 'Email address' }, { id: 'customer-tier', name: 'Account tier' }] },
    ] },
    { id: 'pg-1t', title: 'Reports', parentId: null, modules: [] }, { id: 'pg-1u', title: 'Settings', parentId: null, modules: [] }, { id: 'pg-1v', title: 'Help', parentId: null, modules: [] },
  ] });
  writeJson(`${dir}/system-architecture.json`, { version: 1, nodes: [{ id: 'customer-create-node', kind: 'module', detailKind: 'feature', label: 'Create customer', sourcePageId: 'pg-1s', sourceModuleId: 'create-customer', responsibilities: ['Create a customer record from validated account details'] }] });
  writeJson(`${dir}/product-context.json`, { projectId: 'generic-crm', name: 'Customer workspace', brief: 'Maintain customer accounts and their service tier.', goals: ['Create and manage accurate customer records'], users: ['account operators'], needs: ['capture customer details'] });
}
function writePlanningFiles(dir, spec, { authorAgentId, reviewerAgentId, approved }) { const groups = ['capabilities', 'entities', 'relationships', 'consistencyBoundaries', 'journeys', 'rules', 'permissions', 'integrations']; writeJson(`${dir}/planning-manifest.json`, { schemaVersion: '1.0', packageType: 'fdd-bmad-planning', status: approved ? 'approved' : 'review-pending', authorAgentId, artifacts: ['planning-artifacts.json', 'capability-definitions.json'] }); writeJson(`${dir}/planning-artifacts.json`, { schemaVersion: '1.0', method: 'bmad-planning', phases: ['project-understanding', 'requirements-analysis', 'domain-design', 'independent-domain-review'].map((id) => ({ id, status: approved ? 'completed' : 'pending', outputs: {} })) }); writeJson(`${dir}/capability-definitions.json`, { schemaVersion: '1.0', generatedBy: 'functional-domain-design/bmad-planning', ...Object.fromEntries(groups.map((group) => [group, spec[group] || []])) }); if (approved) writeJson(`${dir}/planning-review-receipt.json`, { schemaVersion: '1.0', status: 'approved', workflow: 'fdd-bmad-planning', authorAgentId, reviewerAgentId }); }
function withTemp(callback) { const dir = mkdtempSync(path.join(os.tmpdir(), 'functional-domain-test-')); try { callback(dir); } finally { rmSync(dir, { recursive: true, force: true }); } }
function run(script, args) { return spawnSync('node', [path.join(root, script), ...args], { encoding: 'utf8' }); }
function scaffoldArgs(input, output) { return ['--input', input, '--visual-release', release, '--output', output, '--author-agent', 'author-a']; }
function readJson(file) { return JSON.parse(readFileSync(file, 'utf8')); }
function writeJson(file, value) { writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); }
function patchJson(file, transform) { writeJson(file, transform(readJson(file))); }
