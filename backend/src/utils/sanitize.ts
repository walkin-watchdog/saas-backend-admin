export function sanitize(input: unknown): any {
  if (input === null || input === undefined) return input as any;
  if (typeof input === 'string') {
    // Replace DSN credentials and generic password patterns
    return input
      .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, 'postgresql://<redacted>')
      .replace(/(postgres(?:ql)?:\/\/[^:]+:)([^@]+)@/gi, '$1****@')
      .replace(/\bpassword=([^\s&]+)/gi, 'password=****')
      .replace(/([?&]password=)[^&\s]+/gi, '$1****');
  }
  if (input instanceof Error) {
    return {
      message: sanitize(input.message),
      stack: input.stack ? sanitize(input.stack) : undefined,
    };
  }
  if (Array.isArray(input)) {
    return input.map((v) => sanitize(v));
  }
  if (typeof input === 'object') {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(input as Record<string, any>)) {
      out[k] = sanitize(v);
    }
    return out;
  }
  return input;
}