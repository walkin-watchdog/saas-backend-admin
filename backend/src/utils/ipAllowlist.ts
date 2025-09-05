import { logger } from './logger';

function ipToLong(ip: string): number {
  return ip.split('.').reduce((acc, oct) => (acc << 8) + (parseInt(oct, 10) & 255), 0) >>> 0;
}

function matchCidrIPv4(ip: string, cidr: string): boolean {
  const [range, bitsStr] = cidr.split('/');
  const bits = parseInt(bitsStr, 10);
  if (isNaN(bits)) return false;
  const mask = bits === 0 ? 0 : (~((1 << (32 - bits)) - 1)) >>> 0;
  const ipLong = ipToLong(ip);
  return (ipToLong(range) & mask) === (ipLong & mask);
}

function parseIPv6(ip: string): number[] {
  if (ip.includes('.')) {
    const lastColon = ip.lastIndexOf(':');
    const ipv4Part = ip.slice(lastColon + 1);
    const parts = ipv4Part.split('.').map(n => parseInt(n, 10));
    if (parts.length !== 4 || parts.some(n => isNaN(n))) throw new Error('Invalid IPv4 part');
    const ipv4Hex = ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3])
      .toString(16)
      .padStart(8, '0');
    ip = ip.slice(0, lastColon) + ':' + ipv4Hex.slice(0, 4) + ':' + ipv4Hex.slice(4);
  }

  const [head, tail] = ip.split('::');
  const headParts = head ? head.split(':').filter(Boolean) : [];
  const tailParts = tail ? tail.split(':').filter(Boolean) : [];
  const missing = 8 - (headParts.length + tailParts.length);
  const parts = [...headParts, ...Array(Math.max(missing, 0)).fill('0'), ...tailParts];
  if (parts.length !== 8) throw new Error('Invalid IPv6');
  return parts.map(p => parseInt(p, 16));
}

function matchCidrIPv6(ip: string, cidr: string): boolean {
  const [range, bitsStr] = cidr.split('/');
  const bits = parseInt(bitsStr, 10);
  if (isNaN(bits) || bits < 0 || bits > 128) return false;
  const ipParts = parseIPv6(ip);
  const rangeParts = parseIPv6(range);
  const fullSegments = Math.floor(bits / 16);
  const remaining = bits % 16;
  for (let i = 0; i < fullSegments; i++) {
    if (ipParts[i] !== rangeParts[i]) return false;
  }
  if (remaining === 0) return true;
  const mask = (~0 << (16 - remaining)) & 0xffff;
  return (ipParts[fullSegments] & mask) === (rangeParts[fullSegments] & mask);
}

export function isIpAllowed(ip: string, list: string[]): boolean {
  if (!ip) return false;
  if (ip.includes(':') && ip.includes('.')) {
    ip = ip.slice(ip.lastIndexOf(':') + 1); // IPv4-mapped IPv6
  }
  for (const entry of list) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    if (trimmed.includes('/')) {
      try {
        if (trimmed.includes(':')) {
          if (matchCidrIPv6(ip, trimmed)) return true;
        } else if (matchCidrIPv4(ip, trimmed)) {
          return true;
        }
      } catch (err) {
        logger.warn('ip_allowlist_bad_cidr', { cidr: trimmed, error: (err as Error).message });
      }
    } else if (trimmed.includes(':')) {
      try {
        const ipParts = parseIPv6(ip);
        const allowParts = parseIPv6(trimmed);
        if (ipParts.every((seg, i) => seg === allowParts[i])) return true;
      } catch { /* ignore */ }
    } else if (trimmed === ip) {
      return true;
    }
  }
  return false;
}