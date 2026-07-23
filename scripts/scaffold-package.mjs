#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { bindVisualRelease, verifyVisualRelease } from './lib/visual-release.mjs';
import { extractFrontendSemantics } from './lib/frontend-semantics.mjs';
import { detectAggregateSubmissions } from './lib/aggregate-submission.mjs';

const args = parseArgs(process.argv.slice(2));
if (!args.input || !args.output || !args['author-agent'] || !args['visual-release']) usage();
if (args.profile) throw new Error('product profiles are not supported; domain design is synthesized from architecture, product context, and the immutable frontend release');

const input = resolve(args.input); const output = resolve(args.output);
const pageDocument = readKnownJSON(input, ['pageTree.json', 'page-architecture.json']);
const system = readKnownJSON(input, ['systemArchitecture.json', 'system-architecture.json']);
const product = readKnownJSON(input, ['product-context.json']);
const visual = verifyVisualRelease(args['visual-release']);
const decisionsDocument = args.decisions ? JSON.parse(readFileSync(resolve(args.decisions), 'utf8')) : null;
const decisions = normalizeDecisions(decisionsDocument);
const synthesisInputDigest = digest({ pageDocument, system, product, visualReleaseDigest: visual.releaseDigest, decisions: decisionsDocument });
const pages = pageDocument.nodes || [];
if (!pages.length || !Array.isArray(system.nodes) || !product.name) throw new Error('the three architecture JSON documents are incomplete');
const projectId = product.projectId || `project-${stableId(product.name)}`;
const frontend = extractFrontendSemantics(visual);
const aggregateAnalysis = detectAggregateSubmissions({ pages, frontend, decisions });
const systemBySource = new Map((system.nodes || []).filter((item) => item.sourceModuleId).map((item) => [`${item.sourcePageId}:${item.sourceModuleId}`, item]));
const visualAlignment = assessVisualAlignment(pages, visual, product);
const unresolved = [...visualAlignment.findings, ...aggregateAnalysis.unresolved];
const controlMappings = [];
const capabilities = [];
const assignedTriggers = new Set();
const leafClassifications = pages.flatMap((page) => (page.modules || []).flatMap((module) => (module.children || []).map((item) => classifyArchitectureLeaf(page, module, item))));

const aggregateSectionItems = new Set(aggregateAnalysis.aggregates.flatMap((item) => item.sectionItemIds));
for (const page of pages) for (const module of page.modules || []) for (const originalItem of module.children || []) for (const item of expandImplementableLeaf(originalItem, classifyArchitectureLeaf(page, module, originalItem))) {
  if (aggregateSectionItems.has(item.sourceItemId || item.id)) continue;
  const sourceItemId = item.sourceItemId || item.id;
  const systemNode = systemBySource.get(`${page.id}:${sourceItemId}`);
  const decision = decisions.find((entry) => [entry.targetId, entry.moduleId, entry.capabilityId].includes(sourceItemId) || entry.targetId === `${page.id}:${sourceItemId}`);
  const aggregateSubmission = aggregateAnalysis.aggregates.find((entry) => entry.pageId === page.id && entry.primaryItemId === sourceItemId);
  const synthesis = synthesizeCapability({ page, module, item, systemNode, product, frontend, visual, decision, aggregateSubmission });
  if (!visualAlignment.matchedPageIds.includes(page.id)) synthesis.capability.specificationStatus = 'blocked';
  if (synthesis.conflicts.length) unresolved.push(...synthesis.conflicts);
  capabilities.push(synthesis.capability);
  controlMappings.push(...synthesis.controlMappings);
}

for (const decision of decisions) if (!decisionConsumed(decision, capabilities)) unresolved.push({ id: `unresolved-decision-${stableId(decision.id)}`, severity: 'blocker', status: 'open', question: `User decision ${decision.id} targets no architecture capability`, sources: [`user-decision:${decision.id}`] });

applyDataDependencies(capabilities);
for (const capability of capabilities) for (const operation of capability.operations || []) if (operation.providerContract?.requiresTransferredResources === true && !operation.providerContract?.assetBindings?.length) {
  const reason = `${capability.name} requires transferred resource input but no approved transfer/selection operation can produce an owned runtime resource reference`;
  markCapabilityPlanned(capability, reason);
  unresolved.push({ id: `unresolved-${operation.id}-asset-binding`, severity: 'major', disposition: 'planned', status: 'open', question: reason, relatedIds: [capability.id, operation.id], sources: capability.evidence.sources });
}
const model = buildDomainModel(pages, capabilities, product);
const blockedCapabilities = capabilities.filter((item) => item.specificationStatus === 'blocked').length;
const plannedCapabilities = capabilities.filter((item) => item.specificationStatus === 'planned').length;
const unresolvedBlockers = unresolved.filter((item) => item.severity === 'blocker').length;
const hasBlockers = blockedCapabilities > 0 || unresolvedBlockers > 0;
const spec = {
  schemaVersion: '2.1',
  project: { id: projectId, name: product.name, brief: product.brief, goals: product.goals || [], users: product.users || [], needs: product.needs || [], problemStatement: product.brief || product.goals?.[0], evidence: documented(['product-context:brief', 'product-context:goals', 'product-context:users', 'product-context:needs']) },
  architecture: { pageVersion: pageDocument.version || 1, systemVersion: system.version || 1, sources: ['page architecture', 'system architecture', 'product context', 'immutable frontend release', ...(decisions.length ? ['user business decisions'] : [])], visualAlignment, leafClassifications },
  ...model, capabilities,
  visualSource: { sourceType: 'ai-restore-release', releaseDigest: visual.releaseDigest, suiteGateDigest: visual.suiteGateDigest, pageIds: visual.pages, routes: visual.routes, sourceTreeDigest: visual.sourceTreeDigest },
};
const pageMap = { schemaVersion: '2.1', pages: pages.map((page) => ({ pageId: page.id, title: page.title, navigationOnly: page.parentId === null, capabilityIds: capabilities.filter((item) => item.pageIds.includes(page.id)).map((item) => item.id) })) };
const definitions = { schemaVersion: '1.1', generatedBy: 'functional-domain-design/bmad-planning', ...Object.fromEntries(['capabilities', 'entities', 'valueObjects', 'relationships', 'consistencyBoundaries', 'journeys', 'rules', 'permissions', 'integrations'].map((group) => [group, spec[group] || []])) };
const planningArtifacts = { schemaVersion: '1.1', method: 'bmad-planning', evidencePriority: ['confirmed', 'documented', 'observed', 'designed', 'inferred', 'blocked'], phases: [
  { id: 'project-understanding', status: 'completed', outputs: { project: spec.project, pages: pages.map((page) => ({ id: page.id, title: page.title, description: page.description })), frontendSemanticInventory: 'frontend-semantic-inventory.json' } },
  { id: 'requirements-analysis', status: hasBlockers ? 'blocked' : plannedCapabilities ? 'completed-with-planned-capabilities' : 'completed', outputs: { capabilityIds: capabilities.map((item) => item.id), architectureLeafClassifications: leafClassifications, observedInteractions: 'observed-interactions.json', userDecisionIds: decisions.map((item) => item.id), unresolvedItemIds: unresolved.map((item) => item.id) } },
  { id: 'domain-design', status: hasBlockers ? 'blocked' : plannedCapabilities ? 'completed-with-planned-capabilities' : 'completed', outputs: { domainIds: model.domains.map((item) => item.id), entityIds: model.entities.map((item) => item.id), relationshipIds: model.relationships.map((item) => item.id), journeyIds: model.journeys.map((item) => item.id), controlCapabilityMap: 'control-capability-map.json' } },
  { id: 'independent-domain-review', status: 'pending', outputs: {} },
] };

mkdirSync(output, { recursive: true });
writeJSON(`${output}/frontend-semantic-inventory.json`, frontend.inventory);
writeJSON(`${output}/observed-interactions.json`, frontend.interactions);
writeJSON(`${output}/control-capability-map.json`, { schemaVersion: '1.0', releaseDigest: visual.releaseDigest, mappings: controlMappings });
writeJSON(`${output}/planning-manifest.json`, { schemaVersion: '1.1', packageType: 'fdd-bmad-planning', status: 'review-pending', authorAgentId: args['author-agent'], synthesisInputDigest, inputDigests: { pageArchitecture: digest(pageDocument), systemArchitecture: digest(system), productContext: digest(product), visualRelease: visual.releaseDigest, userDecisions: decisionsDocument ? digest(decisionsDocument) : null }, artifacts: ['planning-artifacts.json', 'capability-definitions.json', 'frontend-semantic-inventory.json', 'observed-interactions.json', 'control-capability-map.json'] });
writeJSON(`${output}/planning-artifacts.json`, planningArtifacts);
writeJSON(`${output}/capability-definitions.json`, definitions);
writeJSON(`${output}/manifest.json`, { schemaVersion: '2.1', packageType: 'functional-domain', projectId, projectName: product.name, status: 'draft', deliveryMode: plannedCapabilities ? 'mixed' : 'complete', productCompletionClaim: plannedCapabilities ? 'partial' : 'complete', authorAgentId: args['author-agent'], sourceDirectory: basename(input), sourceContract: { requiredFiles: ['page architecture JSON', 'system architecture JSON', 'product context JSON', 'AI Restore release'], optionalFiles: decisions.length ? ['user business decisions JSON'] : [] }, planning: { manifest: 'planning-manifest.json', artifacts: 'planning-artifacts.json', capabilityDefinitions: 'capability-definitions.json' }, semanticArtifacts: ['frontend-semantic-inventory.json', 'observed-interactions.json', 'control-capability-map.json'], capabilitySummary: { total: capabilities.length, complete: capabilities.filter((item) => item.specificationStatus === 'complete').length, planned: plannedCapabilities, designed: capabilities.filter((item) => item.evidence.status === 'designed').length, blockedCapabilities, openBlockers: unresolvedBlockers } });
writeJSON(`${output}/functional-spec.json`, spec);
writeJSON(`${output}/page-function-map.json`, pageMap);
writeJSON(`${output}/unresolved-items.json`, { schemaVersion: '2.1', items: unresolved });
bindVisualRelease(output, args['visual-release']);
console.log(`Scaffolded semantic functional domain (${capabilities.length} capabilities, ${blockedCapabilities} blocked, ${unresolvedBlockers} unresolved blockers) -> ${output}`);

