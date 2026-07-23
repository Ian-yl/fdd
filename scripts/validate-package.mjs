#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { presentationFindings } from './lib/presentation.mjs';

const dirArg = process.argv.slice(2).find((value) => !value.startsWith('--'));
if (!dirArg) { console.error('Usage: validate-package.mjs <package-dir> [--require-approved]'); process.exit(2); }
const dir = resolve(dirArg);
const requireApproved = process.argv.includes('--require-approved');
const checkLock = process.argv.includes('--check-lock');
const manifestPreview = readJSON(`${dir}/manifest.json`);
const semanticFiles = manifestPreview.schemaVersion === '2.1' ? ['frontend-semantic-inventory.json', 'observed-interactions.json', 'control-capability-map.json'] : [];
const files = ['manifest.json', 'planning-manifest.json', 'planning-artifacts.json', 'capability-definitions.json', ...semanticFiles, 'functional-spec.json', 'page-function-map.json', 'unresolved-items.json'];
if (existsSync(`${dir}/review-receipt.json`)) files.push('review-receipt.json');
if (existsSync(`${dir}/planning-review-receipt.json`)) files.push('planning-review-receipt.json');
const docs = Object.fromEntries(files.map((file) => [file, readJSON(`${dir}/${file}`)]));
const errors = [];
const manifest = docs['manifest.json'];
const spec = docs['functional-spec.json'];
const mapping = docs['page-function-map.json'];
const unresolved = docs['unresolved-items.json'];
const planningManifest = docs['planning-manifest.json'];
const planningArtifacts = docs['planning-artifacts.json'];
const definitions = docs['capability-definitions.json'];
const frontendInventory = docs['frontend-semantic-inventory.json'] || {};
const observedInteractions = docs['observed-interactions.json'] || {};
const controlMap = docs['control-capability-map.json'] || {};
const legacyApprovedContract = manifest.status === 'approved' && !docs['review-receipt.json']?.contractVersion;
const currentSemanticContract = !legacyApprovedContract;
const requiredPlanningArtifacts = ['planning-artifacts.json', 'capability-definitions.json', 'frontend-semantic-inventory.json', 'observed-interactions.json', 'control-capability-map.json'];
if (planningManifest.packageType !== 'fdd-bmad-planning' || (manifest.schemaVersion === '2.1' ? JSON.stringify(planningManifest.artifacts) !== JSON.stringify(requiredPlanningArtifacts) : planningManifest.artifacts?.join('|') !== 'planning-artifacts.json|capability-definitions.json')) errors.push('FDD planning manifest is invalid');
if (planningArtifacts.method !== 'bmad-planning' || !['project-understanding', 'requirements-analysis', 'domain-design', 'independent-domain-review'].every((id) => planningArtifacts.phases?.some((item) => item.id === id))) errors.push('FDD BMAD planning phases are incomplete');
for (const group of ['capabilities', 'entities', 'valueObjects', 'relationships', 'consistencyBoundaries', 'journeys', 'rules', 'permissions', 'integrations']) if (JSON.stringify(definitions[group] || []) !== JSON.stringify(spec[group] || [])) errors.push(`capability definitions differ from functional spec: ${group}`);
if (manifest.schemaVersion === '2.1' && (!frontendInventory.release?.releaseDigest || !frontendInventory.pages?.length || !frontendInventory.sourceSummary?.length)) errors.push('frontend semantic inventory did not parse the immutable release');
if (manifest.schemaVersion === '2.1' && (observedInteractions.releaseDigest !== frontendInventory.release?.releaseDigest || controlMap.releaseDigest !== frontendInventory.release?.releaseDigest)) errors.push('frontend semantic artifact release digests differ');
if (manifest.schemaVersion === '2.1' && (!Array.isArray(observedInteractions.interactions) || !Array.isArray(controlMap.mappings))) errors.push('frontend semantic artifacts are incomplete');
if (spec.planningContext) errors.push('external planningContext is outside the FDD-owned planning workflow');
if (manifest.schemaVersion === '2.1') {
  const alignment = spec.architecture?.visualAlignment;
  if (!alignment || alignment.status !== 'aligned' || !alignment.matchedPageIds?.length || alignment.coverage !== 1 || alignment.routeMismatches?.length) errors.push('architecture and immutable frontend release are not fully aligned');
  const leafTypes = new Set(['business-capability', 'operation', 'input-field', 'local-control', 'display-requirement', 'navigation', 'state', 'acceptance-constraint']);
  const leafIds = new Set();
  for (const leaf of spec.architecture?.leafClassifications || []) { const key = `${leaf.pageId}:${leaf.leafId}`; if (!leafTypes.has(leaf.classification)) errors.push(`architecture leaf ${key} has invalid classification`); if (leafIds.has(key)) errors.push(`architecture leaf classification is duplicated: ${key}`); leafIds.add(key); }
  if (!leafIds.size) errors.push('architecture leaves were not classified before capability synthesis');
}

