#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { hashDirectory, interactiveControls, packageDigest, readJSON, sha, verifyVisualRelease } from './lib/visual-release.mjs';
import { presentationFindings } from './lib/presentation.mjs';

const args = parseArgs(process.argv.slice(2));
if (!args.functional || !args['visual-release'] || !args.output || !args['author-agent']) usage();
const functionalDir = resolve(args.functional); const output = resolve(args.output);
const manifest = readJSON(`${functionalDir}/manifest.json`); const spec = readJSON(`${functionalDir}/functional-spec.json`); const functionalLock = readJSON(`${functionalDir}/package-lock.json`);
if (manifest.status !== 'approved' || !existsSync(`${functionalDir}/review-receipt.json`)) throw new Error('functional package is not approved');
const semanticFiles = manifest.schemaVersion === '2.1' ? ['frontend-semantic-inventory.json', 'observed-interactions.json', 'control-capability-map.json'] : [];
const functionalFiles = ['manifest.json', 'planning-manifest.json', 'planning-artifacts.json', 'capability-definitions.json', ...semanticFiles, 'functional-spec.json', 'page-function-map.json', 'unresolved-items.json', 'planning-review-receipt.json', 'review-receipt.json'];
for (const file of functionalFiles) if (!functionalLock.digests?.[file] || sha(readFileSync(`${functionalDir}/${file}`)) !== functionalLock.digests[file]) throw new Error(`functional package lock mismatch: ${file}`);
const functionalPackageDigest = packageDigest(functionalLock); const visual = verifyVisualRelease(args['visual-release']);
if (manifest.visualReleaseDigest !== visual.releaseDigest || spec.visualSource?.releaseDigest !== visual.releaseDigest) throw new Error('functional package visual release digest mismatch');
const uiPlan = (spec.capabilities || []).map((capability) => {
  const presentation = capability.resultPresentation ? { ...capability.presentation, surface: { ...(capability.presentation.surface || {}), contentContract: { ...(capability.presentation.surface?.contentContract || {}), resultContract: capability.resultPresentation } } } : capability.presentation;
  const findings = presentationFindings(capability.id, presentation, capability, { requireDeliveryPolicy: manifest.schemaVersion === '2.1' });
  if (findings.length) throw new Error(findings.join('\n'));
  return { capabilityId: capability.id, specificationStatus: capability.specificationStatus, presentation, deliveryPolicy: capability.deliveryPolicy || { requiredForCompletion: true, allowedIncompleteState: 'planned' }, planningReason: capability.planningReason || null, missingDecisions: capability.missingDecisions || [], aliasOf: capability.aliasOf || null };
});
const visualControls = visual.pages.flatMap((pageId) => interactiveControls(visual.inventories[pageId]).map((control) => ({ pageId, ...control })));
const operations = (spec.capabilities || []).flatMap((capability) => (capability.operations || []).map((operation) => {
  const normalized = { ...operation, capabilityId: capability.id, ruleIds: operation.ruleIds || capability.ruleIds || [] };
  if (normalized.assetTransfer && normalized.resourceTransfer && JSON.stringify(normalized.assetTransfer) !== JSON.stringify(normalized.resourceTransfer)) throw new Error(`operation ${normalized.id} has conflicting assetTransfer and resourceTransfer contracts`);
  if (normalized.assetTransfer && !normalized.resourceTransfer) normalized.resourceTransfer = normalized.assetTransfer;
  delete normalized.assetTransfer;
  return normalized;
}));
mkdirSync(output, { recursive: true });
cpSync(visual.manifestPath, `${output}/release-manifest.json`); cpSync(`${visual.root}/payload/evidence/payload/suite-gate.json`, `${output}/suite-gate.json`); cpSync(`${visual.root}/payload/approval.json`, `${output}/visual-approval.json`); cpSync(visual.publicationRoot, `${output}/web`, { recursive: true }); cpSync(`${functionalDir}/functional-spec.json`, `${output}/functional-spec.json`);
for (const file of semanticFiles) cpSync(`${functionalDir}/${file}`, `${output}/${file}`);
const webDigest = hashDirectory(`${output}/web`);
writeJSON(`${output}/visual-source.json`, { schemaVersion: '1.0', sourceType: 'ai-restore-release', releaseManifest: 'release-manifest.json', suiteGate: 'suite-gate.json', approval: 'visual-approval.json', releaseDigest: visual.releaseDigest, suiteGateDigest: visual.suiteGateDigest, pageIds: visual.pages, routes: visual.routes, sourceTreeDigest: visual.sourceTreeDigest });
writeJSON(`${output}/frontend-manifest.json`, { schemaVersion: '1.0', status: 'visual-baseline', pages: Object.fromEntries(visual.pages.map((pageId) => [pageId, { route: visual.routes[pageId], status: 'baseline' }])), sourceTreeDigest: webDigest });
writeJSON(`${output}/visual-controls.json`, { schemaVersion: '1.0', role: 'optional-reference', controls: visualControls });
writeJSON(`${output}/ui-implementation-plan.json`, { schemaVersion: '1.0', capabilities: uiPlan });
writeJSON(`${output}/api-contract.json`, { schemaVersion: '1.0', operations });
writeJSON(`${output}/domain-bindings.json`, { schemaVersion: semanticFiles.length ? '1.1' : '1.0', functionalPackageDigest, capabilityIds: (spec.capabilities || []).map((item) => item.id), completeCapabilityIds: (spec.capabilities || []).filter((item) => item.specificationStatus === 'complete').map((item) => item.id), plannedCapabilityIds: (spec.capabilities || []).filter((item) => item.specificationStatus === 'planned').map((item) => item.id), ruleIds: (spec.rules || []).map((item) => item.id), ...(semanticFiles.length ? { semanticArtifacts: semanticFiles } : {}) });
writeJSON(`${output}/runtime-contract.json`, { schemaVersion: '1.0', command: spec.runtime?.command || 'npm start', healthUrl: spec.runtime?.healthUrl || 'http://127.0.0.1:${PORT}/health', requiredEnvironment: spec.runtime?.requiredEnvironment || ['PORT'] });
writeJSON(`${output}/handoff-manifest.json`, { schemaVersion: '1.0', packageType: 'implementation-handoff', status: 'draft', authorAgentId: args['author-agent'], functionalProjectId: manifest.projectId, functionalPackageDigest, visualReleaseDigest: visual.releaseDigest, sourceDirectory: basename(visual.root) });
console.log(`Implementation handoff generated (${uiPlan.length} UI intents, ${operations.length} operations) -> ${output}`);
function writeJSON(path, value) { writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`); }
function parseArgs(values) { const result = {}; for (let i = 0; i < values.length; i++) if (values[i].startsWith('--')) result[values[i].slice(2)] = values[++i]; return result; }
function usage() { console.error('Usage: build-implementation-handoff.mjs --functional <approved-package> --visual-release <ai-restore-release> --output <handoff> --author-agent <id>'); process.exit(2); }
