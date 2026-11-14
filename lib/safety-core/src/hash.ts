/**
 * Pure-TypeScript SHA-256, HMAC-SHA256, hex/base64 helpers, and constant-time comparison.
 * Runs identically in Node.js, Expo/Hermes, and browsers with zero platform dependencies.
 */

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function rotr(x: number, n: number): number {
  return (x >>> n) | (x << (32 - n));
}

export function sha256Bytes(data: Uint8Array): Uint8Array {
  const bitLen = data.length * 8;
  const paddedLen = Math.ceil((data.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLen);
  padded.set(data);
  padded[data.length] = 0x80;

  const view = new DataView(padded.buffer);
  const hi = Math.floor(bitLen / 0x100000000);
  const lo = bitLen >>> 0;
  view.setUint32(paddedLen - 8, hi, false);
  view.setUint32(paddedLen - 4, lo, false);

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;

  const w = new Uint32Array(64);
  for (let offset = 0; offset < paddedLen; offset += 64) {
    for (let i = 0; i < 16; i++) {
      w[i] = view.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  const out = new Uint8Array(32);
  const outView = new DataView(out.buffer);
  outView.setUint32(0, h0, false);
  outView.setUint32(4, h1, false);
  outView.setUint32(8, h2, false);
  outView.setUint32(12, h3, false);
  outView.setUint32(16, h4, false);
  outView.setUint32(20, h5, false);
  outView.setUint32(24, h6, false);
  outView.setUint32(28, h7, false);
  return out;
}

export function hmacSha256Bytes(key: Uint8Array, message: Uint8Array): Uint8Array {
  const blockSize = 64;
  const k = key.length > blockSize ? sha256Bytes(key) : key;
  const ipad = new Uint8Array(blockSize);
  const opad = new Uint8Array(blockSize);
  ipad.fill(0x36);
  opad.fill(0x5c);
  for (let i = 0; i < k.length; i++) {
    ipad[i] ^= k[i];
    opad[i] ^= k[i];
  }
  const inner = new Uint8Array(blockSize + message.length);
  inner.set(ipad, 0);
  inner.set(message, blockSize);
  const innerHash = sha256Bytes(inner);

  const outer = new Uint8Array(blockSize + 32);
  outer.set(opad, 0);
  outer.set(innerHash, blockSize);
  return sha256Bytes(outer);
}

export function utf8ToBytes(str: string): Uint8Array {
  const bytes: number[] = [];
  for (let i = 0; i < str.length; i++) {
    let code = str.charCodeAt(i);
    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code >= 0xd800 && code <= 0xdbff && i + 1 < str.length) {
      const low = str.charCodeAt(++i);
      code = 0x10000 + (((code & 0x3ff) << 10) | (low & 0x3ff));
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f)
      );
    } else {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    }
  }
  return new Uint8Array(bytes);
}

export function bytesToHex(bytes: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim();
  if (clean.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(clean)) {
    throw new Error('Invalid hex string');
  }
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += B64_CHARS[b0 >> 2];
    out += B64_CHARS[((b0 & 0x03) << 4) | (b1 >> 4)];
    out += i + 1 < bytes.length ? B64_CHARS[((b1 & 0x0f) << 2) | (b2 >> 6)] : '=';
    out += i + 2 < bytes.length ? B64_CHARS[b2 & 0x3f] : '=';
  }
  return out;
}

export function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/\s+/g, '');
  if (clean.length % 4 !== 0) {
    throw new Error('Invalid base64 length');
  }
  const pad = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
  const outLen = (clean.length / 4) * 3 - pad;
  const out = new Uint8Array(outLen);
  let j = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const c0 = B64_CHARS.indexOf(clean[i]);
    const c1 = B64_CHARS.indexOf(clean[i + 1]);
    const c2 = clean[i + 2] === '=' ? 0 : B64_CHARS.indexOf(clean[i + 2]);
    const c3 = clean[i + 3] === '=' ? 0 : B64_CHARS.indexOf(clean[i + 3]);
    if (c0 < 0 || c1 < 0 || c2 < 0 || c3 < 0) {
      throw new Error('Invalid base64 character');
    }
    const n = (c0 << 18) | (c1 << 12) | (c2 << 6) | c3;
    if (j < outLen) out[j++] = (n >> 16) & 0xff;
    if (j < outLen) out[j++] = (n >> 8) & 0xff;
    if (j < outLen) out[j++] = n & 0xff;
  }
  return out;
}

export function constantTimeEqualBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}
