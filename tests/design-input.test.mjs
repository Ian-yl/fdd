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

function withInput(callback) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'fdd-design-input-'));
  try {
    cpSync(path.join(support, 'designs'), path.join(dir, 'designs'), { recursive: true });
    callback({ designs: path.join(dir, 'designs'), output: path.join(dir, 'output') });
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
function run(designs, output) { return spawnSync(process.execPath, [scaffold, '--input', path.join(support, 'architecture'), '--designs', designs, '--visual-release', path.join(support, 'visual-release'), '--output', output, '--author-agent', 'design-input-author'], { encoding: 'utf8' }); }
function read(file) { return JSON.parse(readFileSync(file, 'utf8')); }
function assertRejected(result, pattern) { assert.notEqual(result.status, 0); assert.match(`${result.stdout}${result.stderr}`, pattern); }
