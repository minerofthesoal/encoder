'use strict';

// ============================================================
//  Utility Functions
// ============================================================

function utf8ToBytes(str) {
  return new TextEncoder().encode(str);
}

function bytesToUtf8(bytes) {
  return new TextDecoder().decode(
    bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  );
}

function bytesToHex(bytes) {
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex) {
  hex = hex.replace(/\s/g, '');
  if (hex.length % 2 !== 0) throw new Error('Invalid hex string: odd length');
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    const v = parseInt(hex.slice(i, i + 2), 16);
    if (Number.isNaN(v)) throw new Error(`Invalid hex at position ${i}`);
    out[i / 2] = v;
  }
  return out;
}

// ============================================================
//  Encoder Registry
// ============================================================

class EncoderRegistry {
  constructor() {
    /** @type {Map<string, object>} */
    this._encoders = new Map();
  }

  /** Register an encoder definition. */
  register(enc) {
    if (!enc.id || !enc.name || typeof enc.encode !== 'function') {
      throw new Error('Encoder must have id, name, and encode()');
    }
    this._encoders.set(enc.id, Object.freeze({
      isDecodable: true,
      category: 'Other',
      options: [],
      description: '',
      ...enc,
    }));
  }

  get(id)        { return this._encoders.get(id) || null; }
  has(id)        { return this._encoders.has(id); }
  getAll()       { return Array.from(this._encoders.values()); }
  unregister(id) { this._encoders.delete(id); }

  /** Returns Map<category, encoder[]> preserving insertion order. */
  getCategories() {
    const cats = new Map();
    for (const enc of this._encoders.values()) {
      if (!cats.has(enc.category)) cats.set(enc.category, []);
      cats.get(enc.category).push(enc);
    }
    return cats;
  }
}

const registry = new EncoderRegistry();

// ============================================================
//  Standard Encodings
// ============================================================

registry.register({
  id: 'base64',
  name: 'Base64',
  category: 'Standard Encodings',
  description: 'RFC 4648 Base64 encoding with full UTF-8 support.',
  encode(input) {
    const bytes = utf8ToBytes(input);
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin);
  },
  decode(input) {
    const bin = atob(input.trim());
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytesToUtf8(bytes);
  },
});

// ---- Base32 (RFC 4648) ----

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

registry.register({
  id: 'base32',
  name: 'Base32',
  category: 'Standard Encodings',
  description: 'RFC 4648 Base32 encoding (A-Z, 2-7).',
  encode(input) {
    const bytes = utf8ToBytes(input);
    let bits = '';
    for (const b of bytes) bits += b.toString(2).padStart(8, '0');
    while (bits.length % 5) bits += '0';
    let out = '';
    for (let i = 0; i < bits.length; i += 5) {
      out += B32[parseInt(bits.slice(i, i + 5), 2)];
    }
    while (out.length % 8) out += '=';
    return out;
  },
  decode(input) {
    const clean = input.replace(/=+$/, '').toUpperCase();
    let bits = '';
    for (const ch of clean) {
      const idx = B32.indexOf(ch);
      if (idx === -1) throw new Error(`Invalid Base32 character: "${ch}"`);
      bits += idx.toString(2).padStart(5, '0');
    }
    const bytes = [];
    for (let i = 0; i + 8 <= bits.length; i += 8) {
      bytes.push(parseInt(bits.slice(i, i + 8), 2));
    }
    return bytesToUtf8(new Uint8Array(bytes));
  },
});

// ---- Hex (Base16) ----

