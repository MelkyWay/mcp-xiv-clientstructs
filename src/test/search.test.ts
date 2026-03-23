import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { searchTypes, getType, listNamespaces, getNamespace } from '../search.js';
import { ParsedType } from '../types.js';

function makeType(name: string, namespace: string, kind: 'struct' | 'enum' = 'struct'): ParsedType {
  return {
    name, namespace, kind,
    size: null, inherits: null, isGenerateInterop: false,
    addonName: null, agentId: null, filePath: 'test.cs',
    fields: [], methods: [],
  };
}

const NS_GAME  = 'FFXIVClientStructs.FFXIV.Client.Game';
const NS_UI    = 'FFXIVClientStructs.FFXIV.Client.UI';
const NS_OTHER = 'FFXIVClientStructs.FFXIV.Other';

const types: ParsedType[] = [
  makeType('ActionManager',  NS_GAME),
  makeType('ActionList',     NS_GAME),
  makeType('ActionColor',    NS_GAME),
  makeType('PartyManager',   NS_GAME),
  makeType('ActionManager',  NS_OTHER),   // same name, different namespace
  makeType('AddonActionBar', NS_UI),
  makeType('Color',          NS_GAME, 'enum'),
];

// ---------------------------------------------------------------------------
// searchTypes
// ---------------------------------------------------------------------------

describe('searchTypes', () => {
  it('returns results for a matching query', () => {
    const results = searchTypes(types, 'Action');
    assert.ok(results.length > 0);
  });

  it('exact name match scores first', () => {
    const results = searchTypes(types, 'ActionManager');
    assert.equal(results[0].name, 'ActionManager');
  });

  it('prefix matches score before contains matches', () => {
    // 'Addon' is a prefix of AddonActionBar; 'action' is only contained (not prefix) in AddonActionBar
    // So searching 'action': ActionManager/ActionList/ActionColor are prefixes, AddonActionBar is contains-only
    const results = searchTypes(types, 'action');
    const prefixNames   = results.filter(r =>  r.name.toLowerCase().startsWith('action')).map(r => r.name);
    const containsNames = results.filter(r => !r.name.toLowerCase().startsWith('action')).map(r => r.name);
    // All prefix matches should appear before any contains-only match
    if (prefixNames.length > 0 && containsNames.length > 0) {
      const lastPrefixIdx   = results.map(r => r.name).lastIndexOf(prefixNames[prefixNames.length - 1]);
      const firstContainsIdx = results.map(r => r.name).indexOf(containsNames[0]);
      assert.ok(lastPrefixIdx < firstContainsIdx, 'a prefix match appeared after a contains-only match');
    }
  });

  it('is case-insensitive', () => {
    const results = searchTypes(types, 'actionmanager');
    assert.ok(results.some(r => r.name === 'ActionManager'));
  });

  it('matches on namespace substring', () => {
    const results = searchTypes(types, 'Client.UI');
    assert.ok(results.length > 0);
    assert.ok(results.every(r => r.namespace.includes('Client.UI')));
  });

  it('returns TypeBrief shape — no fields or methods', () => {
    const results = searchTypes(types, 'ActionManager');
    assert.ok(results.length > 0);
    assert.ok(!('fields' in results[0]));
    assert.ok(!('methods' in results[0]));
  });

  it('respects limit parameter', () => {
    const results = searchTypes(types, 'a', 2);
    assert.ok(results.length <= 2);
  });

  it('returns empty array for no match', () => {
    const results = searchTypes(types, 'ZZZNonExistent');
    assert.equal(results.length, 0);
  });
});

// ---------------------------------------------------------------------------
// getType
// ---------------------------------------------------------------------------

describe('getType', () => {
  it('finds by simple name', () => {
    const results = getType(types, 'PartyManager');
    assert.equal(results.length, 1);
  });

  it('finds by fully qualified name', () => {
    const results = getType(types, `${NS_GAME}.ActionManager`);
    assert.equal(results.length, 1);
    assert.equal((results[0] as any).namespace, NS_GAME);
  });

  it('returns all matches when name exists in multiple namespaces', () => {
    const results = getType(types, 'ActionManager');
    assert.equal(results.length, 2);
  });

  it('is case-insensitive', () => {
    const results = getType(types, 'partymanager');
    assert.equal(results.length, 1);
  });

  it('includes fields and methods in result', () => {
    const results = getType(types, 'PartyManager');
    assert.ok('fields' in results[0]);
    assert.ok('methods' in results[0]);
  });

  it('returns empty array for unknown type', () => {
    const results = getType(types, 'DoesNotExist');
    assert.equal(results.length, 0);
  });
});

// ---------------------------------------------------------------------------
// listNamespaces
// ---------------------------------------------------------------------------

describe('listNamespaces', () => {
  it('returns unique namespaces', () => {
    const ns = listNamespaces(types);
    assert.equal(ns.length, new Set(ns).size);
  });

  it('returns sorted namespaces', () => {
    const ns = listNamespaces(types);
    assert.deepEqual(ns, [...ns].sort());
  });

  it('includes all distinct namespaces from the type list', () => {
    const ns = listNamespaces(types);
    assert.ok(ns.includes(NS_GAME));
    assert.ok(ns.includes(NS_UI));
    assert.ok(ns.includes(NS_OTHER));
  });
});

// ---------------------------------------------------------------------------
// getNamespace
// ---------------------------------------------------------------------------

describe('getNamespace', () => {
  it('returns only types in the specified namespace', () => {
    const results = getNamespace(types, NS_GAME);
    assert.ok(results.length > 0);
    assert.ok(results.every(r => r.namespace === NS_GAME));
  });

  it('is case-insensitive', () => {
    const results = getNamespace(types, NS_GAME.toLowerCase());
    assert.ok(results.length > 0);
  });

  it('returns results sorted by name', () => {
    const results = getNamespace(types, NS_GAME);
    const names = results.map(r => r.name);
    assert.deepEqual(names, [...names].sort());
  });

  it('returns TypeBrief shape — no fields or methods', () => {
    const results = getNamespace(types, NS_GAME);
    assert.ok(!('fields' in results[0]));
  });

  it('returns empty array for unknown namespace', () => {
    const results = getNamespace(types, 'Does.Not.Exist');
    assert.equal(results.length, 0);
  });
});
