import { ParsedField, ParsedMethod, ParsedType } from './types.js';

const RE_NAMESPACE       = /^namespace\s+([\w.]+)/;
const RE_TYPE_DECL       = /^\s*public\s+(?:unsafe\s+)?(?:sealed\s+)?(?:partial\s+)?(struct|enum|class)\s+(\w+)/;
const RE_STRUCT_LAYOUT   = /\[StructLayout\s*\(\s*LayoutKind\.Explicit\s*,\s*Size\s*=\s*(0x[\dA-Fa-f]+|\d+)\s*\)/;
const RE_INHERITS        = /\[Inherits\s*<\s*([\w.]+)\s*>/;
const RE_GENERATE_INTEROP = /\[GenerateInterop/;
const RE_ADDON           = /\[Addon(?:Attribute)?\s*\(\s*"([^"]+)"/;
const RE_AGENT           = /\[Agent(?:Attribute)?\s*\(\s*(\d+)/;
const RE_FIELD_OFFSET    = /\[FieldOffset\s*\(\s*(0x[\dA-Fa-f]+|\d+)\s*\)/;  // no trailing \] — supports compound attrs e.g. [FieldOffset(0x30), FixedSizeArray]
const RE_FIELD_DECL      = /^\s*(?:public|internal|private)\s+(?:new\s+)?(?:readonly\s+)?([\w*<>[\],\s]+?)\s+(\w+)\s*(?:;|{)/;
const RE_FIELD_FIXED     = /^\s*(?:public|internal|private)\s+fixed\s+(\w+)\s+(\w+)\s*\[\s*(0x[\dA-Fa-f]+|\d+)\s*\]/;
const RE_MEMBER_FUNC     = /\[MemberFunction\s*\(\s*"([^"]*)"\s*\)\]/;
const RE_VIRTUAL_FUNC    = /\[VirtualFunction\s*\(\s*(\d+)\s*\)\]/;
const RE_STATIC_ADDR     = /\[StaticAddress\s*\(/;
const RE_METHOD_DECL     = /^\s*(?:public|internal|private)\s+(?:static\s+)?(?:partial\s+)?([\w*<>[\]?]+)\s+(\w+)\s*\(/;

function parseHex(val: string): number {
  return val.startsWith('0x') || val.startsWith('0X')
    ? parseInt(val, 16)
    : parseInt(val, 10);
}

export function parseFile(content: string, filePath: string): ParsedType[] {
  const lines = content.split('\n');
  const results: ParsedType[] = [];

  let namespace = '';
  // Stack of currently open type contexts: [{ type, startDepth }]
  const typeStack: Array<{ type: ParsedType; depth: number }> = [];
  let braceDepth = 0;
  let pendingAttrs: string[] = [];
  let pendingMethodAttr: { kind: 'member' | 'virtual' | 'static_address'; sig: string | null; idx: number | null } | null = null;

  for (const rawLine of lines) {
    const line = rawLine;

    // Track brace depth
    for (const ch of line) {
      if (ch === '{') braceDepth++;
      else if (ch === '}') {
        braceDepth--;
        // Pop type context if we've closed its brace
        if (typeStack.length > 0 && braceDepth < typeStack[typeStack.length - 1].depth) {
          const finished = typeStack.pop()!;
          results.push(finished.type);
        }
      }
    }

    // Namespace
    const nsMatch = RE_NAMESPACE.exec(line);
    if (nsMatch) {
      namespace = nsMatch[1];
      pendingAttrs = [];
      continue;
    }

    // Accumulate attribute lines
    const trimmed = line.trim();
    if (trimmed.startsWith('[') || trimmed.startsWith('//')) {
      if (!trimmed.startsWith('//')) {
        // Handle inline [FieldOffset(...)] field declarations: [FieldOffset(0x20)] public uint Field;
        if (typeStack.length > 0 && RE_FIELD_OFFSET.test(trimmed)) {
          const offsetMatch = RE_FIELD_OFFSET.exec(trimmed)!;
          const offset = parseHex(offsetMatch[1]);
          const currentType = typeStack[typeStack.length - 1].type;
          // Strip leading [attr] blocks to isolate the field declaration
          const afterAttrs = trimmed.replace(/^(\[[^\]]*\]\s*)+/, '').trim();
          if (afterAttrs) {
            const fixedMatch = RE_FIELD_FIXED.exec(`  ${afterAttrs}`);
            if (fixedMatch) {
              currentType.fields.push({ offset, typeName: `fixed ${fixedMatch[1]}`, name: fixedMatch[2], isPointer: false, fixedSize: parseHex(fixedMatch[3]) });
              pendingAttrs = [];
              pendingMethodAttr = null;
              continue;
            }
            const fieldMatch = RE_FIELD_DECL.exec(`  ${afterAttrs}`);
            if (fieldMatch) {
              const typeName = fieldMatch[1].trim();
              currentType.fields.push({ offset, typeName, name: fieldMatch[2], isPointer: typeName.includes('*'), fixedSize: null });
              pendingAttrs = [];
              pendingMethodAttr = null;
              continue;
            }
          }
        }
        // Handle method attribute lines so they don't get lost in pendingAttrs
        if (typeStack.length > 0) {
          const memberMatch = RE_MEMBER_FUNC.exec(trimmed);
          const virtualMatch = RE_VIRTUAL_FUNC.exec(trimmed);
          const staticAddrMatch = RE_STATIC_ADDR.test(trimmed);
          if (memberMatch) {
            pendingMethodAttr = { kind: 'member', sig: memberMatch[1], idx: null };
            pendingAttrs = [];
            continue;
          }
          if (virtualMatch) {
            pendingMethodAttr = { kind: 'virtual', sig: null, idx: parseInt(virtualMatch[1], 10) };
            pendingAttrs = [];
            continue;
          }
          if (staticAddrMatch) {
            pendingMethodAttr = { kind: 'static_address', sig: null, idx: null };
            pendingAttrs = [];
            continue;
          }
        }
        pendingAttrs.push(trimmed);
      }
      continue;
    }

    // Type declaration
    const typeMatch = RE_TYPE_DECL.exec(line);
    if (typeMatch) {
      const rawKind = typeMatch[1];
      const kind: 'struct' | 'enum' | 'class' = rawKind === 'enum' ? 'enum' : rawKind === 'class' ? 'class' : 'struct';
      const typeName = typeMatch[2];

      // Build qualified name if nested
      const parentName = typeStack.length > 0 ? typeStack[typeStack.length - 1].type.name : null;
      const fullName = parentName ? `${parentName}.${typeName}` : typeName;

      // Extract attributes
      const attrBlock = pendingAttrs.join(' ');
      const layoutMatch = RE_STRUCT_LAYOUT.exec(attrBlock);
      const inheritsMatch = RE_INHERITS.exec(attrBlock);
      const addonMatch = RE_ADDON.exec(attrBlock);
      const agentMatch = RE_AGENT.exec(attrBlock);

      const parsedType: ParsedType = {
        name: fullName,
        namespace,
        kind,
        size: layoutMatch ? parseHex(layoutMatch[1]) : null,
        inherits: inheritsMatch ? inheritsMatch[1] : null,
        isGenerateInterop: RE_GENERATE_INTEROP.test(attrBlock),
        addonName: addonMatch ? addonMatch[1] : null,
        agentId: agentMatch ? parseInt(agentMatch[1], 10) : null,
        filePath,
        fields: [],
        methods: [],
      };

      typeStack.push({ type: parsedType, depth: braceDepth });
      pendingAttrs = [];
      pendingMethodAttr = null;
      continue;
    }

    // Only process field/method content if we're inside a type
    if (typeStack.length === 0) {
      if (!trimmed.startsWith('[')) pendingAttrs = [];
      continue;
    }

    const currentType = typeStack[typeStack.length - 1].type;

    // Method attribute lines (stored separately from type attrs)
    const memberMatch = RE_MEMBER_FUNC.exec(trimmed);
    const virtualMatch = RE_VIRTUAL_FUNC.exec(trimmed);
    const staticAddrMatch = RE_STATIC_ADDR.test(trimmed);

    if (memberMatch) {
      pendingMethodAttr = { kind: 'member', sig: memberMatch[1], idx: null };
      pendingAttrs = [];
      continue;
    }
    if (virtualMatch) {
      pendingMethodAttr = { kind: 'virtual', sig: null, idx: parseInt(virtualMatch[1], 10) };
      pendingAttrs = [];
      continue;
    }
    if (staticAddrMatch) {
      pendingMethodAttr = { kind: 'static_address', sig: null, idx: null };
      pendingAttrs = [];
      continue;
    }

    // Field with FieldOffset
    const offsetAttr = pendingAttrs.find(a => RE_FIELD_OFFSET.test(a));
    if (offsetAttr) {
      const offsetMatch = RE_FIELD_OFFSET.exec(offsetAttr)!;
      const offset = parseHex(offsetMatch[1]);

      // Fixed array variant
      const fixedMatch = RE_FIELD_FIXED.exec(line);
      if (fixedMatch) {
        currentType.fields.push({
          offset,
          typeName: `fixed ${fixedMatch[1]}`,
          name: fixedMatch[2],
          isPointer: false,
          fixedSize: parseHex(fixedMatch[3]),
        });
        pendingAttrs = [];
        pendingMethodAttr = null;
        continue;
      }

      // Regular field
      const fieldMatch = RE_FIELD_DECL.exec(line);
      if (fieldMatch) {
        const typeName = fieldMatch[1].trim();
        currentType.fields.push({
          offset,
          typeName,
          name: fieldMatch[2],
          isPointer: typeName.includes('*'),
          fixedSize: null,
        });
        pendingAttrs = [];
        pendingMethodAttr = null;
        continue;
      }
    }

    // Enum member (no offset)
    if (currentType.kind === 'enum' && /^\s*\w+\s*(?:=\s*[^,]+)?\s*,?\s*$/.test(line) && !/^\s*\/\//.test(line)) {
      const enumMemberMatch = /^\s*(\w+)\s*(?:=\s*[^,\s]+)?\s*,?/.exec(trimmed);
      if (enumMemberMatch && enumMemberMatch[1] !== 'public' && enumMemberMatch[1] !== 'private') {
        currentType.fields.push({
          offset: null,
          typeName: '',
          name: enumMemberMatch[1],
          isPointer: false,
          fixedSize: null,
        });
        pendingAttrs = [];
        pendingMethodAttr = null;
        continue;
      }
    }

    // Method declaration (after a method attribute)
    if (pendingMethodAttr) {
      const methodMatch = RE_METHOD_DECL.exec(line);
      if (methodMatch) {
        const method: ParsedMethod = {
          kind: pendingMethodAttr.kind,
          signature: pendingMethodAttr.sig,
          vtableIndex: pendingMethodAttr.idx,
          returnType: methodMatch[1].trim(),
          name: methodMatch[2],
        };
        currentType.methods.push(method);
        pendingMethodAttr = null;
        pendingAttrs = [];
        continue;
      }
    }

    // Non-attribute, non-blank line clears pending attrs
    if (trimmed !== '' && !trimmed.startsWith('[') && !trimmed.startsWith('//')) {
      pendingAttrs = [];
      pendingMethodAttr = null;
    }
  }

  // Flush any remaining open types (malformed files)
  for (const ctx of typeStack.reverse()) {
    results.push(ctx.type);
  }

  return results;
}