registry.register({
  id: 'hex',
  name: 'Hex (Base16)',
  category: 'Standard Encodings',
  description: 'Hexadecimal byte encoding. Each byte becomes two hex digits.',
  options: [
    { id: 'separator', name: 'Byte separator', type: 'select',
      choices: ['none', 'space', 'colon'], default: 'none' },
    { id: 'uppercase', name: 'Uppercase', type: 'checkbox', default: false },
  ],
  encode(input, opts = {}) {
    const hex = bytesToHex(utf8ToBytes(input));
    let out = opts.uppercase ? hex.toUpperCase() : hex;
    if (opts.separator === 'space') {
      out = out.match(/.{1,2}/g).join(' ');
    } else if (opts.separator === 'colon') {
      out = out.match(/.{1,2}/g).join(':');
    }
    return out;
  },
  decode(input) {
    return bytesToUtf8(hexToBytes(input.replace(/[:\s]/g, '')));
  },
});

// ---- Binary (Base2) ----

registry.register({
  id: 'binary',
  name: 'Binary',
  category: 'Standard Encodings',
  description: 'Binary byte representation (8-bit groups).',
  encode(input) {
    return Array.from(utf8ToBytes(input), b => b.toString(2).padStart(8, '0')).join(' ');
  },
  decode(input) {
    const groups = input.trim().split(/\s+/);
    const bytes = new Uint8Array(groups.map(g => {
      const v = parseInt(g, 2);
      if (Number.isNaN(v)) throw new Error(`Invalid binary group: "${g}"`);
      return v;
    }));
    return bytesToUtf8(bytes);
  },
});

// ---- Octal (Base8) ----

registry.register({
  id: 'octal',
  name: 'Octal',
  category: 'Standard Encodings',
  description: 'Octal byte representation (3-digit groups).',
  encode(input) {
    return Array.from(utf8ToBytes(input), b => b.toString(8).padStart(3, '0')).join(' ');
  },
  decode(input) {
    const groups = input.trim().split(/\s+/);
    const bytes = new Uint8Array(groups.map(g => {
      const v = parseInt(g, 8);
      if (Number.isNaN(v) || v > 255) throw new Error(`Invalid octal group: "${g}"`);
      return v;
    }));
    return bytesToUtf8(bytes);
  },
});

// ---- ASCII85 (Base85) ----

registry.register({
  id: 'ascii85',
  name: 'ASCII85',
  category: 'Standard Encodings',
  description: 'Ascii85 / Base85 encoding (Adobe variant with <~ ~> delimiters).',
  encode(input) {
    const bytes = utf8ToBytes(input);
    let out = '<~';
    for (let i = 0; i < bytes.length; i += 4) {
      const len = Math.min(4, bytes.length - i);
      let val = 0;
      for (let j = 0; j < 4; j++) {
        val = val * 256 + (j < len ? bytes[i + j] : 0);
      }
      if (val === 0 && len === 4) { out += 'z'; continue; }
      const chars = [];
      for (let j = 4; j >= 0; j--) {
        chars[j] = String.fromCharCode((val % 85) + 33);
        val = Math.floor(val / 85);
      }
      out += chars.slice(0, len + 1).join('');
    }
    return out + '~>';
  },
  decode(input) {
    let data = input.trim();
    if (data.startsWith('<~')) data = data.slice(2);
    if (data.endsWith('~>')) data = data.slice(0, -2);
    data = data.replace(/\s/g, '');

    const bytes = [];
    let i = 0;
    while (i < data.length) {
      if (data[i] === 'z') {
        bytes.push(0, 0, 0, 0);
        i++;
        continue;
      }
      const chunk = data.slice(i, i + 5);
      const padded = chunk + 'uuuuu'.slice(chunk.length);
      let val = 0;
      for (let j = 0; j < 5; j++) {
        const c = padded.charCodeAt(j) - 33;
        if (c < 0 || c > 84) throw new Error(`Invalid Ascii85 character at ${i + j}`);
        val = val * 85 + c;
      }
      const outLen = chunk.length - 1;
      for (let j = 3; j >= 0; j--) {
        if (3 - j < outLen) bytes.push((val >> (j * 8)) & 0xff);
      }
      i += chunk.length;
    }
    return bytesToUtf8(new Uint8Array(bytes));
  },
});