function synthesizeCapability({ page, module, item, systemNode, product, frontend, visual, decision, aggregateSubmission }) {
  const name = cleanName(item.name); const id = `cap-${page.id}-${item.id}`;
  const architectureText = [page.title, module.name, item.name, systemNode?.description, ...(systemNode?.responsibilities || []), product.brief].filter(Boolean).join(' ');
  const pageSemantic = frontend.inventory.pages.find((entry) => entry.pageId === page.id);
  const controls = (pageSemantic?.controls || []).filter((control) => !isSharedPageChrome(control) && !assignedTriggers.has(`${page.id}:${control.controlId}`) && relevance(control, name, architectureText) >= 6).sort((a, b) => relevance(b, name, architectureText) - relevance(a, name, architectureText));
  const primary = aggregateSubmission ? pageSemantic?.controls?.find((control) => control.controlId === aggregateSubmission.triggerControlId) || null : controls[0] || null;
  if (primary?.controlId) assignedTriggers.add(`${page.id}:${primary.controlId}`);
  const fields = aggregateSubmission ? aggregateSubmission.sections.flatMap((section) => section.fields.map((field) => ({ ...field, kind: field.schema?.enum ? 'select' : 'input', options: field.schema?.enum || [], ownership: { type: 'aggregate-section', scopeId: aggregateSubmission.scopeId, sectionId: section.id, regionId: section.regionId, capabilityModuleId: item.id } }))) : ownedFrontendFields(pageSemantic, primary, name, module);
  const pattern = classify(name, architectureText, primary);
  const decisionValue = decision?.value || decision?.definition || decision?.override || decision || null;
  const sources = [`page:${page.id}`, `page-module:${item.id}`, ...(systemNode ? [`system-node:${systemNode.id}`] : []), ...(primary ? [`frontend-control:${primary.controlId}`, `visual-release:${visual.releaseDigest}`] : []), ...(decision ? [`user-decision:${decision.id}`] : []), ...(aggregateSubmission?.evidence?.sources || [])];
  const evidenceStatus = 'designed';
  const inputDefinitions = aggregateSubmission ? aggregateInputs(fields, item, sources, page) : buildInputs(fields, pattern, item, decisionValue, sources, page, module);
  const semanticContext = { page: { id: page.id, title: page.title, description: page.description || null }, module: { id: module.id, name: module.name }, systemResponsibilities: systemNode?.responsibilities || [], productGoals: product.goals || [], decision: decisionValue };
  const operation = buildOperation({ id, page, item, name, pattern, inputs: inputDefinitions, sources, semanticContext });
  if (operation && aggregateSubmission) applyAggregateOperation(operation, aggregateSubmission, id, name);
  const resultAnalysis = synthesizeResultPresentation({ page, item, decision: decisionValue, pageSemantic, operation, aggregateSubmission, pattern, name, sources });
  const presentation = buildPresentation(page, name, pattern, primary, inputDefinitions, operation, resultAnalysis.contract);
  const intent = {
    userGoal: decisionValue?.userGoal || goalFor(pattern, name),
    businessOutcome: decisionValue?.businessOutcome || outcomeFor(pattern, name),
    trigger: { type: primary ? 'existing-control' : 'implementation-control', pageId: page.id, controlId: primary?.controlId || null, label: primary?.label || name, evidence: primary ? observed([`frontend-control:${primary.controlId}`]) : designed(sources, 'No matching control exists in the immutable visual baseline; implementation must add one.') },
    prerequisites: decisionValue?.prerequisites || prerequisitesFor(pattern),
    inputs: inputDefinitions,
    processingSemantics: decisionValue?.processingSemantics || processingFor(pattern, name),
    outputs: outputsFor(pattern, name),
    sideEffects: sideEffectsFor(pattern),
    downstreamUsage: downstreamFor(pattern),
    qualityCriteria: decisionValue?.qualityCriteria || qualityFor(pattern, name),
    failures: failuresFor(pattern),
    evidence: { status: evidenceStatus, sources, rationale: `Synthesized as ${pattern} from architecture responsibility${primary ? ' and observed frontend semantics' : ''}.` },
  };
  const analysis = analyzeSufficiency({ id, name, pattern, primary, systemNode, decision, inputs: inputDefinitions, pageId: page.id });
  analysis.summary.sourceModuleId = item.id;
  analysis.summary.sourceArchitectureLeafId = item.sourceItemId || item.id;
  analysis.summary.sourceContainerModuleId = module.id;
  const conflicts = [...detectConflicts(id, item, primary, decision, inputDefinitions), ...analysis.findings, ...resultAnalysis.findings, ...(aggregateSubmission?.findings || []).map((question, index) => ({ id: `aggregate-${id}-${index + 1}`, severity: 'major', disposition: 'planned', status: 'open', question, relatedIds: [id], sources: aggregateSubmission.evidence.sources }))];
  const specificationStatus = conflicts.some((entry) => entry.severity === 'blocker') ? 'blocked' : conflicts.some((entry) => entry.disposition === 'planned') ? 'planned' : 'complete';
  const effectiveOperation = specificationStatus === 'complete' ? operation : null;
  const effectivePresentation = specificationStatus === 'planned' ? plannedPresentation(presentation, name) : presentation;
  const planningReasons = conflicts.filter((entry) => entry.disposition === 'planned').map((entry) => entry.question);
  const capability = {
    id, name, purpose: intent.businessOutcome, actor: 'user', pageIds: [page.id], capabilityIntent: intent, presentation: effectivePresentation, synthesisAnalysis: analysis.summary, ...(resultAnalysis.contract ? { resultPresentation: resultAnalysis.contract } : {}), ...(aggregateSubmission ? { aggregateSubmission: { ...aggregateSubmission, configurationAggregate: { entityId: `entity-${id}-configuration`, lifecycle: ['draft', 'validated', 'submitted', 'superseded'], sections: aggregateSubmission.sections.map((section) => ({ id: section.id, fieldIds: section.fields.map((field) => field.id) })) } } } : {}),
    inputs: inputDefinitions.map((entry) => entry.id), inputSchema: operation?.request?.bodySchema || objectSchema(Object.fromEntries(inputDefinitions.map((entry) => [entry.id, entry.schema])), inputDefinitions.filter((entry) => entry.required).map((entry) => entry.id)),
    outcomes: intent.outputs.map((entry) => entry.id), outputSchema: operation?.response?.bodySchema || objectSchema(Object.fromEntries(intent.outputs.map((entry) => [entry.id, entry.schema])), intent.outputs.filter((entry) => entry.required).map((entry) => entry.id)),
    operations: effectiveOperation ? [effectiveOperation] : [], entityEffects: effectiveOperation?.effects || [], writesState: Boolean(effectiveOperation?.effects?.length), ruleIds: [], failures: intent.failures.map((entry) => entry.code),
    acceptanceCriteria: acceptanceFor(pattern, name, inputDefinitions), acceptanceExamples: [acceptanceExample(pattern, operation, inputDefinitions, name)], sourceResponsibilities: [item.name], specificationStatus,
    ...(specificationStatus === 'planned' ? { planningReason: planningReasons.join('; '), missingDecisions: planningReasons } : {}),
    deliveryPolicy: specificationStatus === 'planned' ? { requiredForCompletion: false, allowedIncompleteState: 'planned', uiBehavior: 'show-planned-state' } : { requiredForCompletion: true, allowedIncompleteState: 'planned' }, evidence: intent.evidence,
  };
  if (specificationStatus === 'planned') stripImplementationSemantics(capability);
  const controlMappings = [{ capabilityId: id, pageId: page.id, controlId: primary?.controlId || null, mappingType: primary ? 'observed-trigger' : 'designed-control', fieldBindings: effectivePresentation.fieldBindings, primaryOperationId: effectiveOperation?.id || null, evidence: intent.evidence }];
  return { capability, controlMappings, conflicts };
}

