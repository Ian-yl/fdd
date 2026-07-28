import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { extractFrontendSemantics } from '../scripts/lib/frontend-semantics.mjs';

test('frontend semantics classifies decorative and business assets with fail-closed defaults', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'asset-roles-'));
  try {
    mkdirSync(`${root}/assets`, { recursive: true });
    writeFileSync(`${root}/index.html`, '<header class="brand-logo"><img src="assets/logo.png"></header><section class="result-panel"><img src="assets/stage-result.png"></section>'); writeFileSync(`${root}/unknown.html`, '<img src="assets/th-unknown.png">');
    writeFileSync(`${root}/assets/logo.png`, 'decorative-logo'); writeFileSync(`${root}/assets/stage-result.png`, 'sample-result'); writeFileSync(`${root}/assets/th-unknown.png`, 'unknown-sample');
    const visual = { publicationRoot: root, pages: ['page'], routes: { page: '/page' }, inventories: { page: { items: [] } }, releaseDigest: 'release-digest', sourceTreeDigest: 'tree-digest', suiteGateDigest: 'gate-digest', manifest: { payloadManifestDigest: 'payload-digest' } };
    const result = extractFrontendSemantics(visual); const byPath = new Map(result.assets.assets.map((item) => [item.path, item]));
    assert.equal(byPath.get('assets/logo.png').role, 'decorative'); assert.equal(byPath.get('assets/logo.png').requiredReplacement, undefined);
    assert.equal(byPath.get('assets/stage-result.png').role, 'business-sample'); assert.equal(byPath.get('assets/stage-result.png').requiredReplacement, 'api-data');
    assert.equal(byPath.get('assets/th-unknown.png').role, 'business-sample'); assert.equal(byPath.get('assets/th-unknown.png').classificationStatus, 'defaulted-fail-closed'); assert.ok(result.unresolved.some((item) => item.relatedIds.includes(byPath.get('assets/th-unknown.png').id)));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('frontend semantics inventories CSS, remote, and data URI assets', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'asset-roles-extended-'));
  try {
    mkdirSync(`${root}/assets`, { recursive: true });
    writeFileSync(`${root}/index.html`, '<section class="result-panel"><img src="https://cdn.example.test/sample-result.png"><img src="data:image/png;base64,c2FtcGxl"></section>');
    writeFileSync(`${root}/styles.css`, '.brand-icon{background-image:url("assets/icon.png")}');
    writeFileSync(`${root}/assets/icon.png`, 'decorative-icon');
    const visual = { publicationRoot: root, pages: ['page'], routes: { page: '/page' }, inventories: { page: { items: [] } }, releaseDigest: 'release-digest', sourceTreeDigest: 'tree-digest', suiteGateDigest: 'gate-digest', manifest: { payloadManifestDigest: 'payload-digest' } };
    const assets = extractFrontendSemantics(visual).assets.assets;
    assert.equal(assets.find((item) => item.path === 'assets/icon.png')?.role, 'decorative');
    assert.equal(assets.find((item) => item.sourceType === 'remote-url')?.role, 'business-sample');
    assert.equal(assets.find((item) => item.sourceType === 'data-uri')?.role, 'business-sample');
  } finally { rmSync(root, { recursive: true, force: true }); }
});