// ---- URL Encoding ----

registry.register({
  id: 'url',
  name: 'URL Encoding',
  category: 'Standard Encodings',
  description: 'Percent-encodes characters for safe use in URLs.',
  encode(input) { return encodeURIComponent(input); },
  decode(input) { return decodeURIComponent(input.trim()); },
});

// ---- HTML Entities ----

registry.register({
  id: 'html-entities',
  name: 'HTML Entities',
  category: 'Standard Encodings',
  description: 'Encodes characters as HTML numeric entities (&#xHH;).',
  encode(input) {
    return Array.from(input).map(ch => `&#x${ch.codePointAt(0).toString(16).toUpperCase()};`).join('');
  },
  decode(input) {
    return input.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
      String.fromCodePoint(parseInt(hex, 16))
    ).replace(/&#(\d+);/g, (_, dec) =>
      String.fromCodePoint(parseInt(dec, 10))
    );
  },
});

// ---- Unicode Escape ----

registry.register({
  id: 'unicode-escape',
  name: 'Unicode Escape',
  category: 'Standard Encodings',
  description: 'Encodes each character as \\uXXXX (or \\u{XXXXX} for supplementary).',
  encode(input) {
    return Array.from(input).map(ch => {
      const cp = ch.codePointAt(0);
      return cp > 0xffff
        ? `\\u{${cp.toString(16).toUpperCase()}}`
        : `\\u${cp.toString(16).toUpperCase().padStart(4, '0')}`;
    }).join('');
  },
  decode(input) {
    return input
      .replace(/\\u\{([0-9a-fA-F]+)\}/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
      .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCodePoint(parseInt(h, 16)));
  },
});

// ============================================================
//  Classical Ciphers
// ============================================================

registry.register({
  id: 'rot13',
  name: 'ROT13',
  category: 'Classical Ciphers',
  description: 'Rotates each Latin letter by 13 positions. Self-inverse.',
  encode(input) {
    return input.replace(/[a-zA-Z]/g, ch => {
      const base = ch <= 'Z' ? 65 : 97;
      return String.fromCharCode(((ch.charCodeAt(0) - base + 13) % 26) + base);
    });
  },
  decode(input) { return this.encode(input); },
});

registry.register({
  id: 'caesar',
  name: 'Caesar Cipher',
  category: 'Classical Ciphers',
  description: 'Shifts each Latin letter by a configurable amount.',
  options: [
    { id: 'shift', name: 'Shift amount', type: 'number', default: 3, min: 1, max: 25 },
  ],
  encode(input, opts = {}) {
    const shift = ((parseInt(opts.shift, 10) || 3) % 26 + 26) % 26;
    return input.replace(/[a-zA-Z]/g, ch => {
      const base = ch <= 'Z' ? 65 : 97;
      return String.fromCharCode(((ch.charCodeAt(0) - base + shift) % 26) + base);
    });
  },
  decode(input, opts = {}) {
    const shift = ((parseInt(opts.shift, 10) || 3) % 26 + 26) % 26;
    return input.replace(/[a-zA-Z]/g, ch => {
      const base = ch <= 'Z' ? 65 : 97;
      return String.fromCharCode(((ch.charCodeAt(0) - base - shift + 26) % 26) + base);
    });
  },
});

registry.register({
  id: 'atbash',
  name: 'Atbash Cipher',
  category: 'Classical Ciphers',
  description: 'Reverses the alphabet: A=Z, B=Y, C=X, etc. Self-inverse.',
  encode(input) {
    return input.replace(/[a-zA-Z]/g, ch => {
      const base = ch <= 'Z' ? 65 : 97;
      return String.fromCharCode(base + 25 - (ch.charCodeAt(0) - base));
    });
  },
  decode(input) { return this.encode(input); },
});