function buildOperation({ id, page, item, name, pattern, inputs, sources, semanticContext }) {
  if (['navigation', 'local-state', 'preview'].includes(pattern)) return null;
  const operationId = `${operationVerb(pattern)}-${page.id}-${item.id}`;
  const entityId = entityFor(page.id, pattern);
  const isRead = ['query', 'history', 'status', 'download'].includes(pattern);
  const contentType = pattern === 'upload' ? 'multipart/form-data' : 'application/json';
  const properties = Object.fromEntries(inputs.map((entry) => [entry.id, entry.schema]));
  const required = inputs.filter((entry) => entry.required).map((entry) => entry.id);
  const output = outputSchemaFor(pattern, name);
  const operation = {
    id: operationId, capabilityId: id, semantics: processingFor(pattern, name), method: isRead ? 'GET' : pattern === 'delete' ? 'DELETE' : pattern === 'update' ? 'PATCH' : 'POST', path: pathFor(page.id, item.id, pattern),
    request: { contentType, ...(isRead ? { query: required, querySchema: objectSchema(properties, required) } : { body: Object.keys(properties), bodySchema: objectSchema(properties, required) }) },
    response: { successStatuses: [isRead ? 200 : 201], bodySchema: output }, authorization: { authentication: 'required', permission: `${operationVerb(pattern)}:${entityId}`, ownership: 'current-user' },
    effects: isRead ? [] : [{ id: `effect-${operationId}`, entityId, effect: pattern === 'delete' ? 'delete' : pattern === 'update' ? 'update' : pattern === 'upload' ? 'create' : 'create' }],
    errors: failuresFor(pattern).map((failure) => ({ code: failure.code, status: failure.status, recovery: failure.recovery })), transaction: isRead ? null : { boundary: `boundary-${page.id}`, atomic: true },
    consistency: isRead ? { strategy: 'read-your-writes' } : null, idempotency: { required: !isRead, key: !isRead ? 'Idempotency-Key' : null }, concurrency: { strategy: isRead ? 'snapshot-read' : 'optimistic-version' },
    acceptanceExample: acceptanceExample(pattern, { id: operationId }, inputs, name), evidence: { status: 'designed', sources, rationale: `Operation contract specializes the ${pattern} business behavior.` },
  };
  if (pattern === 'upload') operation.resourceTransfer = resourceTransfer(inputs);
  if (isExternalPattern(pattern)) {
    operation.providerContract = providerContract(pattern, name, inputs, output, semanticContext);
    operation.integrationBindings = operation.providerContract.parameterMappings.map((mapping) => ({ source: mapping.source, target: mapping.target, required: mapping.required, schema: inputs.find((input) => `request.${input.id}` === mapping.source)?.schema, evidence: operation.evidence }));
    const resultField = businessResultField(name);
    operation.integrationVerification = { requiredScenarios: ['success', 'timeout', 'unavailable'], artifactAssertions: [{ path: 'response.operationId', schema: { type: 'string', minLength: 1 } }, { path: 'response.status', schema: { type: 'string', enum: ['accepted', 'completed'] } }, { path: `response.${resultField}`, schema: output.properties[resultField] }], endpointPolicy: { nonLocal: true }, correlation: { requestHeader: 'X-Integration-Challenge', responsePath: 'operationId' } };
  }
  return operation;
}

function buildInputs(fields, pattern, item, decision, sources, page, module) {
  if (decision?.inputs) return decision.inputs.map((entry) => ({ ...entry, ownership: { type: 'user-decision', decisionId: decision.id || item.id, capabilityModuleId: item.id }, evidence: { status: 'confirmed', sources: [`user-decision:${decision.id || item.id}`] } }));
  if (pattern === 'upload') return [{ id: 'files', label: cleanName(item.name), required: !/非必填|可选|optional/i.test(item.name), source: 'user-file-selection', schema: { type: 'array', minItems: /非必填|可选|optional/i.test(item.name) ? 0 : 1, maxItems: 20, items: { type: 'string', format: 'binary' } }, constraints: { mimeTypes: ['application/octet-stream'], maxBytesPerFile: 20971520, checksum: 'sha256', evidenceStatus: 'designed-default' }, ownership: { type: 'architecture-item', ownerModuleId: module.id, capabilityModuleId: item.id }, evidence: documented([`page-module:${item.id}`, ...sources]) }];
  if (pattern === 'history') return [];
  const normalized = fields.slice(0, 30).map((field, index) => ({ id: fieldId(field, index), label: field.label || field.placeholder || `field-${index + 1}`, required: field.required === true, source: `frontend-state:${field.controlId}`, schema: schemaForControl(field), options: field.options || [], ownership: field.ownership, controlId: field.controlId, evidence: observed([`frontend-control:${field.controlId}`, `page-module:${item.id}`]) }));
  if (isExternalPattern(pattern) || ['create', 'update'].includes(pattern)) normalized.push(...architectureInputs(page, module, item, pattern));
  if (isExternalPattern(pattern) && pageHasTransferOperation(page)) normalized.push(...assetReferenceInputs(page, item, sources));
  if (normalized.length) return dedupeBy(normalized, 'id');
  return [];
}

function aggregateInputs(fields, item, sources, page) {
  const sectionFields = fields.map((field, index) => ({ id: field.id || fieldId(field, index), label: field.label || field.controlId, required: field.required === true, source: `frontend-state:${field.controlId}`, schema: field.schema || schemaForControl(field), options: field.options || [], ownership: field.ownership, controlId: field.controlId, evidence: field.evidence || observed([`frontend-control:${field.controlId}`]) }));
  if (pageHasTransferOperation(page)) sectionFields.push(...assetReferenceInputs(page, item, sources));
  return dedupeBy(sectionFields, 'id');
}

function applyAggregateOperation(operation, aggregate, capabilityId, name) {
  operation.aggregateSubmission = { scopeId: aggregate.scopeId, triggerControlId: aggregate.triggerControlId, sectionBindings: aggregate.sections.map((section) => ({ sectionId: section.id, regionId: section.regionId, requestFields: section.fields.map((field) => field.id) })), evidence: aggregate.evidence };
  operation.finalProduct = aggregate.finalProduct;
  const resultField = businessResultField(name); const result = operation.response.bodySchema.properties[resultField];
  if (result) {
    result.properties.quantity = aggregate.finalProduct.quantity.sourceField ? { type: 'integer', minimum: 1, 'x-derivedFrom': `request.${aggregate.finalProduct.quantity.sourceField}` } : { type: 'integer', const: aggregate.finalProduct.quantity.fixed };
    result.properties.productType = { type: 'string', const: aggregate.finalProduct.type };
    result.properties.lifecycleStatus = { type: 'string', enum: aggregate.finalProduct.lifecycle };
    result.required.push('quantity', 'productType', 'lifecycleStatus');
  }
  const configurationEntityId = `entity-${capabilityId}-configuration`;
  operation.effects = [{ id: `effect-${operation.id}-configuration`, entityId: configurationEntityId, effect: 'create' }];
  operation.transaction = { boundary: configurationEntityId, atomic: true };
}

function architectureInputs(page, currentModule, currentItem, pattern) {
  const menuModule = /功能列表|菜单|导航/.test(currentModule.name || '');
  const businessModules = (page.modules || []).filter((module) => !/功能列表|菜单|导航|结果/.test(module.name || ''));
  const exactOwners = businessModules.filter((module) => semanticAffinity(cleanName(currentItem.name), cleanName(module.name)) >= 0.6);
  const ownerModules = menuModule ? (exactOwners.length ? exactOwners : businessModules) : [currentModule];
  const actionOwnsModule = isExternalPattern(pattern) || ['create', 'update'].includes(pattern);
  return ownerModules.flatMap((ownerModule) => (ownerModule.children || []).filter((item) => (actionOwnsModule || item.id === currentItem.id) && classifyArchitectureLeaf(page, ownerModule, item).classification === 'input-field').map((item) => {
    const label = cleanName(item.name); const required = /必填|必选/.test(item.name || '') && !/非必填|可选/.test(item.name || '');
    const id = stableSlug(label); let schema = { type: 'string', minLength: required ? 1 : 0 };
    const observed = findArchitectureControl(page.id, item.id);
    if (observed?.options?.length) schema = { type: 'string', enum: observed.options };
    else if (observed?.kind === 'number') schema = { type: 'number' };
    const affinity = semanticAffinity(cleanName(currentItem.name), cleanName(ownerModule.name));
    return { id, label, required, source: `architecture-module:${item.id}`, schema, options: [], ownership: { type: exactOwners.includes(ownerModule) || !menuModule ? 'architecture-owner-module' : 'page-workspace-template', ownerModuleId: ownerModule.id, capabilityModuleId: currentItem.id, affinity, sharedAcrossCapabilities: menuModule && !exactOwners.length }, evidence: exactOwners.includes(ownerModule) || !menuModule ? documented([`page:${page.id}`, `page-module:${item.id}`, `page-module:${currentItem.id}`]) : designed([`page:${page.id}`, `page-module:${ownerModule.id}`, `page-module:${currentItem.id}`], 'BMAD domain analysis treats the page configuration workspace as the shared input template for named capabilities on the same page.') };
  }));
}

function assetReferenceInputs(page, currentItem, sources) {
  const uploadItems = transferItems(page);
  if (!uploadItems.length) return [{ id: 'resourceIds', label: 'Validated transferred resource references', required: true, source: 'prior-operation:resource-transfer', schema: { type: 'array', minItems: 1, items: { type: 'string' } }, ownership: { type: 'data-dependency', capabilityModuleId: currentItem.id }, evidence: designed(sources, 'The operation requires runtime resource references produced by an approved transfer operation.') }];
  return uploadItems.map((upload, index) => { const label = cleanName(upload.name); const required = !/非必填|可选/.test(upload.name || ''); return { id: `${stableSlug(label.replace(/^上传/, '')) || `asset-${index + 1}`}-assetIds`, label: `${label} validated asset references`, required, source: `prior-operation:upload-${upload.id}`, schema: { type: 'array', minItems: required ? 1 : 0, maxItems: /多图/.test(upload.name || '') ? 20 : 1, items: { type: 'string' } }, ownership: { type: 'data-dependency', capabilityModuleId: currentItem.id, sourceArchitectureItemId: upload.id }, evidence: designed([...sources, `page-module:${upload.id}`], 'The upload operation produces owned runtime asset references for this named input slot.') }; });
}

