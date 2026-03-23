import { ParsedType, TypeBrief } from './types.js';

function toHex(n: number | null): string | null {
  return n === null ? null : '0x' + n.toString(16).toUpperCase();
}

function toBrief(t: ParsedType): TypeBrief {
  return {
    name: t.name,
    namespace: t.namespace,
    kind: t.kind,
    size: t.size,
    sizeHex: toHex(t.size),
    inherits: t.inherits,
    isGenerateInterop: t.isGenerateInterop,
    addonName: t.addonName,
    agentId: t.agentId,
  };
}

export function searchTypes(types: ParsedType[], query: string, limit = 50): TypeBrief[] {
  const q = query.toLowerCase();
  const scored = types
    .filter(t => t.name.toLowerCase().includes(q) || t.namespace.toLowerCase().includes(q))
    .map(t => {
      const name = t.name.toLowerCase();
      const score = name === q ? 0 : name.startsWith(q) ? 1 : 2;
      return { t, score };
    })
    .sort((a, b) => a.score - b.score || a.t.name.localeCompare(b.t.name))
    .slice(0, limit)
    .map(({ t }) => toBrief(t));
  return scored;
}

export function getType(types: ParsedType[], name: string): object[] {
  const q = name.toLowerCase();
  const matches = types.filter(t =>
    t.name.toLowerCase() === q ||
    `${t.namespace}.${t.name}`.toLowerCase() === q
  );
  return matches.map(t => ({
    name: t.name,
    namespace: t.namespace,
    kind: t.kind,
    size: t.size,
    sizeHex: toHex(t.size),
    inherits: t.inherits,
    isGenerateInterop: t.isGenerateInterop,
    addonName: t.addonName,
    agentId: t.agentId,
    fields: t.fields.map(f => ({
      ...f,
      offsetHex: toHex(f.offset),
    })),
    methods: t.methods,
  }));
}

export function listNamespaces(types: ParsedType[]): string[] {
  return [...new Set(types.map(t => t.namespace))].sort();
}

export function getNamespace(types: ParsedType[], namespace: string): TypeBrief[] {
  const q = namespace.toLowerCase();
  return types
    .filter(t => t.namespace.toLowerCase() === q)
    .map(toBrief)
    .sort((a, b) => a.name.localeCompare(b.name));
}
