import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
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

test('checked-in approved package replays under its approval-time contract', () => {
  const result = spawnSync('node', ['scripts/validate-package.mjs', 'assets/golden-approved/functional-domain', '--require-approved', '--check-lock'], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});