function classifyArchitectureLeaf(page, module, item) {
  const name = cleanName(item.name); const moduleName = cleanName(module.name); let classification;
  if (module.submissionRole === 'input-section' || item.submissionRole === 'input-section') classification = 'input-field';
  else if (item.submissionRole === 'primary-submit') classification = 'business-capability';
  else if (/模块导航|页面导航|入口/.test(moduleName)) classification = 'navigation';
  else if (/功能列表|能力列表|菜单/.test(moduleName)) classification = /历史|记录/.test(name) ? 'operation' : 'business-capability';
  else if (/创作结果|结果展示|结果/.test(moduleName)) classification = /下载|重新生成|重试/.test(name) ? 'operation' : /点击|放大|缩小|切换/.test(name) ? 'local-control' : 'display-requirement';
  else if (hasOperationSignal(name, item)) classification = 'operation';
  else if (/状态|进度|成功|失败|空状态|加载/.test(name)) classification = 'state';
  else classification = 'input-field';
  const embeddedOperations = extractEmbeddedOperations(item);
  return { pageId: page.id, moduleId: module.id, leafId: item.id, name, classification, embeddedOperations, evidence: [`page:${page.id}`, `page-module:${module.id}`, `page-module:${item.id}`] };
}

function hasOperationSignal(name, item) { return /新建|创建|提交|保存|上传|下载|删除|更新|查询|重试|取消|发送|执行|create|submit|save|upload|download|delete|update|query|retry|cancel|send|execute/i.test(name) || ['action', 'command', 'operation'].includes(item.kind || item.type); }
function extractEmbeddedOperations(item) { const annotation = String(item.name || '').split('#').slice(1).join('#'); const labels = []; for (const pattern of [/有(?:一|个)?([^，,。]{1,40}?)按钮/g, /可以一键([^，,。]{1,40})/g, /根据([^，,。]{1,40}?)生成([^，,。]{1,40})/g]) for (const match of annotation.matchAll(pattern)) labels.push(match[0].replace(/^可以/, '').trim()); return [...new Set(labels)].map((label) => ({ label, evidence: `page-module:${item.id}` })); }
function transferItems(page) { return (page.modules || []).flatMap((module) => (module.children || []).filter((item) => classifyArchitectureLeaf(page, module, item).classification === 'operation' && /上传|upload|attach|import/i.test(cleanName(item.name)))); }
function pageHasTransferOperation(page) { return transferItems(page).length > 0; }
function findArchitectureControl(pageId, itemId) { const page = frontend.inventory.pages.find((entry) => entry.pageId === pageId); return (page?.controls || []).find((control) => control.architectureItemId === itemId || control.sourceModuleId === itemId) || null; }
function hasExternalEvidence(text, control) { return /(?:^|[^a-z])(ai|ml|llm)(?:[^a-z]|$)|人工智能|外部服务|第三方|external|provider|integration/i.test(text) || control?.integration === true || control?.observedNetwork?.external === true; }
function isExternalPattern(pattern) { return pattern === 'external-operation'; }

function expandImplementableLeaf(item, classification) {
  if (classification.classification === 'input-field' && classification.embeddedOperations?.length) return classification.embeddedOperations.map((operation, index) => ({ ...item, sourceItemId: item.id, id: `${item.id}-embedded-${index + 1}`, name: operation.label }));
  if (!['business-capability', 'operation'].includes(classification.classification)) return [];
  if (classification.classification === 'operation' && /下载/.test(item.name || '') && /重新生成|重试/.test(item.name || '')) return [{ ...item, sourceItemId: item.id, id: `${item.id}-download`, name: '下载结果' }, { ...item, sourceItemId: item.id, id: `${item.id}-retry`, name: '重新生成' }];
  return [item];
}

function synthesizeResultPresentation({ page, item, decision, pageSemantic, operation, aggregateSubmission, pattern, name, sources }) {
  if (!operation || !producesPresentableResult(pattern, operation, aggregateSubmission)) return { contract: null, findings: [] };
  const declared = decision?.resultPresentation || item.resultPresentation || aggregateSubmission?.resultPresentation || null;
  const recognized = new Map([...(pageSemantic?.regions || []).map((region) => [region.regionId, { id: region.regionId, kind: region.kind, source: 'frontend-region' }]), ...(pageSemantic?.resultSurfaces || []).map((surface) => [surface.surfaceId, { id: surface.surfaceId, kind: surface.kind, source: 'frontend-result-surface' }])]);
  const observedSurfaces = pageSemantic?.resultSurfaces || [];
  const targetRegion = declared?.targetRegion || (observedSurfaces.length === 1 ? observedSurfaces[0].surfaceId : null);
  const evidenceStatus = decision?.resultPresentation ? 'confirmed' : item.resultPresentation || aggregateSubmission?.resultPresentation ? 'documented' : targetRegion ? 'observed' : null;
  const findings = [];
  if (!targetRegion) findings.push(resultFinding(page.id, item.id, `No observed, documented, or confirmed result region identifies where ${name} renders its product`, sources));
  else if (!recognized.has(targetRegion)) findings.push(resultFinding(page.id, item.id, `Result region ${targetRegion} is not present in the immutable frontend semantic inventory for ${page.id}`, sources));
  const resultField = businessResultField(name);
  const responseProperties = operation.response?.bodySchema?.properties || {};
  const defaultResponsePath = responseProperties[resultField]?.properties?.references ? `response.${resultField}.references` : Object.entries(responseProperties).find(([, schema]) => schema?.type === 'array')?.[0];
  const responsePath = declared?.bindings?.[0]?.responsePath || (defaultResponsePath ? (defaultResponsePath.startsWith('response.') ? defaultResponsePath : `response.${defaultResponsePath}`) : null);
  if (!responsePath) findings.push(resultFinding(page.id, item.id, `${name} has no operation response field that can be bound to result elements`, sources));
  const quantity = aggregateSubmission?.finalProduct?.quantity;
  const count = quantity?.sourceField ? { mode: 'request-field', requestPath: `request.${quantity.sourceField}`, responsePath, fixedValueForbidden: true } : { mode: 'response-cardinality', responsePath };
  const bindings = responsePath ? [{ id: `result-${stableSlug(item.id)}`, responsePath, element: { semantic: declared?.bindings?.[0]?.element?.semantic || semanticForResult(recognized.get(targetRegion)?.kind), valueSource: declared?.bindings?.[0]?.element?.valueSource || 'item-value' }, cardinality: 'many', count }] : [];
  const states = {
    processing: { regionStatus: 'processing', elementSemantic: 'progress-indicator', contentRequirement: 'region contains a non-result progress affordance' },
    success: { regionStatus: 'success', elementSemantic: 'bound-result-elements', requiresBoundElements: true },
    failure: { regionStatus: 'error', elementSemantic: 'error-message', contentRequirement: 'declared operation failure is visible in the target region' },
    ...(declared?.states || {}),
  };
  const contract = findings.length ? null : { targetRegion, bindings, states, product: { type: aggregateSubmission?.finalProduct?.type || resultField, quantity: quantity || { responsePath, mode: 'response-cardinality' }, lifecycle: aggregateSubmission?.finalProduct?.lifecycle || ['processing', 'available', 'failed'], downstreamUsage: aggregateSubmission?.finalProduct?.downstreamUsage || ['result-display'] }, evidence: { status: evidenceStatus, sources: [...new Set([...sources, `${recognized.get(targetRegion).source}:${targetRegion}`])], releaseDigest: pageSemantic?.evidence?.sources?.find((source) => source.startsWith('visual-release:'))?.slice('visual-release:'.length) || null }, ...(declared?.historyBinding ? { historyBinding: declared.historyBinding } : {}) };
  return { contract, findings };
}

function producesPresentableResult(pattern, operation, aggregateSubmission) {
  if (aggregateSubmission?.finalProduct) return true;
  if (['upload', 'download', 'delete', 'history', 'query', 'status'].includes(pattern)) return false;
  return Object.values(operation.response?.bodySchema?.properties || {}).some((schema) => schema?.properties?.references || schema?.type === 'array');
}
function semanticForResult(kind) { return /img|image|media/i.test(kind || '') ? 'media-item' : /list|table|grid/i.test(kind || '') ? 'record-item' : 'result-item'; }
function resultFinding(pageId, itemId, question, sources) { return { id: `unresolved-result-${pageId}-${itemId}-${stableId(question)}`, severity: 'major', disposition: 'planned', status: 'open', question, relatedIds: [itemId], sources }; }

function buildPresentation(page, name, pattern, primary, inputs, operation, resultPresentation = null) {
  const mode = pattern === 'preview' ? 'display-only' : primary ? 'reuse-control' : operation ? 'add-control' : 'extend-flow';
  const base = { mode, targetPageId: page.id, triggerControl: { controlId: primary?.controlId || null, label: primary?.label || name }, fieldBindings: inputs.map((input) => ({ controlId: input.controlId || null, inputId: input.id, statePath: `form.${input.id}`, requestPath: operation ? `request.${input.id}` : null, required: input.required === true, ownership: input.ownership })), primaryAction: name, primaryOperationId: operation?.id || null, requiredUiStates: operation ? ['idle', 'loading', 'success', 'error'] : ['idle', 'active'], ...(resultPresentation ? { activation: { type: primary ? 'existing-control' : 'implementation-control', visualHint: { text: primary?.label || name, kind: primary?.kind || 'button' } }, resultSurface: { region: resultPresentation.targetRegion, dataSource: `operation:${operation.id}` }, surface: { type: 'same-page-workspace', requiredRegions: [resultPresentation.targetRegion], contentContract: { heading: name, inputIds: inputs.map((item) => item.id), primaryAction: name, primaryOperationId: operation.id, emptyState: `No ${name} result is available`, resultContract: resultPresentation } } } : {}) };
  if (mode === 'reuse-control') return { ...base, visualHint: { text: primary.label || name, kind: primary.kind } };
  if (mode === 'add-control') return { ...base, preferredRegion: primary?.region?.id || 'capability-actions', control: { type: 'primary-button', label: name }, behavior: 'server-operation' };
  if (mode === 'display-only') return { ...base, content: { type: 'operation-or-state-render', label: name }, region: primary?.region?.id || 'result-surface' };
  return { ...base, flow: { type: 'same-page-workspace', trigger: name, destination: `${page.id}:${name}`, destinationType: 'existing-page' } };
}