if (!['1.0', '2.0', '2.1'].includes(manifest.schemaVersion) || manifest.packageType !== 'functional-domain') errors.push('manifest contract is invalid');
if (requireApproved && manifest.status !== 'approved') errors.push('package is not approved');
if (manifest.schemaVersion === '2.0' && !manifest.authorAgentId) errors.push('package has no author agent identity');
if (requireApproved) {
  const receipt = docs['review-receipt.json'];
  if (!receipt) errors.push('approved package has no independent review receipt');
  else {
    if (receipt.status !== 'approved') errors.push('review receipt is not approved');
    if (!receipt.reviewerAgentId) errors.push('review receipt has no reviewer agent identity');
    if (receipt.reviewerAgentId === manifest.authorAgentId) errors.push('author and reviewer agents must be different');
    if (receipt.authorAgentId !== manifest.authorAgentId) errors.push('review receipt author identity mismatch');
  }
  const planningReceipt = docs['planning-review-receipt.json'];
  if (!planningReceipt || planningReceipt.status !== 'approved' || planningReceipt.reviewerAgentId !== receipt?.reviewerAgentId || planningReceipt.authorAgentId !== manifest.authorAgentId) errors.push('FDD planning has no matching independent review receipt');
  if (planningManifest.status !== 'approved') errors.push('FDD planning is not approved');
}
if (manifest.schemaVersion !== spec.schemaVersion || manifest.schemaVersion !== mapping.schemaVersion || manifest.schemaVersion !== unresolved.schemaVersion) errors.push('package schema versions do not match');
const ids = new Set();
for (const group of ['domains', 'entities', ...(manifest.schemaVersion === '2.1' ? ['valueObjects'] : []), 'relationships', 'consistencyBoundaries', 'capabilities', 'journeys', 'rules', 'permissions', 'integrations']) {
  if (!Array.isArray(spec[group])) errors.push(`${group} must be an array`);
  for (const item of spec[group] || []) {
    if (!item.id) errors.push(`${group} contains an item without id`);
    else if (ids.has(item.id)) errors.push(`duplicate id: ${item.id}`);
    else ids.add(item.id);
  }
}
const capabilities = new Map((spec.capabilities || []).map((item) => [item.id, item]));
const operations = new Map((spec.capabilities || []).flatMap((item) => (item.operations || []).map((operation) => [operation.id, { ...operation, capabilityId: item.id }])));
const entities = new Set((spec.entities || []).map((item) => item.id));
const domains = new Set((spec.domains || []).map((item) => item.id));
const pages = new Set((mapping.pages || []).map((item) => item.pageId));
const rules = new Set((spec.rules || []).map((item) => item.id));
const consistencyBoundaryIds = new Set((spec.consistencyBoundaries || []).map((item) => item.id));
const actors = new Set((spec.capabilities || []).map((item) => item.actor).filter(Boolean));
const cardinalities = new Set(['one-to-one', 'one-to-many', 'many-to-one', 'many-to-many']);
const ownerships = new Set(['aggregate', 'reference', 'shared']);
const deleteRules = new Set(['cascade', 'restrict', 'set-null', 'detach']);
for (const domain of spec.domains || []) {
  for (const pageId of domain.pageIds || []) if (!pages.has(pageId)) errors.push(`domain ${domain.id} references unknown page ${pageId}`);
  for (const entityId of domain.entityIds || []) if (!entities.has(entityId)) errors.push(`domain ${domain.id} references unknown entity ${entityId}`);
}
for (const entity of spec.entities || []) {
  if (entity.domainId && !domains.has(entity.domainId)) errors.push(`entity ${entity.id} references unknown domain ${entity.domainId}`);
  if (!entity.identity?.fields?.length) errors.push(`entity ${entity.id} has no identity fields`);
  if (typeof entity.aggregateRoot !== 'boolean') errors.push(`entity ${entity.id} has no aggregateRoot declaration`);
  if (!Array.isArray(entity.lifecycle) || !entity.lifecycle.length) errors.push(`entity ${entity.id} has no lifecycle`);
  if (!entity.constraints || !Array.isArray(entity.constraints.required) || !Array.isArray(entity.constraints.unique) || !entity.constraints.status) errors.push(`entity ${entity.id} has incomplete constraints`);
  if (!entity.accessScope?.ownerActor || !['owner', 'tenant', 'shared', 'system'].includes(entity.accessScope.scope) || (entity.accessScope.scope === 'owner' && !entity.accessScope.ownershipField)) errors.push(`entity ${entity.id} has incomplete access scope`);
  if (!entity.aggregateRoot) {
    const root = (spec.entities || []).find((item) => item.id === entity.aggregateRootEntityId);
    if (!root?.aggregateRoot) errors.push(`entity ${entity.id} references an invalid aggregate root`);
  }
}
for (const relation of spec.relationships || []) {
  if (!entities.has(relation.fromEntityId)) errors.push(`relationship ${relation.id} references unknown from entity ${relation.fromEntityId}`);
  if (!entities.has(relation.toEntityId)) errors.push(`relationship ${relation.id} references unknown to entity ${relation.toEntityId}`);
  if (!cardinalities.has(relation.cardinality)) errors.push(`relationship ${relation.id} has invalid cardinality`);
  if (typeof relation.required !== 'boolean') errors.push(`relationship ${relation.id} has no required declaration`);
  if (!ownerships.has(relation.ownership)) errors.push(`relationship ${relation.id} has invalid ownership`);
  if (!deleteRules.has(relation.onDelete)) errors.push(`relationship ${relation.id} has invalid onDelete rule`);
  if (!relation.associationKey?.fromFields?.length || !relation.associationKey?.toFields?.length) errors.push(`relationship ${relation.id} has no association key`);
  else if (relation.associationKey.fromFields.length !== relation.associationKey.toFields.length) errors.push(`relationship ${relation.id} has mismatched association key fields`);
  if (!relation.invariants?.length) errors.push(`relationship ${relation.id} has no invariants`);
}
for (const boundary of spec.consistencyBoundaries || []) {
  if (!entities.has(boundary.aggregateRootEntityId)) errors.push(`consistency boundary ${boundary.id} references unknown aggregate root`);
  for (const entityId of boundary.entityIds || []) if (!entities.has(entityId)) errors.push(`consistency boundary ${boundary.id} references unknown entity ${entityId}`);
  if (!boundary.entityIds?.includes(boundary.aggregateRootEntityId) || !['atomic', 'eventual'].includes(boundary.strategy)) errors.push(`consistency boundary ${boundary.id} is incomplete`);
}
for (const cap of capabilities.values()) {
  if (!['complete', 'planned', 'blocked'].includes(cap.specificationStatus)) errors.push(`capability ${cap.id} has invalid specification status`);
  if (!cap.name || !cap.purpose || !cap.pageIds?.length) errors.push(`capability ${cap.id} lacks identity or pages`);
  if (!cap.acceptanceCriteria?.length) errors.push(`capability ${cap.id} has no acceptance criteria`);
  if (cap.specificationStatus === 'complete' && (!validObjectSchema(cap.inputSchema) || !validObjectSchema(cap.outputSchema) || !cap.acceptanceExamples?.length)) errors.push(`capability ${cap.id} lacks structured input, output, or acceptance examples`);
  const intentFields = ['userGoal', 'businessOutcome', 'trigger', 'prerequisites', 'inputs', 'processingSemantics', 'outputs', 'sideEffects', 'downstreamUsage', 'qualityCriteria', 'failures', 'evidence'];
  if (manifest.schemaVersion === '2.1' && intentFields.some((field) => cap.capabilityIntent?.[field] === undefined)) errors.push(`capability ${cap.id} has an incomplete capabilityIntent`);
  if (manifest.schemaVersion === '2.1' && (cap.synthesisAnalysis?.classifierRole !== 'candidate-analysis' || (cap.specificationStatus === 'complete' && cap.synthesisAnalysis?.minimumImplementableInformation !== 'satisfied'))) errors.push(`capability ${cap.id} did not pass minimum implementable information review`);
  if (manifest.schemaVersion === '2.1' && cap.synthesisAnalysis?.confidence === 'low' && !['planned', 'blocked'].includes(cap.specificationStatus)) errors.push(`capability ${cap.id} has low-confidence semantics but is neither planned nor blocked`);
  if (manifest.schemaVersion === '2.1' && cap.specificationStatus === 'planned' && ((cap.operations || []).length || (cap.entityEffects || []).length || cap.writesState || (cap.inputs || []).length || cap.inputSchema || (cap.outcomes || []).length || cap.outputSchema || (cap.acceptanceExamples || []).length || cap.deliveryPolicy?.requiredForCompletion !== false || cap.deliveryPolicy?.uiBehavior !== 'show-planned-state' || !cap.planningReason)) errors.push(`planned capability ${cap.id} exposes implementation semantics or lacks its planned delivery contract`);
  if (manifest.schemaVersion === '2.1' && currentSemanticContract && cap.specificationStatus === 'planned' && cap.presentation?.mode === 'headless') errors.push(`planned capability ${cap.id} cannot be headless`);
  if (manifest.schemaVersion === '2.1' && cap.specificationStatus === 'complete' && cap.deliveryPolicy?.requiredForCompletion === false) errors.push(`complete capability ${cap.id} is explicitly excluded from completion`);
  if (manifest.schemaVersion === '2.1') { const leaf = (spec.architecture?.leafClassifications || []).find((item) => item.pageId === cap.pageIds?.[0] && item.leafId === cap.synthesisAnalysis?.sourceArchitectureLeafId); if (!leaf || (!['business-capability', 'operation'].includes(leaf.classification) && !leaf.embeddedOperations?.length)) errors.push(`capability ${cap.id} was synthesized from a non-implementable architecture leaf`); }
  if (manifest.schemaVersion === '2.1' && cap.synthesisAnalysis?.confidence === 'medium') {
    const decision = cap.synthesisAnalysis.bmadDecision;
    if (decision?.status !== 'accepted' || !decision.chosenPattern || decision.chosenPattern !== cap.synthesisAnalysis.candidatePattern || !decision.rationale || !decision.rejectedAlternatives?.length || decision.rejectedAlternatives.some((item) => !item.pattern || !item.reason) || !decision.evidence?.length || !decision.reviewerAgentId || decision.inputDigest !== planningManifest.synthesisInputDigest) errors.push(`capability ${cap.id} has no accepted input-bound BMAD semantic decision`);
  }
  if (manifest.schemaVersion === '2.1') for (const input of cap.capabilityIntent?.inputs || []) {
    const ownership = input.ownership;
    if (!ownership?.type) errors.push(`capability ${cap.id} input ${input.id} has no ownership evidence`);
    if (ownership?.capabilityModuleId && ownership.capabilityModuleId !== cap.synthesisAnalysis?.sourceModuleId) errors.push(`capability ${cap.id} input ${input.id} belongs to another capability module`);
    if (ownership?.type === 'architecture-owner-module' && ownership.ownerModuleId !== cap.synthesisAnalysis?.sourceContainerModuleId && Number(ownership.affinity || 0) < 0.6) errors.push(`capability ${cap.id} input ${input.id} has no reliable architecture ownership match`);
    if (ownership?.type === 'page-workspace-template' && ownership.sharedAcrossCapabilities !== true) errors.push(`capability ${cap.id} input ${input.id} has an invalid shared workspace ownership decision`);
  }
  if (manifest.schemaVersion === '2.1' && (!cap.capabilityIntent?.trigger?.evidence?.sources?.length || !cap.capabilityIntent?.evidence?.sources?.length)) errors.push(`capability ${cap.id} lacks traceable intent evidence`);
  if (manifest.schemaVersion === '2.1' && (containsUnconstrainedGeneric(cap.inputSchema) || containsUnconstrainedGeneric(cap.outputSchema))) errors.push(`capability ${cap.id} uses an unconstrained generic input or result object`);
  if (manifest.schemaVersion === '2.1' && currentSemanticContract && cap.specificationStatus === 'complete' && requiresSpecializedBusinessResult(cap) && !hasSpecializedBusinessResult(cap)) errors.push(`capability ${cap.id} lacks a capability-specific result, quality contract, downstream usage, failure semantics, or executable business assertion`);
  if (manifest.schemaVersion === '2.1' && currentSemanticContract) errors.push(...resultPresentationFindings(cap, frontendInventory));
  if (manifest.schemaVersion === '2.1' && currentSemanticContract && cap.aggregateSubmission) errors.push(...aggregateSubmissionFindings(cap, entities, spec));
  const mapped = (controlMap.mappings || []).find((item) => item.capabilityId === cap.id);
  if (manifest.schemaVersion === '2.1' && cap.presentation?.mode !== 'headless' && (!mapped || (!mapped.controlId && mapped.mappingType !== 'designed-control'))) errors.push(`capability ${cap.id} has no frontend control mapping`);
  if (cap.presentation?.primaryOperationId && !(cap.operations || []).some((operation) => operation.id === cap.presentation.primaryOperationId)) errors.push(`capability ${cap.id} primary operation does not exist`);
  if (cap.writesState && cap.specificationStatus !== 'blocked' && (!cap.entityEffects?.length || !cap.failures?.length)) errors.push(`write capability ${cap.id} lacks effects or failures`);
  for (const effect of cap.entityEffects || []) if (!entities.has(effect.entityId)) errors.push(`${cap.id} references unknown entity ${effect.entityId}`);
  for (const pageId of cap.pageIds || []) if (!pages.has(pageId)) errors.push(`${cap.id} references unknown page ${pageId}`);
  for (const ruleId of cap.ruleIds || []) if (!rules.has(ruleId)) errors.push(`${cap.id} references unknown rule ${ruleId}`);
  if (manifest.schemaVersion === '2.1' && cap.operations?.length && !cap.ruleIds?.length) errors.push(`capability ${cap.id} has operations but no bound rules`);
  errors.push(...presentationFindings(cap.id, cap.presentation, cap, { requireDeliveryPolicy: manifest.schemaVersion === '2.1' }));
  for (const operation of cap.operations || []) {
    if (!operation.request?.contentType || !validObjectSchema(operation.response?.bodySchema)) errors.push(`operation ${operation.id} lacks content type or structured response schema`);
    for (const location of ['path', 'query', 'header']) if (operation.request?.[location]?.length && !validObjectSchema(operation.request?.[`${location}Schema`])) errors.push(`operation ${operation.id} lacks ${location} schema`);
    if (operation.request?.body?.length && !validObjectSchema(operation.request?.bodySchema)) errors.push(`operation ${operation.id} lacks body schema`);
    if (manifest.schemaVersion === '2.1' && (!operation.authorization || !operation.errors?.length || !operation.idempotency || !operation.concurrency || !operation.acceptanceExample)) errors.push(`operation ${operation.id} lacks authorization, errors, idempotency, concurrency, or acceptance semantics`);
    if (manifest.schemaVersion === '2.1' && (!operation.ruleIds?.length || operation.ruleIds.some((ruleId) => !cap.ruleIds.includes(ruleId)))) errors.push(`operation ${operation.id} is not bound to its capability rules`);
    const resourceTransfer = operation.resourceTransfer || ((manifest.schemaVersion === '2.0' || legacyApprovedContract) ? operation.assetTransfer : null);
    if (manifest.schemaVersion === '2.1' && operation.assetTransfer && !legacyApprovedContract) errors.push(`operation ${operation.id} uses legacy assetTransfer instead of resourceTransfer`);
    if (operation.request?.contentType === 'multipart/form-data' && (!resourceTransfer?.fileField || !resourceTransfer?.responseIdPath)) errors.push(`transfer operation ${operation.id} lacks a structured resource transfer contract`);
    if (operation.providerContract && (!operation.providerContract.requiredCapability || !operation.providerContract.parameterMappings?.length || !operation.providerContract.outputConstraints)) errors.push(`operation ${operation.id} has an incomplete provider contract`);
    if (operation.providerContract) {
      const bindings = operation.integrationBindings || [];
      for (const mapping of operation.providerContract.parameterMappings || []) if (!bindings.some((binding) => binding.source === mapping.source && binding.target === mapping.target && binding.required === mapping.required)) errors.push(`operation ${operation.id} provider parameter mapping is not an integration binding: ${mapping.source}`);
    }
    if (operation.providerContract && !operation.integrationVerification) errors.push(`provider operation ${operation.id} has no integrated verification contract`);
    const effectEntities = new Set();
    for (const effect of operation.effects || []) {
      if (!entities.has(effect.entityId)) errors.push(`operation ${operation.id} references unknown entity ${effect.entityId}`);
      effectEntities.add(effect.entityId);
    }
    if ((effectEntities.size > 1 || (operation.effects || []).some((effect) => effect.effect === 'associate')) && (!operation.transaction?.boundary || operation.transaction.atomic !== true) && !operation.consistency?.strategy) errors.push(`operation ${operation.id} writes related entities without transaction or consistency strategy`);
    if (operation.transaction?.boundary && !entities.has(operation.transaction.boundary) && !consistencyBoundaryIds.has(operation.transaction.boundary)) errors.push(`operation ${operation.id} references unknown transaction boundary ${operation.transaction.boundary}`);
    if (operation.integrationVerification) {
      const verification = operation.integrationVerification;
      if (!Array.isArray(verification.requiredScenarios) || verification.requiredScenarios.some((item) => typeof item !== 'string' || !item)) errors.push(`operation ${operation.id} has invalid integration verification scenarios`);
      if (!Array.isArray(verification.artifactAssertions) || verification.artifactAssertions.some((item) => !item?.path || !(item.schema || item.type))) errors.push(`operation ${operation.id} has invalid integration artifact assertions`);
      if (verification.endpointPolicy && typeof verification.endpointPolicy.nonLocal !== 'boolean') errors.push(`operation ${operation.id} has invalid integration endpoint policy`);
    }
  }
}
for (const operation of operations.values()) for (const dependency of operation.dataDependencies || []) {
  const source = operations.get(dependency.sourceOperationId);
  if (!source) errors.push(`operation ${operation.id} data dependency references unknown source operation ${dependency.sourceOperationId}`);
  if (!dependency.sourceField || !dependency.targetField || dependency.targetOperationId !== operation.id) errors.push(`operation ${operation.id} has an incomplete data dependency`);
  if (!dependency.requiredOwnership || !dependency.requiredLifecycleStatus || !dependency.consistencyRequirement || dependency.runtimeValueRequired !== true) errors.push(`operation ${operation.id} has an incomplete runtime data lineage contract`);
  if (source && !schemaHasPath(source.response?.bodySchema, dependency.sourceField.replace(/^response\.?/, ''))) errors.push(`operation ${operation.id} data dependency source path does not exist: ${dependency.sourceField}`);
  const targetSchema = operation.request?.bodySchema || operation.request?.querySchema;
  if (!schemaHasPath(targetSchema, dependency.targetField.replace(/^request\.?/, ''))) errors.push(`operation ${operation.id} data dependency target path does not exist: ${dependency.targetField}`);
}
for (const journey of spec.journeys || []) {
  for (const capabilityId of journey.capabilityIds || []) { if (!capabilities.has(capabilityId)) errors.push(`journey ${journey.id} references unknown capability ${capabilityId}`); else if (manifest.schemaVersion === '2.1' && currentSemanticContract && capabilities.get(capabilityId).specificationStatus !== 'complete') errors.push(`implementation journey ${journey.id} includes non-complete capability ${capabilityId}`); }
  for (const operationId of journey.operationIds || []) if (!operations.has(operationId)) errors.push(`journey ${journey.id} references unknown operation ${operationId}`);
  if (manifest.schemaVersion === '2.1' && currentSemanticContract && !journey.acceptanceCriteria?.length) errors.push(`journey ${journey.id} has no acceptance criteria`);
}
for (const rule of spec.rules || []) for (const capabilityId of rule.appliesTo || []) if (!capabilities.has(capabilityId)) errors.push(`rule ${rule.id} references unknown capability ${capabilityId}`);
for (const permission of spec.permissions || []) {
  if (!actors.has(permission.actor)) errors.push(`permission ${permission.id} references unknown actor ${permission.actor}`);
  const resourceIds = permission.resourceIds || (entities.has(permission.resource) ? [permission.resource] : []);
  if (!resourceIds.length) errors.push(`permission ${permission.id} has no entity resource binding`);
  for (const entityId of resourceIds) if (!entities.has(entityId)) errors.push(`permission ${permission.id} references unknown entity resource ${entityId}`);
}
for (const entity of spec.entities || []) if (entity.accessScope?.scope === 'owner' && !(spec.permissions || []).some((permission) => permission.actor === entity.accessScope.ownerActor && (permission.resourceIds || []).includes(entity.id))) errors.push(`entity ${entity.id} has no ownership permission binding`);
for (const integration of spec.integrations || []) {
  if (!integration.capabilityIds?.length) errors.push(`integration ${integration.id} has no capability binding`);
  for (const capabilityId of integration.capabilityIds || []) if (!capabilities.has(capabilityId)) errors.push(`integration ${integration.id} references unknown capability ${capabilityId}`);
}
for (const page of mapping.pages || []) {
  if (!page.navigationOnly && !page.capabilityIds?.length) errors.push(`page ${page.pageId} has no capability`);
  for (const id of page.capabilityIds || []) if (!capabilities.has(id)) errors.push(`page ${page.pageId} references unknown capability ${id}`);
}
const blockers = (unresolved.items || []).filter((item) => item.severity === 'blocker' && item.status !== 'resolved');
if (requireApproved && blockers.length) errors.push(`package has ${blockers.length} open blocker(s)`);
const blockedCapabilities = (spec.capabilities || []).filter((item) => item.specificationStatus === 'blocked');
if (requireApproved && blockedCapabilities.length) errors.push(`package has ${blockedCapabilities.length} blocked capability specification(s)`);
if (requireApproved) {
  const inferred = collectEvidence(spec).filter((item) => item.status === 'inferred');
  if (inferred.length) errors.push(`package has ${inferred.length} inferred fact(s); confirm or document them before approval`);
}
const semanticFingerprints = new Map(); const aggregateTriggers = new Map();
for (const cap of capabilities.values()) {
  if (manifest.schemaVersion !== '2.1') break;
  if (cap.aliasOf) continue;
  const fingerprint = JSON.stringify({ pageScope: cap.pageIds, input: cap.inputSchema, output: cap.outputSchema, processing: cap.capabilityIntent?.processingSemantics, effects: cap.entityEffects, failures: cap.failures });
  if (semanticFingerprints.has(fingerprint)) errors.push(`capabilities ${semanticFingerprints.get(fingerprint)} and ${cap.id} have indistinguishable business semantics`);
  else semanticFingerprints.set(fingerprint, cap.id);
  if (cap.aggregateSubmission?.status === 'complete') { const trigger = `${cap.pageIds?.[0]}:${cap.aggregateSubmission.triggerControlId}`; if (aggregateTriggers.has(trigger)) errors.push(`aggregate submit trigger ${trigger} is assigned to multiple capabilities: ${aggregateTriggers.get(trigger)}, ${cap.id}`); else aggregateTriggers.set(trigger, cap.id); }
}

