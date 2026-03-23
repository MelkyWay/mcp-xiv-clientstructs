import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { parseFile } from './parser.js';
import { Index, ParsedType } from './types.js';

// Bump this whenever parsing logic changes to force a cache rebuild.
export const PARSER_VERSION = '1';

function getLocalSha(repoPath: string): string {
  return execSync('git rev-parse HEAD', { cwd: repoPath }).toString().trim();
}

function walkCsFiles(repoPath: string): string[] {
  const libraryPath = path.join(repoPath, 'FFXIVClientStructs');
  return (fs.readdirSync(libraryPath, { recursive: true }) as string[])
    .filter(f => f.endsWith('.cs'))
    .map(f => path.join(libraryPath, f));
}

export function mergePartialTypes(types: ParsedType[]): ParsedType[] {
  const map = new Map<string, ParsedType>();
  for (const type of types) {
    const key = `${type.namespace}.${type.name}`;
    const existing = map.get(key);
    if (existing) {
      existing.fields.push(...type.fields);
      existing.methods.push(...type.methods);
      if (existing.size === null)      existing.size      = type.size;
      if (existing.inherits === null)  existing.inherits  = type.inherits;
      if (existing.addonName === null) existing.addonName = type.addonName;
      if (existing.agentId === null)   existing.agentId   = type.agentId;
      existing.isGenerateInterop = existing.isGenerateInterop || type.isGenerateInterop;
    } else {
      map.set(key, { ...type, fields: [...type.fields], methods: [...type.methods] });
    }
  }
  return [...map.values()];
}

function buildIndex(repoPath: string, sha: string): Index {
  const files = walkCsFiles(repoPath);
  const types: ParsedType[] = [];

  for (const file of files) {
    try {
      const content = fs.readFileSync(file, 'utf-8');
      const parsed = parseFile(content, file);
      types.push(...parsed);
    } catch (err) {
      process.stderr.write(`Warning: failed to parse ${file}: ${err}\n`);
    }
  }

  return { gitSha: sha, types };
}

function writeIndex(indexPath: string, index: Index): void {
  const tmp = indexPath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(index), 'utf-8');
  fs.renameSync(tmp, indexPath);
}

function readStoredSha(indexPath: string): string | null {
  try {
    const raw = fs.readFileSync(indexPath, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<Index>;
    return parsed.gitSha ?? null;
  } catch {
    return null;
  }
}

export interface IndexResult {
  index: Index;
  rebuilt: boolean;
  typesIndexed: number;
  sha: string;
}

export function loadOrBuild(repoPath: string, indexPath: string): IndexResult {
  const currentSha = getLocalSha(repoPath);
  const storedSha = readStoredSha(indexPath);

  if (storedSha === currentSha) {
    const raw = fs.readFileSync(indexPath, 'utf-8');
    const index = JSON.parse(raw) as Index;
    process.stderr.write(`Index up to date (${index.types.length} types, sha ${currentSha.slice(0, 8)})\n`);
    return { index, rebuilt: false, typesIndexed: index.types.length, sha: currentSha };
  }

  process.stderr.write(`Rebuilding index from ${repoPath}...\n`);
  const index = buildIndex(repoPath, currentSha);
  writeIndex(indexPath, index);
  process.stderr.write(`Indexed ${index.types.length} types (sha ${currentSha.slice(0, 8)})\n`);
  return { index, rebuilt: true, typesIndexed: index.types.length, sha: currentSha };
}

export function refresh(repoPath: string, indexPath: string): IndexResult {
  process.stderr.write('Running git pull...\n');
  try {
    execSync('git pull', { cwd: repoPath, timeout: 30_000 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`git pull failed: ${msg}`);
  }
  return loadOrBuild(repoPath, indexPath);
}
