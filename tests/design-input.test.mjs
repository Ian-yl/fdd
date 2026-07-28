import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const support = path.join(root, 'test-support/neutral-input');
const scaffold = path.join(root, 'scripts/scaffold-package.mjs');

test('scaffold binds the finalized design manifest into planning and evidence input digests', () => withInput(({ designs, output }) => {
  const result = run(designs, output);
  assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
  const planning = read(path.join(output, 'planning-manifest.json'));
  const evidence = read(path.join(output, 'evidence-index.json'));
  assert.match(planning.inputDigests.designs, /^[a-f0-9]{64}$/);
  assert.equal(evidence.synthesisInputDigest, planning.synthesisInputDigest);
  assert.ok(evidence.evidence.some((item) => item.id === 'design:submission'));
}));

test('scaffold rejects an empty finalized design directory', () => withInput(({ designs, output }) => {
  rmSync(designs, { recursive: true, force: true }); mkdirSync(designs);
  assertRejected(run(designs, output), /at least one finalized/);
}));

test('scaffold rejects unsupported design files', () => withInput(({ designs, output }) => {
  writeFileSync(path.join(designs, 'notes.txt'), 'not a design image');
  assertRejected(run(designs, output), /unsupported or non-regular files/);
}));

test('scaffold rejects a design whose page hint is not an architecture page', () => withInput(({ designs, output }) => {
  renameSync(path.join(designs, 'submission.svg'), path.join(designs, 'unknown-page.svg'));
  assertRejected(run(designs, output), /pageHint does not match an architecture page/);
}));

test('explicit nav nodes retain semantics but are excluded from visual release coverage', () => withInput(({ dir, designs, output }) => {
  const architecture = path.join(dir, 'architecture');
  cpSync(path.join(support, 'architecture'), architecture, { recursive: true });
  const pageFile = path.join(architecture, 'page-architecture.json');
  const pages = read(pageFile);
  pages.nodes.push({ id: 'navigation-destination', title: 'Navigation destination', nav: true, modules: [{ id: 'navigation-module', name: 'Module navigation', children: [{ id: 'navigation-entry', name: 'Entry' }] }] });
  writeFileSync(pageFile, `${JSON.stringify(pages, null, 2)}\n`);
  const result = run(designs, output, architecture);
  assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
  const spec = read(path.join(output, 'functional-spec.json'));
  const mapping = read(path.join(output, 'page-function-map.json'));
  assert.deepEqual(spec.architecture.visualAlignment.navigationOnlyPageIds, ['navigation-destination']);
  assert.equal(spec.architecture.visualAlignment.visualRequiredPageIds.includes('navigation-destination'), false);
  assert.equal(spec.architecture.visualAlignment.missingArchitecturePageIds.includes('navigation-destination'), false);
  assert.equal(spec.architecture.visualAlignment.coverage, 1);
  assert.equal(mapping.pages.find((page) => page.pageId === 'navigation-destination').navigationOnly, true);
  const evidence = read(path.join(output, 'evidence-index.json'));
  assert.ok(evidence.evidence.some((item) => item.id === 'page:navigation-destination'));
}));

test('per-control attributes come from each control own element, never a neighbor', () => withInput(({ designs, output }) => {
  assert.equal(run(designs, output).status, 0);
  const controls = Object.fromEntries(read(path.join(output, 'frontend-semantic-inventory.json')).pages[0].controls.map((control) => [control.controlId, control]));
  // Each control reports its OWN native type, default, and options; a neighbor's never bleeds in.
  assert.equal(controls['title-input'].nativeType, null, 'a text input must not inherit a neighboring number type');
  assert.equal(controls['title-input'].defaultValue, null, 'a text input must not inherit a neighboring default value');
  assert.deepEqual(controls['title-input'].options, [], 'a non-select must not scrape neighboring option text');
  assert.equal(controls['quantity-input'].nativeType, 'number');
  assert.equal(controls['quantity-input'].defaultValue, '2');
  assert.equal(controls['upload-input'].nativeType, 'file');
  assert.deepEqual(controls['category-select'].options, ['standard', 'priority']);
}));

function withInput(callback) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'fdd-design-input-'));
  try {
    cpSync(path.join(support, 'designs'), path.join(dir, 'designs'), { recursive: true });
    callback({ dir, designs: path.join(dir, 'designs'), output: path.join(dir, 'output') });
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
function run(designs, output, input = path.join(support, 'architecture')) { return spawnSync(process.execPath, [scaffold, '--input', input, '--designs', designs, '--visual-release', path.join(support, 'visual-release'), '--output', output, '--author-agent', 'design-input-author'], { encoding: 'utf8' }); }
function read(file) { return JSON.parse(readFileSync(file, 'utf8')); }
function assertRejected(result, pattern) { assert.notEqual(result.status, 0); assert.match(`${result.stdout}${result.stderr}`, pattern); }
