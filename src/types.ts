export interface ParsedField {
  offset: number | null;     // null for enum members
  typeName: string;
  name: string;
  isPointer: boolean;
  fixedSize: number | null;  // non-null for fixed arrays
}

export interface ParsedMethod {
  kind: 'member' | 'virtual' | 'static_address';
  signature: string | null;   // MemberFunction signature string
  vtableIndex: number | null; // VirtualFunction index
  returnType: string;
  name: string;
}

export interface ParsedType {
  name: string;
  namespace: string;
  kind: 'struct' | 'enum' | 'class';
  size: number | null;        // stored as decimal int, display as hex
  inherits: string | null;
  isGenerateInterop: boolean;
  addonName: string | null;
  agentId: number | null;
  filePath: string;
  fields: ParsedField[];
  methods: ParsedMethod[];
}

export interface Index {
  gitSha: string;
  parserVersion: string;
  types: ParsedType[];
}

// Brief type info returned by search_types / get_namespace (no fields/methods)
export type TypeBrief = Omit<ParsedType, 'fields' | 'methods' | 'filePath'> & {
  sizeHex: string | null;
};
