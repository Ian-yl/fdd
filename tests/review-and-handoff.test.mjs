import assert from 'node:assert/strict';
import { appendFileSync, cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const golden = path.join(root, 'assets/golden-approved/functional-domain');
// A real, approved schema 2.2 handoff produced by the end-to-end golden pipeline in the sibling
// project-implementation repo (bound to its neutral ai-restore release).
const handoffFixture = path.resolve(root, '../project-implementation/assets/golden-simulated/current/implementation-handoff');
const readJSON = (file) => JSON.parse(readFileSync(file, 'utf8'));
const tempCopy = (source) => { const dir = mkdtempSync(path.join(os.tmpdir(), 'fdd-rh-')); cpSync(source, path.join(dir, 'target'), { recursive: true }); return { dir, target: path.join(dir, 'target') }; };
const reviewPackage = (dir, reviewer) => spawnSync('node', [path.join(root, 'scripts/review-package.mjs'), '--package', dir, '--reviewer-agent', reviewer], { encoding: 'utf8' });
const validateHandoff = (dir) => spawnSync('node', [path.join(root, 'scripts/validate-implementation-handoff.mjs'), '--handoff', dir], { encoding: 'utf8' });

// ---- review negatives (schema 2.2 functional golden) ----
test('review-package rejects a package whose reviewer is the same agent as the author', () => {
  const { dir, target } = tempCopy(golden);
  try {
    const author = readJSON(path.join(target, 'manifest.json')).authorAgentId;
    const result = reviewPackage(target, author);
    assert.notEqual(result.status, 0);
    const rejection = readJSON(path.join(target, 'review-rejection.json'));
    assert.match(rejection.findings.join('\n'), /reviewer must be a different agent/i);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('review-package rolls the package back to draft and deletes the receipt when validation fails during review', () => {
  const { dir, target } = tempCopy(golden);
  try {
    // break a closure evidence anchor so structural validation fails inside review
    const spec = readJSON(path.join(target, 'functional-spec.json'));
    spec.capabilities.find((item) => item.specificationStatus === 'complete').closure.userInput.evidenceAnchors.push('annotation:does-not-exist');
    writeFileSync(path.join(target, 'functional-spec.json'), `${JSON.stringify(spec, null, 2)}\n`);
    const definitions = readJSON(path.join(target, 'capability-definitions.json')); definitions.capabilities = spec.capabilities; writeFileSync(path.join(target, 'capability-definitions.json'), `${JSON.stringify(definitions, null, 2)}\n`);
    const result = reviewPackage(target, 'independent-reviewer');
    assert.notEqual(result.status, 0);
    assert.equal(readJSON(path.join(target, 'manifest.json')).status, 'draft');
    assert.equal(existsSync(path.join(target, 'review-receipt.json')), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a tampered functional package lock digest is rejected under --require-approved --check-lock', () => {
  const { dir, target } = tempCopy(golden);
  try {
    const lock = readJSON(path.join(target, 'package-lock.json'));
    lock.digests['functional-spec.json'] = '0'.repeat(64);
    writeFileSync(path.join(target, 'package-lock.json'), `${JSON.stringify(lock, null, 2)}\n`);
    const result = spawnSync('node', [path.join(root, 'scripts/validate-package.mjs'), target, '--require-approved', '--check-lock'], { encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}${result.stderr}`, /package lock mismatch/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ---- handoff negatives (schema 2.2 approved handoff) ----
test('the approved schema 2.2 handoff fixture validates before tampering', () => {
  assert.equal(validateHandoff(handoffFixture).status, 0, validateHandoff(handoffFixture).stderr);
});

test('validate-implementation-handoff rejects a tampered handoff file (lock digest mismatch)', () => {
  const { dir, target } = tempCopy(handoffFixture);
  try {
    appendFileSync(path.join(target, 'functional-spec.json'), '\n');
    const result = validateHandoff(target);
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}${result.stderr}`, /handoff lock mismatch/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('validate-implementation-handoff rejects a handoff receipt with a tampered trusted-reviewer binding', () => {
  for (const field of ['trustedReviewerId', 'validatorDigest']) {
    const { dir, target } = tempCopy(handoffFixture);
    try {
      const receipt = readJSON(path.join(target, 'handoff-review-receipt.json'));
      receipt[field] = field === 'validatorDigest' ? '0'.repeat(64) : 'fdd-handoff-reviewer-forged';
      writeFileSync(path.join(target, 'handoff-review-receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`);
      const result = validateHandoff(target);
      assert.notEqual(result.status, 0, `expected rejection for tampered ${field}`);
      assert.match(`${result.stdout}${result.stderr}`, /does not pin a trusted reviewer revision|handoff lock mismatch/);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
});

test('the trusted handoff-2.2 reviewer tree digest detects a tampered imported library on replay', () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'fdd-handoff-tamper-'));
  try {
    for (const name of ['scripts', 'validators']) cpSync(path.join(root, name), path.join(temp, name), { recursive: true });
    cpSync(handoffFixture, path.join(temp, 'handoff'), { recursive: true });
    appendFileSync(path.join(temp, 'validators/handoff-2.2/lib/presentation.mjs'), '\n// tampered\n');
    const result = spawnSync('node', [path.join(temp, 'scripts/validate-implementation-handoff.mjs'), '--handoff', path.join(temp, 'handoff')], { encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(`${result.stdout}${result.stderr}`, /does not pin a trusted reviewer revision/);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});
