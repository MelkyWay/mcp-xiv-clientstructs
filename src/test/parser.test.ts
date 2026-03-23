import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseFile } from '../parser.js';

// ---------------------------------------------------------------------------
// Namespace
// ---------------------------------------------------------------------------

describe('namespace', () => {
  it('parses file-scoped namespace (semicolon form)', () => {
    const types = parseFile('namespace Foo.Bar;\npublic partial struct Baz {}', 'test.cs');
    assert.equal(types[0]?.namespace, 'Foo.Bar');
  });

  it('parses block-scoped namespace (brace form)', () => {
    const types = parseFile('namespace Foo.Bar {\n  public partial struct Baz {}\n}', 'test.cs');
    assert.equal(types[0]?.namespace, 'Foo.Bar');
  });
});

// ---------------------------------------------------------------------------
// Type declarations
// ---------------------------------------------------------------------------

describe('struct', () => {
  it('parses partial struct', () => {
    const src = `
namespace Test;
[StructLayout(LayoutKind.Explicit, Size = 0x10)]
public unsafe partial struct Foo {}
`;
    const types = parseFile(src, 'test.cs');
    assert.equal(types.length, 1);
    assert.equal(types[0].name, 'Foo');
    assert.equal(types[0].kind, 'struct');
    assert.equal(types[0].size, 0x10);
    assert.equal(types[0].namespace, 'Test');
  });

  it('parses non-partial struct', () => {
    const types = parseFile('namespace Test;\npublic struct Foo {}', 'test.cs');
    assert.equal(types[0]?.name, 'Foo');
    assert.equal(types[0]?.kind, 'struct');
  });

  it('parses sealed partial struct', () => {
    const types = parseFile('namespace Test;\npublic sealed partial struct Foo {}', 'test.cs');
    assert.equal(types[0]?.name, 'Foo');
  });
});

describe('class', () => {
  it('parses partial class with kind "class"', () => {
    const types = parseFile('namespace Test;\npublic partial class Foo {}', 'test.cs');
    assert.equal(types[0]?.name, 'Foo');
    assert.equal(types[0]?.kind, 'class');
  });

  it('parses sealed partial class with kind "class"', () => {
    const types = parseFile('namespace Test;\npublic sealed partial class Encoding {}', 'test.cs');
    assert.equal(types[0]?.kind, 'class');
  });
});

describe('enum', () => {
  it('parses non-partial enum with members', () => {
    const src = `
namespace Test;
public enum Color {
  Red = 0,
  Green = 1,
  Blue = 2,
}
`;
    const types = parseFile(src, 'test.cs');
    assert.equal(types.length, 1);
    assert.equal(types[0].kind, 'enum');
    assert.equal(types[0].name, 'Color');
    assert.equal(types[0].fields.length, 3);
    assert.equal(types[0].fields[0].name, 'Red');
    assert.equal(types[0].fields[1].name, 'Green');
    assert.equal(types[0].fields[2].name, 'Blue');
  });

  it('parses enum members without values', () => {
    const src = `
namespace Test;
public enum Dir {
  North,
  South,
  East,
  West,
}
`;
    const types = parseFile(src, 'test.cs');
    assert.equal(types[0].fields.length, 4);
  });
});

// ---------------------------------------------------------------------------
// Fields
// ---------------------------------------------------------------------------

