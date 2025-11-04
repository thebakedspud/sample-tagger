import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, normalize } from 'node:path';

const root = process.cwd();
const configPath = join(root, 'jsconfig.json');
const typesRoot = join(root, 'types');

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function walkTypes(dir) {
  const entries = readdirSync(dir);
  const files = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);

    if (stats.isDirectory()) {
      files.push(...walkTypes(fullPath));
    } else if (stats.isFile() && entry.endsWith('.d.ts')) {
      files.push(fullPath);
    }
  }

  return files;
}

function collectDeclaredModules(typeFiles) {
  const regex = /declare module ['"]([^'"]+)['"]/g;
  const map = new Map();

  for (const file of typeFiles) {
    const contents = readFileSync(file, 'utf8');
    const normalized = normalize(file);
    let match;

    while ((match = regex.exec(contents)) !== null) {
      const moduleId = match[1];
      if (!map.has(moduleId)) {
        map.set(moduleId, new Set());
      }
      map.get(moduleId).add(normalized);
    }
  }

  return map;
}

function collectPathTargets(paths) {
  const map = new Map();

  for (const [moduleId, targets] of Object.entries(paths ?? {})) {
    if (moduleId.includes('*')) continue;
    if (!Array.isArray(targets) || targets.length === 0) continue;

    const [firstTarget] = targets;
    if (!firstTarget.endsWith('.d.ts')) continue;

    const normalized = normalize(join(root, firstTarget));
    if (!map.has(moduleId)) {
      map.set(moduleId, new Set());
    }
    map.get(moduleId).add(normalized);
  }

  return map;
}

const typeFiles = walkTypes(typesRoot);
const declared = collectDeclaredModules(typeFiles);
const config = readJson(configPath);
const paths = collectPathTargets(config?.compilerOptions?.paths ?? {});

const conflicts = [];

for (const [moduleId, pathTargets] of paths.entries()) {
  const files = new Set(pathTargets);
  const declaredFiles = declared.get(moduleId);

  if (declaredFiles) {
    for (const file of declaredFiles) {
      files.add(file);
    }
  }

  if (files.size > 1) {
    conflicts.push({
      moduleId,
      files: Array.from(files),
    });
  }
}

if (conflicts.length > 0) {
  console.error('Duplicate module declarations detected:');
  for (const { moduleId, files } of conflicts) {
    console.error(`  ${moduleId}`);
    for (const file of files) {
      console.error(`    ${file}`);
    }
  }
  process.exit(1);
}

console.log('No duplicate module declarations found.');
