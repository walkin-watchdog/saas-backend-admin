import crypto from 'crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

function base32Decode(str: string): Buffer {
  let bits = 0;
  let value = 0;
  const output: number[] = [];
  str = str.replace(/=+$/, '').toUpperCase();
  for (const c of str) {
    const idx = ALPHABET.indexOf(c);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(output);
}

export function generateSecret(bytes: number = 20): string {
  return base32Encode(crypto.randomBytes(bytes));
}

function generateCodeFromKey(key: Buffer, counter: number, digits = 6): string {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits;
  return code.toString().padStart(digits, '0');
}

export function generateTOTP(secret: string, time: number = Date.now()): string {
  const key = base32Decode(secret);
  const counter = Math.floor(time / 1000 / 30);
  return generateCodeFromKey(key, counter);
}

export function verifyTOTP(token: string, secret: string, window = 1): boolean {
  const key = base32Decode(secret);
  const counter = Math.floor(Date.now() / 1000 / 30);
  for (let error = -window; error <= window; error++) {
    if (generateCodeFromKey(key, counter + error) === token) {
      return true;
    }
  }
  return false;
}

export function otpauthURL(label: string, secret: string, issuer: string): string {
  const encLabel = encodeURIComponent(label);
  const encIssuer = encodeURIComponent(issuer);
  return `otpauth://totp/${encLabel}?secret=${secret}&issuer=${encIssuer}`;
}