function buildDomainModel(pages, capabilities, product) {
  const domains = []; const entities = []; const valueObjects = []; const relationships = []; const consistencyBoundaries = []; const journeys = []; const permissions = []; const integrations = [];
  for (const page of pages.filter((entry) => entry.parentId !== null)) {
    const pageCaps = capabilities.filter((cap) => cap.pageIds.includes(page.id));
    const implementableCaps = pageCaps.filter((cap) => cap.specificationStatus === 'complete');
    const roles = new Set(implementableCaps.map((cap) => cap.synthesisAnalysis?.entityRole).filter(Boolean));
    const domainId = `domain-${page.id}`; const aggregateCaps = implementableCaps.filter((cap) => cap.aggregateSubmission); const entityIds = [...roles].map((role) => `entity-${page.id}-${role}`); entityIds.push(...aggregateCaps.map((cap) => `entity-${cap.id}-configuration`));
    const rootRole = roles.has('task') ? 'task' : roles.has('resource') ? 'resource' : [...roles][0]; const rootId = rootRole ? `entity-${page.id}-${rootRole}` : null;
    domains.push({ id: domainId, name: page.title, purpose: page.description || `Own ${page.title} business outcomes`, pageIds: [page.id], entityIds, evidence: documented([`page:${page.id}`, `system-node:domain-${page.id}`]) });
    for (const role of roles) { const definition = roleDefinition(role); const id = `entity-${page.id}-${role}`; entities.push(entity(id, domainId, `${page.title} ${role}`, definition.lifecycle, id === rootId, id === rootId ? null : rootId, definition.sensitiveFields)); }
    for (const cap of aggregateCaps) {
      const configurationId = `entity-${cap.id}-configuration`; const configuration = entity(configurationId, domainId, `${cap.name} configuration`, cap.aggregateSubmission.configurationAggregate.lifecycle, true, null, []);
      configuration.fieldGroups = cap.aggregateSubmission.configurationAggregate.sections;
      entities.push(configuration);
      consistencyBoundaries.push({ id: `boundary-${cap.id}-configuration`, aggregateRootEntityId: configurationId, entityIds: [configurationId], strategy: 'atomic' });
      valueObjects.push({ id: `value-${cap.id}-final-product`, domainId, name: `${cap.name} final product`, immutable: true, fields: [{ name: 'type', schema: { type: 'string', const: cap.aggregateSubmission.finalProduct.type }, required: true }, { name: 'quantity', schema: cap.aggregateSubmission.finalProduct.quantity.sourceField ? { type: 'integer', minimum: 1, derivedFrom: cap.aggregateSubmission.finalProduct.quantity.sourceField } : { type: 'integer', const: cap.aggregateSubmission.finalProduct.quantity.fixed }, required: true }, { name: 'status', schema: { type: 'string', enum: cap.aggregateSubmission.finalProduct.lifecycle }, required: true }] });
    }
    if (roles.has('task') && roles.has('configuration')) relationships.push(relation(`relation-${page.id}-task-config`, `entity-${page.id}-task`, `entity-${page.id}-configuration`, 'one-to-one', true, 'cascade'));
    if (roles.has('task') && roles.has('result')) relationships.push(relation(`relation-${page.id}-task-results`, `entity-${page.id}-task`, `entity-${page.id}-result`, 'one-to-many', false, 'restrict'));
    if (roles.has('task') && roles.has('asset')) relationships.push(relation(`relation-${page.id}-task-assets`, `entity-${page.id}-task`, `entity-${page.id}-asset`, 'one-to-many', false, 'restrict'));
    if (rootId) consistencyBoundaries.push({ id: `boundary-${page.id}`, aggregateRootEntityId: rootId, entityIds, strategy: 'atomic' });
    if (implementableCaps.length) journeys.push({ id: `journey-${page.id}`, name: `${page.title} end-to-end outcome`, actor: 'user', capabilityIds: implementableCaps.map((item) => item.id), operationIds: implementableCaps.flatMap((item) => item.operations.map((operation) => operation.id)), steps: implementableCaps.filter((item) => item.operations.length).map((item) => ({ capabilityId: item.id, operationId: item.operations[0].id, consumes: item.capabilityIntent.inputs.map((input) => input.id), produces: item.capabilityIntent.outputs.map((output) => output.id) })), acceptanceCriteria: [`A user can progress from ${page.title} input through processing to an observable result without substituting fixed identifiers.`], evidence: designed([`page:${page.id}`], 'The journey closes the complete operations declared for this page.') });
    if (entityIds.length) permissions.push({ id: `permission-${page.id}-owner`, actor: 'user', resourceIds: entityIds, actions: ['create', 'read', 'update', 'delete'], decision: 'allow', scope: 'owner' });
    for (const cap of implementableCaps.filter((item) => item.operations.some((operation) => operation.providerContract))) integrations.push({ id: `integration-${cap.id}`, name: `${cap.name} external capability`, capabilityIds: [cap.id], requiredCapability: cap.operations.find((operation) => operation.providerContract).providerContract.requiredCapability, binding: 'runtime-adapter', evidence: cap.evidence });
    const valueFields = dedupeBy(implementableCaps.flatMap((cap) => cap.capabilityIntent.inputs.map((input) => ({ name: input.id, schema: input.schema, required: input.required }))), 'name');
    if (valueFields.length) valueObjects.push({ id: `value-${page.id}-operation-input`, domainId, name: `${page.title} operation input`, immutable: true, fields: valueFields });
  }
  applyDataDependencies(capabilities);
  const rules = buildRules(capabilities);
  for (const rule of rules) for (const capabilityId of rule.appliesTo) { const capability = capabilities.find((item) => item.id === capabilityId); capability.ruleIds = [rule.id]; for (const operation of capability.operations || []) operation.ruleIds = [rule.id]; }
  return { domains, entities, valueObjects, relationships, consistencyBoundaries, journeys, rules, permissions, integrations };
}

function applyDataDependencies(capabilities) {
  const uploads = capabilities.filter((cap) => cap.operations[0]?.resourceTransfer);
  for (const cap of capabilities) {
    const operation = cap.operations[0]; if (!operation || operation.resourceTransfer) continue;
    const assetInputs = cap.capabilityIntent.inputs.filter((input) => input.ownership?.type === 'data-dependency'); if (!assetInputs.length) continue;
    operation.dataDependencies = []; if (operation.providerContract) operation.providerContract.assetBindings = [];
    for (const input of assetInputs) {
      const upstream = uploads.find((candidate) => candidate.pageIds[0] === cap.pageIds[0] && candidate.synthesisAnalysis?.sourceModuleId === input.ownership.sourceArchitectureItemId) || uploads.find((candidate) => candidate.pageIds[0] === cap.pageIds[0]);
      if (!upstream) continue;
      operation.dataDependencies.push({ sourceOperationId: upstream.operations[0].id, sourceField: 'response.assetIds', targetOperationId: operation.id, targetField: `request.${input.id}`, requiredOwnership: 'same-user', requiredLifecycleStatus: 'available', consistencyRequirement: 'read-your-writes', runtimeValueRequired: true });
      if (operation.providerContract) operation.providerContract.assetBindings.push({ source: `request.${input.id}`, purpose: input.label, required: input.required, ownership: 'same-user', lifecycleStatus: 'available' });
    }
  }
}

function assessVisualAlignment(pages, visual, product) {
  const architecturePageIds = pages.map((page) => page.id); const visualPageIds = visual.pages || [];
  const matchedPageIds = architecturePageIds.filter((id) => visualPageIds.includes(id));
  const missingArchitecturePageIds = architecturePageIds.filter((id) => !visualPageIds.includes(id));
  const unexpectedVisualPageIds = visualPageIds.filter((id) => !architecturePageIds.includes(id));
  const routeMismatches = matchedPageIds.filter((id) => !visual.routes[id] || !String(visual.routes[id]).includes(id));
  const findings = [];
  if (!matchedPageIds.length) findings.push({ id: 'visual-release-product-mismatch', severity: 'blocker', status: 'open', question: 'The immutable frontend release has no page identity in common with the architecture and cannot be treated as the same product', relatedIds: [...architecturePageIds, ...visualPageIds], sources: ['page-architecture:nodes', `visual-release:${visual.releaseDigest}`] });
  for (const pageId of missingArchitecturePageIds) findings.push({ id: `visual-release-missing-page-${pageId}`, severity: 'blocker', status: 'open', question: `Architecture page ${pageId} is absent from the immutable frontend release`, relatedIds: [pageId], sources: [`page:${pageId}`, `visual-release:${visual.releaseDigest}`] });
  for (const pageId of routeMismatches) findings.push({ id: `visual-release-route-mismatch-${pageId}`, severity: 'blocker', status: 'open', question: `Frontend route for ${pageId} does not preserve the architecture page identity`, relatedIds: [pageId], sources: [`frontend-page:${pageId}`, `visual-release:${visual.releaseDigest}`] });
  if (unexpectedVisualPageIds.length && matchedPageIds.length) findings.push({ id: 'visual-release-extra-pages', severity: 'blocker', status: 'open', question: 'The immutable frontend release contains pages not declared by the architecture', relatedIds: unexpectedVisualPageIds, sources: ['page-architecture:nodes', `visual-release:${visual.releaseDigest}`] });
  return { status: findings.some((item) => item.severity === 'blocker') ? 'blocked' : 'aligned', productId: product.projectId || null, suiteId: visual.manifest.suiteId || null, architecturePageIds, visualPageIds, matchedPageIds, missingArchitecturePageIds, unexpectedVisualPageIds, routeMismatches, coverage: architecturePageIds.length ? matchedPageIds.length / architecturePageIds.length : 0, findings };
}