registry.register({
  id: 'vigenere',
  name: 'Vigenere Cipher',
  category: 'Classical Ciphers',
  description: 'Polyalphabetic substitution cipher with a keyword.',
  options: [
    { id: 'key', name: 'Keyword', type: 'text', default: 'SECRET' },
  ],
  encode(input, opts = {}) {
    const key = (opts.key || 'SECRET').toUpperCase().replace(/[^A-Z]/g, '');
    if (!key) throw new Error('Keyword must contain at least one letter');
    let ki = 0;
    return input.replace(/[a-zA-Z]/g, ch => {
      const base = ch <= 'Z' ? 65 : 97;
      const shift = key.charCodeAt(ki % key.length) - 65;
      ki++;
      return String.fromCharCode(((ch.charCodeAt(0) - base + shift) % 26) + base);
    });
  },
  decode(input, opts = {}) {
    const key = (opts.key || 'SECRET').toUpperCase().replace(/[^A-Z]/g, '');
    if (!key) throw new Error('Keyword must contain at least one letter');
    let ki = 0;
    return input.replace(/[a-zA-Z]/g, ch => {
      const base = ch <= 'Z' ? 65 : 97;
      const shift = key.charCodeAt(ki % key.length) - 65;
      ki++;
      return String.fromCharCode(((ch.charCodeAt(0) - base - shift + 26) % 26) + base);
    });
  },
});

registry.register({
  id: 'railfence',
  name: 'Rail Fence Cipher',
  category: 'Classical Ciphers',
  description: 'Zigzag transposition cipher with configurable rail count.',
  options: [
    { id: 'rails', name: 'Number of rails', type: 'number', default: 3, min: 2, max: 20 },
  ],
  encode(input, opts = {}) {
    const rails = Math.max(2, parseInt(opts.rails, 10) || 3);
    if (input.length === 0) return '';
    const fence = Array.from({ length: rails }, () => []);
    let rail = 0, dir = 1;
    for (const ch of input) {
      fence[rail].push(ch);
      if (rail === 0) dir = 1;
      else if (rail === rails - 1) dir = -1;
      rail += dir;
    }
    return fence.flat().join('');
  },
  decode(input, opts = {}) {
    const rails = Math.max(2, parseInt(opts.rails, 10) || 3);
    const n = input.length;
    if (n === 0) return '';
    const pattern = [];
    let rail = 0, dir = 1;
    for (let i = 0; i < n; i++) {
      pattern.push(rail);
      if (rail === 0) dir = 1;
      else if (rail === rails - 1) dir = -1;
      rail += dir;
    }
    const lengths = new Array(rails).fill(0);
    for (const r of pattern) lengths[r]++;
    const offsets = [0];
    for (let r = 1; r < rails; r++) offsets[r] = offsets[r - 1] + lengths[r - 1];
    const pos = new Array(rails).fill(0);
    const result = new Array(n);
    for (let i = 0; i < n; i++) {
      const r = pattern[i];
      result[i] = input[offsets[r] + pos[r]];
      pos[r]++;
    }
    return result.join('');
  },
});

// ============================================================
//  XOR Stream Ciphers  (key-based, output as hex)
// ============================================================

const MASK64 = (1n << 64n) - 1n;

/** Derive a 64-bit seed from a string key via FNV-1a. */
function seedFromKey(key) {
  let h = 0xcbf29ce484222325n;
  for (let i = 0; i < key.length; i++) {
    h ^= BigInt(key.charCodeAt(i));
    h = (h * 0x100000001b3n) & MASK64;
  }
  return h || 1n;
}

/** SplitMix64 — expands a single seed into multiple state words. */
function splitmix64(seed) {
  let z = seed;
  return function next() {
    z = (z + 0x9e3779b97f4a7c15n) & MASK64;
    let x = z;
    x = ((x ^ (x >> 30n)) * 0xbf58476d1ce4e5b9n) & MASK64;
    x = ((x ^ (x >> 27n)) * 0x94d049bb133111ebn) & MASK64;
    return (x ^ (x >> 31n)) & MASK64;
  };
}

