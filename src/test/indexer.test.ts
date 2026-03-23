import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mergePartialTypes, PARSER_VERSION } from '../indexer.js';
import { ParsedType } from '../types.js';

function makeType(name: string, namespace: string, overrides: Partial<ParsedType> = {}): ParsedType {
  return {
    name, namespace, kind: 'struct',
    size: null, inherits: null, isGenerateInterop: false,
    addonName: null, agentId: null, filePath: 'test.cs',
    fields: [], methods: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// mergePartialTypes
// ---------------------------------------------------------------------------

describe('mergePartialTypes', () => {
  it('leaves non-duplicate types unchanged', () => {
    const types = [makeType('Foo', 'NS'), makeType('Bar', 'NS')];
    const result = mergePartialTypes(types);
    assert.equal(result.length, 2);
  });

  it('merges two partial declarations into one', () => {
    const a = makeType('Foo', 'NS', { fields: [{ offset: 0, typeName: 'int', name: 'A', isPointer: false, fixedSize: null }] });
    const b = makeType('Foo', 'NS', { fields: [{ offset: 4, typeName: 'int', name: 'B', isPointer: false, fixedSize: null }] });
    const result = mergePartialTypes([a, b]);
    assert.equal(result.length, 1);
    assert.equal(result[0].fields.length, 2);
    assert.deepEqual(result[0].fields.map(f => f.name), ['A', 'B']);
  });

  it('merges methods from multiple partial declarations', () => {
    const method = (name: string) => ({ kind: 'member' as const, signature: 'AA', vtableIndex: null, returnType: 'void', name });
    const a = makeType('Foo', 'NS', { methods: [method('DoA')] });
    const b = makeType('Foo', 'NS', { methods: [method('DoB')] });
    const result = mergePartialTypes([a, b]);
    assert.equal(result[0].methods.length, 2);
  });

  it('takes size from first declaration that has it', () => {
    const a = makeType('Foo', 'NS', { size: null });
    const b = makeType('Foo', 'NS', { size: 0x100 });
    const result = mergePartialTypes([a, b]);
    assert.equal(result[0].size, 0x100);
  });

  it('does not overwrite size once set', () => {
    const a = makeType('Foo', 'NS', { size: 0x80 });
    const b = makeType('Foo', 'NS', { size: 0x100 });
    const result = mergePartialTypes([a, b]);
    assert.equal(result[0].size, 0x80);
  });

  it('isGenerateInterop is true if any partial has it', () => {
    const a = makeType('Foo', 'NS', { isGenerateInterop: false });
    const b = makeType('Foo', 'NS', { isGenerateInterop: true });
    const result = mergePartialTypes([a, b]);
    assert.equal(result[0].isGenerateInterop, true);
  });

  it('takes inherits from first declaration that has it', () => {
    const a = makeType('Foo', 'NS', { inherits: null });
    const b = makeType('Foo', 'NS', { inherits: 'Base' });
    const result = mergePartialTypes([a, b]);
    assert.equal(result[0].inherits, 'Base');
  });

  it('does not merge types with same name but different namespaces', () => {
    const a = makeType('Foo', 'NS.A');
    const b = makeType('Foo', 'NS.B');
    const result = mergePartialTypes([a, b]);
    assert.equal(result.length, 2);
  });

  it('preserves order of first occurrence', () => {
    const types = [makeType('B', 'NS'), makeType('A', 'NS'), makeType('B', 'NS')];
    const result = mergePartialTypes(types);
    assert.equal(result[0].name, 'B');
    assert.equal(result[1].name, 'A');
  });
});

// ---------------------------------------------------------------------------
// PARSER_VERSION
// ---------------------------------------------------------------------------

describe('PARSER_VERSION', () => {
  it('is a non-empty string', () => {
    assert.ok(typeof PARSER_VERSION === 'string' && PARSER_VERSION.length > 0);
  });
});