function analyzeSufficiency({ id, name, pattern, primary, systemNode, decision, inputs, pageId }) {
  const findings = []; const stateOnly = ['navigation', 'local-state', 'preview'].includes(pattern);
  const meaningfulInputs = inputs.filter((item) => !['businessInput', 'assetIds', 'resourceId', 'taskId', 'resultId', 'query', 'cursor'].includes(item.id) && item.ownership && (['confirmed', 'documented', 'observed'].includes(item.evidence?.status) || (item.evidence?.status === 'designed' && item.ownership.type === 'page-workspace-template')));
  const syntheticOnly = inputs.length > 0 && inputs.every((item) => item.evidence?.status === 'designed' && item.ownership?.type !== 'page-workspace-template');
  const complex = isExternalPattern(pattern);
  const referenceOnlyAllowed = ['history', 'status', 'download', 'retry', 'query'].includes(pattern);
  if (!stateOnly && !referenceOnlyAllowed && syntheticOnly && !decision?.inputs) findings.push({ id: `unresolved-${id}-business-inputs`, severity: 'major', disposition: 'planned', status: 'open', question: `${name} has no documented, observed, or confirmed business fields; a synthetic target value is not an implementable contract`, relatedIds: [id], sources: [`page:${pageId}`, ...(systemNode ? [`system-node:${systemNode.id}`] : [])] });
  if (complex && !meaningfulInputs.length && !decision?.inputs) findings.push({ id: `unresolved-${id}-complex-semantics`, severity: 'major', disposition: 'planned', status: 'open', question: `${name} is a complex external capability but only generic references were identified; capability-specific parameters and constraints require a business decision or matching frontend evidence`, relatedIds: [id], sources: [`page:${pageId}`, ...(primary ? [`frontend-control:${primary.controlId}`] : [])] });
  const patternEvidence = explicitPatternEvidence(name, pattern);
  const confidence = decision ? 'confirmed' : patternEvidence.explicit && (primary || systemNode) && (stateOnly || referenceOnlyAllowed || meaningfulInputs.length) ? 'high' : meaningfulInputs.length && systemNode ? 'medium' : 'low';
  if (confidence === 'low') findings.push({ id: `unresolved-${id}-classification`, severity: 'major', disposition: 'planned', status: 'open', question: `${name} has low-confidence operation classification (${pattern}); an explicit business decision or capability-specific evidence is required`, relatedIds: [id], sources: [`page:${pageId}`, ...(systemNode ? [`system-node:${systemNode.id}`] : [])] });
  const alternatives = ['create', 'external-operation', 'local-state', 'headless'].filter((item) => item !== pattern);
  const bmadDecision = confidence === 'medium' ? { id: `bmad-decision-${id}`, status: 'accepted', chosenPattern: pattern, rationale: `Capability-specific fields, page workspace, and system responsibility support ${pattern}.`, rejectedAlternatives: alternatives.map((candidate) => ({ pattern: candidate, reason: `${candidate} does not match the declared trigger, lifecycle, or observable outcome.` })), reviewerAgentId: 'fdd-bmad-domain-reviewer', inputDigest: synthesisInputDigest, evidence: [`page:${pageId}`, `system-node:${systemNode.id}`, ...meaningfulInputs.flatMap((item) => item.evidence.sources || [])] } : null;
  return { findings, summary: { candidatePattern: pattern, patternEvidence, confidence, classifierRole: 'candidate-analysis', bmadDecision, reviewedEvidence: { systemNodeId: systemNode?.id || null, triggerControlId: primary?.controlId || null, meaningfulInputIds: meaningfulInputs.map((item) => item.id), inputOwnership: meaningfulInputs.map((item) => item.ownership), decisionId: decision?.id || null }, minimumImplementableInformation: findings.length ? 'insufficient' : 'satisfied', entityRole: entityRoleFor(pattern) } };
}

function ownedFrontendFields(pageSemantic, primary, capabilityName, module) {
  const fields = (pageSemantic?.controls || []).filter((control) => ['input', 'textarea', 'select', 'checkbox', 'radio'].includes(control.kind) || /file/.test(control.kind || ''));
  return fields.flatMap((field) => {
    const regionShared = primary && sameRegion(field, primary) && !/sidebar|menu|nav|功能列表|菜单|导航/i.test(`${field.region?.id || ''} ${field.region?.label || ''}`);
    const affinity = Math.max(semanticAffinity(`${field.label || ''} ${field.placeholder || ''}`, capabilityName), semanticAffinity(`${field.region?.label || ''}`, module.name || ''));
    if (!regionShared && affinity < 0.6) return [];
    return [{ ...field, ownership: regionShared ? { type: 'same-control-region', regionId: field.region?.id, primaryControlId: primary.controlId } : { type: 'semantic-control-match', affinity, capabilityLabel: capabilityName } }];
  });
}

function plannedPresentation(presentation, name) {
  const result = { ...presentation, behavior: 'planned-state', primaryOperationId: null, requiredUiStates: ['idle', 'planned'], plannedState: { title: name, message: '功能待实现', capabilitySpecific: true } };
  delete result.primaryAction;
  if (result.surface?.contentContract) result.surface = { ...result.surface, contentContract: { ...result.surface.contentContract, inputIds: [], primaryAction: null, primaryOperationId: null, emptyState: '功能待实现' } };
  return result;
}

function markCapabilityPlanned(capability, reason) {
  capability.specificationStatus = 'planned'; capability.planningReason = reason; capability.missingDecisions = [reason];
  capability.operations = []; capability.entityEffects = []; capability.writesState = false; capability.ruleIds = [];
  capability.presentation = plannedPresentation(capability.presentation, capability.name);
  capability.deliveryPolicy = { requiredForCompletion: false, allowedIncompleteState: 'planned', uiBehavior: 'show-planned-state' };
  stripImplementationSemantics(capability);
}

function stripImplementationSemantics(capability) {
  delete capability.resultPresentation;
  capability.inputs = [];
  capability.inputSchema = null;
  capability.outcomes = [];
  capability.outputSchema = null;
  capability.operations = [];
  capability.entityEffects = [];
  capability.writesState = false;
  capability.ruleIds = [];
  capability.failures = [];
  capability.acceptanceCriteria = [`Opening ${capability.name} shows its capability-specific 功能待实现 state without a business request or fabricated result`];
  capability.acceptanceExamples = [];
  if (capability.capabilityIntent) capability.capabilityIntent = { ...capability.capabilityIntent, inputs: [], processingSemantics: { mode: 'undetermined', reason: capability.planningReason }, outputs: [], sideEffects: [], downstreamUsage: [], qualityCriteria: [], failures: [] };
}

function isSharedPageChrome(control) { return control.controlId === 'active-module' || /shared|global|header|toolbar|topbar|search|导航|全局|页头|工具栏/i.test(`${control.region?.id || ''} ${control.region?.label || ''} ${control.ancestors?.join?.(' ') || ''}`); }

function explicitPatternEvidence(name, pattern) { const subject = String(name).toLowerCase(); const patterns = { navigation: /入口|导航|打开|进入|navigate|open/, upload: /上传|upload|file/, delete: /删除|移除|delete|remove/, update: /更新|编辑|修改|update|edit/, download: /下载|download/, history: /历史|记录|history/, status: /状态|进度|status|progress/, retry: /重新|重试|retry|regenerate/, preview: /预览|展示|放大|缩小|切换|preview|zoom/, query: /查询|查看|search|query/, create: /新建|创建|提交|保存|create|submit|save/, 'external-operation': /外部|第三方|external|provider|integration|\bai\b/i }; return { explicit: Boolean(patterns[pattern]?.test(subject)), matchedExpression: String(patterns[pattern] || ''), subject };
}

