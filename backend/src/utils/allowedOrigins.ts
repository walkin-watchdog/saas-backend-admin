const envList = (v?: string): string[] =>
  (v ? v.split(',') : []).map(s => s.trim()).filter(Boolean);

export const allowedOrigins: string[] = [
  process.env.FRONTEND_URL || 'http://localhost:5174',
  process.env.ADMIN_URL || 'http://localhost:8080',
  ...envList(process.env.ALLOWED_ORIGINS),
].filter(Boolean);

export const allowedOriginsSet = new Set(allowedOrigins);

export const isAllowedOrigin = (origin?: string): boolean => {
  if (!origin) return true; // non-browser or same-origin
  return allowedOriginsSet.has(origin);
};

export const getAllowedOrigins = (): string[] => [...allowedOriginsSet];