describe('fields — single-line declarations', () => {
  it('parses [FieldOffset(hex)] public uint Field', () => {
    const src = `
namespace Test;
public partial struct Foo {
  [FieldOffset(0x20)] public uint NumItems;
}
`;
    const types = parseFile(src, 'test.cs');
    assert.equal(types[0].fields.length, 1);
    const f = types[0].fields[0];
    assert.equal(f.offset, 0x20);
    assert.equal(f.typeName, 'uint');
    assert.equal(f.name, 'NumItems');
    assert.equal(f.isPointer, false);
    assert.equal(f.fixedSize, null);
  });

  it('parses decimal offset', () => {
    const src = `namespace Test;\npublic partial struct Foo {\n  [FieldOffset(32)] public byte X;\n}`;
    const types = parseFile(src, 'test.cs');
    assert.equal(types[0].fields[0].offset, 32);
  });

  it('parses compound attribute [FieldOffset(0x30), FixedSizeArray]', () => {
    const src = `
namespace Test;
public partial struct Foo {
  [FieldOffset(0x30), FixedSizeArray] internal FixedSizeArray130<Item> _items;
}
`;
    const types = parseFile(src, 'test.cs');
    assert.equal(types[0].fields.length, 1);
    const f = types[0].fields[0];
    assert.equal(f.offset, 0x30);
    assert.equal(f.typeName, 'FixedSizeArray130<Item>');
    assert.equal(f.name, '_items');
  });

  it('parses compound attribute [FieldOffset(0x87), FixedSizeArray(isString: true)]', () => {
    const src = `
namespace Test;
public partial struct Foo {
  [FieldOffset(0x87), FixedSizeArray(isString: true)] internal FixedSizeArray32<byte> _sender;
}
`;
    const types = parseFile(src, 'test.cs');
    const f = types[0].fields[0];
    assert.equal(f.offset, 0x87);
    assert.equal(f.typeName, 'FixedSizeArray32<byte>');
    assert.equal(f.name, '_sender');
  });

  it('parses C# fixed array field', () => {
    const src = `
namespace Test;
public partial struct Foo {
  [FieldOffset(0x10)] public fixed byte Buffer[32];
}
`;
    const types = parseFile(src, 'test.cs');
    const f = types[0].fields[0];
    assert.equal(f.offset, 0x10);
    assert.equal(f.typeName, 'fixed byte');
    assert.equal(f.name, 'Buffer');
    assert.equal(f.fixedSize, 32);
    assert.equal(f.isPointer, false);
  });

  it('parses pointer field', () => {
    const src = `
namespace Test;
public partial struct Foo {
  [FieldOffset(0x08)] public Bar* Ptr;
}
`;
    const types = parseFile(src, 'test.cs');
    const f = types[0].fields[0];
    assert.equal(f.typeName, 'Bar*');
    assert.equal(f.isPointer, true);
  });

  it('parses generic field', () => {
    const src = `
namespace Test;
public partial struct Foo {
  [FieldOffset(0x00)] public StdVector<Item> Items;
}
`;
    const types = parseFile(src, 'test.cs');
    const f = types[0].fields[0];
    assert.equal(f.typeName, 'StdVector<Item>');
    assert.equal(f.isPointer, false);
  });

  it('parses private field', () => {
    const src = `
namespace Test;
public partial struct Foo {
  [FieldOffset(0x00)] private int _value;
}
`;
    const types = parseFile(src, 'test.cs');
    assert.equal(types[0].fields[0].name, '_value');
  });

  it('parses multiple fields in order', () => {
    const src = `
namespace Test;
public partial struct Foo {
  [FieldOffset(0x00)] public byte A;
  [FieldOffset(0x04)] public byte B;
  [FieldOffset(0x08)] public byte C;
}
`;
    const types = parseFile(src, 'test.cs');
    assert.equal(types[0].fields.length, 3);
    assert.deepEqual(types[0].fields.map(f => f.name), ['A', 'B', 'C']);
    assert.deepEqual(types[0].fields.map(f => f.offset), [0x00, 0x04, 0x08]);
  });
});

// ---------------------------------------------------------------------------
// Methods
// ---------------------------------------------------------------------------