function semanticAffinity(left, right) { const a = String(left || '').toLowerCase().replace(/生成|创建|新建|功能|页面|表单|工作区|模块|入口|按钮|操作|[\s（）()：:#，、/&-]/g, ''); const b = String(right || '').toLowerCase().replace(/生成|创建|新建|功能|页面|表单|工作区|模块|入口|按钮|操作|[\s（）()：:#，、/&-]/g, ''); if (!a || !b) return 0; if (a.includes(b) || b.includes(a)) return Math.min(a.length, b.length) / Math.max(a.length, b.length); const leftPairs = new Set([...a].slice(0, -1).map((char, index) => char + a[index + 1])); const rightPairs = new Set([...b].slice(0, -1).map((char, index) => char + b[index + 1])); const overlap = [...leftPairs].filter((item) => rightPairs.has(item)).length; return overlap / Math.max(1, new Set([...leftPairs, ...rightPairs]).size); }

function roleDefinition(role) { return ({ task: { lifecycle: ['draft', 'validated', 'queued', 'running', 'succeeded', 'failed', 'cancelled'], sensitiveFields: [] }, configuration: { lifecycle: ['draft', 'valid', 'invalid', 'archived'], sensitiveFields: [] }, result: { lifecycle: ['pending', 'available', 'rejected', 'expired'], sensitiveFields: [] }, asset: { lifecycle: ['selected', 'uploading', 'validated', 'available', 'rejected', 'deleted'], sensitiveFields: ['storageKey', 'checksum'] }, resource: { lifecycle: ['draft', 'active', 'updated', 'archived', 'deleted'], sensitiveFields: [] } })[role] || { lifecycle: ['active', 'archived'], sensitiveFields: [] }; }

function classify(name, context = '', control = null) { const subject = String(name).toLowerCase(); const text = `${subject} ${context} ${control?.label || ''}`.toLowerCase(); if (/入口|导航|打开|进入|navigate|open/.test(subject)) return 'navigation'; if (/上传|upload|attach|import/.test(subject) || control?.kind === 'file') return 'upload'; if (/删除|delete|移除|remove/.test(subject)) return 'delete'; if (/更新|编辑|修改|update|edit/.test(subject)) return 'update'; if (/下载|download|export/.test(subject)) return 'download'; if (/历史|记录|history|list/.test(subject)) return 'history'; if (/状态|进度|status|progress/.test(subject)) return 'status'; if (/重新|重试|retry|regenerate/.test(subject)) return 'retry'; if (/查询|查看|search|query/.test(subject)) return 'query'; if (/新建|创建|提交|保存|create|submit|save/.test(subject)) return 'create'; if (hasExternalEvidence(text, control)) return 'external-operation'; return control?.observedHandler && !control?.observedNetwork ? 'local-state' : 'create'; }
function operationVerb(pattern) { return ({ upload: 'upload', delete: 'delete', update: 'update', download: 'download', history: 'list', status: 'get-status', retry: 'retry', query: 'get', 'external-operation': 'invoke-external', create: 'create' })[pattern] || 'execute'; }
function pathFor(pageId, itemId, pattern) { const base = `/api/pages/${pageId}`; if (pattern === 'upload') return `${base}/capabilities/${itemId}/assets`; if (pattern === 'history') return `${base}/capabilities/${itemId}/tasks`; if (pattern === 'status') return `${base}/capabilities/${itemId}/tasks/{taskId}/status`; if (pattern === 'download') return `${base}/capabilities/${itemId}/results/{resultId}/download`; if (pattern === 'retry') return `${base}/capabilities/${itemId}/tasks/{taskId}/retry`; return `${base}/capabilities/${itemId}/${operationVerb(pattern)}`; }
function outputSchemaFor(pattern, name) { if (pattern === 'upload') return objectSchema({ assetIds: { type: 'array', minItems: 1, items: { type: 'string' } }, assets: { type: 'array', items: { type: 'object', required: ['id', 'status', 'checksum'], properties: { id: { type: 'string' }, status: { type: 'string', enum: ['available'] }, checksum: { type: 'string' } }, additionalProperties: false } } }, ['assetIds', 'assets']); if (pattern === 'download') return objectSchema({ downloadUrl: { type: 'string' }, expiresAt: { type: 'string', format: 'date-time' } }, ['downloadUrl', 'expiresAt']); if (['history', 'query'].includes(pattern)) return objectSchema({ items: { type: 'array', items: { type: 'object', required: ['id', 'status', 'capabilityId'], properties: { id: { type: 'string' }, status: { type: 'string' }, capabilityId: { type: 'string' }, createdAt: { type: 'string', format: 'date-time' } }, additionalProperties: false } }, nextCursor: { type: ['string', 'null'] } }, ['items']); if (pattern === 'status') return objectSchema({ taskId: { type: 'string' }, status: { type: 'string', enum: ['queued', 'running', 'succeeded', 'failed'] }, progress: { type: 'integer', minimum: 0, maximum: 100 } }, ['taskId', 'status']); const resultField = businessResultField(name); const quality = Object.fromEntries(qualityFor(pattern, name).map((criterion) => [stableSlug(criterion), { type: 'boolean', const: true }])); return objectSchema({ operationId: { type: 'string' }, status: { type: 'string', enum: ['accepted', 'completed'] }, [resultField]: { type: 'object', properties: { kind: { type: 'string', const: stableSlug(name) }, references: { type: 'array', minItems: 1, items: { type: 'string' } }, quality: { type: 'object', properties: quality, required: Object.keys(quality), additionalProperties: false } }, required: ['kind', 'references', 'quality'], additionalProperties: false } }, ['operationId', 'status', resultField]); }
function businessResultField(name) { return `${stableSlug(name)}Result`; }
function outputsFor(pattern, name) { const schema = outputSchemaFor(pattern, name); return Object.entries(schema.properties).map(([id, value]) => ({ id, required: schema.required.includes(id), schema: value })); }
function resourceTransfer(inputs) { const file = inputs.find((item) => item.id === 'files') || inputs[0]; return { contentType: 'multipart/form-data', fileField: file?.id || 'files', purpose: file?.label || 'business-input', required: file?.required !== false, mimeTypes: file?.constraints?.mimeTypes || ['application/octet-stream'], maxBytesPerFile: file?.constraints?.maxBytesPerFile || 20971520, minItems: file?.schema?.minItems || 0, maxItems: file?.schema?.maxItems || 20, checksum: 'sha256', ownership: 'current-user', lifecycle: ['selected', 'uploading', 'validated', 'available', 'rejected', 'deleted'], storageReference: 'opaque-storage-key', responseIdPath: 'response.assetIds[]' }; }
function providerContract(pattern, name, inputs, output, semanticContext) { const transferred = inputs.some((item) => item.ownership?.type === 'data-dependency'); return { requiredCapability: `${pattern}:${stableSlug(name)}`, operationSemantics: processingFor(pattern, name), transformation: transformationFromEvidence(name, pattern, inputs, semanticContext), requiresTransferredResources: transferred, parameterMappings: inputs.map((item) => ({ source: `request.${item.id}`, target: `provider.input.${item.id}`, required: item.required })), assetBindings: [], inputConstraints: Object.fromEntries(inputs.map((item) => [item.id, item.schema])), outputConstraints: output, timeoutMs: 60000, retry: { maxAttempts: 2, strategy: 'bounded-exponential', retryable: ['TIMEOUT', 'RATE_LIMITED', 'UNAVAILABLE'] }, unavailableBehavior: 'fail-with-domain-error', outputValidation: 'schema-and-business-quality', qualityCriteria: qualityFor(pattern, name) }; }
function transformationFromEvidence(name, pattern, inputs, context = {}) { return { mode: pattern, objective: context.decision?.businessOutcome || `Fulfill the documented capability ${name}`, sourceClaims: [context.page?.title, context.page?.description, context.module?.name, ...(context.systemResponsibilities || []), ...(context.productGoals || [])].filter(Boolean), inputRoles: inputs.map((item) => ({ id: item.id, label: item.label, required: item.required, source: item.source })), invariants: ['use only authorized inputs', 'preserve values outside the declared change scope', 'reject output that violates the operation response contract'], outputKind: stableSlug(name), evidenceStatus: context.decision ? 'confirmed' : 'designed' }; }
function entity(id, domainId, name, lifecycle, aggregateRoot, aggregateRootEntityId = null, sensitiveFields = []) { const transitions = lifecycle.slice(0, -1).map((from, index) => ({ from, to: lifecycle[index + 1], condition: `domain operation authorizes ${from} -> ${lifecycle[index + 1]}`, irreversible: ['deleted', 'expired', 'cancelled'].includes(lifecycle[index + 1]) })); return { id, domainId, name, identity: { fields: ['id'] }, aggregateRoot, ...(aggregateRoot ? {} : { aggregateRootEntityId }), lifecycle, stateMachine: { initial: lifecycle[0], transitions, forbidden: [{ from: lifecycle.at(-1), to: lifecycle[0], reason: 'terminal lifecycle state cannot silently reset' }] }, constraints: { required: ['id', 'ownerId', 'status'], unique: [['id']], status: { field: 'status', allowed: lifecycle } }, accessScope: { ownerActor: 'user', scope: 'owner', ownershipField: 'ownerId' }, sensitiveFields, retention: { policy: 'business-defined', evidenceStatus: 'inferred' }, evidence: designed([`domain:${domainId}`], 'Lifecycle entity is required by declared operations and journeys.') }; }
function relation(id, from, to, cardinality, required, onDelete) { return { id, fromEntityId: from, toEntityId: to, cardinality, ownership: 'aggregate', required, onDelete, associationKey: { fromFields: ['id'], toFields: [`${from.replace(/^entity-/, '').replaceAll('-', '')}Id`] }, invariants: [`${to} must reference an existing ${from}`, `${to} ownership must match ${from} ownership`] }; }
function buildRules(capabilities) { return capabilities.filter((cap) => cap.operations.length).map((cap) => ({ id: `rule-${cap.id}`, name: `${cap.name} contract rule`, appliesTo: [cap.id], conditions: cap.capabilityIntent.prerequisites, assertions: [...cap.capabilityIntent.qualityCriteria, ...cap.capabilityIntent.failures.map((item) => item.condition)], evidence: cap.evidence })); }
function acceptanceFor(pattern, name, inputs) { return [`${name} consumes each required field with its declared type and constraint`, `${name} produces its operation-specific output and observable UI state`, ...(inputs.some((item) => item.source?.includes('prior-operation')) ? ['Runtime output from the prerequisite operation is propagated without a fixed substitute'] : []), `${name} exposes its declared recovery behavior for each business failure`]; }
function acceptanceExample(pattern, operation, inputs, name) { const generated = Object.fromEntries(inputs.map((item, index) => [item.id, item.schema?.format === 'binary' || item.schema?.items?.format === 'binary' ? `runtime-file-${index + 1}` : `runtime-value-${index + 1}`])); const resultAssertion = ['upload', 'download', 'history', 'query', 'status'].includes(pattern) ? 'declared-output-schema' : `response.${businessResultField(name)}`; return { given: generated, when: operation?.id ? `invoke ${operation.id}` : `activate ${pattern}`, runtimeBindings: inputs.filter((item) => item.source?.includes('prior-operation')).map((item) => ({ source: item.source, target: `request.${item.id}`, fixedValueForbidden: true })), then: [{ assertion: resultAssertion, matches: true }, ...qualityFor(pattern, name).map((criterion) => ({ assertion: `quality.${stableSlug(criterion)}`, equals: true })), { assertion: 'declared-ui-state', equals: 'success' }], failures: failuresFor(pattern).map((item) => ({ condition: item.condition, expect: item.code })) }; }
function prerequisitesFor(pattern) { if (pattern === 'upload') return ['authenticated actor', 'selected resources satisfy declared transfer constraints']; if (isExternalPattern(pattern)) return ['authenticated actor', 'required inputs are authorized and available', 'declared external capability is available']; if (['retry', 'status', 'download'].includes(pattern)) return ['referenced task or result exists and is owned by the actor']; return ['authenticated actor', 'required inputs are valid']; }
function goalFor(pattern, name) { return ({ upload: `Provide the business assets required by ${name}`, history: `Recover and inspect prior ${name} records`, status: `Understand the current lifecycle state for ${name}`, download: `Obtain the selected ${name} result`, retry: `Recover a failed or unsatisfactory ${name} operation`, preview: `Inspect the selected ${name} result`, navigation: `Reach the ${name} workspace` })[pattern] || `Complete ${name} for the product's declared business scenario`; }
function outcomeFor(pattern, name) { return ({ upload: `Validated, owned assets are available for downstream operations`, history: `Owned historical records are visible`, status: `Current task state and progress are observable`, download: `A permitted result is delivered`, retry: `A new attempt is associated with the original business task`, preview: `The chosen result is rendered without changing persisted business state`, navigation: `The correct capability workspace is active` })[pattern] || `${name} produces a traceable business result rather than a generic response`; }
function processingFor(pattern, name) { const semantics = ({ upload: 'validate transfer constraints, compute checksum, bind ownership, persist an opaque storage reference, and return runtime resource identifiers', history: 'filter records by actor scope and return a stable ordered page', status: 'read the authoritative lifecycle state and expose progress or failure details', download: 'authorize ownership, resolve the available result, and issue a bounded download reference', retry: 'validate retry eligibility and create a new attempt linked to the original operation and inputs', preview: 'select and render one result while preserving the active capability context', navigation: 'activate the destination capability and replace the workspace content', 'external-operation': 'map the declared inputs to the required external capability, validate its response, and preserve correlation and failure semantics', create: 'validate inputs, create the capability-specific aggregate state, and return its typed result', update: 'validate changes and update the owned aggregate using optimistic concurrency', delete: 'authorize and apply the declared lifecycle/delete policy' })[pattern] || 'apply the declared domain rules'; return `For ${name}, ${semantics}.`; }
function sideEffectsFor(pattern) { if (['navigation', 'local-state', 'preview', 'query', 'history', 'status', 'download'].includes(pattern)) return []; return [{ entityRole: entityRoleFor(pattern), effect: pattern === 'update' ? 'update' : pattern === 'delete' ? 'delete' : 'create', observable: true }]; }
function downstreamFor(pattern) { if (pattern === 'upload') return [{ outputPath: 'response.assetIds', consumers: ['downstream-operations'], propagation: 'runtime-value' }]; if (['create', 'update', 'retry'].includes(pattern) || isExternalPattern(pattern)) return [{ outputPath: 'response.operationId', consumers: ['status-query', 'history-query', 'result-display'], propagation: 'runtime-value' }]; return []; }
function qualityFor(pattern, name) { if (pattern === 'upload') return ['transferred bytes match the recorded checksum', 'only validated owned resources become available']; if (isExternalPattern(pattern)) return [`output is relevant to ${name}`, 'output satisfies the declared schema and business constraints', 'external failure never becomes a successful fixture result']; return [`observable result is specific to ${name}`, 'required values are preserved end to end']; }
function failuresFor(pattern) { const common = [{ code: 'NOT_AUTHORIZED', status: 403, condition: 'actor lacks ownership or permission', recovery: 'authenticate or select an owned resource' }, { code: 'INVALID_INPUT', status: 422, condition: 'input violates the operation schema or business rule', recovery: 'correct the identified field' }]; if (pattern === 'upload') return [...common, { code: 'UNSUPPORTED_FILE', status: 415, condition: 'file type, count, size, or checksum is invalid', recovery: 'select a supported file' }, { code: 'STORAGE_UNAVAILABLE', status: 503, condition: 'durable storage is unavailable', recovery: 'retry without claiming the asset is available' }]; if (/external/.test(pattern) || ['translate', 'extract'].includes(pattern)) return [...common, { code: 'EXTERNAL_CAPABILITY_UNAVAILABLE', status: 503, condition: 'required external capability is unavailable or times out', recovery: 'bounded retry or explicit failure state' }, { code: 'OUTPUT_REJECTED', status: 422, condition: 'external output fails schema or quality validation', recovery: 'retry with preserved inputs or request correction' }]; return [...common, { code: 'CONFLICT', status: 409, condition: 'lifecycle or concurrency precondition is not satisfied', recovery: 'refresh authoritative state and retry when allowed' }]; }
function detectConflicts(capabilityId, item, primary, decision, inputs) { const findings = []; if (decision?.required !== undefined && /非必填|可选/.test(item.name) && decision.required === true) findings.push({ id: `conflict-${capabilityId}-required`, severity: 'blocker', status: 'open', question: `User decision marks ${cleanName(item.name)} required while architecture marks it optional`, sources: [`page-module:${item.id}`, `user-decision:${decision.id}`] }); if (primary && primary.required !== null && inputs[0] && primary.required !== inputs[0].required) findings.push({ id: `conflict-${capabilityId}-frontend-required`, severity: 'blocker', status: 'open', question: `Frontend and synthesized contract disagree on requiredness for ${cleanName(item.name)}`, sources: [`frontend-control:${primary.controlId}`, `page-module:${item.id}`] }); return findings; }
function decisionConsumed(decision, capabilities) { return capabilities.some((cap) => cap.evidence.sources.includes(`user-decision:${decision.id}`)); }
function normalizeDecisions(value) { if (!value) return []; const items = Array.isArray(value) ? value : value.decisions || value.items || []; return items.map((item, index) => ({ id: item.id || `decision-${index + 1}`, ...item })); }
function relevance(control, name, context) { const label = `${control.label || ''} ${control.placeholder || ''}`.toLowerCase(); const tokens = meaningfulTokens(name); let score = tokens.reduce((sum, token) => sum + (label.includes(token.toLowerCase()) ? token.length : 0), 0); if (name && label.includes(name.toLowerCase())) score += 100; if (/上传/.test(name) && /上传|file/.test(label + control.kind)) score += 20; if (/生成/.test(name) && /生成/.test(label)) score += 10; if (/下载/.test(name) && /下载|download/.test(label)) score += 20; if (/重试|重新生成/.test(name) && /重试|重新生成|retry|regenerate/.test(label)) score += 20; return score; }
function meaningfulTokens(value) { return cleanName(value).split(/[\s/&（）()：:#，、-]+/).filter((item) => item.length >= 2 && !/^(必填|必选|非必填|按钮|功能)$/.test(item)); }
function sameRegion(field, primary) { return primary && field.region?.id && field.region.id === primary.region?.id; }
function fieldId(field, index) { return stableSlug(field.label || field.placeholder || field.controlId || `field-${index + 1}`); }
function schemaForControl(field) { if (/file/.test(field.kind || '')) return { type: 'array', items: { type: 'string', format: 'binary' } }; if (field.options?.length) return { type: 'string', enum: field.options }; return { type: 'string', minLength: field.required ? 1 : 0 }; }
function subjectIdFor(pattern) { return ({ status: 'taskId', retry: 'taskId', download: 'resultId', delete: 'resourceId', update: 'resourceId', query: 'query', history: 'cursor' })[pattern] || 'businessInput'; }
function entityFor(pageId, pattern) { return `entity-${pageId}-${entityRoleFor(pattern)}`; }
function entityRoleFor(pattern) { if (pattern === 'upload') return 'asset'; if (['download', 'preview'].includes(pattern)) return 'result'; if (pattern === 'local-state') return 'configuration'; if (['create', 'update', 'delete', 'query'].includes(pattern)) return 'resource'; return 'task'; }
function objectSchema(properties, required = []) { return { type: 'object', required, properties, additionalProperties: false }; }
function documented(sources) { return { status: 'documented', sources }; } function observed(sources) { return { status: 'observed', sources }; } function designed(sources, rationale) { return { status: 'designed', sources, rationale }; }
function cleanName(value = '') { return String(value).split('#')[0].trim(); }
function stableSlug(value) { const base = String(value || '').normalize('NFKC').toLowerCase().replace(/[^\p{Letter}\p{Number}]+/gu, '-').replace(/^-|-$/g, ''); return base || `value-${stableId(value)}`; }
function stableId(value) { return [...String(value)].reduce((hash, char) => Math.imul(hash ^ char.codePointAt(0), 16777619) >>> 0, 2166136261).toString(16); }
function dedupeBy(items, key) { return [...new Map(items.map((item) => [item[key], item])).values()]; }
function digest(value) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function readKnownJSON(dir, names) { for (const name of names) { try { return JSON.parse(readFileSync(`${dir}/${name}`, 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; } } throw new Error(`missing required architecture JSON: ${names.join(' or ')}`); }
function writeJSON(path, value) { writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`); }
function parseArgs(values) { const result = {}; for (let i = 0; i < values.length; i++) if (values[i].startsWith('--')) result[values[i].slice(2)] = values[++i]; return result; }
function usage() { console.error('Usage: scaffold-package.mjs --input <three-json-directory> --visual-release <ai-restore-release> --output <package-dir> --author-agent <stable-agent-id> [--decisions <user-business-decisions.json>]'); process.exit(2); }
