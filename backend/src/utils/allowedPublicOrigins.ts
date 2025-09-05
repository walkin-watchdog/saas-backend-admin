const envList = (v?: string): string[] =>
  (v ? v.split(',') : []).map(s => s.trim()).filter(Boolean);

export const allowedPublicOrigins: string[] = [
  ...envList(process.env.ALLOWED_PUBLIC_ORIGINS),
].filter(Boolean);

export const allowedPublicOriginsSet = new Set(allowedPublicOrigins);

export const isAllowedPublicOrigin = (origin?: string): boolean => {
  if (!origin) return true;
  return allowedPublicOriginsSet.has(origin);
};

export const getAllowedPublicOrigins = (): string[] => [...allowedPublicOriginsSet];