describe('methods', () => {
  it('parses MemberFunction', () => {
    const src = `
namespace Test;
public partial struct Foo {
  [MemberFunction("48 8B C4 55")]
  public void DoThing();
}
`;
    const types = parseFile(src, 'test.cs');
    assert.equal(types[0].methods.length, 1);
    const m = types[0].methods[0];
    assert.equal(m.kind, 'member');
    assert.equal(m.signature, '48 8B C4 55');
    assert.equal(m.name, 'DoThing');
    assert.equal(m.returnType, 'void');
    assert.equal(m.vtableIndex, null);
  });

  it('parses VirtualFunction', () => {
    const src = `
namespace Test;
public partial struct Foo {
  [VirtualFunction(5)]
  public int GetId();
}
`;
    const types = parseFile(src, 'test.cs');
    const m = types[0].methods[0];
    assert.equal(m.kind, 'virtual');
    assert.equal(m.vtableIndex, 5);
    assert.equal(m.name, 'GetId');
    assert.equal(m.returnType, 'int');
    assert.equal(m.signature, null);
  });

  it('parses StaticAddress', () => {
    const src = `
namespace Test;
public partial struct Foo {
  [StaticAddress("48 8B 05 ?? ?? ?? ??", 3)]
  public static Foo* Instance();
}
`;
    const types = parseFile(src, 'test.cs');
    const m = types[0].methods[0];
    assert.equal(m.kind, 'static_address');
    assert.equal(m.name, 'Instance');
  });

  it('parses multiple methods', () => {
    const src = `
namespace Test;
public partial struct Foo {
  [VirtualFunction(0)]
  public void A();
  [VirtualFunction(1)]
  public void B();
  [MemberFunction("AA BB")]
  public void C();
}
`;
    const types = parseFile(src, 'test.cs');
    assert.equal(types[0].methods.length, 3);
  });
});

// ---------------------------------------------------------------------------
// Attributes
// ---------------------------------------------------------------------------

describe('type attributes', () => {
  it('parses Inherits<T>', () => {
    const src = `
namespace Test;
[Inherits<BaseClass>]
public partial struct Child {}
`;
    const types = parseFile(src, 'test.cs');
    assert.equal(types[0].inherits, 'BaseClass');
  });

  it('parses GenerateInterop', () => {
    const src = `namespace Test;\n[GenerateInterop]\npublic partial struct Foo {}`;
    const types = parseFile(src, 'test.cs');
    assert.equal(types[0].isGenerateInterop, true);
  });

  it('isGenerateInterop is false when absent', () => {
    const src = `namespace Test;\npublic partial struct Foo {}`;
    const types = parseFile(src, 'test.cs');
    assert.equal(types[0].isGenerateInterop, false);
  });

  it('parses Addon attribute', () => {
    const src = `
namespace Test;
[Addon("CharaSelectListMenu")]
public partial struct Foo {}
`;
    const types = parseFile(src, 'test.cs');
    assert.equal(types[0].addonName, 'CharaSelectListMenu');
  });

  it('parses StructLayout size (hex)', () => {
    const src = `
namespace Test;
[StructLayout(LayoutKind.Explicit, Size = 0x76E0)]
public partial struct Foo {}
`;
    const types = parseFile(src, 'test.cs');
    assert.equal(types[0].size, 0x76E0);
  });
});

// ---------------------------------------------------------------------------
// Nested types
// ---------------------------------------------------------------------------

describe('nested types', () => {
  it('names nested type Outer.Inner', () => {
    const src = `
namespace Test;
public partial struct Outer {
  public partial struct Inner {}
}
`;
    const types = parseFile(src, 'test.cs');
    assert.ok(types.some(t => t.name === 'Outer.Inner'), 'Outer.Inner not found');
  });

  it('names doubly-nested type Outer.Mid.Inner', () => {
    const src = `
namespace Test;
public partial struct Outer {
  public partial struct Mid {
    public partial struct Inner {}
  }
}
`;
    const types = parseFile(src, 'test.cs');
    assert.ok(types.some(t => t.name === 'Outer.Mid.Inner'), 'Outer.Mid.Inner not found');
  });

  it('emits both outer and inner types', () => {
    const src = `
namespace Test;
public partial struct Outer {
  public partial struct Inner {}
}
`;
    const types = parseFile(src, 'test.cs');
    assert.equal(types.length, 2);
  });

  it('nested types share parent namespace', () => {
    const src = `
namespace Test.NS;
public partial struct Outer {
  public partial struct Inner {}
}
`;
    const types = parseFile(src, 'test.cs');
    assert.ok(types.every(t => t.namespace === 'Test.NS'));
  });
});

// ---------------------------------------------------------------------------
// InfoProxyLetter regression
// Covers: compound attributes, nested types, mixed field visibility, file-scoped namespace
// ---------------------------------------------------------------------------

