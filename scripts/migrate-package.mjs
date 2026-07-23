#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const args = parseArgs(process.argv.slice(2));
if (!args.package || !args.output) usage();
const source = resolve(args.package); const output = resolve(args.output);
if (!existsSync(source) || !statSync(source).isDirectory()) throw new Error('source package does not exist');
if (existsSync(output) && readdirSync(output).length) throw new Error('migration output must not exist or must be empty');
mkdirSync(output, { recursive: true }); cpSync(source, output, { recursive: true });
const manifest = readJSON(`${output}/manifest.json`); const spec = readJSON(`${output}/functional-spec.json`); const definitions = readJSON(`${output}/capability-definitions.json`);
const changes = [];
for (const capability of spec.capabilities || []) for (const operation of capability.operations || []) {
  if (operation.assetTransfer && operation.resourceTransfer && JSON.stringify(operation.assetTransfer) !== JSON.stringify(operation.resourceTransfer)) throw new Error(`operation ${operation.id} has conflicting transfer contracts`);
  if (operation.assetTransfer && !operation.resourceTransfer) { operation.resourceTransfer = operation.assetTransfer; changes.push({ operationId: operation.id, from: 'assetTransfer', to: 'resourceTransfer' }); }
  delete operation.assetTransfer;
}
if (!changes.length) throw new Error('package has no legacy transfer contracts to migrate');
definitions.capabilities = spec.capabilities;
manifest.status = 'draft'; delete manifest.approval;
manifest.migration = { id: `transfer-contract-${Date.now()}`, fromContractVersion: readOptional(source, 'review-receipt.json')?.contractVersion || `functional-domain/${manifest.schemaVersion}-pre-contract-binding`, toContractVersion: `functional-domain/${manifest.schemaVersion}`, requiresIndependentReview: true };
writeJSON(`${output}/manifest.json`, manifest); writeJSON(`${output}/functional-spec.json`, spec); writeJSON(`${output}/capability-definitions.json`, definitions);
for (const file of ['review-receipt.json', 'planning-review-receipt.json', 'package-lock.json', 'review-rejection.json']) if (existsSync(`${output}/${file}`)) rmSync(`${output}/${file}`);
writeJSON(`${output}/migration-receipt.json`, { schemaVersion: '1.0', generatedBy: 'functional-domain-design/migrate-package', status: 'migration-pending-review', sourcePackageDigest: directoryDigest(source), changes, targetContractVersion: manifest.migration.toContractVersion });
console.log(`Migrated ${changes.length} transfer contract(s); independent review is required: ${output}`);

function directoryDigest(dir) { const files = walk(dir).sort(); const hash = createHash('sha256'); for (const file of files) hash.update(file.slice(dir.length + 1)).update('\0').update(readFileSync(file)).update('\0'); return hash.digest('hex'); }
function walk(dir) { return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? walk(`${dir}/${entry.name}`) : [`${dir}/${entry.name}`]); }
function readJSON(path) { return JSON.parse(readFileSync(path, 'utf8')); }
function readOptional(dir, file) { return existsSync(`${dir}/${file}`) ? readJSON(`${dir}/${file}`) : null; }
function writeJSON(path, value) { writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`); }
function parseArgs(values) { const result = {}; for (let index = 0; index < values.length; index++) if (values[index].startsWith('--')) result[values[index].slice(2)] = values[++index]; return result; }
function usage() { console.error('Usage: migrate-package.mjs --package <approved-or-draft-package> --output <new-package>'); process.exit(2); }
