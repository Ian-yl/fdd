import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { detectAggregateSubmissions } from '../scripts/lib/aggregate-submission.mjs';

const root = path.resolve(import.meta.dirname, '..');
const release = path.resolve(root, '../ai-restore/releases/sample-suite/843a1541f8b1517dd996580cb467fa1534df8a320ce059e097910f01d92cb957');

test('observed cross-region submit produces one aggregate with every section field', () => {
  const analysis = detectAggregateSubmissions(syntheticEvidence({ actions: 1 }));
  assert.equal(analysis.aggregates.length, 1); const aggregate = analysis.aggregates[0];
  assert.equal(aggregate.status, 'complete'); assert.equal(aggregate.evidence.status, 'observed');
  assert.deepEqual(aggregate.sections.flatMap((item) => item.fields.map((field) => field.id)).sort(), ['audience', 'count', 'title']);
  assert.equal(aggregate.finalProduct.quantity.sourceField, 'count');
});

test('two independently observed submit actions remain two aggregates', () => {
  const analysis = detectAggregateSubmissions(syntheticEvidence({ actions: 2 }));
  assert.equal(analysis.aggregates.length, 2);
  assert.deepEqual(analysis.aggregates.map((item) => item.triggerControlId).sort(), ['submit-a', 'submit-b']);
});

test('insufficient aggregate evidence fails closed as planned', () => {
  const input = syntheticEvidence({ actions: 1 }); input.frontend.interactions.interactions = []; input.pages[0].modules.find((item) => item.id === 'actions-a').children[0].aggregateSubmission.evidenceStatus = 'inferred';
  const analysis = detectAggregateSubmissions(input); assert.equal(analysis.aggregates[0].status, 'planned'); assert.ok(analysis.unresolved.length);
});