describe('InfoProxyLetter regression', () => {
  const src = `
namespace FFXIVClientStructs.FFXIV.Client.UI.Info;

[InfoProxy(InfoProxyId.Letter)]
[GenerateInterop]
[Inherits<InfoProxyPageInterface>]
[StructLayout(LayoutKind.Explicit, Size = 0x76E0)]
public unsafe partial struct InfoProxyLetter {
    [FieldOffset(0x20)] public uint NumOfDeniedLetters;
    [FieldOffset(0x24)] public ushort NumAttachments;
    [FieldOffset(0x26)] public byte NumNewLetters;
    [FieldOffset(0x27)] public byte NumLettersFromFriends;
    [FieldOffset(0x28)] public byte NumLettersFromPurchases;
    [FieldOffset(0x29)] public byte NumLettersFromGameMasters;
    [FieldOffset(0x2A)] public bool HasLettersFromGameMasters;
    [FieldOffset(0x2B)] public bool HasLettersFromSupportDesk;
    [FieldOffset(0x30), FixedSizeArray] internal FixedSizeArray130<Letter> _letters;
    [FieldOffset(0x7608)] private Utf8String UnkString0;
    [FieldOffset(0x7670)] private Utf8String UnkString1;

    [GenerateInterop]
    [StructLayout(LayoutKind.Explicit, Size = 0xE8)]
    public unsafe partial struct Letter {
        [FieldOffset(0x00)] public long SenderContentId;
        [FieldOffset(0x08)] public int Timestamp;
        [FieldOffset(0x0C), FixedSizeArray] internal FixedSizeArray5<ItemAttachment> _attachments;
        [FieldOffset(0x74)] public uint Gil;
        [FieldOffset(0x78)] public bool Read;
        [FieldOffset(0x87), FixedSizeArray(isString: true)] internal FixedSizeArray32<byte> _sender;
        [FieldOffset(0xA7), FixedSizeArray(isString: true)] internal FixedSizeArray64<byte> _messagePreview;

        [StructLayout(LayoutKind.Explicit, Size = 0x8)]
        public partial struct ItemAttachment {
            [FieldOffset(0x0)] public uint ItemId;
            [FieldOffset(0x4)] public uint Count;
        }
    }
}
`;

  it('produces 3 types total (InfoProxyLetter, Letter, ItemAttachment)', () => {
    const types = parseFile(src, 'test.cs');
    assert.equal(types.length, 3);
  });

  it('InfoProxyLetter has 11 fields including compound-attribute _letters', () => {
    const types = parseFile(src, 'test.cs');
    const t = types.find(t => t.name === 'InfoProxyLetter')!;
    assert.ok(t);
    assert.equal(t.fields.length, 11);
    assert.ok(t.fields.some(f => f.name === '_letters'), '_letters field missing');
  });

  it('Letter has 7 fields including compound-attribute fields', () => {
    const types = parseFile(src, 'test.cs');
    const t = types.find(t => t.name === 'InfoProxyLetter.Letter')!;
    assert.ok(t);
    assert.equal(t.fields.length, 7);
    assert.ok(t.fields.some(f => f.name === '_attachments'), '_attachments missing');
    assert.ok(t.fields.some(f => f.name === '_sender'), '_sender missing');
    assert.ok(t.fields.some(f => f.name === '_messagePreview'), '_messagePreview missing');
  });

  it('ItemAttachment has 2 fields', () => {
    const types = parseFile(src, 'test.cs');
    const t = types.find(t => t.name === 'InfoProxyLetter.Letter.ItemAttachment')!;
    assert.ok(t);
    assert.equal(t.fields.length, 2);
  });

  it('InfoProxyLetter has correct namespace', () => {
    const types = parseFile(src, 'test.cs');
    const t = types.find(t => t.name === 'InfoProxyLetter')!;
    assert.equal(t.namespace, 'FFXIVClientStructs.FFXIV.Client.UI.Info');
  });

  it('InfoProxyLetter has correct size', () => {
    const types = parseFile(src, 'test.cs');
    const t = types.find(t => t.name === 'InfoProxyLetter')!;
    assert.equal(t.size, 0x76E0);
  });

  it('InfoProxyLetter has Inherits and GenerateInterop', () => {
    const types = parseFile(src, 'test.cs');
    const t = types.find(t => t.name === 'InfoProxyLetter')!;
    assert.equal(t.inherits, 'InfoProxyPageInterface');
    assert.equal(t.isGenerateInterop, true);
  });
});
