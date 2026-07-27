import assert from 'node:assert/strict';
import { appendFileSync, cpSync, mkdtempSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');

test('distributable Skill bundle matches project runtime', () => {
  const result = spawnSync('node', ['scripts/check-skill-bundle.mjs'], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
});

test('installed Skill script resolves independently of caller cwd', () => {
  const cwd = mkdtempSync(path.join(os.tmpdir(), 'functional-skill-cwd-'));
  try {
    const script = path.join(root, 'skills/functional-domain-design/scripts/scaffold-package.mjs');
    const result = spawnSync('node', [script], { cwd, encoding: 'utf8' });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /Usage: scaffold-package/);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

test('checked-in versioned approved package passes trusted replay validation', () => {
  const result = spawnSync('node', ['scripts/validate-package.mjs', 'assets/golden-approved/functional-domain', '--require-approved', '--check-lock'], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});

test('trusted validator tree digest detects a modified imported library', () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), 'fdd-validator-tree-'));
  try {
    for (const name of ['scripts', 'validators']) cpSync(path.join(root, name), path.join(temp, name), { recursive: true });
    cpSync(path.join(root, 'assets/golden-approved/functional-domain'), path.join(temp, 'domain'), { recursive: true });
    appendFileSync(path.join(temp, 'validators/fdd-2.2.3/lib/presentation.mjs'), '\n// tampered\n');
    const result = spawnSync('node', [path.join(temp, 'scripts/validate-package.mjs'), path.join(temp, 'domain'), '--require-approved'], { encoding: 'utf8' });
    assert.notEqual(result.status, 0); assert.match(result.stderr, /does not reference the immutable trusted repository validator/);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});