if (errors.length) {
  console.error(errors.map((error) => `- ${error}`).join('\n'));
  process.exit(1);
}
const digestFiles = [...files, ...(existsSync(`${dir}/fixtures`) ? walkFiles(`${dir}/fixtures`).map((file) => file.slice(dir.length + 1)) : [])];
const digests = Object.fromEntries(digestFiles.map((file) => [file, sha(readFileSync(`${dir}/${file}`))]));
if (checkLock) {
  if (!existsSync(`${dir}/package-lock.json`)) { console.error('- package-lock.json is missing'); process.exit(1); }
  const lock = readJSON(`${dir}/package-lock.json`);
  const expectedFiles = Object.keys(digests).sort();
  const lockedFiles = Object.keys(lock.digests || {}).sort();
  if (JSON.stringify(expectedFiles) !== JSON.stringify(lockedFiles)) { console.error('- package lock file set mismatch'); process.exit(1); }
  const mismatches = Object.entries(digests).filter(([file, digest]) => lock.digests[file] !== digest).map(([file]) => file);
  if (mismatches.length) { console.error(mismatches.map((file) => `- package lock mismatch: ${file}`).join('\n')); process.exit(1); }
  console.log(`Functional-domain package lock valid (${expectedFiles.length} files)`);
  process.exit(0);
}
writeFileSync(`${dir}/package-lock.json`, `${JSON.stringify({ schemaVersion: '1.0', algorithm: 'sha256', digests }, null, 2)}\n`);
console.log(`Functional-domain package valid (${capabilities.size} capabilities, ${blockers.length} open blockers)`);