function rotl64(x, k) {
  return ((x << k) | (x >> (64n - k))) & MASK64;
}

/** Create a xoshiro256+ PRNG returning one byte at a time. */
function makeXoshiro256plus(key) {
  const sm = splitmix64(seedFromKey(key));
  const s = [sm(), sm(), sm(), sm()];
  let buf = 0n;
  let pos = 8;

  return function nextByte() {
    if (pos >= 8) {
      buf = (s[0] + s[3]) & MASK64;
      const t = (s[1] << 17n) & MASK64;
      s[2] ^= s[0]; s[3] ^= s[1]; s[1] ^= s[2]; s[0] ^= s[3];
      s[2] ^= t;
      s[3] = rotl64(s[3], 45n);
      pos = 0;
    }
    const byte = Number((buf >> BigInt(pos * 8)) & 0xFFn);
    pos++;
    return byte;
  };
}

/** Create a xoshiro512** PRNG returning one byte at a time. */
function makeXoshiro512(key) {
  const sm = splitmix64(seedFromKey(key));
  const s = Array.from({ length: 8 }, () => sm());
  let buf = 0n;
  let pos = 8;

  return function nextByte() {
    if (pos >= 8) {
      buf = (rotl64((s[1] * 5n) & MASK64, 7n) * 9n) & MASK64;
      const t = (s[1] << 11n) & MASK64;
      s[2] ^= s[0]; s[5] ^= s[1]; s[1] ^= s[2]; s[7] ^= s[3];
      s[3] ^= s[4]; s[4] ^= s[5]; s[0] ^= s[6]; s[6] ^= s[7];
      s[6] ^= t;
      s[7] = rotl64(s[7], 21n);
      pos = 0;
    }
    const byte = Number((buf >> BigInt(pos * 8)) & 0xFFn);
    pos++;
    return byte;
  };
}

function xorCipherEncode(input, key, factory) {
  if (!key) throw new Error('A key / password is required for this cipher');
  const prng = factory(key);
  const bytes = utf8ToBytes(input);
  const out = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) out[i] = bytes[i] ^ prng();
  return bytesToHex(out);
}

function xorCipherDecode(hex, key, factory) {
  if (!key) throw new Error('A key / password is required for this cipher');
  const prng = factory(key);
  const bytes = hexToBytes(hex.trim());
  const out = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) out[i] = bytes[i] ^ prng();
  return bytesToUtf8(out);
}

registry.register({
  id: 'xorshift256',
  name: 'XORShift-256+',
  category: 'Stream Ciphers',
  description: 'XOR stream cipher powered by xoshiro256+ PRNG. Requires a key.',
  options: [{ id: 'key', name: 'Key / Password', type: 'password', default: '' }],
  encode(input, opts = {}) { return xorCipherEncode(input, opts.key, makeXoshiro256plus); },
  decode(input, opts = {}) { return xorCipherDecode(input, opts.key, makeXoshiro256plus); },
});

registry.register({
  id: 'xorshift512',
  name: 'XORShift-512',
  category: 'Stream Ciphers',
  description: 'XOR stream cipher powered by xoshiro512** PRNG. Requires a key.',
  options: [{ id: 'key', name: 'Key / Password', type: 'password', default: '' }],
  encode(input, opts = {}) { return xorCipherEncode(input, opts.key, makeXoshiro512); },
  decode(input, opts = {}) { return xorCipherDecode(input, opts.key, makeXoshiro512); },
});

// ============================================================
//  Text Transforms
// ============================================================