test('scaffold emits one final submit, keeps upload independent, and closes resource lineage', () => withTemp((input) => withTemp((output) => {
  writeAggregateArchitecture(input);
  const result = spawnSync('node', [path.join(root, 'scripts/scaffold-package.mjs'), '--input', input, '--visual-release', release, '--output', output, '--author-agent', 'aggregate-author'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const spec = read(`${output}/functional-spec.json`); const aggregate = spec.capabilities.find((item) => item.aggregateSubmission); const upload = spec.capabilities.find((item) => item.operations?.[0]?.resourceTransfer);
  assert.ok(aggregate); assert.equal(aggregate.specificationStatus, 'complete'); assert.equal(aggregate.operations.length, 1); assert.ok(upload);
  const sectionFields = aggregate.aggregateSubmission.sections.flatMap((item) => item.fields.map((field) => field.id));
  assert.ok(sectionFields.every((field) => Object.hasOwn(aggregate.operations[0].request.bodySchema.properties, field)));
  assert.ok(aggregate.operations[0].dataDependencies?.some((item) => item.sourceOperationId === upload.operations[0].id && item.targetOperationId === aggregate.operations[0].id));
  assert.equal(spec.capabilities.some((item) => ['section-email', 'section-password'].includes(item.synthesisAnalysis?.sourceArchitectureLeafId)), false);
  const config = spec.entities.find((item) => item.id === aggregate.aggregateSubmission.configurationAggregate.entityId); assert.equal(config.aggregateRoot, true);
  const validation = spawnSync('node', [path.join(root, 'scripts/validate-package.mjs'), output], { encoding: 'utf8' }); assert.equal(validation.status, 0, validation.stderr);
  const review = spawnSync('node', [path.join(root, 'scripts/review-package.mjs'), '--package', output, '--reviewer-agent', 'aggregate-reviewer'], { encoding: 'utf8' }); assert.equal(review.status, 0, review.stderr);
})));

function syntheticEvidence({ actions }) {
  const modules = [];
  for (let index = 0; index < actions; index++) { const suffix = String.fromCharCode(97 + index); modules.push({ id: `actions-${suffix}`, children: [{ id: `primary-${suffix}`, submissionScopeId: `scope-${suffix}`, submissionRole: 'primary-submit', controlId: `submit-${suffix}`, aggregateSubmission: { evidenceStatus: 'inferred', operation: { method: 'POST', path: `/submit-${suffix}` }, finalProduct: finalProduct('count') } }] }, { id: `section-title-${suffix}`, submissionScopeId: `scope-${suffix}`, submissionRole: 'input-section', regionId: `region-title-${suffix}`, fieldIds: ['title'], children: [{ id: `title-${suffix}`, controlId: 'title' }] }, { id: `section-audience-${suffix}`, submissionScopeId: `scope-${suffix}`, submissionRole: 'input-section', regionId: `region-audience-${suffix}`, fieldIds: ['audience', 'count'], children: [{ id: `audience-${suffix}`, controlId: 'audience' }, { id: `count-${suffix}`, controlId: 'count' }] }); }
  return { pages: [{ id: 'page', modules }], decisions: [], frontend: { inventory: { pages: [{ pageId: 'page', controls: [{ controlId: 'title', label: 'Title', kind: 'input', region: { id: 'region-title-a' } }, { controlId: 'audience', label: 'Audience', kind: 'input', region: { id: 'region-audience-a' } }, { controlId: 'count', label: 'Count', kind: 'input', region: { id: 'region-audience-a' } }, ...Array.from({ length: actions }, (_, index) => ({ controlId: `submit-${String.fromCharCode(97 + index)}`, kind: 'button' }))] }] }, interactions: { interactions: Array.from({ length: actions }, (_, index) => { const suffix = String.fromCharCode(97 + index); return { id: `interaction-${suffix}`, pageId: 'page', controlId: `submit-${suffix}`, network: { method: 'POST', url: `/submit-${suffix}`, requestFields: ['title', 'audience', 'count'] } }; }) } } };
}
function writeAggregateArchitecture(dir) {
  write(`${dir}/page-architecture.json`, { version: 1, nodes: [{ id: 'sample', title: 'Submission', parentId: 'root', modules: [{ id: 'actions', name: 'Actions', children: [{ id: 'submit-product', name: 'Create product', submissionScopeId: 'product-submit', submissionRole: 'primary-submit', controlId: 'login-button', resultPresentation: { targetRegion: 'container-002-9x5lc' }, aggregateSubmission: { finalProduct: finalProduct() } }, { id: 'upload-source', name: 'Upload source' }] }, { id: 'section-email', name: 'Identity', submissionScopeId: 'product-submit', submissionRole: 'input-section', regionId: 'identity', fieldIds: ['email-input'], children: [{ id: 'email-field', name: 'Email', controlId: 'email-input' }] }, { id: 'section-password', name: 'Options', submissionScopeId: 'product-submit', submissionRole: 'input-section', regionId: 'options', fieldIds: ['password-input'], children: [{ id: 'password-field', name: 'Password', controlId: 'password-input' }] }] }, { id: 'suite-sample-detail', title: 'Detail', parentId: 'root', modules: [{ id: 'functions', name: '功能列表', children: [{ id: 'view-detail', name: '查询详情' }] }] }] });
  write(`${dir}/system-architecture.json`, { version: 1, nodes: [{ id: 'submit-node', sourcePageId: 'sample', sourceModuleId: 'submit-product', responsibilities: ['Create the final product from all configuration sections'] }, { id: 'upload-node', sourcePageId: 'sample', sourceModuleId: 'upload-source', responsibilities: ['Persist an uploaded source resource'] }, { id: 'detail-node', sourcePageId: 'suite-sample-detail', sourceModuleId: 'view-detail', responsibilities: ['Read the owned product detail'] }] });
  write(`${dir}/product-context.json`, { projectId: 'aggregate-test', name: 'Aggregate submission test', brief: 'Submit multi-section configuration as one product.', goals: ['Create one final product'], users: ['operator'], needs: ['cross-section submission'] });
}
function finalProduct(sourceField) { return { type: 'configured-product', quantity: sourceField ? { sourceField } : { fixed: 1 }, lifecycle: ['pending', 'available', 'failed'], downstreamUsage: ['preview', 'history'] }; }
function withTemp(callback) { const dir = mkdtempSync(path.join(os.tmpdir(), 'aggregate-submission-')); try { callback(dir); } finally { rmSync(dir, { recursive: true, force: true }); } }
function write(file, value) { writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); }
function read(file) { return JSON.parse(readFileSync(file, 'utf8')); }