function collectEvidence(value, found = []) {
  if (Array.isArray(value)) for (const item of value) collectEvidence(item, found);
  else if (value && typeof value === 'object') {
    if (value.evidence?.status) found.push(value.evidence);
    for (const child of Object.values(value)) collectEvidence(child, found);
  }
  return found;
}
function validObjectSchema(schema) { return schema?.type === 'object' && schema.properties && typeof schema.properties === 'object' && Array.isArray(schema.required); }
function containsUnconstrainedGeneric(schema) { if (!schema || typeof schema !== 'object') return false; if (schema.type === 'object' && schema.additionalProperties === true && !Object.keys(schema.properties || {}).length) return true; return Object.values(schema).some((value) => Array.isArray(value) ? value.some(containsUnconstrainedGeneric) : containsUnconstrainedGeneric(value)); }
function requiresSpecializedBusinessResult(capability) { return ['create', 'update', 'retry', 'external-operation'].includes(capability.synthesisAnalysis?.candidatePattern); }
function resultPresentationFindings(capability, frontend) {
  const findings = []; const producesResult = capability.aggregateSubmission?.finalProduct || (capability.specificationStatus === 'complete' && requiresSpecializedBusinessResult(capability)); const contract = capability.resultPresentation;
  if (producesResult && capability.specificationStatus === 'complete' && !contract) return [`capability ${capability.id} produces a business result without resultPresentation`];
  if (!contract) return findings;
  if (capability.specificationStatus !== 'complete') findings.push(`non-complete capability ${capability.id} must not expose resultPresentation`);
  const page = (frontend.pages || []).find((item) => item.pageId === capability.pageIds?.[0]); const regions = new Set([...(page?.regions || []).map((item) => item.regionId), ...(page?.resultSurfaces || []).map((item) => item.surfaceId)]);
  if (!regions.has(contract.targetRegion)) findings.push(`capability ${capability.id} resultPresentation targets an unrecognized frontend region: ${contract.targetRegion}`);
  if (!['confirmed', 'documented', 'observed'].includes(contract.evidence?.status) || !contract.evidence?.sources?.length) findings.push(`capability ${capability.id} resultPresentation has no reliable source evidence`);
  for (const state of ['processing', 'success', 'failure']) if (!contract.states?.[state]?.regionStatus || !contract.states?.[state]?.elementSemantic) findings.push(`capability ${capability.id} resultPresentation lacks semantic ${state} state`);
  if (contract.states?.success?.requiresBoundElements !== true || contract.states?.success?.elementSemantic === 'status-text') findings.push(`capability ${capability.id} resultPresentation success is only a status message`);
  const operation = capability.operations?.find((item) => item.id === capability.presentation?.primaryOperationId) || capability.operations?.[0];
  if (!operation || !contract.bindings?.length) findings.push(`capability ${capability.id} resultPresentation has no operation-bound result elements`);
  for (const binding of contract.bindings || []) { if (!binding.id || !binding.element?.semantic || !binding.responsePath?.startsWith('response.')) findings.push(`capability ${capability.id} has an incomplete result binding`); else if (!schemaHasPath(operation?.response?.bodySchema, binding.responsePath.replace(/^response\./, ''))) findings.push(`capability ${capability.id} result binding references an unknown response path: ${binding.responsePath}`); if (!['response-cardinality', 'request-field'].includes(binding.count?.mode) || (binding.count?.mode === 'request-field' && (!binding.count.requestPath || binding.count.fixedValueForbidden !== true))) findings.push(`capability ${capability.id} result binding has no dynamic count contract`); }
  return findings;
}
function hasSpecializedBusinessResult(capability) { const generic = new Set(['id', 'operationId', 'status', 'output', 'result']); const fields = Object.keys(capability.outputSchema?.properties || {}).filter((field) => !generic.has(field)); const quality = capability.capabilityIntent?.qualityCriteria || []; const downstream = capability.capabilityIntent?.downstreamUsage || []; const failures = capability.capabilityIntent?.failures || []; const assertions = (capability.acceptanceExamples || []).flatMap((example) => example.then || []).map((item) => item.assertion); return fields.length > 0 && quality.length >= 2 && downstream.length > 0 && failures.length >= 3 && assertions.some((item) => String(item).startsWith('response.')) && quality.every((criterion) => assertions.includes(`quality.${String(criterion).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '')}`)); }
function aggregateSubmissionFindings(capability, entityIds, spec) { const findings = []; const aggregate = capability.aggregateSubmission; if (aggregate.status === 'planned') { if (capability.specificationStatus !== 'planned' || capability.operations?.length || capability.inputSchema || capability.acceptanceExamples?.length) findings.push(`aggregate capability ${capability.id} with insufficient evidence must remain planned without operation, schema, or acceptance fixture`); return findings; } const operations = capability.operations || []; if (operations.length !== 1) findings.push(`aggregate capability ${capability.id} must have exactly one final submit operation`); const operation = operations[0]; const declaredFields = aggregate.sections.flatMap((section) => section.fields.map((field) => field.id)); const boundFields = aggregate.configurationAggregate?.sections?.flatMap((section) => section.fieldIds || []) || []; const schemaFields = Object.keys(operation?.request?.bodySchema?.properties || {}); for (const field of declaredFields) if (!schemaFields.includes(field) || !boundFields.includes(field)) findings.push(`aggregate capability ${capability.id} schema or configuration aggregate omits section field ${field}`); const quantityField = aggregate.finalProduct?.quantity?.sourceField; if (quantityField && !schemaFields.includes(quantityField)) findings.push(`aggregate capability ${capability.id} quantity source field is absent from the aggregate request`); if (!aggregate.triggerControlId || operation?.aggregateSubmission?.triggerControlId !== aggregate.triggerControlId) findings.push(`aggregate capability ${capability.id} has no single evidence-bound primary submit action`); if (!aggregate.finalProduct?.type || !aggregate.finalProduct?.quantity || !aggregate.finalProduct?.lifecycle?.length || !aggregate.finalProduct?.downstreamUsage?.length) findings.push(`aggregate capability ${capability.id} has incomplete final product semantics`); if (!entityIds.has(aggregate.configurationAggregate?.entityId)) findings.push(`aggregate capability ${capability.id} has no configuration aggregate root entity`); if (!operation?.effects?.some((effect) => effect.entityId === aggregate.configurationAggregate?.entityId)) findings.push(`aggregate capability ${capability.id} final submit does not persist its configuration aggregate`); for (const itemId of aggregate.sectionItemIds || []) { const leaf = (spec.architecture?.leafClassifications || []).find((item) => item.leafId === itemId && item.pageId === capability.pageIds?.[0]); if (leaf?.classification !== 'input-field' || (spec.capabilities || []).some((item) => item.synthesisAnalysis?.sourceArchitectureLeafId === itemId)) findings.push(`aggregate section ${itemId} was emitted as a capability instead of an input partition`); } return findings; }
function schemaHasPath(schema, path) { let current = schema; for (const part of String(path).replace(/\[\]$/g, '').split('.').filter(Boolean)) { current = current?.properties?.[part] || (current?.type === 'array' ? current.items?.properties?.[part] : null); if (!current) return false; } return true; }
function sha(buffer) { return createHash('sha256').update(buffer).digest('hex'); }
function readJSON(path) { return JSON.parse(readFileSync(path, 'utf8')); }
function walkFiles(path) { return readdirSync(path, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? walkFiles(`${path}/${entry.name}`) : [`${path}/${entry.name}`]).sort(); }