const MORSE_TABLE = {
  A:'.-',B:'-...',C:'-.-.',D:'-..',E:'.',F:'..-.',G:'--.',H:'....',I:'..',
  J:'.---',K:'-.-',L:'.-..',M:'--',N:'-.',O:'---',P:'.--.',Q:'--.-',R:'.-.',
  S:'...',T:'-',U:'..-',V:'...-',W:'.--',X:'-..-',Y:'-.--',Z:'--..',
  '0':'-----','1':'.----','2':'..---','3':'...--','4':'....-',
  '5':'.....','6':'-....','7':'--...','8':'---..','9':'----.',
  '.':'.-.-.-',',':'--..--','?':'..--..','!':'-.-.--','/':'-..-.',
  '(':'-.--.',')':'-.--.-','&':'.-...',':':'---...',';':'-.-.-.',
  '=':'-...-','+':'.-.-.','-':'-....-','_':'..--.-','"':'.-..-.',
  '$':'...-..-','@':'.--.-.',"'":'.----.',
};
const MORSE_REV = Object.fromEntries(Object.entries(MORSE_TABLE).map(([k, v]) => [v, k]));

registry.register({
  id: 'morse',
  name: 'Morse Code',
  category: 'Text Transforms',
  description: 'International Morse Code. Letters separated by spaces, words by " / ".',
  encode(input) {
    return input.toUpperCase().split('').map(ch => {
      if (ch === ' ') return '/';
      return MORSE_TABLE[ch] || `[${ch}]`;
    }).join(' ');
  },
  decode(input) {
    return input.trim().split(/\s+/).map(token => {
      if (token === '/') return ' ';
      if (MORSE_REV[token]) return MORSE_REV[token];
      const m = token.match(/^\[(.)\]$/);
      return m ? m[1] : '?';
    }).join('');
  },
});

registry.register({
  id: 'reverse',
  name: 'Reverse',
  category: 'Text Transforms',
  description: 'Reverses the input string (grapheme-aware).',
  encode(input) { return Array.from(input).reverse().join(''); },
  decode(input) { return Array.from(input).reverse().join(''); },
});

// ---- A1Z26 ----

registry.register({
  id: 'a1z26',
  name: 'A1Z26',
  category: 'Text Transforms',
  description: 'Letters to numbers (A=1, B=2, ..., Z=26). Non-letters pass through.',
  encode(input) {
    return input.toUpperCase().split('').map(ch => {
      const code = ch.charCodeAt(0);
      if (code >= 65 && code <= 90) return (code - 64).toString();
      if (ch === ' ') return '/';
      return ch;
    }).join('-').replace(/-\/-/g, ' / ');
  },
  decode(input) {
    return input.split(' / ').map(word =>
      word.split('-').map(tok => {
        const n = parseInt(tok, 10);
        if (n >= 1 && n <= 26) return String.fromCharCode(64 + n);
        return tok;
      }).join('')
    ).join(' ');
  },
});

// ---- Bacon's Cipher ----

const BACON_MAP = {};
for (let i = 0; i < 26; i++) {
  let code = '';
  let v = i;
  for (let b = 4; b >= 0; b--) {
    code += (v >> b) & 1 ? 'B' : 'A';
    // Note: I/J share index 8, U/V share index 20 in traditional Bacon
    // Using 26-letter modern variant here for simplicity
  }
  BACON_MAP[String.fromCharCode(65 + i)] = code;
}
const BACON_REV = Object.fromEntries(Object.entries(BACON_MAP).map(([k, v]) => [v, k]));

registry.register({
  id: 'bacon',
  name: "Bacon's Cipher",
  category: 'Text Transforms',
  description: 'Encodes letters as 5-letter A/B sequences (26-letter modern variant).',
  encode(input) {
    return input.toUpperCase().split('').map(ch => {
      if (BACON_MAP[ch]) return BACON_MAP[ch];
      if (ch === ' ') return ' ';
      return ch;
    }).join(' ');
  },
  decode(input) {
    const tokens = input.trim().split(/\s+/);
    return tokens.map(t => BACON_REV[t.toUpperCase()] || t).join('');
  },
});

// ---- Tap Code ----

const TAP_GRID = [
  ['A','B','C','D','E'],
  ['F','G','H','I','J'],
  ['L','M','N','O','P'],
  ['Q','R','S','T','U'],
  ['V','W','X','Y','Z'],
]; // K is omitted; C substitutes
const TAP_MAP = {};
const TAP_REV = {};
for (let r = 0; r < 5; r++) {
  for (let c = 0; c < 5; c++) {
    const code = '.'.repeat(r + 1) + ' ' + '.'.repeat(c + 1);
    TAP_MAP[TAP_GRID[r][c]] = code;
    TAP_REV[code] = TAP_GRID[r][c];
  }
}
TAP_MAP['K'] = TAP_MAP['C']; // K→C substitution

registry.register({
  id: 'tapcode',
  name: 'Tap Code',
  category: 'Text Transforms',
  description: 'Military tap code using a 5x5 Polybius square (K=C).',
  encode(input) {
    return input.toUpperCase().split('').map(ch => {
      if (ch === ' ') return '  /  ';
      return TAP_MAP[ch] || `[${ch}]`;
    }).join('   ');
  },
  decode(input) {
    return input.split(/\s*\/\s*/).map(word => {
      const taps = word.trim().split(/\s{2,}/);
      return taps.map(t => {
        const clean = t.trim();
        if (TAP_REV[clean]) return TAP_REV[clean];
        const m = clean.match(/^\[(.)\]$/);
        return m ? m[1] : '';
      }).join('');
    }).join(' ');
  },
});

// ---- Pig Latin ----

registry.register({
  id: 'piglatin',
  name: 'Pig Latin',
  category: 'Text Transforms',
  description: 'Moves leading consonants to end and appends "ay". Vowel-initial words get "yay".',
  encode(input) {
    return input.split(/(\s+)/).map(token => {
      if (/^\s+$/.test(token)) return token;
      const match = token.match(/^([^aeiouAEIOU]*)(.+)$/);
      if (!match) return token + 'ay';
      const [, consonants, rest] = match;
      if (!consonants) return token + 'yay';
      const moved = rest + consonants.toLowerCase() + 'ay';
      return /^[A-Z]/.test(token)
        ? moved.charAt(0).toUpperCase() + moved.slice(1)
        : moved;
    }).join('');
  },
  decode(input) {
    return input.split(/(\s+)/).map(token => {
      if (/^\s+$/.test(token)) return token;
      if (token.endsWith('yay') || token.endsWith('Yay')) {
        return token.slice(0, -3);
      }
      const m = token.match(/^(.+?)([bcdfghjklmnpqrstvwxyz]+)ay$/i);
      if (!m) return token;
      const restored = m[2] + m[1];
      return /^[A-Z]/.test(token)
        ? restored.charAt(0).toUpperCase() + restored.slice(1).toLowerCase()
        : restored.toLowerCase();
    }).join('');
  },
});

// ---- Leet Speak (non-decodable) ----

const LEET_MAP = {
  A:'4',B:'8',C:'(',D:'|)',E:'3',F:'|=',G:'6',H:'#',I:'!',J:']',K:'|<',
  L:'1',M:'/\\/\\',N:'^/',O:'0',P:'|>',Q:'0,',R:'|2',S:'5',T:'7',U:'|_|',
  V:'\\/',W:'\\/\\/',X:'><',Y:"'/",Z:'2',
};

registry.register({
  id: 'leet',
  name: '1337 (Leet Speak)',
  category: 'Text Transforms',
  description: 'Converts text to leet speak. Encoding is lossy — decode is best-effort.',
  isDecodable: false,
  encode(input) {
    return input.split('').map(ch => {
      const up = ch.toUpperCase();
      return LEET_MAP[up] || ch;
    }).join('');
  },
  decode() { throw new Error('Leet speak decoding is ambiguous and not supported'); },
});

// ============================================================
//  Exports
// ============================================================

export { registry, EncoderRegistry, utf8ToBytes, bytesToUtf8, bytesToHex, hexToBytes };
